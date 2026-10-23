// Web Audio synthesizer and lookahead scheduler for Web Tempo Sync demo.

let sharedNoiseBuffer = null;

function getSharedNoiseBuffer(ctx) {
  if (!sharedNoiseBuffer || sharedNoiseBuffer.sampleRate !== ctx.sampleRate) {
    const bufferSize = ctx.sampleRate * 2;
    sharedNoiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = sharedNoiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }
  }
  return sharedNoiseBuffer;
}

// Synthesizer voices
export const SynthVoices = {
  kick(ctx, destination, time, volume = 1.0) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, time);
    osc.frequency.exponentialRampToValueAtTime(38, time + 0.08);

    gain.gain.setValueAtTime(volume * 1.0, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.28);

    // Initial click transient
    const clickOsc = ctx.createOscillator();
    const clickGain = ctx.createGain();
    clickOsc.type = 'triangle';
    clickOsc.frequency.setValueAtTime(300, time);
    clickOsc.frequency.exponentialRampToValueAtTime(40, time + 0.02);
    clickGain.gain.setValueAtTime(volume * 0.7, time);
    clickGain.gain.exponentialRampToValueAtTime(0.001, time + 0.02);

    osc.connect(gain);
    gain.connect(destination);
    clickOsc.connect(clickGain);
    clickGain.connect(destination);

    osc.start(time);
    osc.stop(time + 0.3);
    clickOsc.start(time);
    clickOsc.stop(time + 0.03);
  },

  snare(ctx, destination, time, volume = 1.0) {
    // Noise component
    const noise = ctx.createBufferSource();
    noise.buffer = getSharedNoiseBuffer(ctx);

    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(1000, time);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(volume * 0.8, time);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, time + 0.18);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(destination);

    // Body tone
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(190, time);
    osc.frequency.exponentialRampToValueAtTime(110, time + 0.06);

    oscGain.gain.setValueAtTime(volume * 0.7, time);
    oscGain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);

    osc.connect(oscGain);
    oscGain.connect(destination);

    noise.start(time);
    noise.stop(time + 0.2);
    osc.start(time);
    osc.stop(time + 0.15);
  },

  hat(ctx, destination, time, volume = 1.0) {
    const noise = ctx.createBufferSource();
    noise.buffer = getSharedNoiseBuffer(ctx);

    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(7500, time);
    filter.Q.setValueAtTime(1.5, time);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume * 0.7, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.045);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(destination);

    noise.start(time);
    noise.stop(time + 0.05);
  },

  clap(ctx, destination, time, volume = 1.0) {
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1150, time);
    filter.Q.setValueAtTime(1.8, time);
    filter.connect(destination);

    // 3 quick pre-claps then main decay
    const burstOffsets = [0, 0.011, 0.022, 0.033];
    const burstGains = [0.6, 0.7, 0.8, 1.0];
    const burstDurations = [0.01, 0.01, 0.01, 0.16];

    for (let i = 0; i < burstOffsets.length; i++) {
      const noise = ctx.createBufferSource();
      noise.buffer = getSharedNoiseBuffer(ctx);

      const gain = ctx.createGain();
      const t = time + burstOffsets[i];
      const dur = burstDurations[i];

      gain.gain.setValueAtTime(volume * burstGains[i], t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

      noise.connect(gain);
      gain.connect(filter);

      noise.start(t);
      noise.stop(t + dur + 0.01);
    }
  },

  click(ctx, destination, time, accented = false, volume = 1.0) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    const freq = accented ? 1600 : 1000;
    osc.frequency.setValueAtTime(freq, time);

    const amp = accented ? 0.9 : 0.6;
    gain.gain.setValueAtTime(volume * amp, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.025);

    osc.connect(gain);
    gain.connect(destination);

    osc.start(time);
    osc.stop(time + 0.03);
  },
};

export class Track {
  constructor(name, voiceKey, audioContext, masterGain) {
    this.name = name;
    this.voiceKey = voiceKey;
    this.audioContext = audioContext;
    this.masterGain = masterGain;
    this.audioBuffer = null;
    this.muted = false;
    this.soloed = false;
    this.volume = 0.85;
    this.steps = new Array(16).fill(false);
  }

