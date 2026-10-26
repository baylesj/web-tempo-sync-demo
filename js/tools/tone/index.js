// The tone.js tab: a three-voice instrument on a Tone.js fork whose Transport follows the
// session (vendor/FORK.md). The Transport plays when the session plays, starting on its bar
// line; its bpm follows the session's tempo, and changing it here changes the session's.

import { BARS, KEYS, MOODS, makePatterns } from './music.js';
import { Instrument, SOUNDS } from './instrument.js';

const STORE_PREFIX = 'tempo-sync-demo.tone.';
const TEMPO_MIN = 60;
const TEMPO_MAX = 200;
const VOICES = ['lead', 'chords', 'bass'];

// localStorage that never throws (private mode, blocked storage).
const store = {
  get(key, fallback) {
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

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') {
      node.className = v;
    } else if (k === 'text') {
      node.textContent = v;
    } else {
      node.setAttribute(k, v);
    }
  }
  node.append(...children);
  return node;
}

function section(n, label, id, ...body) {
  return el('section', { class: 'split', 'aria-labelledby': id },
    el('h2', { class: 'label', id }, el('span', { class: 'n', text: n }), label),
    el('div', { class: 'stack' }, ...body));
}

function seg(label, options, current, onPick) {
  const group = el('div', { class: 'seg', role: 'group', 'aria-label': label });
  const buttons = options.map((value) => {
    const b = el('button', { type: 'button', text: value, 'aria-pressed': String(value === current) });
    b.classList.toggle('on', value === current);
    b.addEventListener('click', () => {
      buttons.forEach((o) => {
        o.classList.toggle('on', o === b);
        o.setAttribute('aria-pressed', String(o === b));
      });
      onPick(value);
    });
    return b;
  });
  group.append(...buttons);
  return group;
}

function loadStyle() {
  const href = new URL('./style.css', import.meta.url).href;
  if (!document.querySelector(`link[href="${href}"]`)) {
    document.head.append(el('link', { rel: 'stylesheet', href }));
  }
}

// The vendored build is Tone's UMD bundle: importing it defines globalThis.Tone.
async function loadTone() {
  await import('./vendor/Tone.js');
  return globalThis.Tone;
}

