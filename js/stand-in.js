// The Web Tempo Sync API for browsers without it, following the draft's model
// (https://bayl.es/web-tempo-sync/): participants share tempo, bar phase and start/stop, and
// each session numbers beats its own way.
//
// Like a browser, every session in this document shares one endpoint. Endpoints in other tabs
// of this browser are the other participants, reached over a BroadcastChannel. There's no
// network, so nothing outside this browser takes part.
//
// Host time here is epoch milliseconds (performance.timeOrigin + performance.now()), the
// clock every tab of this browser shares; the shared timeline keeps its times in host seconds.
//
// Not covered: TempoSessionState isn't serializable, so it can't be posted to a worker.

const CHANNEL = 'web-tempo-sync-standin';
const hostNow = () => (performance.timeOrigin + performance.now()) / 1000;
const phase = (beat, q) => ((beat % q) + q) % q;
const offsetFor = (offset, q) => q * Math.floor(offset / q + 0.5);

function toDouble(value, name) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new TypeError(`${name} is not a finite number`);
  }
  return n;
}

function sameTimeline(a, b) {
  if (Math.abs(a.tempo - b.tempo) > 1e-9) {
    return false;
  }
  const beatAtB = a.beatOrigin + (b.timeOrigin - a.timeOrigin) * (a.tempo / 60);
  return Math.abs(beatAtB - b.beatOrigin) < 1e-6;
}

// AudioContext time = page seconds - audioOffset(context), as in the extension: follow
// getOutputTimestamp() slowly, unless it jumps.
const audioOffsets = new WeakMap();
function audioOffset(context) {
  if (typeof AudioContext === 'undefined' || !(context instanceof AudioContext)) {
    return 0;
  }
  const ts = context.getOutputTimestamp();
  const sample = ts.performanceTime > 0
    ? ts.performanceTime / 1000 - ts.contextTime
    : performance.now() / 1000 - context.currentTime;
  const prev = audioOffsets.get(context);
  const next = prev === undefined || Math.abs(sample - prev) > 0.02 ? sample : prev + (sample - prev) * 0.05;
  audioOffsets.set(context, next);
  return next;
}

// This document's one participant: the shared timeline, and the other tabs it's heard from.
class Endpoint {
  id = Math.random().toString(36).slice(2);
  sessions = new Set();
  peers = new Map();
  shared = { tempo: 120, beatOrigin: 0, timeOrigin: hostNow(), playing: false, playingTime: hostNow() };
  #channel = null;
  #timer = null;

  open(session) {
    this.sessions.add(session);
    if (this.#channel || typeof BroadcastChannel === 'undefined') {
      return;
    }
    this.#channel = new BroadcastChannel(CHANNEL);
    this.#channel.onmessage = (e) => this.#receive(e.data);
    this.#post({ type: 'hello' });
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', () => this.#post({ type: 'bye' }));
    }
    // Like Link, announce ourselves every second; a tab that goes quiet drops out after 70 s,
    // longer than the once-a-minute timers Chrome allows hidden tabs.
    this.#timer = setInterval(() => {
      this.#post({ type: 'presence' });
      for (const [id, seen] of this.peers) {
        if (seen < Date.now() - 70000) {
          this.#drop(id);
        }
      }
    }, 1000);
  }

  close(session) {
    const before = this.#peersBefore();
    this.sessions.delete(session);
    if (this.sessions.size === 0 && this.#channel) {
      this.#post({ type: 'bye' });
      clearInterval(this.#timer);
      this.#channel.close();
      this.#channel = null;
      this.peers.clear();
    }
    this.#notifyPeers(before);
  }

  others(session) {
    return this.peers.size > 0 || [...this.sessions].some((s) => s !== session);
  }

  share(next) {
    this.#apply(next);
    this.#post({ type: 'state', shared: this.shared });
  }

  #apply(next) {
    const prev = this.shared;
    this.shared = { ...next };
    this.#notify({
      timeline: !sameTimeline(prev, next),
      playing: prev.playing !== next.playing || Math.abs(prev.playingTime - next.playingTime) > 1e-6,
    });
  }

  #receive(msg) {
    if (!msg || msg.from === this.id) {
      return;
    }
    if (msg.type === 'bye') {
      this.#drop(msg.from);
      return;
    }
    this.#see(msg.from);
    if (msg.type === 'hello') {
      // A tab just joined: hand it the session, as a Link peer does for a joiner.
      this.#post({ type: 'state', shared: this.shared });
    } else if (msg.type === 'state') {
      this.#apply(msg.shared);
    }
  }

  #peersBefore() {
    return new Map([...this.sessions].map((s) => [s, this.others(s)]));
  }

  #see(id) {
    const before = this.#peersBefore();
    this.peers.set(id, Date.now());
    this.#notifyPeers(before);
  }

  #drop(id) {
    const before = this.#peersBefore();
    if (this.peers.delete(id)) {
      this.#notifyPeers(before);
    }
  }

  #notifyPeers(before) {
    for (const [s, had] of before) {
      if (had !== this.others(s)) {
        setTimeout(() => s._fire({ peers: true }));
      }
    }
  }

  // Events are queued, as the draft says, so a commit's own events come after it returns.
  #notify(changes) {
    const targets = [...this.sessions];
    if (changes.timeline || changes.playing) {
      setTimeout(() => targets.forEach((s) => s._fire(changes)));
    }
  }

  #post(message) {
    try {
      this.#channel?.postMessage({ ...message, from: this.id });
    } catch {
      /* the channel closed under us */
    }
  }
}

