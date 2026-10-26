/**
 * Copyright 2016 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// The arpeggios tab: Chrome Music Lab's Arpeggios, on the page's shared Tone.js, playing in
// time with the session. Ported from app/Main.js, app/chord/Chord.js, app/part/PlayButton.js,
// app/part/Part.js and app/sound/Interface.js. Modified in 2026 for the Web Tempo Sync demo:
// mounted in a tab rather than a page of its own; play and stop go through the shared
// Transport, which follows the session; the tempo dial sets the session's tempo; the notes are
// scheduled from the Transport's position, so the pattern's bar lands on the session's.

import { getTone } from '../tone/runtime.js';
import { NOTES, PATTERNS, LOOP_BEATS, MAJOR_ORDER } from './data.js';
import { ChordWheel } from './chord.js';
import { PartsView } from './parts.js';
import { Sound } from './sound.js';
import { TempoDial } from './metronome.js';
import { icon } from './icons.js';

const STORE_PREFIX = 'tempo-sync-demo.arpeggios.';
const FONT = 'https://fonts.googleapis.com/css2?family=Quicksand:wght@400;700&display=swap';

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
    } else if (k === 'html') {
      node.innerHTML = v;
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

function loadStyles() {
  for (const href of [FONT, new URL('./style.css', import.meta.url).href]) {
    if (!document.querySelector(`link[href="${href}"]`)) {
      document.head.append(el('link', { rel: 'stylesheet', href }));
    }
  }
}

const mod = (a, n) => ((a % n) + n) % n;

export async function mount(panel, hub) {
  loadStyles();
  const runtime = await getTone(hub);
  const { Tone, transport } = runtime;
  const audio = runtime.context;
  const PPQ = transport.PPQ;
  const LOOP = LOOP_BEATS * PPQ;
  const sound = new Sound(Tone);

  const settings = {
    letter: store.get('letter', 'C'),
    mode: store.get('mode', 'major'),
    part: store.get('part', 0),
    instrument: store.get('instrument', 'harp'),
  };
  if (!MAJOR_ORDER.includes(settings.letter) || !(settings.mode in NOTES)) {
    settings.letter = 'C';
    settings.mode = 'major';
  }
  if (!(settings.instrument in sound.voices)) {
    settings.instrument = 'harp';
  }
  sound.instrument = settings.instrument;

  // --- Page ---

  const connectBtn = el('button', { type: 'button', text: 'Connect' });
  const noSession = el('div', { class: 'stack arp-nosession' },
    el('p', { class: 'soft', text: 'Join the session to play along: the arpeggio then starts on its bar line and follows its tempo, with every other tab and with Live. The wheel strums without it.' }),
    el('div', { class: 'actions' }, connectBtn));

  const stage = el('div', { class: 'arp-stage' });
  const strip = el('div', { class: 'arp-parts', 'aria-label': 'The pattern: swipe or use the arrows to change it' });
  const chordArea = el('div', { class: 'arp-chord' });
  stage.append(strip, chordArea);

  const status = el('p', { class: 'mono soft arp-status', 'aria-live': 'polite' });

  panel.replaceChildren(
    section('01', 'play', 'arp-play-label', noSession, el('div', { class: 'arp-frame' }, stage), status,
      el('p', { class: 'help', text: 'Tap a chord on the wheel; the arpeggio plays its notes. Swipe the pattern, or use the arrows, for another one. Play starts on the session’s next bar line, or at once when you are alone, and Stop waits for the bar line too. The metronome button opens the tempo dial, which sets the session’s tempo.' })),
    section('02', 'how', 'arp-how-label',
      el('p', { class: 'soft', text: 'The experiment runs on the page’s one Tone.js Transport, shared with the tone.js tab, which follows the session through the fork’s syncTempoSession(). Its Play and Stop are the Transport’s start() and stop(), its tempo dial is the Transport’s bpm, and each note is scheduled from the Transport’s position, so a pattern starts on every bar line of the session.' }),
      el('p', { class: 'help' },
        'From ', el('a', { href: 'https://musiclab.chromeexperiments.com/Arpeggios', text: 'Chrome Music Lab' }),
        ' by Google, Apache-2.0. The harp and piano are synthesized here. Credits, changes and licenses: ',
        el('a', { href: new URL('./README.md', import.meta.url).href, text: 'js/tools/arpeggios/README.md' }), '.')),
  );

  const parts = new PartsView(strip, stage, PATTERNS);
  const wheel = new ChordWheel(chordArea);

  const playBtn = el('button', { type: 'button', class: 'arp-button arp-play', 'aria-label': 'Play', html: icon('play') });
  wheel.wheel.append(playBtn);
  const instrumentBtn = el('button', { type: 'button', class: 'arp-button arp-instrument' });
  const metronomeBtn = el('button', { type: 'button', class: 'arp-button arp-metronome-button', 'aria-label': 'Tempo', html: icon('metronome') });
  stage.append(instrumentBtn, metronomeBtn);
  const dial = new TempoDial(stage, {
    grey: new URL('./images/icon_check_grey.png', import.meta.url).href,
    white: new URL('./images/icon_check_white.png', import.meta.url).href,
  });

  // --- Chords and patterns (Chord.js, Parts.js) ---

  let chord = NOTES[settings.mode][settings.letter];
  const pick = (letter, mode, strum = true) => {
    chord = NOTES[mode][letter];
    wheel.set(letter, mode);
    parts.setChord(chord);
    // a tap strums the chord, unless the arpeggio is playing it
    if (strum && transport.state !== 'started') {
      runtime.resume();
      sound.strum(chord);
    }
    settings.letter = letter;
    settings.mode = mode;
    store.set('letter', letter);
    store.set('mode', mode);
  };
  wheel.onpick = (letter, mode) => pick(letter, mode);
  pick(settings.letter, settings.mode, false);
  parts.setPart(Math.max(0, Math.min(PATTERNS.length - 1, Number(settings.part) || 0)), false);
  parts.onchange = (index) => store.set('part', index);

  // --- Instrument (sound/Interface.js) ---

  const showInstrument = () => {
    instrumentBtn.innerHTML = icon(sound.instrument);
    instrumentBtn.setAttribute('aria-label', `Instrument: ${sound.instrument}. Switch to ${sound.instrument === 'harp' ? 'piano' : 'harp'}`);
  };
  instrumentBtn.addEventListener('click', () => {
    sound.instrument = sound.instrument === 'harp' ? 'piano' : 'harp';
    store.set('instrument', sound.instrument);
    showInstrument();
  });
  showInstrument();

  // --- Audio wakes on a tap ---

  document.addEventListener('pointerdown', () => runtime.resume());
  document.addEventListener('keydown', () => runtime.resume());

  // --- Session ---

  let sync = null;
  hub.onSession(() => {
    sync = runtime.sync; // the runtime has already replaced it
    noSession.hidden = Boolean(sync);
  });

  connectBtn.addEventListener('click', async () => {
    runtime.resume();
    connectBtn.disabled = true;
    try {
      await hub.connect();
    } catch (err) {
      hub.log(`Couldn't join the session: ${err.message}`, 'error');
    } finally {
      connectBtn.disabled = false;
    }
  });

  // PlayButton.js: through the shared Transport, which the fork commits to the session. With
  // no session yet, the button joins one first: it's a click, so it may.
  playBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    runtime.resume();
    if (!sync) {
      try {
        await hub.connect();
      } catch (err) {
        hub.log(`Couldn't join the session: ${err.message}`, 'error');
        return;
      }
    }
    if (!sync) {
      return;
    }
    const state = sync.captureState();
    if (state.isPlaying) {
      // on the next bar line, as the session bar and the tone.js tab do
      transport.stop(transport.nextSubdivision('1m') || undefined);
      hub.log('Arpeggios: stop on the next bar');
    } else {
      transport.start();
      hub.log('Arpeggios: Transport.start(), on the next bar line');
    }
  });

  // --- Tempo (Metronome.js): the dial is the Transport's bpm, which the fork commits ---

  let tempoLog = 0;
  dial.oninput = (bpm) => {
    transport.bpm.value = bpm;
    clearTimeout(tempoLog);
    tempoLog = setTimeout(() => hub.log(`Arpeggios: tempo ${bpm} bpm`, 'tempo'), 500);
  };
  dial.onopen = () => metronomeBtn.classList.add('active');
  dial.onclose = () => {
    metronomeBtn.classList.remove('active');
    metronomeBtn.focus({ preventScroll: true });
  };
  metronomeBtn.addEventListener('click', (e) => {
    e.preventDefault();
    runtime.resume();
    dial.open();
  });

  // --- Notes (Part.js onnote) ---
  // One repeating event on the triplet-sixteenth grid, which every pattern's notes fall on. The
  // pattern position comes from the Transport's ticks, which the fork counts from the bar line
  // the session started in: a four-beat pattern restarts on every bar line of a 2-, 4- or
  // 8-beat bar, and on every third bar line of a 3-beat one, without looping the Transport,
  // which the tone.js tab shares.

  const GRID = PPQ / 6;
  const byTick = PATTERNS.map((events) => {
    const map = new Map();
    events.forEach((event, i) => {
      const tick = Math.round(event.time * PPQ);
      map.set(tick, [...(map.get(tick) ?? []), i]);
    });
    return map;
  });
  const scheduled = []; // for tests: the last notes, with where they fall in the session
  transport.scheduleRepeat((time) => {
    const ticks = Math.round(transport.getTicksAtTime(time));
    const pos = mod(ticks, LOOP);
    if (dial.isOpen && pos % PPQ === 0) {
      sound.tick(time);
    }
    const index = parts.index;
    const hits = byTick[index].get(pos);
    if (!hits) {
      return;
    }
    const bpm = transport.bpm.getValueAtTime(time);
    for (const i of hits) {
      const event = PATTERNS[index][i];
      const duration = (event.length * 60) / bpm;
      sound.play(chord[event.degree], time, duration);
      Tone.getDraw().schedule(() => parts.flash(i, duration), time);
    }
    if (sync && globalThis.__arpTab?.record) {
      const state = sync.captureState();
      const q = sync.quantum;
      scheduled.push({ time, ticks, pos, notes: hits.length, sessionBeat: state.beatAtTime(time, q), sessionPhase: state.phaseAtTime(time, q), tempo: state.tempo, q });
      if (scheduled.length > 2000) {
        scheduled.splice(0, 1000);
      }
    }
  }, `${GRID}i`, 0);

  // The metronome's clicks while the dial is open and the Transport isn't playing: on the
  // session's beats, without starting it (the original started its Transport muted, which
  // here would start everyone's).
  let previewBeat = null;
  let localClock = null;
  setInterval(() => {
    if (!dial.isOpen) {
      previewBeat = null;
      localClock = null;
      return;
    }
    const now = audio.currentTime;
    const horizon = now + 0.15;
    if (sync) {
      localClock = null;
      const state = sync.captureState();
      const q = sync.quantum;
      previewBeat ??= Math.ceil(state.beatAtTime(now + 0.02, q));
      for (let t = state.timeAtBeat(previewBeat, q); t < horizon; t = state.timeAtBeat(++previewBeat, q)) {
        // once the session plays, the Transport's own event clicks
        if (t >= now && !(state.isPlaying && t >= state.timeForIsPlaying - 0.01)) {
          sound.tick(t);
        }
      }
    } else {
      previewBeat = null;
      localClock ??= { next: now + 0.05 };
      while (localClock.next < horizon) {
        sound.tick(localClock.next);
        localClock.next += 60 / transport.bpm.value;
      }
    }
  }, 25);

  // --- Each frame: the play button, the playhead, the dial, the status ---

  let playIcon = '';
  let statusText = null;
  function frame() {
    requestAnimationFrame(frame);
    // the context time being heard now, for what's drawn
    const stamp = audio.getOutputTimestamp?.();
    const heard = stamp?.contextTime ? stamp.contextTime + (performance.now() - stamp.performanceTime) / 1000 : audio.currentTime;
    let playing = false;
    let text = '';
    let iconName = 'play';
    let pending = false;
    if (sync) {
      const state = sync.captureState();
      const wait = state.timeForIsPlaying - audio.currentTime;
      pending = wait > 0.05;
      playing = state.isPlaying && !pending;
      iconName = state.isPlaying ? 'pause' : 'play';
      if (pending) {
        text = `${state.isPlaying ? 'Starts' : 'Stops'} on the bar line, in ${wait.toFixed(1)} s`;
      } else if (state.isPlaying) {
        text = `Playing at ${state.tempo.toFixed(1)} bpm`;
      } else {
        text = `Stopped · ${state.tempo.toFixed(1)} bpm`;
      }
      if (!dial.dragging) {
        const tempo = sync.tempo ?? state.tempo;
        if (Math.abs(tempo - dial.value) > 1e-6) {
          dial.set(tempo);
        }
      }
      if (dial.isOpen) {
        const beat = transport.state === 'started' ? transport.getTicksAtTime(heard) / PPQ : state.beatAtTime(heard, sync.quantum);
        dial.blink((Math.sin(mod(beat, 1) * Math.PI * 2) + 1) / 2);
      }
    } else if (dial.isOpen && !dial.dragging) {
      dial.set(transport.bpm.value);
    }
    if (audio.state !== 'running') {
      text = text ? `${text} · tap anywhere to turn the sound on` : 'Tap anywhere to turn the sound on';
    }
    if (iconName !== playIcon) {
      playIcon = iconName;
      playBtn.innerHTML = icon(iconName);
      playBtn.setAttribute('aria-label', iconName === 'play' ? 'Play' : 'Stop');
    }
    playBtn.classList.toggle('active', iconName === 'pause');
    playBtn.classList.toggle('pending', pending);
    if (text !== statusText) {
      statusText = text;
      status.textContent = text;
    }
    const started = playing && transport.state === 'started';
    parts.setProgress(started ? mod(transport.getTicksAtTime(heard), LOOP) / LOOP : 0);
  }
  requestAnimationFrame(frame);

  // For the console and end-to-end tests.
  globalThis.__arpTab = {
    Tone,
    transport,
    runtime,
    record: false,
    scheduled,
    get sync() {
      return sync;
    },
    get part() {
      return parts.index;
    },
    get chord() {
      return chord;
    },
    stats() {
      const state = sync?.captureState();
      return {
        contextState: audio.state,
        currentTime: audio.currentTime,
        transportState: transport.state,
        transportBpm: transport.bpm.getValueAtTime(audio.currentTime),
        sessionTempo: state?.tempo ?? null,
        sessionPlaying: state?.isPlaying ?? null,
        timeForIsPlaying: state?.timeForIsPlaying ?? null,
        dial: dial.value,
        instrument: sound.instrument,
      };
    },
  };
}
