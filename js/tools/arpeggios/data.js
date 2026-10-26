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

// Ported from Chrome Music Lab's Arpeggios: app/data/Colors.js, app/data/Notes.js,
// app/data/Parts.js and app/chord/Positions.js. Modified in 2026 for the Web Tempo Sync demo:
// ES modules; chords computed directly rather than with teoria; the minor colours darkened
// here rather than with tinycolor2; pattern times in beats rather than Tone time strings.

export const COLORS = {
  'C': 'rgb(246, 190, 55)',
  'C#': 'rgb(128, 100, 198)',
  'D': 'rgb(149, 198, 49)',
  'D#': 'rgb(237, 56, 131)',
  'E': 'rgb(69, 181, 161)',
  'F': 'rgb(247, 148, 61)',
  'F#': 'rgb(78, 97, 216)',
  'G': 'rgb(209, 193, 46)',
  'G#': 'rgb(165, 66, 177)',
  'A': 'rgb(75, 178, 80)',
  'A#': 'rgb(247, 88, 57)',
  'B': 'rgb(69, 152, 182)',
};

export const PITCH_CLASSES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// tinycolor2's darken(10): ten points off the HSL lightness.
function darken(rgb, amount) {
  let [r, g, b] = rgb.match(/\d+/g).map((v) => Number(v) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  let l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h /= 6;
  }
  l = Math.max(0, l - amount / 100);
  const hue = (p, q, t) => {
    t = (t + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue(p, q, h + 1 / 3);
    g = hue(p, q, h);
    b = hue(p, q, h - 1 / 3);
  }
  return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
}

export const MINOR_COLORS = Object.fromEntries(Object.entries(COLORS).map(([k, v]) => [k, darken(v, 10)]));

// --- The wheel (Positions.js) ---

const polarToCartesian = (theta, radius) => ({ x: radius * Math.cos(theta), y: radius * Math.sin(theta) });

export const INNER_RADIUS = 0.66;
export const MAJOR_ORDER = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#', 'G#', 'D#', 'A#', 'F'];
export const MINOR_ORDER = ['A', 'E', 'B', 'F#', 'C#', 'G#', 'D#', 'A#', 'F', 'C', 'G', 'D'];

const THRESH = 0.01;
const ARC = (Math.PI * 2) / MAJOR_ORDER.length;

export const POSITIONS = { major: {}, minor: {} };
{
  // C at the top; the majors round the outside, their relative minors inside them
  let start = -ARC / 2 - Math.PI / 2;
  MAJOR_ORDER.forEach((letter, i) => {
    const startAngle = start + i * ARC - THRESH;
    const endAngle = start + (i + 1) * ARC + THRESH;
    POSITIONS.major[letter] = {
      startAngle, endAngle, innerRadius: INNER_RADIUS, outerRadius: 1,
      center: polarToCartesian((startAngle + endAngle) / 2, (1 + INNER_RADIUS) / 2),
    };
    const minor = MINOR_ORDER[i];
    POSITIONS.minor[minor] = {
      startAngle, endAngle, innerRadius: 0, outerRadius: INNER_RADIUS,
      center: polarToCartesian((startAngle + endAngle) / 2, (INNER_RADIUS * 3) / 4),
    };
  });
}

// --- The chords (Notes.js): the triad from the third octave, over three octaves, as MIDI notes ---

export const NOTES = { major: {}, minor: {} };
for (const key of MAJOR_ORDER) {
  const root = 48 + PITCH_CLASSES.indexOf(key); // C3 is MIDI 48, as in teoria
  for (const [mode, third] of [['major', 4], ['minor', 3]]) {
    NOTES[mode][key] = [];
    for (let o = 0; o < 3; o++) {
      NOTES[mode][key].push(root + 12 * o, root + third + 12 * o, root + 7 + 12 * o);
    }
  }
}

// The range the parts view spans (Note.js): the lowest and highest of all the major chords.
const allMajor = Object.values(NOTES.major).flat();
export const LOWEST_NOTE = Math.min(...allMajor);
export const HIGHEST_NOTE = Math.max(...allMajor);

// --- The patterns (Parts.js) ---
// One bar of 4/4 each. Times and lengths are in beats (quarter notes): '8n * k' is k / 2,
// '4n * k' is k, '8t * k' is k / 3.

export const LOOP_BEATS = 4;

const run = (unit, degrees) => degrees.flatMap((d, i) => (Array.isArray(d) ? d : [d]).map((degree) => ({ time: i * unit, degree, length: unit })));

export const PATTERNS = [
  run(1 / 2, [0, 1, 2, 3, 4, 3, 2, 1]),
  run(1 / 2, [3, 5, 4, 5, 3, 5, 4, 5]),
  run(1, [0, 1, 2, 3]),
  run(1 / 3, [5, 4, 3, 4, 3, 2, 3, 2, 1, 2, 3, 4]),
  run(1 / 3, [[0, 2], [1, 3], [2, 4], [3, 5], [2, 4], [1, 5], [0, 6], [1, 5], [2, 6], [3, 7], [6, 2], [5, 1]]),
];
