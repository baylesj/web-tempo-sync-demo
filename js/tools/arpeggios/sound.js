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

// Ported from Chrome Music Lab's Arpeggios: app/sound/Sound.js, Player.js and
// app/fileplayer/Player.js, and the metronome's synth from app/sound/Metronome.js.
// Modified in 2026 for the Web Tempo Sync demo, on Tone.js 15: the harp and piano were MP3
// samples on the Music Lab site, outside the repository, so here they are synthesized
// (see README.md). Notes are still held for their length and released over half a second,
// as the sample player did, and a chord tap still strums four notes 50 ms apart.

const RELEASE = 0.5; // fileplayer/Player.js _releaseTime

// Each instrument is a few layers of PolySynth. The partials follow the samples' spectra: the
// harp nearly a sine, with a bright pluck on top; the piano with a strong second harmonic and
// a longer decay.
const INSTRUMENTS = {
  harp: [
    {
      volume: -11,
      oscillator: { type: 'custom', partials: [1, 0.07, 0.03, 0.016, 0.005, 0.005, 0.009] },
      envelope: { attack: 0.002, decay: 1.2, sustain: 0, release: RELEASE },
    },
    {
      // the pluck: brighter, and gone in a few tens of milliseconds
      volume: -21,
      oscillator: { type: 'custom', partials: [1, 0.5, 0.2, 0.35, 0.1, 0.15, 0.08] },
      envelope: { attack: 0.001, decay: 0.07, sustain: 0, release: 0.05 },
    },
  ],
  piano: [
    {
      volume: -12,
      oscillator: { type: 'custom', partials: [1, 0.45, 0.07, 0.03, 0.006] },
      envelope: { attack: 0.003, decay: 2.6, sustain: 0, release: RELEASE },
    },
    {
      // a slightly detuned copy, for the beating of a piano's paired strings
      volume: -20,
      detune: 4,
      oscillator: { type: 'custom', partials: [1, 0.3, 0.05] },
      envelope: { attack: 0.003, decay: 1.6, sustain: 0, release: RELEASE },
    },
    {
      // the hammer
      volume: -24,
      oscillator: { type: 'custom', partials: [0.6, 1, 0.6, 0.4, 0.3, 0.2] },
      envelope: { attack: 0.001, decay: 0.04, sustain: 0, release: 0.03 },
    },
  ],
};

export class Sound {
  instrument = 'harp';
  muted = false;

  constructor(Tone) {
    this.Tone = Tone;
    this.output = new Tone.Volume(-2).toDestination();
    this.voices = {};
    for (const [name, layers] of Object.entries(INSTRUMENTS)) {
      this.voices[name] = layers.map(({ volume, ...options }) => {
        const synth = new Tone.PolySynth(Tone.Synth, options).connect(this.output);
        synth.maxPolyphony = 24;
        synth.volume.value = volume;
        return synth;
      });
    }
    // Metronome.js: a membrane click on each beat while the tempo dial is open
    this.click = new Tone.MembraneSynth({
      volume: -20,
      envelope: { attack: 0.008, decay: 0.01, sustain: 0 },
      octaves: 5,
      pitchDecay: 0.1,
      oscillator: { type: 'triangle' },
    }).connect(this.output);
  }

  // Sound.js play(): a MIDI note, held for `duration` seconds, then released.
  play(midi, time, duration) {
    if (this.muted) {
      return;
    }
    const frequency = this.Tone.Frequency(midi, 'midi').toFrequency();
    for (const synth of this.voices[this.instrument]) {
      synth.triggerAttackRelease(frequency, duration, time);
    }
  }

  // Sound.js strum(): the first four notes of the chord, 50 ms apart.
  strum(chord) {
    const now = this.Tone.getContext().currentTime + 128 / this.Tone.getContext().sampleRate;
    for (let i = 0; i < 4; i++) {
      this.play(chord[i], now + 0.05 * i, 0.5);
    }
  }

  tick(time) {
    this.click.triggerAttackRelease('C4', 0.05, time);
  }
}