export async function mount(panel, hub) {
  loadStyle();
  const Tone = await loadTone();

  // A native AudioContext, so the session can give times in its currentTime: Tone's own
  // default is a standardized-audio-context wrapper, which captureState() won't take.
  const audio = new AudioContext({ latencyHint: 'interactive' });
  Tone.setContext(audio, true);
  const transport = Tone.getTransport();
  const instrument = new Instrument(Tone);

  const settings = {
    mood: store.get('mood', 'night'),
    key: store.get('key', 'A'),
    sound: store.get('sound', 'warm'),
    density: store.get('density', 0.5),
    volume: store.get('volume', -8),
    seed: store.get('seed', 20261026),
    mutes: store.get('mutes', { bass: false, chords: false, lead: false }),
  };
  if (!(settings.mood in MOODS)) settings.mood = 'night';
  if (!(settings.sound in SOUNDS)) settings.sound = 'warm';
  instrument.setSound(settings.sound);
  instrument.volume = settings.volume;
  Object.assign(instrument.mutes, settings.mutes);

  let steps = 16;
  let patterns = [];
  let sync = null;
  let sequence = null;
  const regenerate = () => {
    patterns = makePatterns({ ...settings, steps });
    renderGrid(true);
  };

  // --- Page ---

  const playBtn = el('button', { type: 'button', text: 'Play' });
  const tempoInput = el('input', { class: 'tempo-number', type: 'number', min: TEMPO_MIN, max: TEMPO_MAX, step: '0.1', value: '120.0', 'aria-label': 'Transport bpm' });
  const playStatus = el('span', { class: 'mono soft', text: '' });
  const connectBtn = el('button', { type: 'button', text: 'Connect' });
  const noSession = el('div', { class: 'stack tone-nosession' },
    el('p', { class: 'soft', text: 'Join the session to play. The instrument then follows its tempo, its bar lines and its start and stop, with every other tab and with Live.' }),
    el('div', { class: 'actions' }, connectBtn));
  const playControls = el('div', { class: 'stack' },
    el('div', { class: 'actions tone-transport' }, playBtn,
      el('label', { class: 'sub', for: 'tone-bpm', text: 'transport bpm' }), tempoInput, playStatus),
    el('p', { class: 'help', text: 'Play waits for the next bar line when someone else is playing, and starts at once when you are alone. Stop waits for the bar line too. The bpm here is the Transport’s own: change it and the whole session follows.' }));
  tempoInput.id = 'tone-bpm';

  const readout = {
    bpm: el('span', { class: 'mono', text: '–' }),
    position: el('span', { class: 'mono', text: '–' }),
    offset: el('span', { class: 'mono', text: '–' }),
  };
  const rows = el('div', { class: 'rows' },
    el('div', { class: 'kv' }, el('span', { text: 'transport' }), readout.bpm),
    el('div', { class: 'kv' }, el('span', { text: 'position' }), readout.position),
    el('div', { class: 'kv' }, el('span', { text: 'vs session' }), readout.offset));

  const barsStrip = el('div', { class: 'tone-bars', 'aria-label': 'The four-bar progression' });
  const grid = el('div', { class: 'tone-grid', role: 'img', 'aria-label': 'This bar of the pattern, with the playhead' });

  const keySelect = el('select', { id: 'tone-key', 'aria-label': 'Key' }, ...KEYS.map((k) => el('option', { value: k, text: k })));
  keySelect.value = settings.key;
  const density = el('input', { id: 'tone-density', type: 'range', min: '0', max: '1', step: '0.05', value: String(settings.density) });
  const volume = el('input', { id: 'tone-volume', type: 'range', min: '-40', max: '0', step: '1', value: String(settings.volume) });
  const reroll = el('button', { type: 'button', class: 'quiet', text: 'New pattern' });
  const seedText = el('span', { class: 'mono soft' });
  const voiceSwitches = el('div', { class: 'actions' }, ...VOICES.map((voice) => {
    const input = el('input', { type: 'checkbox' });
    input.checked = !settings.mutes[voice];
    input.addEventListener('change', () => {
      settings.mutes[voice] = !input.checked;
      instrument.mutes[voice] = !input.checked;
      store.set('mutes', settings.mutes);
      renderGrid(true);
    });
    return el('label', { class: 'switch' }, input, el('span', { class: 'track', 'aria-hidden': 'true' }), el('span', { text: voice }));
  }));

  const field = (id, label, control) => el('div', { class: 'tone-field' }, el('label', { class: 'sub', for: id, text: label }), control);
  const controls = el('div', { class: 'tone-controls' },
    el('div', { class: 'tone-field' }, el('span', { class: 'sub', text: 'mood' }),
      seg('Mood', Object.keys(MOODS), settings.mood, (v) => { settings.mood = v; store.set('mood', v); regenerate(); })),
    el('div', { class: 'tone-field' }, el('span', { class: 'sub', text: 'sound' }),
      seg('Sound', Object.keys(SOUNDS), settings.sound, (v) => { settings.sound = v; store.set('sound', v); instrument.setSound(v); })),
    field('tone-key', 'key', keySelect),
    field('tone-density', 'density', density),
    field('tone-volume', 'volume', volume));

  panel.replaceChildren(
    section('01', 'play', 'tone-play-label', noSession, playControls, rows),
    section('02', 'bar', 'tone-bar-label', barsStrip, grid,
      el('p', { class: 'help', text: 'Four bars, one chord each. The playhead is the Transport’s position, which lands on the session’s bar line; two windows that start together play the same bar.' })),
    section('03', 'sound', 'tone-sound-label', controls, voiceSwitches,
      el('div', { class: 'actions' }, reroll, seedText),
      el('p', { class: 'help', text: 'Patterns come from a seed, so another window with the same settings and seed plays along note for note.' })),
    section('04', 'how', 'tone-how-label',
      el('p', { class: 'soft', text: 'Tone.js with one addition: the Transport can follow a tempo session. The session is duck-typed, so anything shaped like Web Tempo Sync’s works.' }),
      el('pre', { class: 'code-snippet' }, el('code', { text: [
        "Tone.setContext(new AudioContext()); // native, for captureState()",
        "const session = await navigator.tempoSync.requestSession({ quantum: 4 });",
        "const sync = Tone.getTransport().syncTempoSession(session);",
        "Tone.getTransport().start(); // on the session's next bar line",
        "sync.dispose(); // stop following",
      ].join('\n') })),
      el('p', { class: 'help' }, 'Source, credits and licenses: ', el('a', { href: new URL('./README.md', import.meta.url).href, text: 'js/tools/tone/README.md' }), '.')),
  );

  // --- Grid ---

  let gridCells = { lead: [], chords: [], bass: [] };
  let gridBar = -1;
  let gridStep = -1;
  function buildGrid() {
    grid.replaceChildren();
    grid.style.setProperty('--steps', String(steps));
    gridCells = {};
    for (const voice of VOICES) {
      const row = el('div', { class: 'tone-row' }, el('span', { class: 'tone-voice mono', text: voice }));
      const cells = el('div', { class: 'tone-steps' });
      gridCells[voice] = Array.from({ length: steps }, (_, s) => {
        const c = el('span', { class: s % 4 === 0 ? 'cell beat' : 'cell' });
        cells.append(c);
        return c;
      });
      row.append(cells);
      grid.append(row);
    }
    barsStrip.replaceChildren(...Array.from({ length: BARS }, () => el('span', { class: 'mono' })));
    gridBar = -1;
  }

  function renderGrid(force = false, bar = Math.max(gridBar, 0)) {
    if (!force && bar === gridBar) {
      return;
    }
    gridBar = bar;
    const pattern = patterns[bar];
    if (!pattern) {
      return;
    }
    for (const voice of VOICES) {
      let hold = 0;
      gridCells[voice].forEach((cell, s) => {
        const event = pattern[voice][s];
        if (event) {
          hold = event.steps;
        }
        cell.classList.toggle('hit', Boolean(event));
        cell.classList.toggle('hold', !event && hold > 0);
        cell.classList.toggle('muted', settings.mutes[voice]);
        hold--;
      });
    }
    [...barsStrip.children].forEach((b, i) => {
      b.textContent = patterns[i]?.chord ?? '';
      b.classList.toggle('on', i === bar);
    });
  }

  function renderPlayhead(step) {
    if (step === gridStep) {
      return;
    }
    for (const voice of VOICES) {
      gridCells[voice][gridStep]?.classList.remove('now');
      gridCells[voice][step]?.classList.add('now');
    }
    gridStep = step;
  }

  // --- Controls ---

  keySelect.addEventListener('change', () => { settings.key = keySelect.value; store.set('key', settings.key); regenerate(); });
  density.addEventListener('input', () => { settings.density = Number(density.value); store.set('density', settings.density); regenerate(); });
  volume.addEventListener('input', () => { settings.volume = Number(volume.value); store.set('volume', settings.volume); instrument.volume = settings.volume; });
  const showSeed = () => { seedText.textContent = `seed ${settings.seed}`; };
  reroll.addEventListener('click', () => {
    settings.seed = Math.floor(Math.random() * 1e8);
    store.set('seed', settings.seed);
    showSeed();
    regenerate();
    hub.log(`Tone.js: new pattern, seed ${settings.seed}`);
  });
  showSeed();

  // Audio can only start from a tap. Any tap wakes it (Connect included).
  const wake = () => {
    if (audio.state !== 'running') {
      audio.resume().catch(() => {});
    }
  };
  document.addEventListener('pointerdown', wake);
  document.addEventListener('keydown', wake);

  connectBtn.addEventListener('click', async () => {
    wake();
    connectBtn.disabled = true;
    try {
      await hub.connect();
    } catch (err) {
      hub.log(`Couldn't join the session: ${err.message}`, 'error');
    } finally {
      connectBtn.disabled = false;
    }
  });

  // Play and Stop go through the Transport: the fork commits them to the session.
  playBtn.addEventListener('click', () => {
    if (!sync) {
      return;
    }
    wake();
    const state = sync.captureState();
    if (state.isPlaying) {
      // on the next bar line, as the session bar does
      transport.stop(transport.nextSubdivision('1m') || undefined);
      hub.log('Tone.js: stop on the next bar');
    } else {
      transport.start();
      hub.log('Tone.js: Transport.start(), on the next bar line');
    }
  });

  tempoInput.addEventListener('change', () => {
    const bpm = Math.max(TEMPO_MIN, Math.min(TEMPO_MAX, Number(tempoInput.value) || 120));
    // the fork sees the Transport's bpm change, and commits it to the session
    transport.bpm.value = bpm;
    hub.log(`Tone.js: Transport bpm ${bpm.toFixed(1)}`, 'tempo');
  });

  buildGrid();
  regenerate();

  // --- Session ---

  function startSequence() {
    sequence?.dispose();
    const ppq = transport.PPQ;
    sequence = new Tone.Sequence((time) => {
      // which bar of the progression, from the Transport's position: the same in every window
      const sixteenth = Math.round(transport.getTicksAtTime(time) / (ppq / 4));
      const bar = Math.floor(sixteenth / steps) % BARS;
      const step = ((sixteenth % steps) + steps) % steps;
      const pattern = patterns[bar];
      if (pattern) {
        instrument.playStep(pattern, step, time, 60 / transport.bpm.getValueAtTime(time) / 4);
      }
    }, Array.from({ length: steps }, (_, i) => i), '16n').start(0);
  }

  hub.onSession((session) => {
    sync?.dispose();
    sync = null;
    noSession.hidden = Boolean(session);
    playControls.hidden = !session;
    rows.hidden = !session;
    if (!session) {
      transport.stop();
      instrument.releaseAll();
      return;
    }
    const q = session.quantum;
    transport.timeSignature = q;
    steps = Math.round(q * 4);
    buildGrid();
    regenerate();
    startSequence();
    sync = transport.syncTempoSession(session, { quantum: q });
    instrument.setTempo(sync.tempo ?? 120);
  });

  // --- Each frame: the playhead, the readouts, the Play label ---

  let lastTempo = 0;
  let playLabel = '';
  function frame() {
    requestAnimationFrame(frame);
    if (!sync || sync.disposed) {
      renderPlayhead(-1);
      return;
    }
    const t = audio.currentTime;
    const state = sync.captureState();
    const bpm = transport.bpm.getValueAtTime(t);
    if (sync.tempo && sync.tempo !== lastTempo) {
      lastTempo = sync.tempo;
      instrument.setTempo(lastTempo);
      if (document.activeElement !== tempoInput) {
        tempoInput.value = lastTempo.toFixed(1);
      }
    }
    const wait = state.timeForIsPlaying - t;
    const playing = state.isPlaying && wait <= 0;
    let label = state.isPlaying ? 'Stop' : 'Play';
    if (wait > 0.05) {
      label = `${state.isPlaying ? 'Starts' : 'Stops'} in ${wait.toFixed(1)} s`;
    }
    if (label !== playLabel) {
      playLabel = label;
      playBtn.textContent = label;
      playBtn.classList.toggle('quiet', state.isPlaying && wait <= 0.05);
    }
    playStatus.textContent = audio.state === 'running' ? '' : 'tap anywhere to turn the sound on';

    readout.bpm.textContent = `${bpm.toFixed(2)} bpm (session ${state.tempo.toFixed(2)})`;
    const stats = measure(t, state);
    if (playing && stats) {
      const ticks = stats.ticks;
      const sixteenth = Math.floor(ticks / (transport.PPQ / 4) + 1e-6);
      const bar = Math.floor(sixteenth / steps);
      const beat = Math.floor((sixteenth % steps) / 4);
      readout.position.textContent = `bar ${bar + 1} · beat ${beat + 1} · ${transport.position}`;
      readout.offset.textContent = `${stats.errorMs >= 0 ? '+' : ''}${stats.errorMs.toFixed(2)} ms`;
      renderGrid(false, ((bar % BARS) + BARS) % BARS);
      renderPlayhead(((sixteenth % steps) + steps) % steps);
    } else {
      readout.position.textContent = state.isPlaying ? 'waiting for the bar line' : 'stopped';
      readout.offset.textContent = '–';
      renderPlayhead(-1);
    }
  }

  // The Transport's bar position against the session's phase, at a context time.
  function measure(t = audio.currentTime, state = sync?.captureState()) {
    if (!sync || !state) {
      return null;
    }
    const q = sync.quantum;
    const ticks = transport.getTicksAtTime(t);
    const beats = ticks / transport.PPQ;
    const phase = state.phaseAtTime(t, q);
    const error = ((((beats % q) - phase + q / 2) % q) + q) % q - q / 2;
    return { t, q, ticks, beats, phase, errorMs: (error * 60000) / state.tempo };
  }

  // For the console and end-to-end tests.
  globalThis.__toneTab = {
    Tone,
    transport,
    get sync() {
      return sync;
    },
    stats() {
      const state = sync?.captureState();
      const m = measure(audio.currentTime, state);
      return {
        contextState: audio.state,
        currentTime: audio.currentTime,
        native: Tone.getContext().rawContext === audio,
        transportBpm: transport.bpm.getValueAtTime(audio.currentTime),
        sessionTempo: state?.tempo ?? null,
        transportState: transport.state,
        sessionPlaying: state?.isPlaying ?? null,
        timeForIsPlaying: state?.timeForIsPlaying ?? null,
        barPosition: m ? (m.beats % m.q) / m.q : null,
        sessionBarPosition: m ? m.phase / m.q : null,
        errorMs: m?.errorMs ?? null,
        position: transport.position,
      };
    },
  };

  requestAnimationFrame(frame);
}
