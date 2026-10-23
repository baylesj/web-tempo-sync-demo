// WebMIDI input: picks an input, follows its clock, passes notes on and keeps a short monitor.

import { MidiClock, parseMidiMessage, noteName, PPQN } from './midi-clock.js';

const MONITOR_SIZE = 12;
const NOTE_LOG_GAP_MS = 250; // at most four note lines a second in the event log

export class MidiInput {
  #el;
  #access = null;
  #input = null;
  #clock = new MidiClock();
  #monitor = [];
  #renderQueued = false;
  #clockLocked = false;
  #lastNoteLog = 0;
  #notesSkipped = 0;
  #handlers;

  // elements: { connectBtn, select, follow, status, clockBpm, clockDot, transport, monitor }
  // handlers: { onClockTempo(bpm), onTransport('start'|'continue'|'stop'), onNote(note, velocity, channel),
  //             onConnect(), log(message, tag) }
  constructor(elements, handlers) {
    this.#el = elements;
    this.#handlers = handlers;

    const reason = MidiInput.unavailableReason();
    if (reason) {
      this.#el.status.textContent = reason;
      this.#el.status.hidden = false;
      this.#el.connectBtn.disabled = true;
      this.#el.select.disabled = true;
      this.#el.select.options[0].textContent = 'MIDI not available here';
      return;
    }
    this.#el.connectBtn.addEventListener('click', () => this.connect());
    this.#el.select.addEventListener('change', () => this.#useInput(this.#el.select.value));
    setInterval(() => this.#checkClock(), 250);
  }

  // Why WebMIDI can't be used here, or null when it can.
  static unavailableReason() {
    if (!window.isSecureContext) {
      return 'MIDI needs a secure page (https or localhost), and this one was loaded over plain http. The rest of the page works without it.';
    }
    if (typeof navigator.requestMIDIAccess !== 'function') {
      return "This browser doesn't have WebMIDI (Safari doesn't; Chrome and Edge do). The rest of the page works without it.";
    }
    return null;
  }

  get following() {
    return this.#el.follow.checked;
  }

  async connect() {
    if (this.#access) {
      return;
    }
    this.#el.connectBtn.disabled = true;
    try {
      this.#access = await navigator.requestMIDIAccess({ sysex: false });
    } catch (err) {
      this.#el.connectBtn.disabled = false;
      this.#el.select.options[0].textContent = 'MIDI access refused';
      this.#el.status.textContent = `MIDI access was refused (${err.name}). Allow MIDI for this site in the browser's settings, then try again.`;
      this.#el.status.hidden = false;
      this.#handlers.log(`MIDI access refused: ${err.message || err.name}`, 'ERROR');
      return;
    }
    this.#el.status.hidden = true;
    this.#el.connectBtn.textContent = 'MIDI connected';
    this.#knownIds = new Set(this.#inputs().map((i) => i.id));
    this.#access.onstatechange = (e) => this.#onStateChange(e);
    this.#handlers.onConnect?.();
    this.#refreshInputs(true);
  }

  #inputs() {
    // Chrome keeps unplugged ports in the map with state 'disconnected'.
    return [...this.#access.inputs.values()].filter((i) => i.state !== 'disconnected');
  }

  // Rebuilds the select. With autoPick, prefers an input named like "Move" when none is chosen.
  #refreshInputs(autoPick) {
    const inputs = this.#inputs();
    const current = this.#input?.id;
    const select = this.#el.select;
    select.replaceChildren();
    const none = new Option(inputs.length ? 'none' : 'no devices found', '');
    select.appendChild(none);
    for (const input of inputs) {
      select.appendChild(new Option(input.name || input.id, input.id));
    }
    select.disabled = inputs.length === 0;

    let pick = inputs.find((i) => i.id === current)?.id || '';
    if (!pick && autoPick) {
      pick = inputs.find((i) => /move/i.test(i.name || ''))?.id || '';
    }
    select.value = pick;
    if (pick !== (current || '')) {
      this.#useInput(pick);
    }
  }

