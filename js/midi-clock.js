// MIDI parsing and clock tempo estimation. Pure: no DOM, no WebMIDI, so node can test it.

export const PPQN = 24;

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Note name with Ableton's octave numbering (note 60 = C3).
export function noteName(note) {
  return `${NOTE_NAMES[note % 12]}${Math.floor(note / 12) - 2}`;
}

const SYSTEM_TYPES = {
  0xf8: 'clock',
  0xfa: 'start',
  0xfb: 'continue',
  0xfc: 'stop',
  0xfe: 'active sensing',
  0xff: 'reset',
  0xf2: 'song position',
  0xf3: 'song select',
  0xf1: 'time code',
  0xf0: 'sysex',
};

const CHANNEL_TYPES = {
  0x80: 'note off',
  0x90: 'note on',
  0xa0: 'aftertouch',
  0xb0: 'cc',
  0xc0: 'program',
  0xd0: 'pressure',
  0xe0: 'pitch bend',
};

// Turns raw bytes into { type, channel (1-16 or null), data1, data2 }.
// A note on with velocity 0 is reported as a note off, as the MIDI spec intends.
export function parseMidiMessage(bytes) {
  const status = bytes[0];
  if (status >= 0xf0) {
    return { type: SYSTEM_TYPES[status] || `0x${status.toString(16)}`, channel: null, data1: bytes[1], data2: bytes[2] };
  }
  let type = CHANNEL_TYPES[status & 0xf0] || 'unknown';
  if (type === 'note on' && bytes[2] === 0) {
    type = 'note off';
  }
  return { type, channel: (status & 0x0f) + 1, data1: bytes[1], data2: bytes[2] };
}

// Least-squares slope of tick time against tick index, in ms per tick. Fitting a line through every
// timestamp averages out jitter far better than averaging intervals between neighbours.
function slope(points) {
  const n = points.length;
  let sx = 0;
  let sy = 0;
  for (const [x, y] of points) {
    sx += x;
    sy += y;
  }
  const mx = sx / n;
  const my = sy / n;
  let num = 0;
  let den = 0;
  for (const [x, y] of points) {
    num += (x - mx) * (y - my);
    den += (x - mx) * (x - mx);
  }
  return den > 0 ? { k: num / den, b: my - (num / den) * mx } : { k: NaN, b: NaN };
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Drops ticks that sit far off the fitted line (a tick delivered late because the main thread was busy),
// as long as they're a small minority.
function withoutOutliers(points) {
  const { k, b } = slope(points);
  const residuals = points.map(([x, y]) => Math.abs(y - (k * x + b)));
  const limit = Math.max(6 * median(residuals), 2); // ms
  const kept = points.filter((_, i) => residuals[i] <= limit);
  return kept.length >= points.length * 0.75 ? kept : points;
}

// Tempo from a list of [tickIndex, timeMs] points. Returns { bpm, stable }: bpm is null with fewer than
// minTicks points; stable means the older and newer halves of the window agree within `tolerance`
// (a fraction of the tempo), so the clock isn't mid-change.
export function estimateClockBpm(points, { minTicks = PPQN, tolerance = 0.01 } = {}) {
  if (points.length < Math.max(minTicks, 4)) {
    return { bpm: null, stable: false };
  }
  const kept = withoutOutliers(points);
  const msPerTick = slope(kept).k;
  if (!(msPerTick > 0)) {
    return { bpm: null, stable: false };
  }
  const bpm = 60000 / (msPerTick * PPQN);
  const half = kept.length >> 1;
  const older = 60000 / (slope(kept.slice(0, half + 1)).k * PPQN);
  const newer = 60000 / (slope(kept.slice(half)).k * PPQN);
  const stable = Math.abs(older - newer) / bpm <= tolerance;
  return { bpm, stable };
}

// Follows a MIDI clock: feed it every clock tick and transport message with its timestamp in ms
// (MIDIMessageEvent.timeStamp). It keeps a window of recent ticks, treats a long silence as the clock
// stopping, and only reports a tempo once the
// window is steady. The reported tempo moves only when the estimate moves by more than `hysteresis`
// BPM, so it doesn't flicker between neighbouring values.
export class MidiClock {
  #points = [];
  #index = 0;
  #lastTime = null;
  #reported = null;
  #ticks = 0;
  #opts;

  constructor({ windowTicks = PPQN * 4, minTicks = PPQN * 2, tolerance = 0.01, hysteresis = 0.1, timeoutMs = 300 } = {}) {
    this.#opts = { windowTicks, minTicks, tolerance, hysteresis, timeoutMs };
  }

  // The tempo once stable, else null. Stays at the last stable value while the clock is changing.
  get bpm() {
    return this.#reported;
  }

  // Ticks since start/continue, for beat flashes (a beat every PPQN ticks).
  get ticks() {
    return this.#ticks;
  }

  // True while ticks keep arriving. Pass the current time in ms.
  isAlive(nowMs) {
    return this.#lastTime !== null && nowMs - this.#lastTime <= this.#opts.timeoutMs;
  }

  reset() {
    this.#points = [];
    this.#index = 0;
    this.#lastTime = null;
    this.#reported = null;
  }

  // Feeds one clock tick. Returns { bpm, stable, changed }: changed is true when the reported tempo moved.
  tick(timeMs) {
    const { windowTicks, minTicks, tolerance, hysteresis, timeoutMs } = this.#opts;
    if (this.#lastTime !== null) {
      const dt = timeMs - this.#lastTime;
      if (dt > timeoutMs || dt < 0) {
        // The clock stopped and came back (or time went backwards): start a fresh window.
        this.#points = [];
        this.#index = 0;
      } else {
        this.#index += 1;
      }
    }
    this.#lastTime = timeMs;
    this.#ticks += 1;
    this.#points.push([this.#index, timeMs]);
    if (this.#points.length > windowTicks) {
      this.#points.shift();
    }

    const { bpm, stable } = estimateClockBpm(this.#points, { minTicks, tolerance });
    let changed = false;
    if (stable && (this.#reported === null || Math.abs(bpm - this.#reported) > hysteresis)) {
      this.#reported = bpm;
      changed = true;
    }
    return { bpm: this.#reported, stable, changed };
  }

  // Feeds a transport message (0xFA start, 0xFB continue, 0xFC stop). Returns 'start' | 'continue' | 'stop'.
  transport(status) {
    if (status === 0xfa) {
      this.#ticks = 0;
      return 'start';
    }
    if (status === 0xfb) {
      return 'continue';
    }
    if (status === 0xfc) {
      return 'stop';
    }
    return null;
  }
}
