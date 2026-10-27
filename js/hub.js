// The tempo sessions of this page: one per tool group, so each tool joins and leaves on its own.
// The session bar shows the hub of the tab you're on. Sessions in the same page count as each
// other's participants, as other tabs do, so two joined tools are "playing along".
//
// Tools don't call navigator.tempoSync themselves. They ask their hub, which joins through the
// browser's API when there is one (a browser build, or the extension) and the stand-in when there
// isn't, and tells them when the session comes, goes, or is replaced (a new quantum rejoins).
//
//   const hub = hubFor('hydra')
//   hub.onSession((session) => { ... })   called now and on every change; session may be null
//   await hub.connect()                   join (call it from a click: audio needs one)
//   hub.requestPlaying(true, ctx)         start or stop on the next bar line
//   hub.nextBarTime(state, t)             the next bar line far enough ahead to schedule for
//   hub.setTempo(bpm, ctx)                change the session tempo now
//   hub.isPlayingAt(state, t, before)     whether the transport plays at t (see isPlayingAt)
//   hub.toggleTool(sw, state, now)        a tool's own Play/Stop (see PlaySwitch)
//   hub.log(message, tag)                 add a line to the page's log

import { StandInTempoSession } from './stand-in.js';
import { isLegacyApi, LegacySession } from './legacy.js';

// Tools schedule audio up to about 0.25 s ahead (Strudel does), so a start or stop needs at
// least this much notice; closer than this, it waits for the bar after.
const MIN_NOTICE = 0.3;

export function apiAvailable() {
  return typeof navigator !== 'undefined' && typeof navigator.tempoSync?.requestSession === 'function';
}

// 'browser' (built in), 'extension', or 'stand-in'. The extension's API is plain JavaScript; a
// browser's is native code.
function apiSource() {
  if (!apiAvailable()) {
    return 'stand-in';
  }
  const native = Function.prototype.toString.call(navigator.tempoSync.requestSession).includes('[native code]');
  return native ? 'browser' : 'extension';
}

// A start or stop takes effect at timeForIsPlaying, usually the next bar line. From then on
// isPlaying holds; before then, whatever held before does. A snapshot can't tell what that was,
// so pass what you last saw (`before`); without it, a pending change is assumed.
export function isPlayingAt(state, t, before = !state.isPlaying) {
  return t >= state.timeForIsPlaying ? state.isPlaying : before;
}

// A tool's own Play/Stop, layered on the session's. With the session stopped, a tool's Play starts
// it for everyone (nothing else is playing to interrupt). While it plays, a tool's Play/Stop only
// starts or stops that tool, on the next bar line, so stopping one tool doesn't stop the others.
// The session bar's Play/Stop is still everyone's. A tool plays along by default.
export class PlaySwitch {
  on = true;
  at = -Infinity; // when `on` takes effect
  #before = true;

  // Whether the tool plays at t (the session permitting).
  playingAt(t) {
    return t >= this.at ? this.on : this.#before;
  }

  // Seconds until a pending change takes effect, or 0.
  wait(now) {
    return Math.max(0, this.at - now);
  }

  set(on, now, at = -Infinity) {
    this.#before = this.playingAt(now);
    this.on = on;
    this.at = at;
  }
}

export class Hub extends EventTarget {
  session = null;
  // 'browser', 'browser v0.1' (the prototype build, adapted), 'extension', or 'stand-in'.
  source = null;
  quantum = 4;
  #connecting = null;

  constructor(name) {
    super();
    this.name = name;
  }

  get available() {
    return apiAvailable();
  }

  connect() {
    if (this.session) {
      return Promise.resolve(this.session);
    }
    this.#connecting ??= (async () => {
      try {
        const options = { quantum: this.quantum };
        let session = apiAvailable()
          ? await navigator.tempoSync.requestSession(options)
          : await StandInTempoSession.requestSession(options);
        this.source = apiSource();
        if (this.source === 'browser' && isLegacyApi()) {
          session = new LegacySession(session);
          this.source = 'browser v0.1';
        }
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

  isPlayingAt(state, t, before) {
    return isPlayingAt(state, t, before);
  }

  // A tool's Play/Stop, given a snapshot and the time in its time base. Returns 'start' when the
  // session is stopped: the tool then starts the session (through its own transport, if it has
  // one). Otherwise flips the tool's switch at the next bar line and returns 'on' or 'off'.
  toggleTool(sw, state, now) {
    if (!state.isPlaying) {
      sw.set(true, now);
      return 'start';
    }
    sw.set(!sw.on, now, this.nextBarTime(state, now));
    return sw.on ? 'on' : 'off';
  }

  log(message, tag = 'info') {
    this.dispatchEvent(new CustomEvent('log', { detail: { message, tag } }));
  }

  #set(session) {
    this.session = session;
    this.dispatchEvent(new Event('session'));
  }
}

const hubs = new Map();

// The hub for a tool group, made the first time it's asked for.
export function hubFor(group) {
  if (!hubs.has(group)) {
    hubs.set(group, new Hub(group));
  }
  return hubs.get(group);
}
