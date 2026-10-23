// Page controller: session, transport, pattern, MIDI, latency mode and the event log.

import { requestTempoSession } from './fake-session.js';
import { AudioEngine } from './audio.js';
import { BeatRing } from './beat-ring.js';
import { SamplerUI } from './sampler-ui.js';
import { MidiInput } from './midi-input.js';
import { noteName } from './midi-clock.js';

const STORE_PREFIX = 'tempo-sync-demo.';
const TEMPO_MIN = 60;
const TEMPO_MAX = 200;

// localStorage that never throws (private mode, blocked storage).
const store = {
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(STORE_PREFIX + key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(STORE_PREFIX + key, JSON.stringify(value));
    } catch {
      /* storage blocked: the setting lasts until reload */
    }
  },
};

class App {
  #session = null;
  #isNative = false;
  #audioEngine = new AudioEngine();
  #beatRing = null;
  #samplerUI = null;
  #midi = null;
  #noteMap = {}; // learned MIDI note -> track index
  #learnTrack = null;
  #lastClockCommit = 0;
  #el = {};

  constructor() {
    const $ = (id) => document.getElementById(id);
    this.#el = {
      connectBtn: $('connect-btn'),
      statusDot: $('status-dot'),
      statusText: $('status-text'),
      apiText: $('api-text'),
      peerCount: $('peer-count'),
      tempoSlider: $('tempo-slider'),
      tempoInput: $('tempo-input'),
      playStopBtn: $('play-stop-btn'),
      quantumSelect: $('quantum-select'),
      metronomeToggle: $('metronome-toggle'),
      metronomeVolume: $('metronome-volume'),
      beatRingCanvas: $('beat-ring-canvas'),
      samplerContainer: $('sampler-container'),
      latencyToggle: $('latency-toggle'),
      baseLatencyVal: $('base-latency-val'),
      outputLatencyVal: $('output-latency-val'),
      sampleRateVal: $('sample-rate-val'),
      eventLog: $('event-log'),
      clearLogBtn: $('clear-log-btn'),
    };
    this.#initUI();
    this.#initMidi();
  }

  #initUI() {
    const el = this.#el;
    this.#beatRing = new BeatRing(el.beatRingCanvas);
    this.#samplerUI = new SamplerUI(el.samplerContainer, this.#audioEngine);
    this.#samplerUI.buildUI();

    el.connectBtn.addEventListener('click', () => this.#toggleConnect());
    el.tempoSlider.addEventListener('input', (e) => this.#onTempoInput(Number(e.target.value)));
    el.tempoInput.addEventListener('change', (e) => this.#onTempoInput(Number(e.target.value)));
    el.playStopBtn.addEventListener('click', () => this.#requestPlaying(!this.#isPlaying()));
    el.quantumSelect.addEventListener('change', () => this.#onQuantumChange());
    el.latencyToggle.addEventListener('change', (e) => this.#toggleLatencyMode(e.target.checked));
    el.clearLogBtn.addEventListener('click', () => el.eventLog.replaceChildren());

    // Metronome: remembered per browser.
    el.metronomeToggle.checked = Boolean(store.get('metronome', false));
    el.metronomeVolume.value = String(store.get('metronomeVolume', 0.6));
    this.#audioEngine.metronome = el.metronomeToggle.checked;
    this.#audioEngine.metronomeVolume = Number(el.metronomeVolume.value);
    el.metronomeToggle.addEventListener('change', () => {
      this.#audioEngine.metronome = el.metronomeToggle.checked;
      store.set('metronome', el.metronomeToggle.checked);
      this.#log(`Metronome ${el.metronomeToggle.checked ? 'on' : 'off'}`, 'INFO');
    });
    el.metronomeVolume.addEventListener('input', () => {
      this.#audioEngine.metronomeVolume = Number(el.metronomeVolume.value);
      store.set('metronomeVolume', Number(el.metronomeVolume.value));
    });

    // Pads should sound before a session exists, so Connect MIDI starts audio too, inside its own click (browsers
    // refuse to start audio after an await). Any later tap wakes audio that a browser put to sleep.
    $('midi-connect-btn').addEventListener('click', () => {
      this.#audioEngine.ensureContext();
      this.#audioEngine.resume().catch(() => {});
    });
    document.addEventListener('pointerdown', () => {
      if (this.#audioEngine.hasContext() && !this.#audioEngine.isRunning()) {
        this.#audioEngine.resume().catch(() => {});
      }
    });

    const loop = () => {
      requestAnimationFrame(loop);
      try {
        this.#samplerUI.updatePlayhead();
      } catch (err) {
        console.warn('Playhead update failed:', err);
      }
    };
    requestAnimationFrame(loop);
    this.#log('Press Connect to start audio and join the session.', 'INFO');
  }

  // --- MIDI ---

  #initMidi() {
    const saved = store.get('noteMap', {});
    this.#noteMap = saved && typeof saved === 'object' ? saved : {};
    this.#renderNoteLabels();
    this.#samplerUI.onLearn = (track) => this.#setLearn(track);

    const $ = (id) => document.getElementById(id);
    this.#midi = new MidiInput(
      {
        connectBtn: $('midi-connect-btn'),
        select: $('midi-input-select'),
        follow: $('midi-follow'),
        status: $('midi-status'),
        clockBpm: $('midi-clock-bpm'),
        clockDot: $('midi-clock-dot'),
        transport: $('midi-transport'),
        monitor: $('midi-monitor'),
      },
      {
        onClockTempo: (bpm) => this.#followClockTempo(bpm),
        onTransport: (kind) => this.#followClockTransport(kind),
        onNote: (note, velocity) => this.#onNote(note, velocity),
        log: (msg, tag) => this.#log(msg, tag),
      }
    );
  }

  #followClockTempo(bpm) {
    if (!this.#session) {
      return;
    }
    const target = Math.max(TEMPO_MIN, Math.min(TEMPO_MAX, Math.round(bpm * 10) / 10));
    const current = this.#session.captureState().tempo;
    const now = performance.now();
    // Only move the session for a real change, and not more than a few times a second.
    if (Math.abs(target - current) < 0.1 - 1e-6 || now - this.#lastClockCommit < 200) {
      return;
    }
    this.#lastClockCommit = now;
    this.#onTempoInput(target);
  }

  #followClockTransport(kind) {
    if (!this.#session) {
      this.#log(`Ignored ${kind}: connect the session first`, 'MIDI');
      return;
    }
    const play = kind !== 'stop';
    if (play !== this.#isPlaying()) {
      this.#requestPlaying(play);
    }
  }

  #trackForNote(note) {
    const learned = this.#noteMap[note];
    if (Number.isInteger(learned) && learned >= 0 && learned < this.#samplerUI.trackCount) {
      return learned;
    }
    return note % this.#samplerUI.trackCount;
  }

  #onNote(note, velocity) {
    if (this.#learnTrack !== null) {
      const track = this.#learnTrack;
      for (const [n, t] of Object.entries(this.#noteMap)) {
        if (t === track) {
          delete this.#noteMap[n];
        }
      }
      this.#noteMap[note] = track;
      store.set('noteMap', this.#noteMap);
      this.#renderNoteLabels();
      this.#log(`Note ${note} (${noteName(note)}) now plays ${this.#audioEngine.tracks[track].name}`, 'MIDI');
      this.#setLearn(null);
    }
    const track = this.#trackForNote(note);
    if (this.#audioEngine.trigger(track, velocity / 127)) {
      this.#samplerUI.flash(track);
    }
  }

  #setLearn(track) {
    this.#learnTrack = track;
    this.#samplerUI.setLearning(track);
  }

  #renderNoteLabels() {
    this.#audioEngine.tracks.forEach((_, t) => {
      const note = Object.keys(this.#noteMap).find((n) => this.#noteMap[n] === t);
      this.#samplerUI.setNoteLabel(t, note === undefined ? '' : `note ${note}`);
    });
  }

  // --- Session ---

  async #toggleConnect() {
    if (this.#session) {
      this.#disconnect();
      return;
    }
    const el = this.#el;
    try {
      el.connectBtn.disabled = true;
      el.connectBtn.textContent = 'Connecting…';

      // Start audio inside the tap itself, before any await: Safari only lets a page start sound from the
      // tap's own handler, and an AudioContext resumed later can wait forever, which left this on "Connecting…".
      this.#audioEngine.ensureContext();
      const audioReady = this.#audioEngine.resume();

      const quantum = Number(el.quantumSelect.value) || 4;
      const { session, isNative } = await requestTempoSession({ quantum, startStopSync: true });
      this.#session = session;
      this.#isNative = isNative;

      this.#audioEngine.init(session);
      // Never let audio hold up joining the session; if it's still asleep, the next tap wakes it.
      const started = await Promise.race([
        audioReady.then(() => true, () => false),
        new Promise((resolve) => setTimeout(() => resolve(false), 1500)),
      ]);
      if (!started || !this.#audioEngine.isRunning()) {
        this.#log('Sound is off until you tap the page again.', 'INFO');
      }
      this.#audioEngine.startScheduler();

      this.#beatRing.setSession(session);
      this.#beatRing.start();
      this.#samplerUI.setSession(session);

      session.addEventListener('numpeerschange', () => this.#onPeersChange());
      session.addEventListener('tempochange', () => this.#onTempoChange());
      session.addEventListener('playingchange', () => this.#onPlayingChange());

      el.connectBtn.disabled = false;
      el.connectBtn.textContent = 'Disconnect';
      el.connectBtn.classList.add('quiet');
      el.playStopBtn.disabled = false;
      el.playStopBtn.classList.remove('quiet');
      el.statusDot.className = 'dot ok';
      el.statusText.textContent = 'Connected';
      el.apiText.textContent = isNative ? 'navigator.tempoSync' : 'stand-in (BroadcastChannel)';
      el.peerCount.textContent = String(session.numPeers);

      const state = session.captureState();
      this.#syncTempoUI(state.tempo);
      this.#syncPlayStateUI(state.isPlaying);
      this.#updateLatencyInfo();

      this.#log(
        `Joined the session through ${isNative ? 'navigator.tempoSync' : 'the stand-in'}, ${session.numPeers} peers`,
        'SESSION'
      );
    } catch (err) {
      console.error('Could not join the tempo session:', err);
      el.connectBtn.disabled = false;
      el.connectBtn.textContent = 'Connect';
      el.statusDot.className = 'dot err';
      el.statusText.textContent = "Couldn't connect";
      this.#log(`Couldn't join the session: ${err.message}`, 'ERROR');
    }
  }

  #disconnect() {
    if (!this.#session) {
      return;
    }
    const el = this.#el;
    const session = this.#session;
    // Let go of the session everywhere it's read before closing it: a closed session throws on captureState(),
    // and the ring's last redraw and the playhead loop would hit that.
    this.#session = null;
    this.#audioEngine.stopScheduler();
    this.#audioEngine.detach();
    this.#beatRing.setSession(null);
    this.#beatRing.stop();
    this.#samplerUI.setSession(null);
    try {
      session.close();
    } catch (err) {
      console.warn('Closing the session failed:', err);
    }

    el.connectBtn.textContent = 'Connect';
    el.connectBtn.classList.remove('quiet');
    el.playStopBtn.disabled = true;
    el.playStopBtn.classList.add('quiet');
    el.statusDot.className = 'dot';
    el.statusText.textContent = 'Not connected';
    el.apiText.textContent = '–';
    el.peerCount.textContent = '0';
    this.#syncPlayStateUI(false);
    this.#log('Left the session', 'SESSION');
  }

  #onPeersChange() {
    if (!this.#session) {
      return;
    }
    const count = this.#session.numPeers;
    this.#el.peerCount.textContent = String(count);
    this.#log(`${count} ${count === 1 ? 'peer' : 'peers'}`, 'PEERS');
  }

  #onTempoChange() {
    if (!this.#session) {
      return;
    }
    const { tempo } = this.#session.captureState();
    this.#syncTempoUI(tempo);
    this.#log(`Tempo ${tempo.toFixed(2)} bpm`, 'TEMPO');
  }

  #onPlayingChange() {
    if (!this.#session) {
      return;
    }
    const { isPlaying } = this.#session.captureState();
    this.#syncPlayStateUI(isPlaying);
    this.#log(isPlaying ? 'Playing' : 'Stopped', 'PLAYING');
  }

  // The one path for tempo changes: the slider, the number field and MIDI clock all come through here.
  #onTempoInput(bpm) {
    const clamped = Math.max(TEMPO_MIN, Math.min(TEMPO_MAX, bpm));
    this.#syncTempoUI(clamped);
    if (!this.#session) {
      return;
    }
    const ctx = this.#audioEngine.audioContext;
    const state = this.#session.captureState(ctx || null);
    const t = ctx ? ctx.currentTime : performance.now() / 1000;
    state.setTempo(clamped, t);
    this.#session.commitState(state);
  }

  #syncTempoUI(bpm) {
    const rounded = Math.round(bpm * 10) / 10;
    this.#el.tempoSlider.value = rounded;
    this.#el.tempoInput.value = rounded.toFixed(1);
  }

  #isPlaying() {
    return Boolean(this.#session?.captureState().isPlaying);
  }

  // The one path for play/stop: the button and MIDI start/stop. Commits at the next quantum boundary.
  #requestPlaying(willPlay) {
    if (!this.#session) {
      return;
    }
    const ctx = this.#audioEngine.audioContext;
    const state = this.#session.captureState(ctx || null);
    const t = ctx ? ctx.currentTime : performance.now() / 1000;
    const quantum = this.#session.quantum || 4;

    const nextBar = Math.floor(state.beatAtTime(t, quantum) / quantum + 1) * quantum;
    const at = state.timeAtBeat(nextBar, quantum);
    state.setIsPlaying(willPlay, at);
    this.#session.commitState(state);
    this.#log(`${willPlay ? 'Play' : 'Stop'} at beat ${nextBar}, in ${(at - t).toFixed(2)} s`, 'PLAYING');
  }

  #syncPlayStateUI(isPlaying) {
    this.#el.playStopBtn.textContent = isPlaying ? 'Stop' : 'Play';
  }

  async #onQuantumChange() {
    if (!this.#session) {
      return;
    }
    this.#log(`Quantum ${this.#el.quantumSelect.value}, rejoining`, 'INFO');
    this.#disconnect();
    await this.#toggleConnect();
  }

  #toggleLatencyMode(enabled) {
    this.#audioEngine.latencyMode = enabled;
    this.#log(`Latency clicks ${enabled ? 'on' : 'off'}`, 'INFO');
    this.#updateLatencyInfo();
  }

  #updateLatencyInfo() {
    const ms = (v) => (v !== null ? `${v.toFixed(2)} ms` : '–');
    const sr = this.#audioEngine.sampleRate;
    this.#el.baseLatencyVal.textContent = ms(this.#audioEngine.baseLatencyMs);
    this.#el.outputLatencyVal.textContent = ms(this.#audioEngine.outputLatencyMs);
    this.#el.sampleRateVal.textContent = sr !== null ? `${sr} Hz` : '–';
  }

  #log(message, tag = 'INFO') {
    const now = new Date();
    const pad = (n, w = 2) => String(n).padStart(w, '0');
    const item = document.createElement('li');
    if (tag === 'ERROR') {
      item.className = 'err';
    }
    const time = document.createElement('span');
    time.className = 't';
    time.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}.${pad(now.getMilliseconds(), 3)}`;
    const tagSpan = document.createElement('span');
    tagSpan.className = 'tag';
    tagSpan.textContent = tag.toLowerCase();
    const msg = document.createElement('span');
    msg.textContent = message;
    item.append(time, tagSpan, msg);

    const log = this.#el.eventLog;
    const atBottom = log.scrollTop + log.clientHeight >= log.scrollHeight - 4;
    log.appendChild(item);
    while (log.childElementCount > 500) {
      log.firstElementChild.remove();
    }
    if (atBottom) {
      log.scrollTop = log.scrollHeight;
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new App();
  if (new URLSearchParams(window.location.search).get('autoconnect') === '1') {
    document.getElementById('connect-btn')?.click();
  }
});
