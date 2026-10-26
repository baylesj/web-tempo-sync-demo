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

// Ported from Chrome Music Lab's Arpeggios: app/sound/Metronome.js and style/metronome.scss.
// Modified in 2026 for the Web Tempo Sync demo: an SVG dial with pointer and keyboard input in
// place of jquery-knob (same 270° arc, thickness and colours); it reports the tempo to
// index.js, which sets the session's through the Transport, rather than setting Transport.bpm
// itself; the click is scheduled by index.js.

import { icon } from './icons.js';

export const TEMPO_MIN = 60;
export const TEMPO_MAX = 200;

// jquery-knob's geometry: 270° from the bottom left, clockwise; the line 0.3 of the radius.
const ARC = 270;
const START = 135; // degrees, clockwise from three o'clock
const THICKNESS = 0.3;
const R = 50 - (50 * THICKNESS) / 2;

const point = (deg) => {
  const rad = (deg * Math.PI) / 180;
  return [50 + Math.cos(rad) * R, 50 + Math.sin(rad) * R];
};
const arcPath = (from, to) => {
  const [x0, y0] = point(from);
  const [x1, y1] = point(to);
  return `M${x0.toFixed(3)} ${y0.toFixed(3)}A${R} ${R} 0 ${to - from > 180 ? 1 : 0} 1 ${x1.toFixed(3)} ${y1.toFixed(3)}`;
};

export class TempoDial {
  value = 120;
  isOpen = false;
  dragging = false;
  oninput = () => {};
  onopen = () => {};
  onclose = () => {};

  constructor(parent, checkUrls) {
    this.overlay = document.createElement('div');
    this.overlay.className = 'arp-metronome';
    this.overlay.setAttribute('role', 'dialog');
    this.overlay.setAttribute('aria-label', 'Tempo');
    this.overlay.inert = true;

    this.wheel = document.createElement('div');
    this.wheel.className = 'arp-metro-wheel';
    this.wheel.innerHTML = `
      <svg class="arp-dial" viewBox="0 0 100 100" role="slider" tabindex="0" aria-label="Tempo, in BPM"
           aria-valuemin="${TEMPO_MIN}" aria-valuemax="${TEMPO_MAX}">
        <path class="arp-dial-bg" d="${arcPath(START, START + ARC)}" stroke-width="${50 * THICKNESS}" />
        <path class="arp-dial-fg" stroke-width="${50 * THICKNESS}" />
      </svg>
      <div class="arp-handle arp-button"><div class="arp-blinky"></div></div>
      <div class="arp-bpm"><b></b> bpm</div>
      <div class="arp-icon arp-turtle">${icon('turtle')}</div>
      <div class="arp-icon arp-rabbit">${icon('rabbit')}</div>`;
    this.check = document.createElement('button');
    this.check.type = 'button';
    this.check.className = 'arp-check arp-button';
    this.check.setAttribute('aria-label', 'Done');
    this.check.style.setProperty('--check', `url("${checkUrls.grey}")`);
    this.check.style.setProperty('--check-active', `url("${checkUrls.white}")`);
    this.wheel.append(this.check);
    this.overlay.append(this.wheel);
    parent.append(this.overlay);

    this.dial = this.wheel.querySelector('.arp-dial');
    this.fg = this.wheel.querySelector('.arp-dial-fg');
    this.handle = this.wheel.querySelector('.arp-handle');
    this.blinky = this.wheel.querySelector('.arp-blinky');
    this.readout = this.wheel.querySelector('.arp-bpm b');

    this.check.addEventListener('click', (e) => {
      e.preventDefault();
      this.close();
    });
    this.#input();
    this.set(120);
  }

  open() {
    if (this.isOpen) {
      return;
    }
    this.isOpen = true;
    this.overlay.inert = false;
    this.overlay.classList.add('visible');
    this.onopen();
    this.dial.focus({ preventScroll: true });
  }

  close() {
    if (!this.isOpen) {
      return;
    }
    this.isOpen = false;
    this.overlay.classList.remove('visible');
    this.overlay.inert = true;
    this.blink(0);
    this.onclose();
  }

  // Show a tempo (from the session, or the dial itself).
  set(bpm) {
    this.value = bpm;
    const v = Math.max(TEMPO_MIN, Math.min(TEMPO_MAX, bpm));
    const end = START + ((v - TEMPO_MIN) / (TEMPO_MAX - TEMPO_MIN)) * ARC;
    this.fg.setAttribute('d', end - START < 0.01 ? '' : arcPath(START, end));
    const [x, y] = point(end);
    this.handle.style.left = `${x}%`;
    this.handle.style.top = `${y}%`;
    const shown = Math.abs(bpm - Math.round(bpm)) < 0.05 ? String(Math.round(bpm)) : bpm.toFixed(1);
    this.readout.textContent = shown;
    this.dial.setAttribute('aria-valuenow', String(Math.round(bpm)));
  }

  // The blinking dot in the handle (Metronome.js blinkyLoop).
  blink(opacity) {
    this.blinky.style.opacity = String(opacity);
  }

  #change(bpm) {
    bpm = Math.round(Math.max(TEMPO_MIN, Math.min(TEMPO_MAX, bpm)));
    if (bpm !== Math.round(this.value)) {
      this.set(bpm);
      this.oninput(bpm);
    }
  }

  #input() {
    const fromPointer = (e) => {
      const rect = this.dial.getBoundingClientRect();
      const deg = (Math.atan2(e.clientY - rect.top - rect.height / 2, e.clientX - rect.left - rect.width / 2) * 180) / Math.PI;
      let rel = (deg - START + 720) % 360;
      if (rel > ARC) {
        rel = rel > ARC + (360 - ARC) / 2 ? 0 : ARC;
      }
      this.#change(TEMPO_MIN + (rel / ARC) * (TEMPO_MAX - TEMPO_MIN));
    };
    this.dial.addEventListener('pointerdown', (e) => {
      if (e.button > 0) {
        return;
      }
      e.preventDefault();
      this.dragging = true;
      this.dial.setPointerCapture(e.pointerId);
      fromPointer(e);
    });
    this.dial.addEventListener('pointermove', (e) => {
      if (this.dragging) {
        fromPointer(e);
      }
    });
    const end = () => {
      this.dragging = false;
    };
    this.dial.addEventListener('pointerup', end);
    this.dial.addEventListener('pointercancel', end);
    this.dial.addEventListener('keydown', (e) => {
      const step = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: 10, PageDown: -10 }[e.key];
      if (e.key === 'Escape') {
        this.close();
        return;
      }
      if (step === undefined) {
        return;
      }
      e.preventDefault();
      this.#change(Math.round(this.value) + step);
    });
  }
}
