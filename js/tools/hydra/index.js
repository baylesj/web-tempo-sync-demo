// The hydra tab: live-coded visuals with hydra-synth, timed in beats from the shared session.
//
// Hydra keeps its own clock (time += dt * speed each frame). Here every frame sets it from the
// session instead, so `time` is the session's beat and the visuals follow tempo and phase
// changes from any participant. See README.md in this folder for the choices made.

import { CodeEditor } from './editor.js';

// hydra-synth's UMD build, pinned and checked (AGPL-3.0; see README.md).
const HYDRA_URL = 'https://cdn.jsdelivr.net/npm/hydra-synth@1.4.0/dist/hydra-synth.js';
const HYDRA_SRI = 'sha384-/vOuuF0UsnMoxr7eN/uWmNuIDUgt5t++C+G6a+T9WpUwK3vbCAStyB5cq3IajAj0';

const FREE_BPM = 120;
const MAX_PIXELS = 1920 * 1080;
const STORE_KEY = 'tempo-sync-demo.hydra.sketch';

const STARTER = `// time is in beats. pulse() kicks on each beat
// while playing; accent() on each bar's first beat.
shape(4, () => 0.3 + pulse() * 0.25, 0.02)
  .repeat(3, 2)
  .rotate(() => phase() * Math.PI / 2)
  .color(0.55, () => 0.25 + accent() * 0.55, 0.95)
  .add(
    osc(6, 0.1, 0.8).kaleid(4).color(0.8, 0.2, 1)
      .mult(shape(4, 0.6, 0.5)),
    () => 0.1 + accent() * 0.6)
  .modulate(noise(2, 0.05), 0.05)
  .scale(() => 1 + accent() * 0.15)
  .out()
`;

// Settable from a sketch, as in Hydra. Everything else on the synth is read-only.
const USER_PROPS = new Set(['speed', 'update', 'afterUpdate', 'fps']);

const store = {
  get() {
    try {
      return localStorage.getItem(STORE_KEY);
    } catch {
      return null;
    }
  },
  set(value) {
    try {
      localStorage.setItem(STORE_KEY, value);
    } catch {
      /* storage blocked: the sketch lasts until reload */
    }
  },
};

let hydraScript = null;
function loadHydra() {
  hydraScript ??= new Promise((resolve, reject) => {
    if (typeof window.Hydra === 'function') {
      resolve(window.Hydra);
      return;
    }
    const s = document.createElement('script');
    s.src = HYDRA_URL;
    s.integrity = HYDRA_SRI;
    s.crossOrigin = 'anonymous';
    s.onload = () => (typeof window.Hydra === 'function' ? resolve(window.Hydra) : reject(new Error('hydra-synth loaded without a Hydra global')));
    s.onerror = () => {
      hydraScript = null;
      reject(new Error(`couldn't load hydra-synth from ${new URL(HYDRA_URL).host}`));
    };
    document.head.append(s);
  });
  return hydraScript;
}

const frac = (x) => x - Math.floor(x);
const mod = (x, q) => ((x % q) + q) % q;
const num = (v, fallback) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

function describe(args) {
  const err = args.find((a) => a instanceof Error);
  if (err) {
    return `${err.name}: ${err.message}`;
  }
  // Hydra passes the offending function along too; its source isn't much help.
  const text = args.filter((a) => typeof a !== 'function').map(String).join(' ');
  return text.startsWith('function does not return a number')
    ? `${text}: a parameter got a function that returns something else (a Hydra source passed where a number goes?)`
    : text;
}

