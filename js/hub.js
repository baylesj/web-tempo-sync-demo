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
//   hub.setTempo(bpm, ctx)                change the session tempo now
//   hub.log(message, tag)                 add a line to the page's log

import { StandInTempoSession } from './stand-in.js';

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

  // Start or stop at the next bar line, so every participant changes on the same beat.
  requestPlaying(willPlay, context) {
    if (!this.session) {
      return null;
    }
    const q = this.session.quantum;
    const state = this.session.captureState(context ?? undefined);
    const now = this.now(context);
    const at = state.timeAtBeat(Math.floor(state.beatAtTime(now, q) / q + 1) * q, q);
    state.setIsPlaying(willPlay, at);
    this.session.commitState(state);
    return at - now;
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
