// Page controller: the navbar's tabs, the session bar, and the log. Each tool tab (play) is a
// module that loads the first time it's shown and keeps running when hidden. Each tool group has
// its own session (hub.js), joined and left on its own; the session bar shows the one for the tab
// you're on, and only on the play tabs. The read tabs load the proposal's documents (docs.js).

import { apiAvailable, hubFor } from './hub.js';
import { highlightAll } from './highlight.js';
import { mountDoc } from './docs.js';
import { aboutSection } from './tools/about.js';

const TEMPO_MIN = 60;
const TEMPO_MAX = 200;
const DEFAULT_TAB = 'home';

// Each exports mount(panel, hub).
const TOOLS = {
  sampler: () => import('./tools/sampler/index.js'),
  strudel: () => import('./tools/strudel/index.js'),
  hydra: () => import('./tools/hydra/index.js'),
  tone: () => import('./tools/tone/index.js'),
  arpeggios: () => import('./tools/arpeggios/index.js'),
};

// Which session each tool uses. Tone.js and Arpeggios share one Tone Transport, which can only
// follow one session, so they join and leave together.
const GROUP = { sampler: 'sampler', strudel: 'strudel', hydra: 'hydra', tone: 'tone', arpeggios: 'tone' };
const GROUP_NAME = { sampler: 'sampler', strudel: 'strudel', hydra: 'hydra', tone: 'tone.js and arpeggios' };

const $ = (id) => document.getElementById(id);
const el = {
  statusDot: $('status-dot'),
  statusText: $('status-text'),
  apiText: $('api-text'),
  beatDots: $('beat-dots'),
  tempoInput: $('tempo-input'),
  tempoSlider: $('tempo-slider'),
  quantumSelect: $('quantum-select'),
  playStopBtn: $('play-stop-btn'),
  connectBtn: $('connect-btn'),
  openWindowBtn: $('open-window-btn'),
  focusBtn: $('focus-btn'),
  sessionBar: document.querySelector('.session-bar'),
  tabButtons: [...document.querySelectorAll('.nav-tabs [data-tab]')],
  eventLog: $('event-log'),
  clearLogBtn: $('clear-log-btn'),
};
const panels = Object.fromEntries(el.tabButtons.map((b) => [b.dataset.tab, $(`tab-${b.dataset.tab}`)]));
const mounted = new Map();
let playLabel = '';
// The hub the session bar shows: the active play tab's.
let bar = hubFor('sampler');

// --- Log ---

function log(message, tag = 'info') {
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  const now = new Date();
  const item = document.createElement('li');
  if (tag === 'error') {
    item.className = 'err';
  }
  const time = document.createElement('span');
  time.className = 't';
  time.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}.${pad(now.getMilliseconds(), 3)}`;
  const tagSpan = document.createElement('span');
  tagSpan.className = 'tag';
  tagSpan.textContent = tag;
  const msg = document.createElement('span');
  msg.textContent = message;
  item.append(time, tagSpan, msg);
  const list = el.eventLog;
  const atBottom = list.scrollTop + list.clientHeight >= list.scrollHeight - 4;
  list.append(item);
  while (list.childElementCount > 500) {
    list.firstElementChild.remove();
  }
  if (atBottom) {
    list.scrollTop = list.scrollHeight;
  }
}
for (const group of new Set(Object.values(GROUP))) {
  hubFor(group).addEventListener('log', (e) => log(`${group}: ${e.detail.message}`, e.detail.tag));
}
el.clearLogBtn.addEventListener('click', () => el.eventLog.replaceChildren());

// --- Tabs ---
// Tabs live in the URL (#sampler, #strudel, ...; home has none), so a reload keeps the tab and a
// tab can be linked or opened in its own window.

function tabFromHash() {
  const name = location.hash.slice(1);
  return name in panels ? name : DEFAULT_TAB;
}

async function mountTool(name) {
  const panel = panels[name];
  if (mounted.has(name) || !(name in TOOLS || panel.dataset.doc)) {
    return;
  }
  mounted.set(name, true);
  if (panel.dataset.doc) {
    await mountDoc(panel, panel.dataset.doc);
    return;
  }
  try {
    const tool = await TOOLS[name]();
    await tool.mount(panel, hubFor(GROUP[name]));
    // After mount, which fills the panel: what the tool is, and how it was made to play in time.
    const about = aboutSection(name);
    if (about) {
      panel.prepend(about);
    }
  } catch (err) {
    console.error(`The ${name} tool failed to load:`, err);
    const p = document.createElement('p');
    p.className = 'help err';
    p.textContent = `The ${name} tool couldn't load: ${err.message}`;
    panel.replaceChildren(p);
    log(`${name} failed to load: ${err.message}`, 'error');
  }
}

