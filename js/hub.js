// One tempo session per document, shared by the session bar and every tool tab.
//
// Tools don't call navigator.tempoSync themselves. They ask the hub, which joins through the
// browser's API when there is one (a browser build, or the extension) and the stand-in when
// there isn't, and tells them when the session comes, goes, or is replaced (a new quantum
// rejoins the session).
//
//   hub.onSession((session) => { ... })   called now and on every change; session may be null
//   await hub.connect()                   join (call it from a click: audio needs one)
//   hub.requestPlaying(true, ctx)         start or stop on the next bar line
//   hub.nextBarTime(state, t)             the next bar line far enough ahead to schedule for
//   hub.setTempo(bpm, ctx)                change the session tempo now
//   hub.isPlayingAt(state, t, before)     whether the transport plays at t (see below)
//   hub.log(message, tag)                 add a line to the page's log

import { StandInTempoSession } from './stand-in.js';

// Tools schedule audio up to about 0.25 s ahead (Strudel does), so a start or stop needs at
// least this much notice; closer than this, it waits for the bar after.
const MIN_NOTICE = 0.3;

class Hub extends EventTarget {
  session = null;
  // 'browser' (built in), 'extension', or 'stand-in'.
  source = null;
  quantum = 4;
  #connecting = null;

  get available() {
    return typeof navigator !== 'undefined' && typeof navigator.tempoSync?.requestSession === 'function';
  }

  // The extension's API is plain JavaScript; a browser's is native code.
  get #apiSource() {
    if (!this.available) {
      return 'stand-in';
    }
    const native = Function.prototype.toString.call(navigator.tempoSync.requestSession).includes('[native code]');
    return native ? 'browser' : 'extension';
  }

  connect() {
    if (this.session) {
      return Promise.resolve(this.session);
    }
    this.#connecting ??= (async () => {
      try {
        const options = { quantum: this.quantum };
        const session = this.available
          ? await navigator.tempoSync.requestSession(options)
          : await StandInTempoSession.requestSession(options);
        this.source = this.#apiSource;
        this.#set(session);
        return session;
      } finally {
        this.#connecting = null;
      }
    })();
    return this.#connecting;
  }

  disconnect() {
    const session = this.session;
    if (!session) {
      return;
    }
    // Let go of it everywhere first: a closed session throws on captureState().
    this.#set(null);
    session.close();
  }

  async setQuantum(quantum) {
    this.quantum = quantum;
    if (this.session) {
      this.disconnect();
      await this.connect();
    }
  }

  onSession(fn) {
    const listener = () => fn(this.session);
    this.addEventListener('session', listener);
    fn(this.session);
    return () => this.removeEventListener('session', listener);
  }

  // Seconds in the time base a snapshot captured with `context` uses.
  now(context) {
    return context ? context.currentTime : performance.now() / 1000;
  }

  setTempo(bpm, context) {
    if (!this.session) {
      return;
    }
    const state = this.session.captureState(context ?? undefined);
    state.setTempo(bpm, this.now(context));
    this.session.commitState(state);
  }

  // The first bar line at least MIN_NOTICE after t, in the state's time base.
  nextBarTime(state, t) {
    const q = this.session?.quantum ?? this.quantum;
    let bar = Math.floor(state.beatAtTime(t, q) / q + 1) * q;
    if (state.timeAtBeat(bar, q) - t < MIN_NOTICE) {
      bar += q;
    }
    return state.timeAtBeat(bar, q);
  }

  // Start or stop at the next bar line, so every participant changes on the same beat.
  requestPlaying(willPlay, context) {
    if (!this.session) {
      return null;
    }
    const state = this.session.captureState(context ?? undefined);
    const now = this.now(context);
    const at = this.nextBarTime(state, now);
    state.setIsPlaying(willPlay, at);
    this.session.commitState(state);
    return at - now;
  }

  // A start or stop takes effect at timeForIsPlaying, usually the next bar line. From then on
  // isPlaying holds; before then, whatever held before does. A snapshot can't tell what that
  // was, so pass what you last saw (`before`); without it, a pending change is assumed.
  isPlayingAt(state, t, before = !state.isPlaying) {
    return t >= state.timeForIsPlaying ? state.isPlaying : before;
  }

  log(message, tag = 'info') {
    this.dispatchEvent(new CustomEvent('log', { detail: { message, tag } }));
  }

  #set(session) {
    this.session = session;
    this.dispatchEvent(new Event('session'));
  }
}

export const hub = new Hub();
