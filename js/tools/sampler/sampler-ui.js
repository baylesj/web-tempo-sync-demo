// The 4-track x 16-step pattern grid.

export class SamplerUI {
  #container;
  #audioEngine;
  #session = null;
  #stepButtons = []; // [trackIndex][stepIndex]
  #headerCells = [];
  #presetButtons = new Map();
  #lastPlayheadStep = -1;

  static PRESETS = {
    fourOnTheFloor: {
      name: 'four on the floor',
      patterns: [
        [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], // Kick
        [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0], // Snare
        [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0], // Hat
        [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0], // Clap
      ],
    },
    breakbeat: {
      name: 'breakbeat',
      patterns: [
        [1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
        [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      ],
    },
    syncopated: {
      name: 'syncopated',
      patterns: [
        [1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0],
        [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1],
        [1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1],
        [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0],
      ],
    },
  };

  constructor(container, audioEngine) {
    this.#container = container;
    this.#audioEngine = audioEngine;
  }

  setSession(session) {
    this.#session = session;
    if (!session && this.#lastPlayheadStep !== -1) {
      this.#setPlayhead(this.#lastPlayheadStep, false);
      this.#lastPlayheadStep = -1;
    }
  }

  buildUI() {
    this.#container.replaceChildren();
    const tracks = this.#audioEngine.tracks;

    const tools = el('div', 'pattern-tools');
    const presets = el('div', 'seg');
    presets.setAttribute('role', 'group');
    presets.setAttribute('aria-label', 'Patterns');
    for (const [key, preset] of Object.entries(SamplerUI.PRESETS)) {
      const btn = el('button', '', preset.name);
      btn.type = 'button';
      btn.addEventListener('click', () => this.applyPreset(key));
      presets.appendChild(btn);
      this.#presetButtons.set(key, btn);
    }
    const clearBtn = el('button', '', 'clear');
    clearBtn.type = 'button';
    clearBtn.addEventListener('click', () => this.clearAll());
    presets.appendChild(clearBtn);
    tools.appendChild(presets);
    this.#container.appendChild(tools);

    const grid = el('div', 'pattern');

    // Header: beat numbers over the first step of each beat.
    const header = el('div', 'pattern-row pattern-head');
    header.appendChild(el('span', 'track'));
    const headSteps = el('div', 'steps');
    headSteps.setAttribute('aria-hidden', 'true');
    this.#headerCells = [];
    for (let s = 0; s < 16; s++) {
      const cell = el('span', s % 4 === 0 ? 'down' : '', s % 4 === 0 ? String(s / 4 + 1) : '');
      headSteps.appendChild(cell);
      this.#headerCells.push(cell);
    }
    header.appendChild(headSteps);
    grid.appendChild(header);

    this.#stepButtons = [];
    tracks.forEach((track, trackIdx) => {
      const row = el('div', 'pattern-row');
      const meta = el('div', 'track');
      meta.appendChild(el('span', 'name', track.name));

      const toggle = (label, title, key) => {
        const btn = el('button', 'mini', label);
        btn.type = 'button';
        btn.title = title;
        btn.setAttribute('aria-pressed', 'false');
        btn.addEventListener('click', () => {
          track[key] = !track[key];
          btn.setAttribute('aria-pressed', String(track[key]));
        });
        return btn;
      };
      meta.appendChild(toggle('mute', `Mute ${track.name}`, 'muted'));
      meta.appendChild(toggle('solo', `Solo ${track.name}`, 'soloed'));

      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'audio/*';
      fileInput.hidden = true;
      const sampleBtn = el('button', 'mini', 'sample');
      sampleBtn.type = 'button';
      sampleBtn.title = `Load a WAV or MP3 into ${track.name}`;
      sampleBtn.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', async () => {
        const file = fileInput.files[0];
        if (!file) {
          return;
        }
        try {
          const ctx = this.#audioEngine.ensureContext();
          track.setAudioBuffer(await ctx.decodeAudioData(await file.arrayBuffer()));
          sampleBtn.setAttribute('aria-pressed', 'true');
          sampleBtn.title = `${track.name}: ${file.name}`;
        } catch (err) {
          console.error('Could not load sample:', err);
          sampleBtn.title = `Couldn't read ${file.name}`;
        }
      });
      meta.appendChild(sampleBtn);
      meta.appendChild(fileInput);

      row.appendChild(meta);

      const steps = el('div', 'steps');
      const buttons = [];
      for (let s = 0; s < 16; s++) {
        const btn = el('button', s % 4 === 0 ? 'step down' : 'step');
        btn.type = 'button';
        btn.setAttribute('aria-label', `${track.name} step ${s + 1}`);
        btn.setAttribute('aria-pressed', 'false');
        btn.addEventListener('click', () => {
          btn.setAttribute('aria-pressed', String(track.toggleStep(s)));
          this.#markPreset(null);
        });
        steps.appendChild(btn);
        buttons.push(btn);
      }
      this.#stepButtons.push(buttons);
      row.appendChild(steps);
      grid.appendChild(row);
    });

    this.#container.appendChild(grid);
    this.applyPreset('fourOnTheFloor');
  }

  applyPreset(presetKey) {
    const preset = SamplerUI.PRESETS[presetKey];
    if (!preset) {
      return;
    }
    this.#audioEngine.tracks.forEach((track, t) => {
      const pattern = preset.patterns[t] || [];
      for (let s = 0; s < 16; s++) {
        track.setStep(s, Boolean(pattern[s]));
        this.#stepButtons[t]?.[s]?.setAttribute('aria-pressed', String(Boolean(pattern[s])));
      }
    });
    this.#markPreset(presetKey);
  }

  clearAll() {
    this.#audioEngine.tracks.forEach((track, t) => {
      track.clearSteps();
      this.#stepButtons[t]?.forEach((btn) => btn.setAttribute('aria-pressed', 'false'));
    });
    this.#markPreset(null);
  }

  #markPreset(key) {
    for (const [k, btn] of this.#presetButtons) {
      btn.classList.toggle('on', k === key);
    }
  }

  updatePlayhead() {
    if (!this.#session) {
      return;
    }
    const vis = this.#session.captureState();
    if (!vis.isPlaying) {
      if (this.#lastPlayheadStep !== -1) {
        this.#setPlayhead(this.#lastPlayheadStep, false);
        this.#lastPlayheadStep = -1;
      }
      return;
    }
    const beat = vis.beatAtTime(performance.now() / 1000, this.#session.quantum || 4);
    const step = ((Math.floor(beat * 4) % 16) + 16) % 16;
    if (step !== this.#lastPlayheadStep) {
      if (this.#lastPlayheadStep !== -1) {
        this.#setPlayhead(this.#lastPlayheadStep, false);
      }
      this.#setPlayhead(step, true);
      this.#lastPlayheadStep = step;
    }
  }

  #setPlayhead(step, on) {
    this.#headerCells[step]?.classList.toggle('now', on);
    for (const buttons of this.#stepButtons) {
      buttons[step]?.classList.toggle('now', on);
    }
  }
}

function el(tag, className = '', text = null) {
  const node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  if (text !== null) {
    node.textContent = text;
  }
  return node;
}