// On narrow screens the tab row scrolls sideways: keep the current tab in view (a link straight to
// #privacy shouldn't leave it off-screen), and mark which edges have more tabs past them for the fade.
const tabRow = document.querySelector('.nav-tabs');

function revealTab(btn) {
  if (!btn || tabRow.scrollWidth <= tabRow.clientWidth) {
    return;
  }
  const row = tabRow.getBoundingClientRect();
  const tab = btn.getBoundingClientRect();
  const margin = 32;
  if (tab.left < row.left + margin || tab.right > row.right - margin) {
    const left = tabRow.scrollLeft + tab.left - row.left - (row.width - tab.width) / 2;
    tabRow.scrollTo({ left, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }
}

function markTabOverflow() {
  const max = tabRow.scrollWidth - tabRow.clientWidth;
  const start = tabRow.scrollLeft > 2;
  const end = tabRow.scrollLeft < max - 2;
  if (start && end) {
    tabRow.dataset.more = 'both';
  } else if (start || end) {
    tabRow.dataset.more = start ? 'start' : 'end';
  } else {
    delete tabRow.dataset.more;
  }
}

tabRow.addEventListener('scroll', markTabOverflow, { passive: true });
new ResizeObserver(markTabOverflow).observe(tabRow);

function switchTab(name, { updateHash = true } = {}) {
  if (!(name in panels)) {
    name = DEFAULT_TAB;
  }
  for (const btn of el.tabButtons) {
    const active = btn.dataset.tab === name;
    btn.classList.toggle('on', active);
    btn.setAttribute('aria-selected', String(active));
    btn.tabIndex = active ? 0 : -1;
  }
  for (const [key, panel] of Object.entries(panels)) {
    panel.hidden = key !== name;
  }
  revealTab(el.tabButtons.find((btn) => btn.dataset.tab === name));
  el.sessionBar.hidden = !(name in TOOLS);
  if (name in TOOLS) {
    bindBar(hubFor(GROUP[name]));
  } else {
    setFocus(false);
  }
  if (updateHash) {
    history.replaceState(null, '', name === DEFAULT_TAB ? location.pathname + location.search : `#${name}`);
  }
  mountTool(name);
}

for (const btn of el.tabButtons) {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  // Arrow keys, Home and End move between tabs, as a tablist should.
  btn.addEventListener('keydown', (e) => {
    const i = el.tabButtons.indexOf(btn);
    const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: el.tabButtons.length - 1 }[e.key];
    if (next === undefined) {
      return;
    }
    e.preventDefault();
    const target = el.tabButtons[(next + el.tabButtons.length) % el.tabButtons.length];
    switchTab(target.dataset.tab);
    target.focus();
  });
}
window.addEventListener('hashchange', () => switchTab(tabFromHash(), { updateHash: false }));
el.openWindowBtn.addEventListener('click', () => {
  const url = new URL(location.href);
  url.searchParams.set('autoconnect', '1');
  window.open(url, '_blank', 'noopener,width=1100,height=900');
});

// --- Focus ---
// A tool fills the tab: no header, navbar, about section or footer, just a slim session strip over
// the tool (Hydra's visuals fill the whole tab). It's in the URL (?focus), so a window opened with
// New window, or a link, starts focused. F toggles it on a tool tab; Esc leaves.

function setFocus(on) {
  on = Boolean(on) && tabFromHash() in TOOLS;
  document.documentElement.toggleAttribute('data-focus', on);
  el.focusBtn.setAttribute('aria-pressed', String(on));
  const url = new URL(location.href);
  if (on) {
    url.searchParams.set('focus', '');
  } else {
    url.searchParams.delete('focus');
  }
  history.replaceState(null, '', url.href.replace(/([?&])focus=(?=&|#|$)/, '$1focus'));
}

el.focusBtn.addEventListener('click', () => setFocus(!document.documentElement.hasAttribute('data-focus')));
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) {
    return;
  }
  if (e.target instanceof Element && e.target.closest('input, select, textarea, [contenteditable], .cm-editor')) {
    return;
  }
  if (e.key === 'Escape' && document.documentElement.hasAttribute('data-focus')) {
    setFocus(false);
  } else if ((e.key === 'f' || e.key === 'F') && tabFromHash() in TOOLS) {
    e.preventDefault();
    setFocus(!document.documentElement.hasAttribute('data-focus'));
  }
});

// --- Session bar ---

function renderSession(session) {
  el.connectBtn.textContent = session ? 'Disconnect' : 'Connect';
  el.connectBtn.classList.toggle('quiet', Boolean(session));
  el.playStopBtn.disabled = !session;
  el.playStopBtn.classList.toggle('quiet', !session);
  el.apiText.textContent = session ? bar.source : '';
  renderPeers(session);
  if (session) {
    syncTempoUI(session.captureState().tempo);
  }
  renderBeatDots(session?.quantum ?? Number(el.quantumSelect.value));
}

function renderPeers(session) {
  if (!session) {
    el.statusDot.className = 'dot';
    el.statusText.textContent = 'Not connected';
  } else if (session.hasPeers) {
    el.statusDot.className = 'dot ok';
    el.statusText.textContent = 'Playing along';
  } else {
    el.statusDot.className = 'dot warn';
    el.statusText.textContent = bar.source === 'stand-in' ? 'Alone: join another tool, or open a window' : 'Alone: join another tool, or turn on Link in Live';
  }
}

function renderBeatDots(quantum) {
  el.beatDots.replaceChildren(...Array.from({ length: quantum }, () => document.createElement('span')));
}

function syncTempoUI(bpm) {
  const rounded = Math.round(bpm * 10) / 10;
  el.tempoSlider.value = String(rounded);
  el.tempoInput.value = rounded.toFixed(1);
}

// The session bar follows one hub at a time: the active play tab's. Switching tabs rebinds it, so
// Connect, the status, tempo, bar length and Play all act on that tool's session.
let unwatch = () => {};
let unwatchHub = () => {};
let bound = null;

function bindBar(h) {
  if (h === bound) {
    return;
  }
  unwatchHub();
  bound = h;
  bar = h;
  el.quantumSelect.value = String(h.quantum);
  unwatchHub = h.onSession((session) => {
    unwatch();
    renderSession(session);
    if (!session) {
      unwatch = () => {};
      return;
    }
    const onTimeline = () => syncTempoUI(session.captureState().tempo);
    const onPeers = () => renderPeers(session);
    session.addEventListener('timelinechange', onTimeline);
    session.addEventListener('peerschange', onPeers);
    unwatch = () => {
      session.removeEventListener('timelinechange', onTimeline);
      session.removeEventListener('peerschange', onPeers);
    };
  });
}

// The log hears every group's session, whichever tab is showing.
for (const group of new Set(Object.values(GROUP))) {
  let stop = () => {};
  hubFor(group).onSession((session) => {
    stop();
    stop = () => {};
    if (!session) {
      return;
    }
    const onTimeline = () => log(`${group}: tempo ${session.captureState().tempo.toFixed(2)} bpm`, 'tempo');
    const onPlaying = () => log(`${group}: ${session.captureState().isPlaying ? 'playing' : 'stopped'}`, 'playing');
    const onPeers = () => log(`${group}: ${session.hasPeers ? 'someone is playing along' : 'no one else is in the session'}`, 'peers');
    session.addEventListener('timelinechange', onTimeline);
    session.addEventListener('playingchange', onPlaying);
    session.addEventListener('peerschange', onPeers);
    stop = () => {
      session.removeEventListener('timelinechange', onTimeline);
      session.removeEventListener('playingchange', onPlaying);
      session.removeEventListener('peerschange', onPeers);
    };
  });
}

async function connect() {
  const h = bar;
  el.connectBtn.disabled = true;
  el.connectBtn.textContent = 'Connecting…';
  try {
    const session = await h.connect();
    log(`${GROUP_NAME[h.name]} joined the session through ${h.source === 'stand-in' ? 'the stand-in' : `navigator.tempoSync (${h.source})`}; ${session.hasPeers ? 'someone is playing along' : 'no one else yet'}`, 'session');
  } catch (err) {
    console.error('Could not join the tempo session:', err);
    el.statusDot.className = 'dot err';
    el.statusText.textContent = "Couldn't connect";
    el.connectBtn.textContent = 'Connect';
    log(`Couldn't join the session: ${err.message}`, 'error');
  } finally {
    el.connectBtn.disabled = false;
  }
}

el.connectBtn.addEventListener('click', () => {
  if (bar.session) {
    bar.disconnect();
    log(`${GROUP_NAME[bar.name]} left the session`, 'session');
  } else {
    connect();
  }
});

function onTempoInput(bpm) {
  const clamped = Math.max(TEMPO_MIN, Math.min(TEMPO_MAX, bpm));
  syncTempoUI(clamped);
  bar.setTempo(clamped);
}
el.tempoSlider.addEventListener('input', (e) => onTempoInput(Number(e.target.value)));
el.tempoInput.addEventListener('change', (e) => onTempoInput(Number(e.target.value)));

el.quantumSelect.addEventListener('change', async () => {
  const quantum = Number(el.quantumSelect.value);
  log(`${GROUP_NAME[bar.name]}: bar of ${quantum} beats${bar.session ? ', rejoining' : ''}`, 'info');
  await bar.setQuantum(quantum);
  renderBeatDots(quantum);
});

function togglePlaying() {
  const session = bar.session;
  if (!session) {
    return;
  }
  const willPlay = !session.captureState().isPlaying;
  const wait = bar.requestPlaying(willPlay);
  log(`${GROUP_NAME[bar.name]}: ${willPlay ? 'play' : 'stop'} on the next bar, in ${wait.toFixed(2)} s`, 'playing');
}
el.playStopBtn.addEventListener('click', togglePlaying);

// Space toggles Play/Stop, like Live, on the play tabs (elsewhere it scrolls). Not while typing,
// and not on a focused button, where space already presses it. Tools with their own editors
// (Strudel, Hydra) are text fields, so they keep it.
document.addEventListener('keydown', (e) => {
  if (e.code !== 'Space' || e.repeat || e.ctrlKey || e.metaKey || e.altKey || !bar.session || el.sessionBar.hidden) {
    return;
  }
  if (e.target instanceof Element && e.target.closest('input, select, textarea, button, [contenteditable], .cm-editor')) {
    return;
  }
  e.preventDefault();
  togglePlaying();
});

// Each frame: the beat dots, and the Play/Stop label. A start or stop waits for the next bar line,
// so while one is pending the button counts down to it, whoever committed it.
function frame() {
  requestAnimationFrame(frame);
  const session = bar.session;
  let label = 'Play';
  let lit = -1;
  if (session) {
    const state = session.captureState();
    const now = performance.now() / 1000;
    const wait = state.timeForIsPlaying - now;
    if (wait > 0.05) {
      label = `${state.isPlaying ? 'Starts' : 'Stops'} in ${wait.toFixed(1)} s`;
    } else {
      label = state.isPlaying ? 'Stop' : 'Play';
    }
    lit = Math.floor(state.phaseAtTime(now));
    el.beatDots.classList.toggle('playing', state.isPlaying && wait <= 0);
  }
  [...el.beatDots.children].forEach((dot, i) => dot.classList.toggle('on', i === lit));
  if (label !== playLabel) {
    playLabel = label;
    el.playStopBtn.textContent = label;
  }
}
requestAnimationFrame(frame);

highlightAll();
bindBar(bar);
switchTab(tabFromHash(), { updateHash: false });
setFocus(new URLSearchParams(location.search).has('focus'));
log(apiAvailable() ? 'navigator.tempoSync is available. Press Connect to join.' : 'No navigator.tempoSync here; Connect uses the stand-in, which syncs this browser’s tabs.', 'info');
if (new URLSearchParams(location.search).get('autoconnect') === '1') {
  connect();
}