  setAudioBuffer(buffer) {
    this.audioBuffer = buffer;
  }

  async loadSample(url) {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    this.audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
  }

  toggleStep(index) {
    if (index >= 0 && index < 16) {
      this.steps[index] = !this.steps[index];
    }
    return this.steps[index];
  }

  setStep(index, active) {
    if (index >= 0 && index < 16) {
      this.steps[index] = Boolean(active);
    }
  }

  clearSteps() {
    this.steps.fill(false);
  }

  play(time, velocity = 1.0) {
    if (this.muted || !this.audioContext) {
      return;
    }
    if (this.audioBuffer) {
      this.playBuffer(time, velocity);
    } else {
      const voice = SynthVoices[this.voiceKey];
      if (voice) {
        voice(this.audioContext, this.masterGain, time, velocity * this.volume);
      }
    }
  }

  playBuffer(time, velocity = 1.0) {
    const source = this.audioContext.createBufferSource();
    source.buffer = this.audioBuffer;
    const gain = this.audioContext.createGain();
    gain.gain.setValueAtTime(velocity * this.volume, time);
    source.connect(gain);
    gain.connect(this.masterGain);
    source.start(time);
  }
}

export class AudioEngine {
  #audioContext = null;
  #masterGain = null;
  #tracks = [];
  #session = null;
  #schedulerTimer = null;
  #latencyMode = false;
  #metronome = false;
  #metronomeVolume = 0.6;
  #nextBeatToSchedule = null;
  #onStepCallback = null;