let endpoint = null;

export class StandInTempoSessionState {
  #session;
  #toHost;
  #tempo;
  #timeOrigin;
  #beatOrigin;
  #offset;
  #quantum;
  #playing;
  #playingTime;
  #solo;
  #timelineChanged = false;
  #playingChanged = false;
  #committed = false;

  constructor(session, fields, toHost) {
    this.#session = session;
    this.#toHost = toHost;
    this.#tempo = fields.tempo;
    this.#timeOrigin = fields.timeOrigin;
    this.#beatOrigin = fields.beatOrigin;
    this.#offset = fields.offset;
    this.#quantum = fields.quantum;
    this.#playing = fields.playing;
    this.#playingTime = fields.playingTime;
    this.#solo = fields.solo;
  }

  #q(quantum) {
    if (quantum === undefined) {
      return this.#quantum;
    }
    const q = toDouble(quantum, 'quantum');
    return q > 0 ? q : this.#quantum;
  }

  #sharedBeat(time) {
    return this.#beatOrigin + (time - this.#timeOrigin) * (this.#tempo / 60);
  }

  get tempo() {
    return this.#tempo;
  }

  get isPlaying() {
    return this.#playing;
  }

  get timeForIsPlaying() {
    return this.#playingTime;
  }

  beatAtTime(time, quantum) {
    time = toDouble(time, 'time');
    return this.#sharedBeat(time) + offsetFor(this.#offset, this.#q(quantum));
  }

  timeAtBeat(beat, quantum) {
    beat = toDouble(beat, 'beat');
    const shared = beat - offsetFor(this.#offset, this.#q(quantum));
    return this.#timeOrigin + (shared - this.#beatOrigin) * (60 / this.#tempo);
  }

  phaseAtTime(time, quantum) {
    time = toDouble(time, 'time');
    return phase(this.#sharedBeat(time), this.#q(quantum));
  }

  setTempo(bpm, atTime) {
    bpm = toDouble(bpm, 'bpm');
    atTime = toDouble(atTime, 'atTime');
    if (bpm <= 0) {
      throw new RangeError('bpm must be positive');
    }
    this.#beatOrigin = this.#sharedBeat(atTime);
    this.#timeOrigin = atTime;
    this.#tempo = bpm;
    this.#timelineChanged = true;
  }

  requestBeatAtTime(beat, time, quantum) {
    beat = toDouble(beat, 'beat');
    time = toDouble(time, 'time');
    const q = this.#q(quantum);
    if (this.#solo) {
      this.forceBeatAtTime(beat, time, q);
      return;
    }
    const current = this.beatAtTime(time, q);
    const launch = current + phase(phase(beat, q) - phase(current, q), q);
    this.#offset = beat - this.#sharedBeat(this.timeAtBeat(launch, q));
  }

  forceBeatAtTime(beat, time, quantum) {
    beat = toDouble(beat, 'beat');
    time = toDouble(time, 'time');
    const q = this.#q(quantum);
    const current = this.#sharedBeat(time);
    let shift = phase(phase(beat, q) - phase(current, q), q);
    if (shift > q / 2) {
      shift -= q;
    }
    this.#timeOrigin = time;
    this.#beatOrigin = current + shift;
    this.#offset = beat - (current + shift);
    this.#timelineChanged = true;
  }

  setIsPlaying(playing, atTime) {
    atTime = toDouble(atTime, 'atTime');
    this.#playing = Boolean(playing);
    this.#playingTime = atTime;
    this.#playingChanged = true;
  }

  // For StandInTempoSession.commitState(): the new offset, and what to share, if anything.
  _take(session) {
    if (this.#session !== session) {
      throw new DOMException('This state was captured from another session', 'InvalidModificationError');
    }
    if (this.#committed) {
      throw new DOMException('This state was already committed', 'InvalidStateError');
    }
    this.#committed = true;
    if (!this.#timelineChanged && !this.#playingChanged) {
      return { offset: this.#offset, share: null };
    }
    const share = { ...endpoint.shared };
    if (this.#timelineChanged) {
      Object.assign(share, { tempo: this.#tempo, beatOrigin: this.#beatOrigin, timeOrigin: this.#toHost(this.#timeOrigin) });
    }
    if (this.#playingChanged) {
      Object.assign(share, { playing: this.#playing, playingTime: this.#toHost(this.#playingTime) });
    }
    return { offset: this.#offset, share };
  }
}

export class StandInTempoSession extends EventTarget {
  #quantum;
  #offset = 0;
  #closed = false;
  onpeerschange = null;
  ontimelinechange = null;
  onplayingchange = null;

  constructor(quantum) {
    super();
    this.#quantum = quantum;
    const before = endpoint ? [...endpoint.sessions] : [];
    endpoint ??= new Endpoint();
    endpoint.open(this);
    // A second session in this document is another participant for the first.
    for (const s of before) {
      if (endpoint.peers.size === 0 && endpoint.sessions.size === 2) {
        setTimeout(() => s._fire({ peers: true }));
      }
    }
  }

  static async requestSession(options = {}) {
    const quantum = options?.quantum === undefined ? 4 : toDouble(options.quantum, 'quantum');
    if (quantum <= 0) {
      throw new RangeError('quantum must be positive');
    }
    return new StandInTempoSession(quantum);
  }

  get hasPeers() {
    return !this.#closed && endpoint.others(this);
  }

  get quantum() {
    return this.#quantum;
  }

  captureState(context = undefined) {
    if (this.#closed) {
      throw new DOMException('The session is closed', 'InvalidStateError');
    }
    if (context !== undefined && (typeof BaseAudioContext === 'undefined' || !(context instanceof BaseAudioContext))) {
      throw new TypeError('captureState() takes a BaseAudioContext');
    }
    // Host seconds to this time base: page seconds, then the context's offset from them.
    const contextOffset = context ? audioOffset(context) : 0;
    const origin = performance.timeOrigin / 1000;
    const toLocal = (host) => host - origin - contextOffset;
    const toHost = (local) => local + contextOffset + origin;
    const s = endpoint.shared;
    return new StandInTempoSessionState(this, {
      tempo: s.tempo,
      timeOrigin: toLocal(s.timeOrigin),
      beatOrigin: s.beatOrigin,
      offset: this.#offset,
      quantum: this.#quantum,
      playing: s.playing,
      playingTime: toLocal(s.playingTime),
      solo: !endpoint.others(this),
    }, toHost);
  }

  commitState(state) {
    if (this.#closed) {
      throw new DOMException('The session is closed', 'InvalidStateError');
    }
    if (!(state instanceof StandInTempoSessionState)) {
      throw new TypeError('commitState() takes a TempoSessionState');
    }
    const { offset, share } = state._take(this);
    this.#offset = offset;
    if (share) {
      endpoint.share(share);
    }
  }

  close() {
    if (this.#closed) {
      return;
    }
    this.#closed = true;
    endpoint.close(this);
  }

  _fire(changes) {
    if (this.#closed) {
      return;
    }
    for (const [flag, type] of [['timeline', 'timelinechange'], ['playing', 'playingchange'], ['peers', 'peerschange']]) {
      if (changes[flag]) {
        const event = new Event(type);
        this.dispatchEvent(event);
        this[`on${type}`]?.call(this, event);
      }
    }
  }
}