export async function mount(panel, hub) {
  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = new URL('./style.css', import.meta.url).href;
  document.head.append(css);

  panel.innerHTML = `
    <section class="split" aria-labelledby="hydra-visuals-label">
      <h2 class="label" id="hydra-visuals-label"><span class="n">01</span>visuals</h2>
      <div class="stack">
        <div class="hydra-stage">
          <canvas class="hydra-canvas" role="img" aria-label="Hydra visuals"></canvas>
          <p class="hydra-loading soft">Loading Hydra…</p>
        </div>
        <div class="hydra-readout mono" aria-live="off"></div>
        <div class="hydra-note" hidden>
          <p class="soft">Not connected: the visuals run on a free ${FREE_BPM} BPM clock of their own.</p>
          <button type="button" class="hydra-connect">Connect</button>
        </div>
      </div>
    </section>

    <section class="split" aria-labelledby="hydra-sketch-label">
      <h2 class="label" id="hydra-sketch-label"><span class="n">02</span>sketch</h2>
      <div class="stack">
        <div class="hydra-code"></div>
        <div class="actions">
          <button type="button" class="hydra-run" disabled>Run</button>
          <button type="button" class="quiet hydra-fullscreen">Fullscreen</button>
          <button type="button" class="quiet hydra-reset">Starter sketch</button>
        </div>
        <div class="hydra-output" role="status"></div>
        <p class="help">
          <kbd>Ctrl</kbd>+<kbd>Enter</kbd> (<kbd>⌘</kbd>+<kbd>Enter</kbd> on a Mac) runs the sketch. A sketch
          that fails leaves the last one running.
        </p>
      </div>
    </section>

    <section class="split" aria-labelledby="hydra-time-label">
      <h2 class="label" id="hydra-time-label"><span class="n">03</span>time</h2>
      <div class="stack">
        <p class="soft">
          Hydra's <code>time</code> is the session's beat, so <code>osc(10, 0.1)</code> moves per beat rather than per
          second, and arrays such as <code>osc([10, 20, 40])</code> step once a beat. These read the session; pass
          them to any parameter, as <code>osc(10, 0.1, pulse)</code> or <code>() =&gt; phase() / 4</code>:
        </p>
        <div class="rows hydra-helpers">
          <div class="kv"><code>beat()</code><span>the session's beat (the same as <code>time</code>)</span></div>
          <div class="kv"><code>phase()</code><span>where in the bar, 0 up to the quantum</span></div>
          <div class="kv"><code>bar()</code><span>which bar</span></div>
          <div class="kv"><code>tempo()</code><span>beats per minute</span></div>
          <div class="kv"><code>quantum()</code><span>beats per bar</span></div>
          <div class="kv"><code>playing()</code><span>1 while the session plays, else 0</span></div>
          <div class="kv"><code>pulse(k = 6)</code><span>1 on each beat, decaying by e<sup>−k</sup> over it; 0 when stopped</span></div>
          <div class="kv"><code>accent(k = 3)</code><span>the same on the first beat of each bar</span></div>
        </div>
        <p class="help">
          Time keeps moving while the session is stopped, so the visuals stay in phase; only <code>pulse()</code>,
          <code>accent()</code> and <code>playing()</code> wait for Play. <code>speed</code> still scales
          <code>time</code>; <code>bpm</code> is fixed, because the session sets the tempo.
        </p>
      </div>
    </section>`;

  const $ = (sel) => panel.querySelector(sel);
  const stage = $('.hydra-stage');
  const canvas = $('.hydra-canvas');
  const readout = $('.hydra-readout');
  const note = $('.hydra-note');
  const output = $('.hydra-output');
  const runBtn = $('.hydra-run');
  const fullscreenBtn = $('.hydra-fullscreen');

  // --- The clock: the session's beat, or a free one when there's no session ---

  let session = null;
  const clock = { beat: 0, phase: 0, bar: 0, tempo: FREE_BPM, quantum: hub.quantum, playing: 1, live: false };

  function readClock(nowMs) {
    const t = nowMs / 1000;
    if (session) {
      try {
        const state = session.captureState();
        const q = session.quantum;
        clock.beat = state.beatAtTime(t);
        clock.phase = state.phaseAtTime(t, q);
        clock.tempo = state.tempo;
        clock.quantum = q;
        // A start or stop waits for its time (the next bar line, from Play): until then, the old state holds.
        clock.playing = (t >= state.timeForIsPlaying ? state.isPlaying : !state.isPlaying) ? 1 : 0;
        clock.bar = Math.round((clock.beat - clock.phase) / q);
        clock.live = true;
        return;
      } catch {
        // Closed under us (a new quantum replaces the session); the hub hands over the new one.
      }
    }
    const q = hub.quantum;
    clock.beat = t * (FREE_BPM / 60);
    clock.phase = mod(clock.beat, q);
    clock.bar = Math.floor(clock.beat / q);
    clock.tempo = FREE_BPM;
    clock.quantum = q;
    clock.playing = 1;
    clock.live = false;
  }

  // Read-only views of the clock for sketches. Hydra calls a function parameter with its own
  // props object, so a helper passed bare (osc(10, 0.1, pulse)) ignores anything not a number.
  const helpers = Object.freeze({
    beat: () => clock.beat,
    phase: () => clock.phase,
    bar: () => clock.bar,
    tempo: () => clock.tempo,
    quantum: () => clock.quantum,
    playing: () => clock.playing,
    pulse: (k) => clock.playing * Math.exp(-num(k, 6) * frac(clock.beat)),
    accent: (k) => clock.playing * Math.exp(-num(k, 3) * clock.phase),
  });

  hub.onSession((s) => {
    session = s;
    note.hidden = Boolean(s);
  });
  $('.hydra-connect').addEventListener('click', () => {
    hub.connect().catch((err) => hub.log(`Couldn't connect: ${err.message}`, 'error'));
  });

  // --- The editor ---

  const editor = new CodeEditor($('.hydra-code'), {
    value: store.get() ?? STARTER,
    label: 'Hydra sketch',
    onRun: () => run(),
    onChange: (text) => store.set(text),
  });
  $('.hydra-reset').addEventListener('click', () => {
    editor.value = STARTER;
    store.set(STARTER);
    run();
  });
  runBtn.addEventListener('click', () => run());

  // --- Hydra ---

  let Hydra;
  try {
    Hydra = await loadHydra();
  } catch (err) {
    $('.hydra-loading').textContent = `Hydra couldn't load: ${err.message}.`;
    $('.hydra-loading').classList.add('err');
    hub.log(`hydra: ${err.message}`, 'error');
    return;
  }

  // Hydra reports sketch errors with console.warn and console.log and carries on. While Hydra
  // runs, those go to `sink` instead, to be shown in the tab; anything else passes through.
  const realConsole = { log: console.log, warn: console.warn, error: console.error };
  function withConsole(sink, fn) {
    console.warn = (...args) => sink(describe(args));
    console.error = (...args) => sink(describe(args));
    console.log = (...args) => (args.some((a) => a instanceof Error) ? sink(describe(args)) : sink.log?.(args));
    try {
      return fn();
    } finally {
      Object.assign(console, realConsole);
    }
  }
  const silent = Object.assign(() => {}, { log: () => {} });

  const size = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    let h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    const scale = Math.min(1, Math.sqrt(MAX_PIXELS / (w * h)));
    w = Math.round(w * scale);
    h = Math.round(h * scale);
    return [w, h];
  };
  [canvas.width, canvas.height] = size();

  let hydra;
  try {
    // makeGlobal: false keeps osc, src, o0... off window, where the other tabs live; sketches
    // run against the synth instead (see compile()). Hydra still adds a few methods to
    // Array.prototype (fast, smooth, ease, offset, fit) and a Meyda global; that can't be helped.
    hydra = withConsole(silent, () => new Hydra({
      canvas,
      makeGlobal: false,
      autoLoop: false,
      detectAudio: false,
      enableStreamCapture: false,
      precision: 'highp',
    }));
  } catch (err) {
    $('.hydra-loading').textContent = `Hydra couldn't start: ${err.message}. It needs WebGL.`;
    $('.hydra-loading').classList.add('err');
    hub.log(`hydra: ${err.message}`, 'error');
    return;
  }
  $('.hydra-loading').remove();
  const synth = hydra.synth;
  synth.bpm = 60; // arrays step once per unit of time, which is a beat

  new ResizeObserver(() => {
    const [w, h] = size();
    if (w !== canvas.width || h !== canvas.height) {
      withConsole(silent, () => hydra.setResolution(w, h));
    }
  }).observe(canvas);

  // Sketches see the synth's names (osc, o0, time, ...) and the helpers, through a `with`
  // scope: reading falls through to the page's globals (Math, ...), and assigning to a
  // setting (speed, update) reaches the synth, as with Hydra's globals.
  const scope = new Proxy(Object.create(null), {
    has: (_, key) => typeof key === 'string' && (key in helpers || key in synth || key === 'bpm'),
    get: (_, key) => (key === Symbol.unscopables ? undefined : key in helpers ? helpers[key] : synth[key]),
    set: (_, key, value) => {
      if (key === 'bpm') {
        notes.add('bpm is set by the session here; arrays step once per beat.');
      } else if (USER_PROPS.has(key)) {
        synth[key] = value;
      } else {
        throw new TypeError(`${String(key)} is read-only here${key in helpers || key === 'time' ? ': time comes from the session' : ''}`);
      }
      return true;
    },
  });
  // eslint-disable-next-line no-new-func
  const compile = (code) => new Function('__scope', `with (__scope) {\n${code}\n}`);

  // --- Errors ---

  const notes = new Set();
  let shown = '';
  function show(kind, message) {
    const text = `${kind}|${message}`;
    if (text === shown) {
      return;
    }
    shown = text;
    output.replaceChildren();
    output.className = `hydra-output${kind === 'error' ? ' is-error' : ''}`;
    if (message) {
      const pre = document.createElement('pre');
      pre.textContent = message;
      output.append(pre);
    }
  }

  // Errors while the sketch runs (a parameter function that throws, say): shown, and kept until
  // the next Run, but not repeated every frame.
  let runtimeErrors = 0;
  const runtimeSink = Object.assign((message) => {
    runtimeErrors++;
    show('error', `While running: ${message}`);
  }, { log: (args) => realConsole.log(...args) });

  // --- Drawing ---

  let raf = 0;
  let last = null;
  let frames = 0;
  let lastFrameMs = 0;
  let lastReadout = 0;

  function draw(nowMs, sink = runtimeSink) {
    readClock(nowMs);
    const dt = last === null ? 1000 / 60 : Math.max(0, nowMs - last);
    last = nowMs;
    const speed = num(synth.speed, 1);
    synth.bpm = 60;
    // tick() adds dt * speed to time, so set it a step back: after the tick it's the beat.
    synth.time = (clock.beat - dt * 0.001) * speed;
    withConsole(sink, () => hydra.tick(dt));
    frames++;
    lastFrameMs = nowMs;
    if (nowMs - lastReadout > 100) {
      lastReadout = nowMs;
      const beatInBar = Math.floor(clock.phase) + 1;
      readout.textContent = [
        `bar ${clock.bar}`,
        `beat ${beatInBar}/${clock.quantum}`,
        `time ${synth.time.toFixed(2)}`,
        `${clock.tempo.toFixed(1)} bpm`,
        clock.live ? (clock.playing ? 'playing' : 'stopped') : 'free clock',
      ].join('  ·  ');
    }
  }

  function frame(nowMs) {
    raf = requestAnimationFrame(frame);
    draw(nowMs);
  }

  // Draw only while the panel is showing, on screen, and the page visible. Time comes from the
  // session, so it picks up in phase.
  let onScreen = true;
  function updateRunning() {
    const shouldRun = !panel.hidden && onScreen && !document.hidden;
    if (shouldRun && !raf) {
      last = null;
      raf = requestAnimationFrame(frame);
    } else if (!shouldRun && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  }
  new MutationObserver(updateRunning).observe(panel, { attributes: true, attributeFilter: ['hidden'] });
  new IntersectionObserver((entries) => {
    onScreen = entries.at(-1).isIntersecting;
    updateRunning();
  }).observe(stage);
  document.addEventListener('visibilitychange', updateRunning);

  // --- Running sketches ---

  function run() {
    const code = editor.value;
    const saved = {
      draws: hydra.o.map((o) => o.draw),
      output: hydra.output,
      isRenderingAll: hydra.isRenderingAll,
      ...Object.fromEntries([...USER_PROPS].map((k) => [k, synth[k]])),
    };
    // Each Run is the whole sketch: settings from the last one don't carry over.
    Object.assign(synth, { speed: 1, fps: undefined, update: () => {}, afterUpdate: () => {} });
    hydra.output = hydra.o[0];
    hydra.isRenderingAll = false;
    notes.clear();
    runtimeErrors = 0;

    const errors = [];
    const sink = Object.assign((message) => errors.push(message), { log: (args) => realConsole.log(...args) });
    try {
      withConsole(sink, () => compile(code)(scope));
    } catch (err) {
      errors.push(describe([err]));
    }
    // Draw a frame now, so shader errors show up here rather than on the next frame.
    if (errors.length === 0) {
      draw(performance.now(), sink);
    }

    if (errors.length) {
      hydra.o.forEach((o, i) => (o.draw = saved.draws[i]));
      hydra.output = saved.output;
      hydra.isRenderingAll = saved.isRenderingAll;
      for (const k of USER_PROPS) {
        synth[k] = saved[k];
      }
      show('error', [...new Set(errors)].join('\n'));
      hub.log(`hydra: ${errors[0]}`, 'error');
      return false;
    }
    show('note', [...notes].join('\n'));
    return true;
  }

  // --- Fullscreen ---

  const requestFs = stage.requestFullscreen ?? stage.webkitRequestFullscreen;
  if (!requestFs || document.fullscreenEnabled === false) {
    fullscreenBtn.hidden = true;
  }
  fullscreenBtn.addEventListener('click', () => {
    Promise.resolve(requestFs.call(stage)).catch((err) => show('error', `Fullscreen: ${err.message}`));
  });
  stage.addEventListener('dblclick', () => {
    if (document.fullscreenElement === stage) {
      document.exitFullscreen();
    }
  });

  // For tests and the curious: the synth and the clock this tab draws with.
  Object.defineProperty(panel, 'hydraTool', {
    value: Object.freeze({
      synth,
      clock,
      helpers,
      run,
      get frames() {
        return frames;
      },
      get lastFrameMs() {
        return lastFrameMs;
      },
      get drawing() {
        return Boolean(raf);
      },
      get runtimeErrors() {
        return runtimeErrors;
      },
      editor,
    }),
  });

  runBtn.disabled = false;
  run();
  updateRunning();
}
