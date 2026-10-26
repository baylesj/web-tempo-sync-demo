/**
 * Copyright 2026 Jordan Bayles
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

// Inline SVG stand-ins for Chrome Music Lab's icon font (style/icons.scss), which was served
// from the Music Lab site rather than kept in the repository.

const FILLED = {
  play: '<path d="M8.5 5.5v13l10.5-6.5z"/>',
  pause: '<path d="M7 5.5h3.5v13H7zM13.5 5.5H17v13h-3.5z"/>',
};

const STROKED = {
  left: '<path d="M14.5 6.5 9 12l5.5 5.5"/>',
  right: '<path d="M9.5 6.5 15 12l-5.5 5.5"/>',
  harp: '<path d="M6.5 20.5v-16"/><path d="M6.5 4.5c4 0 7 3.5 12.5 4"/><path d="M19 8.5 6.5 20.5"/><path d="M9.5 5.2v12.4M12.5 6.4v8.3M15.5 7.6v4.3" stroke-width="1"/>',
  piano: '<rect x="3.5" y="5.5" width="17" height="13" rx="1.5"/><path d="M9.2 18.5v-4.5M14.8 18.5v-4.5"/><path d="M7.8 5.5h2.8v8.5H7.8zM13.4 5.5h2.8v8.5h-2.8z" fill="currentColor" stroke-width="0"/>',
  metronome: '<path d="M9.5 3.5h5l4 17h-13z"/><path d="M6.4 16.5h11.2"/><path d="M12 16.5 17 7"/>',
  turtle: '<path d="M4.5 15.5c0-4 3-6.5 6.5-6.5s6.5 2.5 6.5 6.5z"/><path d="M17.5 13.5h2a1.5 1.5 0 0 0 0-3h-.5"/><path d="M6.5 15.5v2M15.5 15.5v2"/>',
  rabbit: '<path d="M8 20.5c-1.5-4 1-8 5-8.5 3.5-.4 6 1.5 6 4.5s-2.5 4-5 4z"/><path d="M15 12.2c-.5-3-1.8-6.5-3.4-8.5M17.5 12.8c.4-3-.3-6.5-1.5-8.8"/><path d="M8 18.5H5.5"/>',
};

export function icon(name) {
  if (name in FILLED) {
    return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">${FILLED[name]}</svg>`;
  }
  return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${STROKED[name]}</svg>`;
}