  constructor() {
    // Tracks exist from the start so the pattern grid can be built; the AudioContext is created on the
    // first user gesture (Connect, or Connect MIDI) and handed to them then.
    this.#tracks = [
      new Track('Kick', 'kick', null, null),
      new Track('Snare', 'snare', null, null),
      new Track('Hi-hat', 'hat', null, null),
      new Track('Clap', 'clap', null, null),
    ];
  }

  get audioContext() {
    return this.#audioContext;
  }

  get tracks() {
    return this.#tracks;
  }

  get latencyMode() {
    return this.#latencyMode;
  }

  set latencyMode(val) {
    this.#latencyMode = Boolean(val);
  }

  // The beat click for playing along. Shares its scheduling with latency mode.
  get metronome() {
    return this.#metronome;
  }

  set metronome(val) {
    this.#metronome = Boolean(val);
  }

  get metronomeVolume() {
    return this.#metronomeVolume;
  }

  set metronomeVolume(val) {
    this.#metronomeVolume = Math.max(0, Math.min(1, Number(val) || 0));
  }

  get baseLatencyMs() {
    if (!this.#audioContext || typeof this.#audioContext.baseLatency !== 'number') {
      return null;
    }
    return this.#audioContext.baseLatency * 1000;
  }

  get outputLatencyMs() {
    if (!this.#audioContext || typeof this.#audioContext.outputLatency !== 'number') {
      return null;
    }
    return this.#audioContext.outputLatency * 1000;
  }

  get sampleRate() {
    return this.#audioContext ? this.#audioContext.sampleRate : null;
  }

  init(session) {
    this.#session = session;
    this.ensureContext();
  }

  // Forget the session (on disconnect), keeping the AudioContext for MIDI notes and the next connect.
  detach() {
    this.#session = null;
  }

  // Creates the AudioContext if needed. Call from a user gesture.
  ensureContext() {
    if (!this.#audioContext) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.#audioContext = new AudioCtx({ latencyHint: 'interactive' });
      this.#masterGain = this.#audioContext.createGain();
      this.#masterGain.gain.setValueAtTime(0.85, this.#audioContext.currentTime);
      this.#masterGain.connect(this.#audioContext.destination);
      for (const track of this.#tracks) {
        track.audioContext = this.#audioContext;
        track.masterGain = this.#masterGain;
      }
    }
    return this.#audioContext;
  }

  // Plays a track now (a MIDI note), honouring mute and solo. velocity is 0-1.
  trigger(trackIndex, velocity = 1.0) {
    const track = this.#tracks[trackIndex];
    if (!track || !this.#audioContext) {
      return false;
    }
    const hasSolo = this.#tracks.some((t) => t.soloed);
    if (track.muted || (hasSolo && !track.soloed)) {
      return false;
    }
    track.play(this.#audioContext.currentTime, velocity);
    return true;
  }

  setSession(session) {
    this.#session = session;
  }

  setOnStepCallback(cb) {
    this.#onStepCallback = cb;
  }

  hasContext() {
    return Boolean(this.#audioContext);
  }

  isRunning() {
    return this.#audioContext?.state === 'running';
  }

  async resume() {
    if (this.#audioContext && this.#audioContext.state === 'suspended') {
      await this.#audioContext.resume();
    }
  }

  startScheduler() {
    if (this.#schedulerTimer !== null) {
      return;
    }
    this.#nextBeatToSchedule = null;
    // Lookahead loop at 25ms interval
    this.#schedulerTimer = setInterval(() => {
      this.#onSchedulerTick();
    }, 25);
  }

  stopScheduler() {
    if (this.#schedulerTimer !== null) {
      clearInterval(this.#schedulerTimer);
      this.#schedulerTimer = null;
    }
    this.#nextBeatToSchedule = null;
  }

  #onSchedulerTick() {
    if (!this.#session || !this.#audioContext) {
      return;
    }

    // Capture state once per tick in audioContext time base
    const state = this.#session.captureState(this.#audioContext);
    const quantum = this.#session.quantum || 4;

    const tCurrent = this.#audioContext.currentTime;
    const lookaheadSec = 0.100;
    const tWindowEnd = tCurrent + lookaheadSec;

    // Check solo states
    const hasSolo = this.#tracks.some((t) => t.soloed);

    const currentBeat = state.beatAtTime(tCurrent, quantum);

    // Initialize or resync nextBeatToSchedule if out of sync
    if (this.#nextBeatToSchedule === null ||
        Math.abs(this.#nextBeatToSchedule - currentBeat) > 4.0 ||
        state.timeAtBeat(this.#nextBeatToSchedule, quantum) < tCurrent - 0.05) {
      this.#nextBeatToSchedule = Math.ceil(currentBeat * 4.0) / 4.0;
    }

    // Schedule 16th-note beats (increments of 0.25 beats) within lookahead window
    while (true) {
      const beatTime = state.timeAtBeat(this.#nextBeatToSchedule, quantum);
      if (beatTime >= tWindowEnd) {
        break;
      }

      // Check if this beat is within active playback time
      const isStartStopSync = Boolean(this.#session.startStopSync);
      const isPlaying = state.isPlaying;
      const isAfterPlayStart = beatTime >= (state.timeForIsPlaying || 0) - 0.005;

      const shouldPlayBeats = !isStartStopSync || (isPlaying && isAfterPlayStart);

      if (shouldPlayBeats && beatTime >= tCurrent - 0.005) {
        // Step in 16-step pattern (16 steps = 4 beats)
        const step16 = ((Math.round(this.#nextBeatToSchedule * 4) % 16) + 16) % 16;

        // Schedule tracks
        for (const track of this.#tracks) {
          if (track.steps[step16]) {
            if (hasSolo) {
              if (track.soloed && !track.muted) {
                track.play(beatTime);
              }
            } else if (!track.muted) {
              track.play(beatTime);
            }
          }
        }

        // Click on every whole beat, accented on beat 0 of the quantum: the metronome, or latency mode
        // (always full volume, so the recording has a clear transient to measure).
        if (this.#latencyMode || this.#metronome) {
          const isIntegerBeat = Math.abs(this.#nextBeatToSchedule - Math.round(this.#nextBeatToSchedule)) < 1e-4;
          if (isIntegerBeat) {
            const beatInt = Math.round(this.#nextBeatToSchedule);
            const isDownbeat = ((beatInt % quantum) + quantum) % quantum === 0;
            const volume = this.#latencyMode ? 1.0 : this.#metronomeVolume;
            if (volume > 0) {
              SynthVoices.click(this.#audioContext, this.#masterGain, beatTime, isDownbeat, volume);
            }
          }
        }
      }

      this.#nextBeatToSchedule = (Math.round(this.#nextBeatToSchedule * 4) + 1) / 4.0;
    }
  }
}
