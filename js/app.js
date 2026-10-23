// Main application controller for Web Tempo Sync demo.

import { requestTempoSession } from './fake-session.js';
import { AudioEngine } from './audio.js';
import { BeatRing } from './beat-ring.js';
import { SamplerUI } from './sampler-ui.js';

class App {
  #session = null;
  #isNative = false;
  #audioEngine = new AudioEngine();
  #beatRing = null;
  #samplerUI = null;
  #animId = null;

  // DOM Elements
  #elements = {};

  constructor() {
    this.#cacheElements();
    this.#initUI();
  }

  #cacheElements() {
    this.#elements = {
      connectBtn: document.getElementById('connect-btn'),
      statusBadge: document.getElementById('status-badge'),
      peerCount: document.getElementById('peer-count'),
      tempoSlider: document.getElementById('tempo-slider'),
      tempoInput: document.getElementById('tempo-input'),
      playStopBtn: document.getElementById('play-stop-btn'),
      quantumSelect: document.getElementById('quantum-select'),
      beatRingCanvas: document.getElementById('beat-ring-canvas'),
      samplerContainer: document.getElementById('sampler-container'),
      latencyToggle: document.getElementById('latency-toggle'),
      latencyInfo: document.getElementById('latency-info'),
      baseLatencyVal: document.getElementById('base-latency-val'),
      outputLatencyVal: document.getElementById('output-latency-val'),
      sampleRateVal: document.getElementById('sample-rate-val'),
      eventLog: document.getElementById('event-log'),
      clearLogBtn: document.getElementById('clear-log-btn'),
    };
  }

  #initUI() {
    this.#beatRing = new BeatRing(this.#elements.beatRingCanvas);
    this.#samplerUI = new SamplerUI(this.#elements.samplerContainer, this.#audioEngine);
    this.#samplerUI.buildUI();

    this.#elements.connectBtn.addEventListener('click', () => this.#toggleConnect());
    this.#elements.tempoSlider.addEventListener('input', (e) => this.#onTempoInput(Number(e.target.value)));
    this.#elements.tempoInput.addEventListener('change', (e) => this.#onTempoInput(Number(e.target.value)));
    this.#elements.playStopBtn.addEventListener('click', () => this.#togglePlayStop());
    this.#elements.quantumSelect.addEventListener('change', () => this.#onQuantumChange());
    this.#elements.latencyToggle.addEventListener('change', (e) => this.#toggleLatencyMode(e.target.checked));
    this.#elements.clearLogBtn.addEventListener('click', () => this.#clearLog());

    this.#startVisualLoop();
    this.#log('Ready. Click Connect to start audio and join session.', 'INFO');
  }

  async #toggleConnect() {
    if (this.#session) {
      this.#disconnect();
      return;
    }

    try {
      this.#elements.connectBtn.disabled = true;
      this.#elements.connectBtn.textContent = 'Connecting...';

      const quantum = Number(this.#elements.quantumSelect.value) || 4;
      const { session, isNative } = await requestTempoSession({
        quantum,
        startStopSync: true,
      });

      this.#session = session;
      this.#isNative = isNative;

      // Initialize audio engine
      this.#audioEngine.init(this.#session);
      await this.#audioEngine.resume();
      this.#audioEngine.startScheduler();

      // Connect sub-components
      this.#beatRing.setSession(this.#session);
      this.#beatRing.start();
      this.#samplerUI.setSession(this.#session);

      // Register session listeners
      this.#session.addEventListener('numpeerschange', () => this.#onPeersChange());
      this.#session.addEventListener('tempochange', (e) => this.#onTempoChange(e));
      this.#session.addEventListener('playingchange', (e) => this.#onPlayingChange(e));

      // Update UI elements
      this.#elements.connectBtn.disabled = false;
      this.#elements.connectBtn.textContent = 'Disconnect';
      this.#elements.connectBtn.classList.add('btn-connected');

      this.#elements.statusBadge.textContent = isNative ? 'Native API' : 'Fake Session Fallback';
      this.#elements.statusBadge.className = `status-badge ${isNative ? 'badge-native' : 'badge-fake'}`;

      this.#elements.peerCount.textContent = String(this.#session.numPeers);

      // Read initial state
      const state = this.#session.captureState();
      this.#syncTempoUI(state.tempo);
      this.#syncPlayStateUI(state.isPlaying);

      this.#updateLatencyInfo();

      this.#log(
        `Session connected (${isNative ? 'navigator.tempoSync native' : 'fake-session fallback'}). Peer count: ${this.#session.numPeers}`,
        'SESSION'
      );
    } catch (err) {
      console.error('Failed to request tempo session:', err);
      this.#elements.connectBtn.disabled = false;
      this.#elements.connectBtn.textContent = 'Connect';
      this.#log(`Connection error: ${err.message}`, 'ERROR');
    }
  }

  #disconnect() {
    if (!this.#session) {
      return;
    }

    this.#session.close();
    this.#session = null;
    this.#audioEngine.stopScheduler();
    this.#beatRing.setSession(null);
    this.#samplerUI.setSession(null);

    this.#elements.connectBtn.textContent = 'Connect';
    this.#elements.connectBtn.classList.remove('btn-connected');
    this.#elements.statusBadge.textContent = 'Disconnected';
    this.#elements.statusBadge.className = 'status-badge badge-disconnected';
    this.#elements.peerCount.textContent = '0';
    this.#syncPlayStateUI(false);

    this.#log('Session disconnected.', 'SESSION');
  }

  #onPeersChange() {
    if (!this.#session) {
      return;
    }
    const count = this.#session.numPeers;
    this.#elements.peerCount.textContent = String(count);
    this.#log(`Peer count changed: ${count} peer(s) connected`, 'PEERS');
  }

  #onTempoChange(e) {
    if (!this.#session) {
      return;
    }
    const state = this.#session.captureState();
    this.#syncTempoUI(state.tempo);
    this.#log(`Tempo changed: ${state.tempo.toFixed(2)} BPM`, 'TEMPO');
  }

  #onPlayingChange(e) {
    if (!this.#session) {
      return;
    }
    const state = this.#session.captureState();
    this.#syncPlayStateUI(state.isPlaying);
    this.#log(`Play state changed: isPlaying = ${state.isPlaying}`, 'PLAYING');
  }

  #onTempoInput(bpm) {
    if (!this.#session) {
      this.#syncTempoUI(bpm);
      return;
    }
    const clampedBpm = Math.max(60, Math.min(200, bpm));
    this.#syncTempoUI(clampedBpm);

    const ctx = this.#audioEngine.audioContext;
    const state = this.#session.captureState(ctx || null);
    const t = ctx ? ctx.currentTime : performance.now() / 1000;
    state.setTempo(clampedBpm, t);
    this.#session.commitState(state);
  }

  #syncTempoUI(bpm) {
    const rounded = Math.round(bpm * 10) / 10;
    this.#elements.tempoSlider.value = rounded;
    this.#elements.tempoInput.value = rounded.toFixed(1);
  }

  #togglePlayStop() {
    if (!this.#session) {
      return;
    }

    const ctx = this.#audioEngine.audioContext;
    const state = this.#session.captureState(ctx || null);
    const t = ctx ? ctx.currentTime : performance.now() / 1000;
    const quantum = this.#session.quantum || 4;

    const currentBeat = state.beatAtTime(t, quantum);
    // Quantize to the next multiple of quantum
    const nextQuantumBeat = Math.floor(currentBeat / quantum + 1) * quantum;
    const quantizedTime = state.timeAtBeat(nextQuantumBeat, quantum);

    const willPlay = !state.isPlaying;
    state.setIsPlaying(willPlay, quantizedTime);
    this.#session.commitState(state);

    this.#log(
      `Requested ${willPlay ? 'PLAY' : 'STOP'} at quantized beat ${nextQuantumBeat} (time ${quantizedTime.toFixed(3)}s)`,
      'PLAYING'
    );
  }

  #syncPlayStateUI(isPlaying) {
    if (isPlaying) {
      this.#elements.playStopBtn.textContent = 'Stop';
      this.#elements.playStopBtn.classList.add('btn-playing');
    } else {
      this.#elements.playStopBtn.textContent = 'Play';
      this.#elements.playStopBtn.classList.remove('btn-playing');
    }
  }

  async #onQuantumChange() {
    if (!this.#session) {
      return;
    }
    // Reconnect session with new quantum
    this.#log(`Changing quantum to ${this.#elements.quantumSelect.value}...`, 'INFO');
    this.#disconnect();
    await this.#toggleConnect();
  }

  #toggleLatencyMode(enabled) {
    this.#audioEngine.latencyMode = enabled;
    this.#log(`Latency measurement metronome ${enabled ? 'ENABLED' : 'DISABLED'}`, 'INFO');
    this.#updateLatencyInfo();
  }

  #updateLatencyInfo() {
    const baseMs = this.#audioEngine.baseLatencyMs;
    const outMs = this.#audioEngine.outputLatencyMs;
    const sr = this.#audioEngine.sampleRate;

    this.#elements.baseLatencyVal.textContent = baseMs !== null ? `${baseMs.toFixed(2)} ms` : 'N/A';
    this.#elements.outputLatencyVal.textContent = outMs !== null ? `${outMs.toFixed(2)} ms` : 'N/A';
    this.#elements.sampleRateVal.textContent = sr !== null ? `${sr} Hz` : 'N/A';
  }

  #startVisualLoop() {
    const loop = () => {
      if (this.#samplerUI) {
        this.#samplerUI.updatePlayhead();
      }
      this.#animId = requestAnimationFrame(loop);
    };
    this.#animId = requestAnimationFrame(loop);
  }

  #log(message, tag = 'INFO') {
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}.${String(now.getMilliseconds()).padStart(3, '0')}`;

    const item = document.createElement('div');
    item.className = `log-entry log-${tag.toLowerCase()}`;

    const timeSpan = document.createElement('span');
    timeSpan.className = 'log-time';
    timeSpan.textContent = timeStr;

    const tagSpan = document.createElement('span');
    tagSpan.className = `log-tag tag-${tag.toLowerCase()}`;
    tagSpan.textContent = `[${tag}]`;

    const msgSpan = document.createElement('span');
    msgSpan.className = 'log-msg';
    msgSpan.textContent = message;

    item.appendChild(timeSpan);
    item.appendChild(tagSpan);
    item.appendChild(msgSpan);

    this.#elements.eventLog.appendChild(item);
    this.#elements.eventLog.scrollTop = this.#elements.eventLog.scrollHeight;
  }

  #clearLog() {
    this.#elements.eventLog.innerHTML = '';
  }
}

// Bootstrap application on DOMContentLoaded
window.addEventListener('DOMContentLoaded', () => {
  new App();
});