  #onStateChange(e) {
    const port = e.port;
    if (port.type !== 'input') {
      return;
    }
    if (port.state === 'connected' && !this.#knownIds.has(port.id)) {
      this.#handlers.log(`MIDI input appeared: ${port.name}`, 'MIDI');
    } else if (port.state === 'disconnected' && this.#knownIds.has(port.id)) {
      this.#handlers.log(`MIDI input went away: ${port.name}`, 'MIDI');
      if (port.id === this.#input?.id) {
        this.#useInput('');
      }
    }
    this.#knownIds = new Set(this.#inputs().map((i) => i.id));
    this.#refreshInputs(true);
  }

  #knownIds = new Set();

  #useInput(id) {
    if (this.#input) {
      this.#input.onmidimessage = null;
    }
    this.#input = id ? this.#access.inputs.get(id) || null : null;
    this.#clock.reset();
    this.#clockLocked = false;
    this.#renderClock();
    if (this.#input) {
      this.#input.onmidimessage = (e) => this.#onMessage(e);
      this.#handlers.log(`Listening to ${this.#input.name}`, 'MIDI');
    }
  }

  #onMessage(e) {
    const bytes = e.data;
    if (!bytes || bytes.length === 0) {
      return;
    }
    const time = e.timeStamp || performance.now();
    const status = bytes[0];
    const msg = parseMidiMessage(bytes);
    this.#addToMonitor(msg);

    if (status === 0xf8) {
      const before = this.#clock.ticks;
      const { bpm, changed } = this.#clock.tick(time);
      if (Math.floor(this.#clock.ticks / PPQN) !== Math.floor(before / PPQN)) {
        this.#flashBeat();
      }
      if (changed) {
        if (!this.#clockLocked) {
          this.#clockLocked = true;
          this.#handlers.log(`Clock steady at ${bpm.toFixed(1)} bpm`, 'MIDI');
        }
        this.#renderClock();
        if (this.following) {
          this.#handlers.onClockTempo(bpm);
        }
      }
      return;
    }

    const transport = this.#clock.transport(status);
    if (transport) {
      this.#el.transport.textContent = transport === 'stop' ? 'stopped' : 'playing';
      this.#handlers.log(`Received ${transport}`, 'MIDI');
      if (this.following) {
        this.#handlers.onTransport(transport);
      }
      return;
    }

    if (msg.type === 'note on') {
      this.#handlers.onNote(msg.data1, msg.data2, msg.channel);
      const now = performance.now();
      if (now - this.#lastNoteLog >= NOTE_LOG_GAP_MS) {
        const more = this.#notesSkipped ? ` (and ${this.#notesSkipped} more)` : '';
        this.#handlers.log(`Note ${msg.data1} (${noteName(msg.data1)}) velocity ${msg.data2}, channel ${msg.channel}${more}`, 'MIDI');
        this.#lastNoteLog = now;
        this.#notesSkipped = 0;
      } else {
        this.#notesSkipped++;
      }
    }
  }

  #checkClock() {
    if (this.#clockLocked && !this.#clock.isAlive(performance.now())) {
      this.#clockLocked = false;
      this.#clock.reset();
      this.#handlers.log('Clock stopped arriving', 'MIDI');
      this.#renderClock();
    }
  }

  #renderClock() {
    const bpm = this.#clock.bpm;
    this.#el.clockBpm.textContent = bpm === null ? 'none' : `${bpm.toFixed(1)} bpm`;
    this.#el.clockBpm.classList.toggle('num', bpm !== null);
    this.#el.clockDot.classList.toggle('ok', bpm !== null);
    if (bpm === null) {
      this.#el.transport.textContent = '–';
    }
  }

  #flashBeat() {
    const dot = this.#el.clockDot;
    dot.classList.add('beat');
    setTimeout(() => dot.classList.remove('beat'), 90);
  }

  // Keeps the last messages; runs of clock ticks (or active sensing) collapse into one line with a count.
  #addToMonitor(msg) {
    const last = this.#monitor[0];
    const time = new Date();
    if ((msg.type === 'clock' || msg.type === 'active sensing') && last?.type === msg.type) {
      last.count++;
      last.time = time;
    } else {
      this.#monitor.unshift({ ...msg, time, count: 1 });
      this.#monitor.length = Math.min(this.#monitor.length, MONITOR_SIZE);
    }
    if (!this.#renderQueued) {
      this.#renderQueued = true;
      requestAnimationFrame(() => this.#renderMonitor());
    }
  }

  #renderMonitor() {
    this.#renderQueued = false;
    const rows = this.#monitor.map((m) => {
      const li = document.createElement('li');
      const data =
        m.type === 'clock' || m.type === 'active sensing'
          ? `×${m.count}`
          : m.type.startsWith('note')
            ? `${m.data1} ${noteName(m.data1)} v${m.data2}`
            : [m.data1, m.data2].filter((v) => v !== undefined).join(' ');
      for (const [cls, text] of [
        ['t', formatTime(m.time)],
        ['type', m.type],
        ['ch', m.channel ? `ch ${m.channel}` : ''],
        ['data', data],
      ]) {
        const span = document.createElement('span');
        span.className = cls;
        span.textContent = text;
        li.appendChild(span);
      }
      return li;
    });
    this.#el.monitor.replaceChildren(...rows);
  }
}

function formatTime(d) {
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}
