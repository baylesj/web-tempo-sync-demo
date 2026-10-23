// In-page fallback implementation of the Web Tempo Sync API.
// Implements Ableton Link timeline semantics in JavaScript.

class FakeTempoSyncState {
  #tempo;
  #beatOrigin;
  #timeOrigin;
  #isPlaying;
  #timeForIsPlaying;
  #timeOffset;
  #isAudioContext;

  constructor({ tempo, beatOrigin, timeOrigin, isPlaying, timeForIsPlaying, timeOffset = 0, isAudioContext = false }) {
    this.#tempo = tempo;
    this.#beatOrigin = beatOrigin;
    this.#timeOrigin = timeOrigin;
    this.#isPlaying = isPlaying;
    this.#timeForIsPlaying = timeForIsPlaying;
    this.#timeOffset = timeOffset;
    this.#isAudioContext = isAudioContext;
  }

  get tempo() {
    return this.#tempo;
  }

  get isPlaying() {
    return this.#isPlaying;
  }

  get timeForIsPlaying() {
    return this.#timeForIsPlaying;
  }

  get _beatOrigin() {
    return this.#beatOrigin;
  }

  get _timeOrigin() {
    return this.#timeOrigin;
  }

  get _timeOffset() {
    return this.#timeOffset;
  }

  get _isAudioContext() {
    return this.#isAudioContext;
  }

  setTempo(bpm, atTime = 0) {
    if (typeof bpm !== 'number' || bpm <= 0) {
      throw new RangeError('BPM must be positive');
    }
    const currentBeat = this.beatAtTime(atTime);
    this.#timeOrigin = atTime;
    this.#beatOrigin = currentBeat;
    this.#tempo = bpm;
  }

  setIsPlaying(playing, atTime = 0) {
    this.#isPlaying = Boolean(playing);
    this.#timeForIsPlaying = atTime;
  }

  beatAtTime(t, quantum = 4) {
    const beatsPerSec = this.#tempo / 60.0;
    return this.#beatOrigin + (t - this.#timeOrigin) * beatsPerSec;
  }

  phaseAtTime(t, quantum = 4) {
    if (quantum <= 0) {
      quantum = 4;
    }
    const beat = this.beatAtTime(t, quantum);
    const mod = beat % quantum;
    return mod < 0 ? mod + quantum : mod;
  }

  timeAtBeat(beat, quantum = 4) {
    const secsPerBeat = 60.0 / this.#tempo;
    return this.#timeOrigin + (beat - this.#beatOrigin) * secsPerBeat;
  }

  requestBeatAtTime(beat, t, quantum = 4) {
    if (quantum <= 0) {
      quantum = 4;
    }
    // Aligns the timeline so that target beat lands at time t while preserving phase
    const curBeat = this.beatAtTime(t, quantum);
    const delta = beat - curBeat;
    const offset = Math.round(delta / quantum) * quantum;
    const targetBeat = curBeat + offset;
    this.#beatOrigin = targetBeat;
    this.#timeOrigin = t;
  }

  forceBeatAtTime(beat, t, quantum = 4) {
    this.#beatOrigin = beat;
    this.#timeOrigin = t;
  }
}

export class FakeTempoSyncSession extends EventTarget {
  #quantum;
  #startStopSync;
  #closed = false;
  #id = Math.random().toString(36).slice(2);
  #broadcastChannel = null;
  // Other tabs in this session: peer id -> last time heard from (ms). Like Link, peers announce themselves and
  // repeat it every second. A tab that closes or navigates away says so and drops out at once; one that just goes
  // quiet drops out after 70 s, longer than Chrome's once-a-minute timer throttling for hidden tabs.
  #peers = new Map();
  #presenceTimer = null;

