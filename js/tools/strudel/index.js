// The strudel tab: live coding with Strudel, its scheduler following the shared session.
//
// One Strudel cycle is one bar (the session's quantum, in beats). Strudel's Cyclist counts
// cycles from an anchor ({cycles, seconds}) that it takes on the tick after its tick counter is
// reset. Between ticks, this tool compares the cycle Strudel will reach at its next tick with the
// cycle the session says it should be, and if they differ (or the tempo changed) it sets the
// cycle and cps and resets the counter, so the next tick re-anchors there. Cycle 0 is the bar
// the shared transport started on. See README.md in this folder.

const STRUDEL_VERSION = '1.3.0';
// @strudel/repl's ES build, pinned and checked (AGPL-3.0; see README.md). This chunk defines
// <strudel-editor>; the chunks it imports later (tonal, soundfonts, midi...) load beside it.
const STRUDEL_URL = `https://cdn.jsdelivr.net/npm/@strudel/repl@${STRUDEL_VERSION}/dist/index-1NNF4L0p.js`;
const STRUDEL_SRI = 'sha384-DhNACDPoOCU4/fpM2FdoCwDCoredmAq9YMPoO1uRgoSTFSCOorb0UJLQXuop7p9s';

const STORE_KEY = 'tempo-sync-demo.strudel.code';
const FOLLOW_MS = 25;
// Re-anchor when Strudel is more than this many cycles off the session (0.5 ms at 120 BPM in 4/4).
const TOLERANCE = 0.00025;
const MIN_BPM = 20;
const MAX_BPM = 999;

const STARTER = `// One cycle is one bar of the session. Ctrl+Enter (⌘+Enter) runs or updates.
// Everything here is a synth, so nothing has to download.
// setcpm(30) // a tempo in the code sets everyone's: 30 bars a minute is 120 BPM in 4/4

$: s("sbd*4").decay(.4).gain(.9)
$: s("[- white]*4").decay(.07).sustain(0).hpf(6000).gain(.25)
$: s("white*16").decay(.02).sustain(0).hpf(9000).gain("<.08 .12>")

$: note("<c2 c2 ab1 bb1>*8").s("sawtooth")
  .lpf(sine.range(300, 1800).slow(4)).lpq(6)
  .decay(.15).sustain(0).gain(.4)

$: note("<[c4,eb4,g4] [ab3,c4,eb4] [bb3,d4,f4] [g3,b3,d4]>")
  .s("triangle").attack(.1).release(.8).room(.6).gain(.18)

$: n("0 2 4 <7 6> - 4 <2 3> -").scale("C5:minor")
  .s("square").lpf(2200).decay(.12).sustain(0)
  .delay(.35).delaytime(3/16).gain(.1)
`;

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
      /* storage blocked: the code lasts until reload */
    }
  },
};

let strudelScript = null;
function loadStrudel() {
  strudelScript ??= new Promise((resolve, reject) => {
    if (customElements.get('strudel-editor')) {
      resolve();
      return;
    }
    const s = document.createElement('script');
    s.type = 'module';
    s.src = STRUDEL_URL;
    s.integrity = STRUDEL_SRI;
    s.crossOrigin = 'anonymous';
    s.onload = () => (customElements.get('strudel-editor') ? resolve() : reject(new Error('Strudel loaded without <strudel-editor>')));
    s.onerror = () => {
      strudelScript = null;
      reject(new Error(`couldn't load Strudel from ${new URL(STRUDEL_URL).host}`));
    };
    document.head.append(s);
  });
  return strudelScript;
}

// What tests (and the curious) can read: the scheduler, the session, and where cycle 0 is.
export const debug = { mirror: null, scheduler: null, context: null, session: null, origin: null, reanchors: 0, gate: null };

