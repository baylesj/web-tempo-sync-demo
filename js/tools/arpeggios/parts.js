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

// Ported from Chrome Music Lab's Arpeggios: app/part/Parts.js, Part.js, Note.js, SnapScroll.js
// and TimelineIndicator.js. Modified in 2026 for the Web Tempo Sync demo: ES modules and plain
// DOM rather than jQuery; a small swipeable track with arrows in place of slick-carousel; notes
// placed in percentages, so they need no resize handler; the parts only draw, and index.js
// schedules their notes on the shared Transport.

import { COLORS, PITCH_CLASSES, LOWEST_NOTE, HIGHEST_NOTE, LOOP_BEATS } from './data.js';
import { icon } from './icons.js';

export class PartsView {
  index = 0;
  onchange = () => {};

  constructor(strip, arrowsParent, patterns) {
    this.strip = strip;
    this.patterns = patterns;
    this.track = document.createElement('div');
    this.track.className = 'arp-track';
    this.parts = patterns.map((events, p) => {
      const part = document.createElement('div');
      part.className = 'arp-part';
      part.setAttribute('role', 'group');
      part.setAttribute('aria-roledescription', 'slide');
      part.setAttribute('aria-label', `Pattern ${p + 1} of ${patterns.length}`);
      const notes = events.map((event, i) => {
        const note = document.createElement('div');
        note.className = 'arp-note';
        note.style.left = `calc(2px + ${(event.time / LOOP_BEATS) * 100}%)`;
        note.style.width = `calc(${(event.length / LOOP_BEATS) * 100}% - 4px)`;
        // the notes move to a new chord one after another (part.scss nth-child delays)
        note.style.transitionDelay = `${(i + 1) / 60}s`;
        const highlight = document.createElement('div');
        highlight.className = 'arp-highlight';
        note.append(highlight);
        part.append(note);
        return { node: note, highlight, timer: 0 };
      });
      this.track.append(part);
      return { node: part, notes };
    });
    this.position = document.createElement('div');
    this.position.className = 'arp-loop-position';
    strip.append(this.track, this.position);

    this.prev = this.#arrow('prev', 'left', 'Previous pattern', -1);
    this.next = this.#arrow('next', 'right', 'Next pattern', 1);
    arrowsParent.append(this.prev, this.next);
    this.#swipe();
    this.setPart(0, false);
  }

  #arrow(cls, glyph, label, step) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `arp-button arp-arrow ${cls}`;
    b.setAttribute('aria-label', label);
    b.innerHTML = icon(glyph);
    b.addEventListener('click', (e) => {
      e.preventDefault();
      this.setPart(this.index + step);
    });
    return b;
  }

  setPart(index, notify = true) {
    index = Math.max(0, Math.min(this.parts.length - 1, index));
    const changed = index !== this.index;
    this.index = index;
    this.track.style.transform = `translateX(${-index * 100}%)`;
    this.prev.disabled = index === 0;
    this.next.disabled = index === this.parts.length - 1;
    this.parts.forEach((p, i) => p.node.setAttribute('aria-hidden', String(i !== index)));
    if (this.chord) {
      this.setChord(this.chord);
    }
    if (changed && notify) {
      this.onchange(index);
    }
  }

  // Note.js setChord(): each note's height and colour from its degree of the chord. Only the
  // part showing moves; the others catch up when they come into view, as in the original.
  setChord(chord) {
    this.chord = chord;
    const part = this.parts[this.index];
    this.patterns[this.index].forEach((event, i) => {
      const midi = chord[event.degree];
      const position = (midi - LOWEST_NOTE + 2) / (HIGHEST_NOTE - LOWEST_NOTE);
      const note = part.notes[i].node;
      note.style.top = `${(1 - position) * 100}%`;
      note.style.backgroundColor = COLORS[PITCH_CLASSES[midi % 12]];
    });
  }

  // Note.js play(): black while it sounds.
  flash(eventIndex, seconds) {
    const note = this.parts[this.index].notes[eventIndex];
    if (!note) {
      return;
    }
    clearTimeout(note.timer);
    note.highlight.classList.add('active');
    note.timer = setTimeout(() => note.highlight.classList.remove('active'), seconds * 1000);
  }

  // TimelineIndicator.js: the playhead, as a fraction of the loop.
  setProgress(fraction) {
    this.position.style.left = `${fraction * 100}%`;
  }

  // SnapScroll.js: slick's swipe, without slick. A drag of a fifth of the width changes part.
  #swipe() {
    let start = null;
    const width = () => this.strip.clientWidth || 1;
    this.strip.addEventListener('pointerdown', (e) => {
      if (e.button > 0) {
        return;
      }
      start = { x: e.clientX, y: e.clientY, id: e.pointerId, dragging: false };
    });
    this.strip.addEventListener('pointermove', (e) => {
      if (!start || e.pointerId !== start.id) {
        return;
      }
      const dx = e.clientX - start.x;
      if (!start.dragging && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(e.clientY - start.y)) {
        start.dragging = true;
        this.strip.setPointerCapture(e.pointerId);
        this.track.classList.add('dragging');
      }
      if (start.dragging) {
        // resist past the ends, as slick does with infinite: false
        const atEnd = (dx > 0 && this.index === 0) || (dx < 0 && this.index === this.parts.length - 1);
        const offset = (atEnd ? dx / 3 : dx) / width();
        this.track.style.transform = `translateX(${(-this.index + offset) * 100}%)`;
      }
    });
    const end = (e) => {
      if (!start || e.pointerId !== start.id) {
        return;
      }
      const dx = e.clientX - start.x;
      const dragging = start.dragging;
      start = null;
      this.track.classList.remove('dragging');
      if (!dragging) {
        return;
      }
      const step = Math.abs(dx) > width() / 5 ? -Math.sign(dx) : 0;
      this.setPart(this.index + step);
    };
    this.strip.addEventListener('pointerup', end);
    this.strip.addEventListener('pointercancel', end);
  }
}