  #timeline = {
    tempo: 120.0,
    beatOrigin: 0.0,
    timeOrigin: 0.0,
    isPlaying: false,
    timeForIsPlaying: 0.0,
  };

  constructor(options = {}) {
    super();
    this.#quantum = Number(options.quantum) || 4;
    this.#startStopSync = Boolean(options.startStopSync);

    const nowSec = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
    this.#timeline.timeOrigin = nowSec;
    this.#timeline.timeForIsPlaying = nowSec;

    this.#initBroadcastChannel();
  }

  static async requestSession(options = {}) {
    return new FakeTempoSyncSession(options);
  }

  get numPeers() {
    return this.#peers.size;
  }

  get quantum() {
    return this.#quantum;
  }

  get startStopSync() {
    return this.#startStopSync;
  }

  close() {
    if (this.#closed) {
      return;
    }
    this.#closed = true;
    if (this.#presenceTimer !== null) {
      clearInterval(this.#presenceTimer);
      this.#presenceTimer = null;
    }
    this.#post({ type: 'bye' });
    this.#peers.clear();
    if (this.#broadcastChannel) {
      this.#broadcastChannel.close();
      this.#broadcastChannel = null;
    }
  }

  #getAudioContextOffset(audioContext) {
    if (!audioContext) {
      return 0;
    }
    if (typeof audioContext.getOutputTimestamp === 'function') {
      try {
        const ts = audioContext.getOutputTimestamp();
        if (ts && typeof ts.contextTime === 'number' && typeof ts.performanceTime === 'number' && ts.performanceTime > 0) {
          // performanceTime is in ms, contextTime is in seconds.
          // offset = perfSeconds - contextSeconds
          return (ts.performanceTime / 1000) - ts.contextTime;
        }
      } catch (_) {}
    }
    const perfNow = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
    const ctxNow = audioContext.currentTime || 0;
    return perfNow - ctxNow;
  }

  captureState(audioContext = null) {
    if (this.#closed) {
      throw new Error('Session is closed');
    }

    if (audioContext) {
      const offset = this.#getAudioContextOffset(audioContext);
      return new FakeTempoSyncState({
        tempo: this.#timeline.tempo,
        beatOrigin: this.#timeline.beatOrigin,
        timeOrigin: this.#timeline.timeOrigin - offset,
        isPlaying: this.#timeline.isPlaying,
        timeForIsPlaying: this.#timeline.timeForIsPlaying - offset,
        timeOffset: offset,
        isAudioContext: true,
      });
    }

    return new FakeTempoSyncState({
      tempo: this.#timeline.tempo,
      beatOrigin: this.#timeline.beatOrigin,
      timeOrigin: this.#timeline.timeOrigin,
      isPlaying: this.#timeline.isPlaying,
      timeForIsPlaying: this.#timeline.timeForIsPlaying,
      timeOffset: 0,
      isAudioContext: false,
    });
  }

  commitState(state) {
    if (this.#closed) {
      throw new Error('Session is closed');
    }
    if (!(state instanceof FakeTempoSyncState)) {
      throw new TypeError('Invalid state object');
    }

    const prevTempo = this.#timeline.tempo;
    const prevPlaying = this.#timeline.isPlaying;

    const offset = state._timeOffset;
    this.#timeline.tempo = state.tempo;
    this.#timeline.beatOrigin = state._beatOrigin;
    this.#timeline.timeOrigin = state._timeOrigin + offset;
    this.#timeline.isPlaying = state.isPlaying;
    this.#timeline.timeForIsPlaying = state.timeForIsPlaying + offset;

    const tempoChanged = Math.abs(prevTempo - this.#timeline.tempo) > 0.001;
    const playingChanged = prevPlaying !== this.#timeline.isPlaying;

    if (tempoChanged) {
      this.dispatchEvent(new CustomEvent('tempochange', { detail: { tempo: this.#timeline.tempo } }));
    }
    if (playingChanged) {
      this.dispatchEvent(new CustomEvent('playingchange', {
        detail: { isPlaying: this.#timeline.isPlaying, timeForIsPlaying: this.#timeline.timeForIsPlaying }
      }));
    }

    this.#broadcastState();
  }

  #initBroadcastChannel() {
    if (typeof BroadcastChannel === 'undefined') {
      return;
    }
    try {
      this.#broadcastChannel = new BroadcastChannel('web-tempo-sync-fake');
      this.#broadcastChannel.onmessage = (event) => {
        const data = event.data;
        if (!data || data.senderId === this.#id) {
          return;
        }
        if (data.type === 'bye') {
          this.#dropPeer(data.senderId);
          return;
        }
        this.#seePeer(data.senderId);
        if (data.type === 'hello') {
          // A tab just joined: tell it we're here and hand it the session's timeline, as Link does for a joiner.
          this.#post({ type: 'presence' });
          this.#broadcastState();
          return;
        }
        if (data.type !== 'sync-state') {
          return;
        }

        const perfBase = typeof performance !== 'undefined' ? performance.timeOrigin : 0;
        const localTimeOrigin = (data.timeOriginEpoch - perfBase) / 1000;
        const localTimeForIsPlaying = (data.timeForIsPlayingEpoch - perfBase) / 1000;

        const prevTempo = this.#timeline.tempo;
        const prevPlaying = this.#timeline.isPlaying;

        this.#timeline.tempo = data.tempo;
        this.#timeline.beatOrigin = data.beatOrigin;
        this.#timeline.timeOrigin = localTimeOrigin;
        this.#timeline.isPlaying = data.isPlaying;
        this.#timeline.timeForIsPlaying = localTimeForIsPlaying;

        if (Math.abs(prevTempo - this.#timeline.tempo) > 0.001) {
          this.dispatchEvent(new CustomEvent('tempochange', { detail: { tempo: this.#timeline.tempo } }));
        }
        if (prevPlaying !== this.#timeline.isPlaying) {
          this.dispatchEvent(new CustomEvent('playingchange', {
            detail: { isPlaying: this.#timeline.isPlaying, timeForIsPlaying: this.#timeline.timeForIsPlaying }
          }));
        }
      };
      this.#post({ type: 'hello' });
      if (typeof window !== 'undefined') {
        window.addEventListener('pagehide', () => this.#post({ type: 'bye' }));
      }
      this.#presenceTimer = setInterval(() => {
        this.#post({ type: 'presence' });
        const cutoff = Date.now() - 70000;
        for (const [id, seen] of this.#peers) {
          if (seen < cutoff) {
            this.#dropPeer(id);
          }
        }
      }, 1000);
    } catch (_) {}
  }

  #post(message) {
    if (!this.#broadcastChannel) {
      return;
    }
    try {
      this.#broadcastChannel.postMessage({ ...message, senderId: this.#id });
    } catch (_) {}
  }

  #seePeer(id) {
    const isNew = !this.#peers.has(id);
    this.#peers.set(id, Date.now());
    if (isNew) {
      this.dispatchEvent(new CustomEvent('numpeerschange', { detail: { numPeers: this.#peers.size } }));
    }
  }

  #dropPeer(id) {
    if (this.#peers.delete(id)) {
      this.dispatchEvent(new CustomEvent('numpeerschange', { detail: { numPeers: this.#peers.size } }));
    }
  }

  #broadcastState() {
    if (!this.#broadcastChannel) {
      return;
    }
    try {
      const perfBase = typeof performance !== 'undefined' ? performance.timeOrigin : 0;
      this.#broadcastChannel.postMessage({
        type: 'sync-state',
        senderId: this.#id,
        tempo: this.#timeline.tempo,
        beatOrigin: this.#timeline.beatOrigin,
        timeOriginEpoch: perfBase + this.#timeline.timeOrigin * 1000,
        isPlaying: this.#timeline.isPlaying,
        timeForIsPlayingEpoch: perfBase + this.#timeline.timeForIsPlaying * 1000,
        quantum: this.#quantum,
      });
    } catch (_) {}
  }
}

export async function requestTempoSession(options = {}) {
  if (typeof navigator !== 'undefined' && navigator.tempoSync && typeof navigator.tempoSync.requestSession === 'function') {
    const session = await navigator.tempoSync.requestSession(options);
    return { session, isNative: true };
  }
  const session = await FakeTempoSyncSession.requestSession(options);
  return { session, isNative: false };
}