export async function mount(panel, hub) {
  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = new URL('./style.css', import.meta.url).href;
  document.head.append(css);

  panel.innerHTML = `
    <section class="split" aria-labelledby="strudel-code-label">
      <h2 class="label" id="strudel-code-label"><span class="n">01</span>code</h2>
      <div class="stack">
        <div class="strudel-note" hidden>
          <p class="soft">Not connected. Connect to play in time with the session.</p>
          <button type="button" class="strudel-connect">Connect</button>
        </div>
        <div class="strudel-code"><p class="strudel-loading soft">Loading Strudel…</p></div>
        <div class="actions">
          <button type="button" class="strudel-run" disabled>Run</button>
          <button type="button" class="quiet strudel-stop" disabled>Stop</button>
          <button type="button" class="quiet strudel-reset">Starter pattern</button>
        </div>
        <div class="strudel-readout mono" aria-live="off"></div>
        <div class="strudel-output" role="status"></div>
        <p class="help">
          <kbd>Ctrl</kbd>+<kbd>Enter</kbd> (<kbd>⌘</kbd>+<kbd>Enter</kbd> on a Mac) runs or updates the code;
          <kbd>Ctrl</kbd>+<kbd>.</kbd> stops. If the session is stopped, Run starts it on the next bar line, for
          everyone. Stop here stops just Strudel on the next bar line, and anything else playing carries on; the
          session bar's Stop stops everyone.
        </p>
      </div>
    </section>

    <section class="split" aria-labelledby="strudel-time-label">
      <h2 class="label" id="strudel-time-label"><span class="n">02</span>time</h2>
      <div class="stack">
        <p class="soft">
          One cycle is one bar of the session, so <code>s("sbd*4")</code> plays every beat in 4/4. Cycle 0 is the bar
          the session started on. Strudel follows tempo changes from anyone, and <code>setcps()</code> or
          <code>setcpm()</code> in the code changes the session's tempo: cycles per minute times the beats in a bar
          is BPM.
        </p>
        <p class="help">
          Strudel plays while the session plays: Play in the session bar, in another tab or in Live starts it again
          after you've run code here. Sounds other than the synths (<code>s("bd sd")</code> and the like) load from
          Strudel's sample maps the first time they play.
        </p>
      </div>
    </section>`;

  const $ = (sel) => panel.querySelector(sel);
  const note = $('.strudel-note');
  const host = $('.strudel-code');
  const runBtn = $('.strudel-run');
  const stopBtn = $('.strudel-stop');
  const readout = $('.strudel-readout');
  const output = $('.strudel-output');

  let session = null;

  // Strudel's AudioContext, made at the first tap (audio needs one) rather than at load.
  let strudelReady = false;
  let ctx = null;
  let audioReady = null;
  function wakeAudio() {
    if (!strudelReady) {
      return;
    }
    ctx ??= globalThis.getAudioContext();
    debug.context = ctx;
    if (ctx.state !== 'running') {
      ctx.resume().catch(() => {});
    }
    // AudioWorklet effects; Strudel loads these on the first mousedown, which a keyboard user
    // never sends.
    audioReady ??= Promise.resolve(globalThis.initAudio?.()).catch(() => {});
  }

  hub.onSession((s) => {
    note.hidden = Boolean(s);
  });
  $('.strudel-connect').addEventListener('click', () => {
    wakeAudio();
    hub.connect().catch((err) => hub.log(`Couldn't connect: ${err.message}`, 'error'));
  });

  function show(kind, message) {
    output.replaceChildren();
    output.className = `strudel-output${kind === 'error' ? ' is-error' : ''}`;
    if (message) {
      const pre = document.createElement('pre');
      pre.textContent = message;
      output.append(pre);
    }
  }

  // --- Strudel ---

  try {
    await loadStrudel();
  } catch (err) {
    $('.strudel-loading').textContent = `Strudel couldn't load: ${err.message}.`;
    $('.strudel-loading').classList.add('err');
    hub.log(`strudel: ${err.message}`, 'error');
    return;
  }

  // <strudel-editor> builds its editor in a container it puts right after itself.
  const el = document.createElement('strudel-editor');
  el.hidden = true;
  el.setAttribute('code', store.get() ?? STARTER);
  host.replaceChildren(el);
  const mirror = el.editor;
  const sch = mirror.repl.scheduler;
  debug.mirror = mirror;
  debug.scheduler = sch;

  // The sample maps come from GitHub. If one doesn't load, the synths still work, so don't let
  // it fail every evaluation (StrudelMirror awaits `prebaked` before each one).
  mirror.prebaked = mirror.prebaked.catch((err) => {
    hub.log(`strudel: some sounds didn't load (${err?.message ?? err})`, 'error');
  });

  // Look: the page's font and theme, line wrapping for phone width.
  const fontFamily = getComputedStyle(document.documentElement).getPropertyValue('--mono').trim() || 'monospace';
  mirror.setFontFamily(fontFamily);
  const setFontSize = () => mirror.setFontSize(matchMedia('(max-width: 600px)').matches ? 13 : 14);
  setFontSize();
  matchMedia('(max-width: 600px)').addEventListener('change', setFontSize);
  mirror.setLineWrappingEnabled(true);
  mirror.setLineNumbersDisplayed(true);
  const darkQuery = matchMedia('(prefers-color-scheme: dark)');
  const setTheme = () => {
    const mode = document.documentElement.dataset.theme;
    const dark = mode === 'dark' || (mode !== 'light' && darkQuery.matches);
    mirror.setTheme(dark ? 'githubDark' : 'githubLight');
  };
  setTheme();
  darkQuery.addEventListener('change', setTheme);
  new MutationObserver(setTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  mirror.editor.dom.setAttribute('aria-label', 'Strudel code');
  let saveTimer = 0;
  el.addEventListener('update', (e) => {
    const state = e.detail;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => state.code && state.code !== '// LOADING' && store.set(state.code), 300);
    const err = state.evalError || state.schedulerError;
    show(err ? 'error' : '', err ? String(err.message ?? err) : '');
  });

  await mirror.prebaked;
  if (typeof globalThis.getAudioContext !== 'function') {
    show('error', "Strudel loaded, but its audio context isn't reachable.");
    return;
  }
  strudelReady = true;
  document.addEventListener('pointerdown', wakeAudio);
  document.addEventListener('keydown', wakeAudio);

  // --- Following the session ---
  //
  // Strudel only plays haps from cycle `gate.from` up to `gate.to`: from the start bar, and
  // before the stop time, so a start never plays the end of the bar before it and a stop
  // doesn't let the lookahead run past it.

  const gate = { from: 0, to: Infinity };
  debug.gate = gate;
  const gated = (pat) => pat.filterHaps((hap) => !hap.whole || (hap.whole.begin >= gate.from && hap.whole.begin < gate.to));

  const rawStart = sch.start.bind(sch);
  const rawStop = sch.stop.bind(sch);
  const ticksKey = 'num_ticks_since_checkpoint' in sch ? 'num_ticks_since_checkpoint' : 'num_ticks_since_cps_change';

  let armed = false; // Run was pressed, and Stop hasn't been since
  let stopAt = null; // Stop while the session plays: Strudel alone stops, on this bar line
  let starting = false;
  let origin = null; // the session's beat (in this page's numbering) at cycle 0
  let ownCps = sch.cps; // the cps this tool last set; anything else came from the code
  let lastQuantum = null;

  // Set the cycle Strudel reaches at its next tick, and its cps. The next tick anchors there.
  function anchor(cycle, cps) {
    sch.cps = cps;
    ownCps = cps;
    sch.lastEnd = cycle;
    sch[ticksKey] = 0;
    debug.reanchors++;
  }

  const capture = () => {
    try {
      return session ? session.captureState(ctx ?? undefined) : null;
    } catch {
      return null; // closed under us: the hub hands over the next session
    }
  };

  // A tempo from the code (setcps, setcpm, or a patterned cps) becomes the session's.
  function tempoFromCode() {
    if (!session || sch.cps === ownCps) {
      return;
    }
    const bpm = Math.min(MAX_BPM, Math.max(MIN_BPM, sch.cps * 60 * session.quantum));
    ownCps = sch.cps;
    hub.setTempo(bpm, ctx);
    hub.log(`Strudel set the tempo to ${bpm.toFixed(1)} BPM`, 'tempo');
  }

  // Before the first tick of a start: anchor to the session where that tick will be.
  const beforeStart = sch.beforeStart;
  sch.beforeStart = async () => {
    await beforeStart?.();
    const s = capture();
    if (s && origin !== null) {
      const q = session.quantum;
      const t = ctx.currentTime + (sch.clock.minLatency ?? 0.01) + sch.latency;
      anchor((s.beatAtTime(t, q) - origin) / q, s.tempo / 60 / q);
    }
  };

  function follow() {
    const s = capture();
    if (!s) {
      if (sch.started) {
        rawStop();
      }
      render(null);
      return;
    }
    const q = session.quantum;
    if (q !== lastQuantum) {
      origin = null; // a new quantum is a new session, and a new bar length
      lastQuantum = q;
    }
    tempoFromCode();
    const state = sch.cps === ownCps ? s : capture();
    const cps = state.tempo / 60 / q;
    const now = hub.now(ctx);

    if (state.isPlaying) {
      if (origin === null) {
        origin = q * Math.round(state.beatAtTime(state.timeForIsPlaying, q) / q);
        gate.from = 0;
      }
      gate.to = Infinity;
      if (!armed && sch.started && stopAt !== null) {
        const at = (state.beatAtTime(stopAt, q) - origin) / q;
        gate.to = Math.abs(at - Math.round(at)) < 1e-6 ? Math.round(at) : at;
        if (now >= stopAt) {
          rawStop();
          stopAt = null;
        }
      } else if (!armed && sch.started) {
        rawStop();
      } else if (armed && ctx && !sch.started && !starting) {
        starting = true;
        rawStart()
          .catch((err) => show('error', String(err.message ?? err)))
          .finally(() => {
            starting = false;
          });
      }
    } else if (sch.started) {
      if (origin !== null) {
        // A stop on a bar line (as from Play/Stop) is a whole cycle: don't let rounding play its first hap.
        const at = (state.beatAtTime(state.timeForIsPlaying, q) - origin) / q;
        gate.to = Math.abs(at - Math.round(at)) < 1e-6 ? Math.round(at) : at;
      }
      if (now >= state.timeForIsPlaying || origin === null) {
        rawStop();
      }
    }

    if (ctx && sch.started && !starting && origin !== null && sch.clock.getPhase() > 0) {
      const t = sch.clock.getPhase() + sch.latency;
      let want = (state.beatAtTime(t, q) - origin) / q;
      let diff = want - sch.lastEnd;
      // This page's beat numbering moved by whole bars (requestBeatAtTime somewhere): keep counting.
      const bars = Math.round(diff);
      if (bars !== 0 && Math.abs(diff - bars) < TOLERANCE) {
        origin += bars * q;
        want -= bars;
        diff -= bars;
      }
      if (cps !== sch.cps || Math.abs(diff) > TOLERANCE) {
        // A small step back would query a stretch Strudel has already scheduled: don't play it twice.
        if (diff < 0 && diff > -0.05) {
          gate.from = Math.max(gate.from, sch.lastEnd);
        }
        anchor(want, cps);
      }
    } else if (!sch.started && sch.cps !== cps) {
      // Not playing: keep cps current, for cpm() and so a setcps() in the code reads as a change.
      sch.cps = cps;
      ownCps = cps;
    }
    debug.session = session;
    debug.origin = origin;
    render(state, q, now);
  }

  let lastReadout = 0;
  function render(state, q, now) {
    runBtn.disabled = false;
    stopBtn.disabled = !(armed || sch.started);
    runBtn.textContent = sch.started ? 'Update' : 'Run';
    if (panel.hidden || performance.now() - lastReadout < 100) {
      return;
    }
    lastReadout = performance.now();
    if (!state) {
      readout.textContent = 'not connected';
      return;
    }
    const beat = state.beatAtTime(now, q);
    const parts = [];
    if (origin !== null && sch.started) {
      parts.push(`cycle ${((beat - origin) / q).toFixed(2)}`);
    }
    parts.push(`beat ${Math.floor(state.phaseAtTime(now, q)) + 1}/${q}`, `${state.tempo.toFixed(1)} bpm`);
    if (state.isPlaying && now < state.timeForIsPlaying) {
      parts.push(`starts in ${(state.timeForIsPlaying - now).toFixed(1)} s`);
    } else if (!state.isPlaying && sch.started) {
      parts.push(`stops in ${Math.max(0, state.timeForIsPlaying - now).toFixed(1)} s`);
    } else if (state.isPlaying) {
      parts.push(sch.started ? 'playing' : 'session playing; Run to join');
    } else {
      parts.push(armed ? 'waiting for Play' : 'stopped');
    }
    readout.textContent = parts.join('  ·  ');
  }

  // --- Run and Stop ---

  // Strudel's evaluate hands the new pattern to the scheduler, and starts it if asked. Here the
  // session decides when it starts.
  sch.setPattern = async (pattern, autostart = false) => {
    sch.pattern = gated(pattern);
    if (autostart) {
      await play();
    }
  };
  // Ctrl+. in the editor, and anything else in Strudel that stops it.
  sch.stop = () => stop();

  async function play() {
    wakeAudio();
    armed = true;
    stopAt = null;
    if (!session) {
      try {
        await hub.connect();
      } catch (err) {
        armed = false;
        show('error', `Couldn't connect: ${err.message}`);
        return;
      }
    }
    tempoFromCode(); // before choosing the start bar, which a new tempo moves
    const s = capture();
    if (s && !s.isPlaying) {
      const wait = hub.requestPlaying(true, ctx);
      hub.log(`Strudel starts the session in ${wait.toFixed(2)} s, on the next bar`, 'playing');
    }
    follow();
  }

  // Stop stops Strudel, not the session: anything else playing carries on. The session bar's
  // Play/Stop is everyone's.
  function stop() {
    armed = false;
    const s = capture();
    if (s?.isPlaying && sch.started && origin !== null) {
      const now = hub.now(ctx);
      stopAt = hub.nextBarTime(s, now);
      hub.log(`Strudel stops in ${(stopAt - now).toFixed(2)} s, on the next bar; the session plays on`);
    } else if (sch.started) {
      stopAt = null;
      rawStop();
    }
    follow();
  }

  async function run() {
    wakeAudio();
    await mirror.evaluate(true);
  }

  runBtn.addEventListener('click', () => run());
  stopBtn.addEventListener('click', () => stop());
  $('.strudel-reset').addEventListener('click', () => {
    mirror.setCode(STARTER);
    store.set(STARTER);
  });
  // ⌘+Enter and ⌘+. too (Strudel binds only Ctrl and Alt), ahead of the editor's own keys.
  host.addEventListener(
    'keydown',
    (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) {
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        run();
      } else if (e.key === '.') {
        e.preventDefault();
        e.stopPropagation();
        stop();
      }
    },
    true,
  );

  let unwatch = () => {};
  hub.onSession((s) => {
    unwatch();
    session = s;
    origin = null;
    lastQuantum = null;
    if (!s) {
      unwatch = () => {};
      follow();
      return;
    }
    const onPlaying = () => {
      const state = capture();
      if (state?.isPlaying) {
        origin = null; // a new start: cycle 0 is its bar
      }
      follow();
    };
    const onTimeline = () => follow();
    s.addEventListener('playingchange', onPlaying);
    s.addEventListener('timelinechange', onTimeline);
    unwatch = () => {
      s.removeEventListener('playingchange', onPlaying);
      s.removeEventListener('timelinechange', onTimeline);
    };
    follow();
  });

  setInterval(follow, FOLLOW_MS);
  follow();
}
