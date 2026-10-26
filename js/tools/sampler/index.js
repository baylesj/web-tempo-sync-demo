// The sampler tab: a sixteen-step pattern, a metronome, the beat ring, and latency clicks.

import { AudioEngine } from './audio.js';
import { BeatRing } from './beat-ring.js';
import { SamplerUI } from './sampler-ui.js';

const STORE_PREFIX = 'tempo-sync-demo.';

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

export function mount(panel, hub) {
  const $ = (id) => panel.querySelector(`#${id}`);
  const engine = new AudioEngine();
  const ring = new BeatRing($('beat-ring-canvas'));
  const sampler = new SamplerUI($('sampler-container'), engine);
  sampler.buildUI();

  const metronome = $('metronome-toggle');
  const volume = $('metronome-volume');
  metronome.checked = Boolean(store.get('metronome', false));
  volume.value = String(store.get('metronomeVolume', 0.6));
  engine.metronome = metronome.checked;
  engine.metronomeVolume = Number(volume.value);
  metronome.addEventListener('change', () => {
    engine.metronome = metronome.checked;
    store.set('metronome', metronome.checked);
    hub.log(`Metronome ${metronome.checked ? 'on' : 'off'}`);
  });
  volume.addEventListener('input', () => {
    engine.metronomeVolume = Number(volume.value);
    store.set('metronomeVolume', Number(volume.value));
  });

  const ms = (v) => (v !== null ? `${v.toFixed(2)} ms` : '–');
  const showLatency = () => {
    $('base-latency-val').textContent = ms(engine.baseLatencyMs);
    $('output-latency-val').textContent = ms(engine.outputLatencyMs);
    $('sample-rate-val').textContent = engine.sampleRate !== null ? `${engine.sampleRate} Hz` : '–';
  };
  $('latency-toggle').addEventListener('change', (e) => {
    engine.latencyMode = e.target.checked;
    hub.log(`Latency clicks ${e.target.checked ? 'on' : 'off'}`);
    showLatency();
  });

  // Audio can only start from a tap. Any tap starts it (Connect included) and wakes it again if
  // the browser put it to sleep (Safari, a backgrounded tab).
  const wake = () => {
    engine.ensureContext();
    if (!engine.isRunning()) {
      engine.resume().then(showLatency, () => {});
    }
  };
  document.addEventListener('pointerdown', wake);
  document.addEventListener('keydown', wake);

  hub.onSession((session) => {
    engine.stopScheduler();
    engine.detach();
    ring.setSession(session);
    sampler.setSession(session);
    if (!session) {
      ring.stop();
      return;
    }
    engine.ensureContext();
    engine.init(session);
    engine.startScheduler();
    ring.start();
    showLatency();
  });

  const loop = () => {
    requestAnimationFrame(loop);
    try {
      sampler.updatePlayhead();
    } catch (err) {
      console.warn('Playhead update failed:', err);
    }
  };
  requestAnimationFrame(loop);
}
