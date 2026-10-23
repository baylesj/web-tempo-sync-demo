// Page controller: session, transport, metronome, pattern, latency mode and the event log.

import { requestTempoSession } from './fake-session.js';
import { AudioEngine } from './audio.js';
import { BeatRing } from './beat-ring.js';
import { SamplerUI } from './sampler-ui.js';
import { highlightAll } from './highlight.js';

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
  #playLabel = '';
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
      openTabBtn: $('open-tab-btn'),
      standinNote: $('standin-note'),
      goSetupBtn: $('go-setup-btn'),
      tabButtons: Array.from(document.querySelectorAll('.view-tabs [data-tab]')),
      tabViews: {
        sequencer: $('tab-sequencer'),
        setup: $('tab-setup'),
        api: $('tab-api'),
      },
    };
    this.#initUI();
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

    // Tabs live in the URL (#setup, #api; the sequencer has none), so a reload keeps the tab and a tab can be
    // linked. Arrow keys, Home and End move between them, as a tablist should.
    for (const btn of el.tabButtons) {
      btn.addEventListener('click', () => this.#switchTab(btn.dataset.tab));
      btn.addEventListener('keydown', (e) => this.#onTabKey(e, btn));
    }
    window.addEventListener('hashchange', () => this.#switchTab(this.#tabFromHash(), { updateHash: false }));
    this.#switchTab(this.#tabFromHash(), { updateHash: false });
    el.openTabBtn?.addEventListener('click', () => {
      window.open(window.location.href, '_blank', 'noopener');
    });
    el.goSetupBtn?.addEventListener('click', () => {
      this.#switchTab('setup');
    });

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

    // A browser can put audio to sleep (Safari, a backgrounded tab); any tap wakes it.
    document.addEventListener('pointerdown', () => {
      if (this.#audioEngine.hasContext() && !this.#audioEngine.isRunning()) {
        this.#audioEngine.resume().catch(() => {});
      }
    });

    const loop = () => {
      requestAnimationFrame(loop);
      try {
        this.#samplerUI.updatePlayhead();
        this.#updatePlayButton();
      } catch (err) {
        console.warn('Playhead update failed:', err);
      }
    };
    requestAnimationFrame(loop);

    // Space toggles Play/Stop, like Live. Not while typing in a field, and not on a focused button, where
    // space already presses the button.
    document.addEventListener('keydown', (e) => {
      if (e.code !== 'Space' || e.repeat || e.ctrlKey || e.metaKey || e.altKey || !this.#session) {
        return;
      }
      if (e.target instanceof Element && e.target.closest('input, select, textarea, button, [contenteditable]')) {
        return;
      }
      e.preventDefault();
      this.#requestPlaying(!this.#isPlaying());
    });

    this.#log('Press Connect to start audio and join the session.', 'INFO');
  }

  #tabFromHash() {
    const name = window.location.hash.slice(1);
    return name in this.#el.tabViews ? name : 'sequencer';
  }

  #switchTab(tabName, { updateHash = true } = {}) {
    const el = this.#el;
    if (!(tabName in el.tabViews)) {
      tabName = 'sequencer';
    }
    for (const btn of el.tabButtons) {
      const active = btn.dataset.tab === tabName;
      btn.classList.toggle('on', active);
      btn.setAttribute('aria-selected', String(active));
      btn.tabIndex = active ? 0 : -1; // one tab stop for the whole tablist; arrows move inside it
    }
    for (const [key, view] of Object.entries(el.tabViews)) {
      if (view) {
        view.hidden = key !== tabName;
      }
    }
    if (updateHash) {
      const url = tabName === 'sequencer' ? window.location.pathname + window.location.search : `#${tabName}`;
      history.replaceState(null, '', url);
    }
  }

  #onTabKey(e, btn) {
    const tabs = this.#el.tabButtons;
    const i = tabs.indexOf(btn);
    const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
    if (next === undefined) {
      return;
    }
    e.preventDefault();
    const target = tabs[(next + tabs.length) % tabs.length];
    this.#switchTab(target.dataset.tab);
    target.focus();
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
      if (el.openTabBtn) {
        el.openTabBtn.hidden = isNative;
      }
      if (el.standinNote) {
        el.standinNote.hidden = isNative;
      }

      const state = session.captureState();
      this.#syncTempoUI(state.tempo);
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
    if (el.openTabBtn) {
      el.openTabBtn.hidden = true;
    }
    if (el.standinNote) {
      el.standinNote.hidden = true;
    }
    this.#updatePlayButton();
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
    this.#log(isPlaying ? 'Playing' : 'Stopped', 'PLAYING');
  }

  // The one path for tempo changes: the slider and the number field both come through here.
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

  // The one path for play/stop: the button and the space bar. Commits at the next quantum boundary.
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

  // The Play/Stop label, from the session state each frame. A start or stop waits for the next quantum
  // boundary, so while one is pending (timeForIsPlaying still ahead) the button counts down to it. Reading the
  // shared state, not a local flag, means a change committed by another peer counts down here too. Uses the
  // performance.now() time base, like the beat ring, so it keeps counting even if audio is asleep.
  #updatePlayButton() {
    let label = 'Play';
    if (this.#session) {
      const state = this.#session.captureState();
      const wait = state.timeForIsPlaying - performance.now() / 1000;
      if (wait > 0.05) {
        label = `${state.isPlaying ? 'Starts' : 'Stops'} in ${wait.toFixed(1)} s`;
      } else {
        label = state.isPlaying ? 'Stop' : 'Play';
      }
    }
    if (label !== this.#playLabel) {
      this.#playLabel = label;
      this.#el.playStopBtn.textContent = label;
    }
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
  highlightAll();
  new App();
  if (new URLSearchParams(window.location.search).get('autoconnect') === '1') {
    document.getElementById('connect-btn')?.click();
  }
});
