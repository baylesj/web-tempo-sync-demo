// The tone tab's music: moods (a scale and a four-bar progression), and patterns for the bass,
// chords and lead, generated from a seed. Pure functions, so the same seed, mood and density
// give the same patterns in every window.

export const KEYS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

// Scale steps in semitones, and the progression as scale degrees (0 is the tonic), one per bar.
export const MOODS = {
  night: { name: 'night', scale: [0, 2, 3, 5, 7, 8, 10], progression: [0, 5, 2, 6] }, // aeolian: i VI III VII
  drift: { name: 'drift', scale: [0, 2, 3, 5, 7, 9, 10], progression: [0, 3, 0, 6] }, // dorian: i IV i VII
  bright: { name: 'bright', scale: [0, 2, 4, 5, 7, 9, 11], progression: [0, 4, 5, 3] }, // ionian: I V vi IV
  float: { name: 'float', scale: [0, 2, 4, 6, 7, 9, 11], progression: [0, 1, 0, 4] }, // lydian: I II I V
};

export const BARS = 4;
const ROMAN = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii'];

// mulberry32: small, fast, and the same everywhere.
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The MIDI note of a scale degree (any integer; 7 is the tonic an octave up) in the key and octave.
function degreeToMidi(mood, key, degree, octave) {
  const n = mood.scale.length;
  const oct = Math.floor(degree / n);
  const step = mood.scale[((degree % n) + n) % n];
  return 12 * (octave + 1 + oct) + KEYS.indexOf(key) + step;
}

// A chord's name: its numeral, upper case when its third is major.
export function chordName(mood, degree) {
  const s = mood.scale;
  const third = (s[(degree + 2) % 7] - s[degree] + 12) % 12;
  const numeral = ROMAN[degree];
  return third === 4 ? numeral.toUpperCase() : numeral;
}

// How likely a note is on each sixteenth of a beat: on the beat, the "and", then the rest.
const WEIGHT = [1, 0.35, 0.65, 0.4];

// Patterns for each bar of the progression, `steps` sixteenths long. Each step of each voice is
// null or { notes: [midi...], steps: length in sixteenths, velocity }.
export function makePatterns({ seed, mood: moodName, key, density, steps }) {
  const mood = MOODS[moodName];
  const random = rng(seed);
  const bars = [];
  let leadDegree = 7 + 4; // start on the fifth, an octave up
  for (let bar = 0; bar < BARS; bar++) {
    const root = mood.progression[bar];
    const chordTones = [root, root + 2, root + 4, root + 6];
    const bass = new Array(steps).fill(null);
    const chords = new Array(steps).fill(null);
    const lead = new Array(steps).fill(null);

    // Chords: a seventh chord held for the bar, struck again halfway when it's busy.
    const voicing = [root, root + 2, root + 4, root + 6].map((d) => degreeToMidi(mood, key, d, 3));
    const half = Math.floor(steps / 2 / 4) * 4;
    const restrike = density > 0.55 && half > 0;
    chords[0] = { notes: voicing, steps: restrike ? half : steps, velocity: 0.55 };
    if (restrike) {
      chords[half] = { notes: voicing, steps: steps - half, velocity: 0.42 };
    }

    // Bass: the root on the downbeat; more notes, octaves and fifths as density rises.
    for (let s = 0; s < steps; s++) {
      const w = WEIGHT[s % 4];
      const p = s === 0 ? 1 : density * w * 0.9 - (s % 4 === 0 ? 0 : 0.1);
      if (random() >= p) {
        continue;
      }
      const choice = random();
      const degree = s === 0 || choice < 0.6 ? root : choice < 0.85 ? root + 4 : root + 7;
      bass[s] = { notes: [degreeToMidi(mood, key, degree, 1)], steps: s % 4 === 0 ? 2 : 1, velocity: s === 0 ? 0.9 : 0.7 };
    }

    // Lead: a walk around the scale that leans to chord tones on the beat.
    for (let s = 0; s < steps; s++) {
      const p = density * WEIGHT[s % 4] * 0.85;
      if (random() >= p) {
        continue;
      }
      if (s % 4 === 0 && random() < 0.6) {
        // the nearest chord tone, in the lead's octave
        const target = chordTones
          .flatMap((d) => [d + 7, d + 14])
          .reduce((best, d) => (Math.abs(d - leadDegree) < Math.abs(best - leadDegree) ? d : best));
        leadDegree = target;
      } else {
        leadDegree += [-2, -1, -1, 1, 1, 2][Math.floor(random() * 6)];
      }
      leadDegree = Math.max(5, Math.min(16, leadDegree));
      const long = random() < 0.25 ? 2 : 1;
      lead[s] = { notes: [degreeToMidi(mood, key, leadDegree, 4)], steps: long, velocity: 0.5 + random() * 0.35 };
    }

    bars.push({ chord: chordName(mood, root), bass, chords, lead });
  }
  return bars;
}
