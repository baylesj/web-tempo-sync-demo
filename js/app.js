// Page controller: the session bar, the tabs, and the log. Each tool tab is a module that
// loads the first time it's shown and keeps running when hidden; they share the hub's session.

import { hub } from './hub.js';
import { highlightAll } from './highlight.js';

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
  tabButtons: [...document.querySelectorAll('.view-tabs [data-tab]')],
  eventLog: $('event-log'),
  clearLogBtn: $('clear-log-btn'),
};
const panels = Object.fromEntries(el.tabButtons.map((b) => [b.dataset.tab, $(`tab-${b.dataset.tab}`)]));
const mounted = new Map();
let playLabel = '';

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
hub.addEventListener('log', (e) => log(e.detail.message, e.detail.tag));
el.clearLogBtn.addEventListener('click', () => el.eventLog.replaceChildren());

// --- Tabs ---
// Tabs live in the URL (#sampler, #strudel, ...; home has none), so a reload keeps the tab and a
// tab can be linked or opened in its own window.

function tabFromHash() {
  const name = location.hash.slice(1);
  return name in panels ? name : DEFAULT_TAB;
}

async function mountTool(name) {
  if (!(name in TOOLS) || mounted.has(name)) {
    return;
  }
  const panel = panels[name];
  mounted.set(name, true);
  try {
    const tool = await TOOLS[name]();
    await tool.mount(panel, hub);
  } catch (err) {
    console.error(`The ${name} tool failed to load:`, err);
    const p = document.createElement('p');
    p.className = 'help err';
    p.textContent = `The ${name} tool couldn't load: ${err.message}`;
    panel.replaceChildren(p);
    log(`${name} failed to load: ${err.message}`, 'error');
  }
}

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
  el.openWindowBtn.hidden = !(name in TOOLS);
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

// --- Session bar ---

function renderSession(session) {
  el.connectBtn.textContent = session ? 'Disconnect' : 'Connect';
  el.connectBtn.classList.toggle('quiet', Boolean(session));
  el.playStopBtn.disabled = !session;
  el.playStopBtn.classList.toggle('quiet', !session);
  el.apiText.textContent = session ? hub.source : '';
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
    el.statusText.textContent = hub.source === 'stand-in' ? 'Alone: open a second window' : 'Alone: turn on Link in Live';
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

let unwatch = () => {};
hub.onSession((session) => {
  unwatch();
  renderSession(session);
  if (!session) {
    unwatch = () => {};
    return;
  }
  const onTimeline = () => {
    const { tempo } = session.captureState();
    syncTempoUI(tempo);
    log(`Tempo ${tempo.toFixed(2)} bpm`, 'tempo');
  };
  const onPlaying = () => log(session.captureState().isPlaying ? 'Playing' : 'Stopped', 'playing');
  const onPeers = () => {
    renderPeers(session);
    log(session.hasPeers ? 'Someone is playing along' : 'No one else is in the session', 'peers');
  };
  session.addEventListener('timelinechange', onTimeline);
  session.addEventListener('playingchange', onPlaying);
  session.addEventListener('peerschange', onPeers);
  unwatch = () => {
    session.removeEventListener('timelinechange', onTimeline);
    session.removeEventListener('playingchange', onPlaying);
    session.removeEventListener('peerschange', onPeers);
  };
});

async function connect() {
  el.connectBtn.disabled = true;
  el.connectBtn.textContent = 'Connecting…';
  try {
    const session = await hub.connect();
    log(`Joined the session through ${hub.source === 'stand-in' ? 'the stand-in' : `navigator.tempoSync (${hub.source})`}; ${session.hasPeers ? 'someone is playing along' : 'no one else yet'}`, 'session');
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
  if (hub.session) {
    hub.disconnect();
    log('Left the session', 'session');
  } else {
    connect();
  }
});

function onTempoInput(bpm) {
  const clamped = Math.max(TEMPO_MIN, Math.min(TEMPO_MAX, bpm));
  syncTempoUI(clamped);
  hub.setTempo(clamped);
}
el.tempoSlider.addEventListener('input', (e) => onTempoInput(Number(e.target.value)));
el.tempoInput.addEventListener('change', (e) => onTempoInput(Number(e.target.value)));

el.quantumSelect.addEventListener('change', async () => {
  const quantum = Number(el.quantumSelect.value);
  log(`Bar of ${quantum} beats${hub.session ? ', rejoining' : ''}`, 'info');
  await hub.setQuantum(quantum);
  renderBeatDots(quantum);
});

function togglePlaying() {
  const session = hub.session;
  if (!session) {
    return;
  }
  const willPlay = !session.captureState().isPlaying;
  const wait = hub.requestPlaying(willPlay);
  log(`${willPlay ? 'Play' : 'Stop'} on the next bar, in ${wait.toFixed(2)} s`, 'playing');
}
el.playStopBtn.addEventListener('click', togglePlaying);

// Space toggles Play/Stop, like Live. Not while typing, and not on a focused button, where space
// already presses it. Tools with their own editors (Strudel, Hydra) are text fields, so they keep it.
document.addEventListener('keydown', (e) => {
  if (e.code !== 'Space' || e.repeat || e.ctrlKey || e.metaKey || e.altKey || !hub.session) {
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
  const session = hub.session;
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
renderSession(null);
switchTab(tabFromHash(), { updateHash: false });
log(hub.available ? 'navigator.tempoSync is available. Press Connect to join.' : 'No navigator.tempoSync here; Connect uses the stand-in, which syncs this browser’s tabs.', 'info');
if (new URLSearchParams(location.search).get('autoconnect') === '1') {
  connect();
}
