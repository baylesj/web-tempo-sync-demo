// The prototype Chromium v0.1 build implements an earlier draft of the API: numPeers and
// numpeerschange instead of hasPeers and peerschange, tempochange instead of timelinechange,
// and one beat grid shared by everyone, so its requestBeatAtTime() moves everyone's bar lines.
// This wraps a v0.1 session so it looks like the current draft to the tools:
//
// - hasPeers is numPeers > 0 (v0.1 counts only network peers, not other tabs);
// - each session numbers beats its own way: an offset kept here, rounded to the quantum,
//   over v0.1's shared beats, so requestBeatAtTime() waits for the bar line and changes only
//   this page's numbering when anyone else plays, as the current draft says;
// - forceBeatAtTime() moves the shared grid by at most half a quantum;
// - only what a state changed is committed (v0.1 still writes its whole timeline when it does);
// - v0.1 applies a commit asynchronously, so for a moment its snapshots still show the old
//   timeline. Until they catch up (or a second passes), snapshots come from the committed state,
//   so a tool never sees the tempo or the bar lines jump back and forth.
//
// It goes once a rebuilt prototype implements the current draft.

const phase = (beat, q) => ((beat % q) + q) % q;
const CATCH_UP_MS = 1000;
const offsetFor = (offset, q) => q * Math.floor(offset / q + 0.5);

// Whether a fresh v0.1 snapshot shows the committed timeline yet.
function agrees(fresh, committed, context) {
  const now = context ? context.currentTime : performance.now() / 1000;
  return Math.abs(fresh.tempo - committed.tempo) < 1e-6
    && Math.abs(fresh.beatAtTime(now) - committed.beatAtTime(now)) < 1e-3
    && fresh.isPlaying === committed.isPlaying;
}

export function isLegacyApi() {
  return typeof TempoSession === 'function' && 'numPeers' in TempoSession.prototype;
}

class LegacyState {
  #context;
  #session;
  #inner;
  #offset;
  #quantum;
  #solo;
  #changed = false;
  #committed = false;

  constructor(session, inner, offset, quantum, solo, context) {
    this.#context = context;
    this.#session = session;
    this.#inner = inner;
    this.#offset = offset;
    this.#quantum = quantum;
    this.#solo = solo;
  }

  #q(quantum) {
    return quantum !== undefined && quantum > 0 ? quantum : this.#quantum;
  }

  get tempo() {
    return this.#inner.tempo;
  }

  get isPlaying() {
    return this.#inner.isPlaying;
  }

  get timeForIsPlaying() {
    return this.#inner.timeForIsPlaying;
  }

  beatAtTime(time, quantum) {
    return this.#inner.beatAtTime(time) + offsetFor(this.#offset, this.#q(quantum));
  }

  timeAtBeat(beat, quantum) {
    return this.#inner.timeAtBeat(beat - offsetFor(this.#offset, this.#q(quantum)));
  }

  phaseAtTime(time, quantum) {
    return phase(this.#inner.beatAtTime(time), this.#q(quantum));
  }

  setTempo(bpm, atTime) {
    this.#inner.setTempo(bpm, atTime);
    this.#changed = true;
  }

  setIsPlaying(playing, atTime) {
    this.#inner.setIsPlaying(playing, atTime);
    this.#changed = true;
  }

  requestBeatAtTime(beat, time, quantum) {
    const q = this.#q(quantum);
    if (this.#solo) {
      this.forceBeatAtTime(beat, time, q);
      return;
    }
    const current = this.beatAtTime(time, q);
    const launch = current + phase(phase(beat, q) - phase(current, q), q);
    this.#offset = beat - this.#inner.beatAtTime(this.timeAtBeat(launch, q));
  }

  forceBeatAtTime(beat, time, quantum) {
    const q = this.#q(quantum);
    const current = this.#inner.beatAtTime(time);
    let shift = phase(phase(beat, q) - phase(current, q), q);
    if (shift > q / 2) {
      shift -= q;
    }
    this.#inner.forceBeatAtTime(current + shift, time);
    this.#offset = beat - (current + shift);
    this.#changed = true;
  }

  // For LegacySession.commitState().
  _take(session) {
    if (this.#session !== session) {
      throw new DOMException('This state was captured from another session', 'InvalidModificationError');
    }
    if (this.#committed) {
      throw new DOMException('This state was already committed', 'InvalidStateError');
    }
    this.#committed = true;
    return { offset: this.#offset, inner: this.#changed ? this.#inner : null, context: this.#context };
  }
}

const EVENTS = { numpeerschange: 'peerschange', tempochange: 'timelinechange', playingchange: 'playingchange' };

export class LegacySession extends EventTarget {
  #inner;
  #offset = 0;
  // The last committed state, its time base, and when, until v0.1's snapshots agree with it.
  #pending = null;
  #hadPeers;
  onpeerschange = null;
  ontimelinechange = null;
  onplayingchange = null;

  constructor(inner) {
    super();
    this.#inner = inner;
    this.#hadPeers = inner.numPeers > 0;
    for (const [from, to] of Object.entries(EVENTS)) {
      inner.addEventListener(from, () => {
        if (to === 'peerschange') {
          const has = inner.numPeers > 0;
          if (has === this.#hadPeers) {
            return; // the count changed, but not whether anyone else is here
          }
          this.#hadPeers = has;
        }
        const event = new Event(to);
        this.dispatchEvent(event);
        this[`on${to}`]?.call(this, event);
      });
    }
  }

  get hasPeers() {
    return this.#inner.numPeers > 0;
  }

  get quantum() {
    return this.#inner.quantum;
  }

  captureState(context = undefined) {
    let inner = context === undefined ? this.#inner.captureState() : this.#inner.captureState(context);
    const pending = this.#pending;
    if (pending && pending.context === context) {
      if (performance.now() - pending.at > CATCH_UP_MS || agrees(inner, pending.state, context)) {
        this.#pending = null;
      } else {
        inner = pending.state;
      }
    }
    return new LegacyState(this, inner, this.#offset, this.#inner.quantum, !this.hasPeers, context);
  }

  commitState(state) {
    if (!(state instanceof LegacyState)) {
      throw new TypeError('commitState() takes a TempoSessionState');
    }
    const { offset, inner, context } = state._take(this);
    this.#offset = offset;
    if (inner) {
      this.#inner.commitState(inner);
      this.#pending = { state: inner, context, at: performance.now() };
    }
  }

  close() {
    this.#inner.close();
  }
}
