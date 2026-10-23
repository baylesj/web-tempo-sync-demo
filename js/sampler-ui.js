// UI component for the 4-track x 16-step pattern sampler.

export class SamplerUI {
  #container;
  #audioEngine;
  #session = null;
  #stepButtons = []; // 2D array [trackIndex][stepIndex]
  #headerPlayheads = [];
  #lastPlayheadStep = -1;

  static PRESETS = {
    fourOnTheFloor: {
      name: 'Four on the Floor',
      patterns: [
        [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], // Kick
        [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0], // Snare
        [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0], // Hat
        [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0], // Clap
      ],
    },
    breakbeat: {
      name: 'Breakbeat',
      patterns: [
        [1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0], // Kick
        [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0], // Snare
        [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0], // Hat
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0], // Clap
      ],
    },
    syncopated: {
      name: 'Syncopated',
      patterns: [
        [1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0], // Kick
        [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1], // Snare
        [1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1], // Hat
        [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0], // Clap
      ],
    },
  };

  constructor(container, audioEngine) {
    this.#container = container;
    this.#audioEngine = audioEngine;
  }

  setSession(session) {
    this.#session = session;
  }

  buildUI() {
    this.#container.innerHTML = '';
    const tracks = this.#audioEngine.tracks;

    const wrapper = document.createElement('div');
    wrapper.className = 'sampler-wrapper';

    // Toolbar (Preset buttons, Clear)
    const toolbar = document.createElement('div');
    toolbar.className = 'sampler-toolbar';

    const presetLabel = document.createElement('span');
    presetLabel.className = 'toolbar-label';
    presetLabel.textContent = 'Patterns:';
    toolbar.appendChild(presetLabel);

    for (const [key, preset] of Object.entries(SamplerUI.PRESETS)) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn-preset';
      btn.textContent = preset.name;
      btn.addEventListener('click', () => this.applyPreset(key));
      toolbar.appendChild(btn);
    }

    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'btn-preset btn-clear';
    clearBtn.textContent = 'Clear All';
    clearBtn.addEventListener('click', () => this.clearAll());
    toolbar.appendChild(clearBtn);

    wrapper.appendChild(toolbar);

    // Grid container
    const grid = document.createElement('div');
    grid.className = 'sampler-grid';

    // Step indicators header row (1 to 16, grouped in 4s)
    const headerRow = document.createElement('div');
    headerRow.className = 'sampler-row sampler-header-row';

    const cornerCell = document.createElement('div');
    cornerCell.className = 'track-meta-cell';
    cornerCell.textContent = 'TRACK';
    headerRow.appendChild(cornerCell);

    const stepsHeader = document.createElement('div');
    stepsHeader.className = 'track-steps-header';

    this.#headerPlayheads = [];
    for (let s = 0; s < 16; s++) {
      const stepHeaderCell = document.createElement('div');
      const beatNum = Math.floor(s / 4) + 1;
      const subBeat = (s % 4) + 1;
      stepHeaderCell.className = `step-header-cell beat-group-${beatNum}`;
      stepHeaderCell.textContent = subBeat === 1 ? String(beatNum) : '•';
      if (subBeat === 1) {
        stepHeaderCell.classList.add('step-downbeat');
      }
      stepsHeader.appendChild(stepHeaderCell);
      this.#headerPlayheads.push(stepHeaderCell);
    }
    headerRow.appendChild(stepsHeader);
    grid.appendChild(headerRow);

    // Track rows
    this.#stepButtons = [];
    tracks.forEach((track, trackIdx) => {
      const row = document.createElement('div');
      row.className = `sampler-row track-row track-${track.voiceKey}`;

      // Track meta (name, mute, solo, sample loader)
      const meta = document.createElement('div');
      meta.className = 'track-meta-cell';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'track-name';
      nameSpan.textContent = track.name;
      meta.appendChild(nameSpan);

      const trackControls = document.createElement('div');
      trackControls.className = 'track-controls';

      const muteBtn = document.createElement('button');
      muteBtn.type = 'button';
      muteBtn.className = 'btn-track-ctrl btn-mute';
      muteBtn.textContent = 'M';
      muteBtn.title = 'Mute';
      muteBtn.addEventListener('click', () => {
        track.muted = !track.muted;
        muteBtn.classList.toggle('active', track.muted);
      });
      trackControls.appendChild(muteBtn);

      const soloBtn = document.createElement('button');
      soloBtn.type = 'button';
      soloBtn.className = 'btn-track-ctrl btn-solo';
      soloBtn.textContent = 'S';
      soloBtn.title = 'Solo';
      soloBtn.addEventListener('click', () => {
        track.soloed = !track.soloed;
        soloBtn.classList.toggle('active', track.soloed);
      });
      trackControls.appendChild(soloBtn);

      // Hidden file input for sample loading
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'audio/*';
      fileInput.style.display = 'none';
      fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
          try {
            const arrayBuffer = await file.arrayBuffer();
            const audioBuffer = await this.#audioEngine.audioContext.decodeAudioData(arrayBuffer);
            track.setAudioBuffer(audioBuffer);
            sampleBtn.classList.add('loaded');
            sampleBtn.title = `Loaded: ${file.name}`;
          } catch (err) {
            console.error('Failed to load sample:', err);
          }
        }
      });

      const sampleBtn = document.createElement('button');
      sampleBtn.type = 'button';
      sampleBtn.className = 'btn-track-ctrl btn-sample';
      sampleBtn.textContent = 'SMP';
      sampleBtn.title = 'Load AudioBuffer Sample (WAV/MP3)';
      sampleBtn.addEventListener('click', () => fileInput.click());
      trackControls.appendChild(sampleBtn);
      meta.appendChild(trackControls);
      meta.appendChild(fileInput);

      row.appendChild(meta);

      // 16 step buttons
      const stepsRow = document.createElement('div');
      stepsRow.className = 'track-steps-row';

      const trackStepButtons = [];
      for (let s = 0; s < 16; s++) {
        const beatNum = Math.floor(s / 4) + 1;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `step-btn beat-group-${beatNum}`;
        if (s % 4 === 0) {
          btn.classList.add('downbeat-step');
        }
        btn.setAttribute('aria-label', `${track.name} step ${s + 1}`);

        btn.addEventListener('click', () => {
          const active = track.toggleStep(s);
          btn.classList.toggle('active', active);
        });

        stepsRow.appendChild(btn);
        trackStepButtons.push(btn);
      }

      this.#stepButtons.push(trackStepButtons);
      row.appendChild(stepsRow);
      grid.appendChild(row);
    });

    wrapper.appendChild(grid);
    this.#container.appendChild(wrapper);

    // Apply default preset
    this.applyPreset('fourOnTheFloor');
  }

  applyPreset(presetKey) {
    const preset = SamplerUI.PRESETS[presetKey];
    if (!preset) {
      return;
    }
    const tracks = this.#audioEngine.tracks;
    tracks.forEach((track, trackIdx) => {
      const pattern = preset.patterns[trackIdx] || [];
      for (let s = 0; s < 16; s++) {
        const active = Boolean(pattern[s]);
        track.setStep(s, active);
        if (this.#stepButtons[trackIdx] && this.#stepButtons[trackIdx][s]) {
          this.#stepButtons[trackIdx][s].classList.toggle('active', active);
        }
      }
    });
  }

  clearAll() {
    const tracks = this.#audioEngine.tracks;
    tracks.forEach((track, trackIdx) => {
      track.clearSteps();
      for (let s = 0; s < 16; s++) {
        if (this.#stepButtons[trackIdx] && this.#stepButtons[trackIdx][s]) {
          this.#stepButtons[trackIdx][s].classList.remove('active');
        }
      }
    });
  }

  updatePlayhead() {
    if (!this.#session) {
      return;
    }
    const vis = this.#session.captureState();
    const isStartStopSync = Boolean(this.#session.startStopSync);

    if (isStartStopSync && !vis.isPlaying) {
      if (this.#lastPlayheadStep !== -1) {
        this.#clearPlayheadHighlight(this.#lastPlayheadStep);
        this.#lastPlayheadStep = -1;
      }
      return;
    }

    const nowSec = performance.now() / 1000;
    const beat = vis.beatAtTime(nowSec, this.#session.quantum || 4);
    // 16th note step index (0 to 15)
    const currentStep = ((Math.floor(beat * 4.0) % 16) + 16) % 16;

    if (currentStep !== this.#lastPlayheadStep) {
      if (this.#lastPlayheadStep !== -1) {
        this.#clearPlayheadHighlight(this.#lastPlayheadStep);
      }
      this.#setPlayheadHighlight(currentStep);
      this.#lastPlayheadStep = currentStep;
    }
  }

  #setPlayheadHighlight(stepIdx) {
    if (this.#headerPlayheads[stepIdx]) {
      this.#headerPlayheads[stepIdx].classList.add('playhead-active');
    }
    for (let t = 0; t < this.#stepButtons.length; t++) {
      if (this.#stepButtons[t][stepIdx]) {
        this.#stepButtons[t][stepIdx].classList.add('playhead-step');
      }
    }
  }

  #clearPlayheadHighlight(stepIdx) {
    if (this.#headerPlayheads[stepIdx]) {
      this.#headerPlayheads[stepIdx].classList.remove('playhead-active');
    }
    for (let t = 0; t < this.#stepButtons.length; t++) {
      if (this.#stepButtons[t][stepIdx]) {
        this.#stepButtons[t][stepIdx].classList.remove('playhead-step');
      }
    }
  }
}
