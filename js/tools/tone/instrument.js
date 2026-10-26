// The tone tab's voices, on Tone.js: a bass, a chord pad and a lead, through a delay and a
// reverb, and three sounds to choose from.

export const SOUNDS = {
  warm: {
    bass: {
      oscillator: { type: 'sawtooth' },
      filter: { Q: 2, type: 'lowpass', rolloff: -24 },
      envelope: { attack: 0.004, decay: 0.25, sustain: 0.35, release: 0.25 },
      filterEnvelope: { attack: 0.002, decay: 0.18, sustain: 0.2, release: 0.3, baseFrequency: 70, octaves: 3.2 },
    },
    pad: {
      oscillator: { type: 'fatsawtooth', count: 3, spread: 24 },
      envelope: { attack: 0.35, decay: 0.4, sustain: 0.65, release: 1.4 },
    },
    padFilter: 1300,
    lead: {
      harmonicity: 2,
      modulationIndex: 3,
      oscillator: { type: 'triangle' },
      modulation: { type: 'sine' },
      envelope: { attack: 0.004, decay: 0.3, sustain: 0.08, release: 0.4 },
      modulationEnvelope: { attack: 0.004, decay: 0.15, sustain: 0.1, release: 0.3 },
    },
  },
  glass: {
    bass: {
      oscillator: { type: 'triangle' },
      filter: { Q: 1, type: 'lowpass', rolloff: -12 },
      envelope: { attack: 0.006, decay: 0.35, sustain: 0.5, release: 0.3 },
      filterEnvelope: { attack: 0.004, decay: 0.3, sustain: 0.5, release: 0.4, baseFrequency: 180, octaves: 2 },
    },
    pad: {
      oscillator: { type: 'fatsine', count: 3, spread: 12 },
      envelope: { attack: 0.08, decay: 1.2, sustain: 0.3, release: 2 },
    },
    padFilter: 4200,
    lead: {
      harmonicity: 3.01,
      modulationIndex: 9,
      oscillator: { type: 'sine' },
      modulation: { type: 'sine' },
      envelope: { attack: 0.002, decay: 0.9, sustain: 0, release: 1 },
      modulationEnvelope: { attack: 0.002, decay: 0.4, sustain: 0, release: 0.5 },
    },
  },
  retro: {
    bass: {
      oscillator: { type: 'pulse', width: 0.3 },
      filter: { Q: 4, type: 'lowpass', rolloff: -24 },
      envelope: { attack: 0.002, decay: 0.12, sustain: 0.6, release: 0.08 },
      filterEnvelope: { attack: 0.002, decay: 0.1, sustain: 0.3, release: 0.1, baseFrequency: 120, octaves: 3.5 },
    },
    pad: {
      oscillator: { type: 'fatsquare', count: 2, spread: 10 },
      envelope: { attack: 0.01, decay: 0.2, sustain: 0.45, release: 0.3 },
    },
    padFilter: 1800,
    lead: {
      harmonicity: 1,
      modulationIndex: 1.5,
      oscillator: { type: 'square' },
      modulation: { type: 'square' },
      envelope: { attack: 0.002, decay: 0.12, sustain: 0.25, release: 0.08 },
      modulationEnvelope: { attack: 0.002, decay: 0.1, sustain: 0.2, release: 0.1 },
    },
  },
};

export class Instrument {
  constructor(Tone) {
    this.Tone = Tone;
    this.out = new Tone.Volume(-8).toDestination();
    this.reverb = new Tone.Reverb({ decay: 3.2, preDelay: 0.02, wet: 0.28 }).connect(this.out);
    this.delay = new Tone.PingPongDelay({ delayTime: '8n.', feedback: 0.32, wet: 0.24 }).connect(this.reverb);

    this.bass = new Tone.MonoSynth().connect(this.out);
    this.bass.volume.value = -6;

    this.padFilter = new Tone.Filter({ type: 'lowpass', frequency: 1300, Q: 0.5 }).connect(this.reverb);
    this.pad = new Tone.PolySynth(Tone.Synth, { maxPolyphony: 12 }).connect(this.padFilter);
    this.pad.volume.value = -17;

    this.lead = new Tone.PolySynth(Tone.FMSynth, { maxPolyphony: 6 });
    this.lead.connect(this.delay);
    this.lead.connect(this.reverb);
    this.lead.volume.value = -14;

    this.mutes = { bass: false, chords: false, lead: false };
  }

  setSound(name) {
    const sound = SOUNDS[name] ?? SOUNDS.warm;
    this.bass.set(sound.bass);
    this.pad.set(sound.pad);
    this.padFilter.frequency.rampTo(sound.padFilter, 0.1);
    this.lead.set(sound.lead);
  }

  // The delay is a dotted eighth at the session's tempo.
  setTempo(bpm) {
    this.delay.delayTime.rampTo((60 / bpm) * 0.75, 0.05);
  }

  set volume(db) {
    this.out.volume.rampTo(db, 0.05);
  }

  // Play one step of a bar's pattern at the time.
  playStep(bar, step, time, sixteenth) {
    const { Tone } = this;
    const hit = (voice, synth, mono = false) => {
      const event = bar[voice][step];
      if (!event || this.mutes[voice]) {
        return;
      }
      const notes = event.notes.map((n) => Tone.Frequency(n, 'midi').toFrequency());
      const duration = event.steps * sixteenth * (voice === 'chords' ? 0.98 : 0.85);
      if (mono) {
        synth.triggerAttackRelease(notes[0], duration, time, event.velocity);
      } else {
        synth.triggerAttackRelease(notes, duration, time, event.velocity);
      }
    };
    hit('bass', this.bass, true);
    hit('chords', this.pad);
    hit('lead', this.lead);
  }

  releaseAll() {
    this.pad.releaseAll();
    this.lead.releaseAll();
    this.bass.triggerRelease();
  }
}
