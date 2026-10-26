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

// Ported from Chrome Music Lab's Arpeggios: app/chord/Chord.js, Wheel.js, Letters.js and
// Interface.js. Modified in 2026 for the Web Tempo Sync demo: ES modules and plain DOM rather
// than jQuery; one class; pointer events; sized by a ResizeObserver on its own box rather than
// the window; drawn at the device pixel ratio; keyboard selection.

import { COLORS, MINOR_COLORS, POSITIONS, INNER_RADIUS, MAJOR_ORDER, MINOR_ORDER } from './data.js';

const MARGIN = 15;

export class ChordWheel {
  letter = 'C';
  mode = 'major';
  onpick = () => {};

  constructor(container) {
    this.container = container;
    this.wheel = document.createElement('div');
    this.wheel.className = 'arp-wheel';
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'arp-canvas';
    this.letters = document.createElement('div');
    this.letters.className = 'arp-letters';
    this.interaction = document.createElement('div');
    this.interaction.className = 'arp-interaction';
    this.interaction.tabIndex = 0;
    this.interaction.setAttribute('role', 'group');
    this.wheel.append(this.canvas, this.letters, this.interaction);
    container.append(this.wheel);

    this.#makeLetters();
    this.interaction.addEventListener('pointerdown', (e) => this.#pointerdown(e));
    this.interaction.addEventListener('keydown', (e) => this.#keydown(e));
    new ResizeObserver(() => this.resize()).observe(container);
  }

  // The square wheel, centred in its container (Chord.js size()).
  resize() {
    const dim = Math.min(this.container.clientWidth, this.container.clientHeight) - MARGIN * 2;
    if (dim <= 0) {
      return; // hidden
    }
    this.size = dim;
    this.wheel.style.width = `${dim}px`;
    this.wheel.style.height = `${dim}px`;
    this.wheel.style.marginLeft = `${-dim / 2}px`;
    this.wheel.style.marginTop = `${-dim / 2}px`;
    this.wheel.style.setProperty('--dim', `${dim}px`);
    const ratio = Math.max(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(dim * ratio);
    this.canvas.height = Math.round(dim * ratio);
    for (const node of this.letters.children) {
      node.style.left = `${(node.dataset.x * dim) / 2 + dim / 2}px`;
      node.style.top = `${(node.dataset.y * dim) / 2 + dim / 2}px`;
    }
    this.draw();
  }

  set(letter, mode) {
    this.letter = letter;
    this.mode = mode;
    this.interaction.setAttribute('aria-label', `Chord wheel, ${letter} ${mode}. Arrow keys go round the wheel; Enter switches major and minor.`);
    this.draw();
  }

  // Wheel.js draw(): the majors, then the minors over them; the chosen one black.
  draw() {
    const ctx = this.canvas.getContext('2d');
    const w = this.canvas.width;
    const c = w / 2;
    ctx.clearRect(0, 0, w, w);
    for (const mode of ['major', 'minor']) {
      for (const [letter, slice] of Object.entries(POSITIONS[mode])) {
        const chosen = letter === this.letter && mode === this.mode;
        ctx.fillStyle = chosen ? 'black' : mode === 'major' ? COLORS[letter] : MINOR_COLORS[letter];
        ctx.beginPath();
        ctx.moveTo(c, c);
        ctx.arc(c, c, c * slice.outerRadius, slice.startAngle, slice.endAngle, false);
        ctx.fill();
      }
    }
  }

  // Letters.js
  #makeLetters() {
    for (const mode of ['major', 'minor']) {
      for (const [letter, slice] of Object.entries(POSITIONS[mode])) {
        const node = document.createElement('div');
        node.className = `arp-letter ${mode === 'major' ? 'major' : 'minor'}`;
        node.dataset.x = slice.center.x;
        node.dataset.y = slice.center.y;
        const [name, sharp] = letter.split('#');
        node.textContent = mode === 'major' ? name : name.toLowerCase();
        if (sharp !== undefined) {
          const span = document.createElement('span');
          span.textContent = '#';
          node.append(span);
        }
        this.letters.append(node);
      }
    }
  }

  // Interface.js getChord(): the slice under a point, in the wheel's own pixels.
  chordAt(x, y) {
    const width = this.interaction.clientWidth;
    const height = this.interaction.clientHeight;
    x = ((x - width / 2) / width) * 2;
    y = ((y - height / 2) / height) * 2;
    const theta = Math.atan2(y, x);
    const radius = Math.sqrt(x * x + y * y);
    if (radius > 1) {
      return null;
    }
    let index = MAJOR_ORDER.findIndex((letter) => {
      const { startAngle, endAngle } = POSITIONS.major[letter];
      return (theta > startAngle && theta < endAngle) || (theta + Math.PI * 2 > startAngle && theta + Math.PI * 2 < endAngle);
    });
    if (index < 0) {
      index = 0;
    }
    return radius < INNER_RADIUS ? [MINOR_ORDER[index], 'minor'] : [MAJOR_ORDER[index], 'major'];
  }

  #pointerdown(e) {
    if (e.button > 0) {
      return;
    }
    const rect = this.interaction.getBoundingClientRect();
    const chord = this.chordAt(e.clientX - rect.left, e.clientY - rect.top);
    if (!chord) {
      return;
    }
    e.preventDefault();
    this.onpick(chord[0], chord[1]);
  }

  #keydown(e) {
    const order = this.mode === 'major' ? MAJOR_ORDER : MINOR_ORDER;
    let i = order.indexOf(this.letter);
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      i = (i + 1) % 12;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      i = (i + 11) % 12;
    } else if (e.key === 'Enter') {
      const other = this.mode === 'major' ? 'minor' : 'major';
      e.preventDefault();
      this.onpick((other === 'major' ? MAJOR_ORDER : MINOR_ORDER)[i], other);
      return;
    } else {
      return;
    }
    e.preventDefault();
    this.onpick(order[i], this.mode);
  }
}
