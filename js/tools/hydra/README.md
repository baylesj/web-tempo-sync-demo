# hydra tab

Live-coded visuals with [Hydra](https://hydra.ojack.xyz), timed in beats from the page's shared tempo session, so they move with the other tabs and with anything on the Link session (Ableton Live, say).

| File | What it is |
| --- | --- |
| `index.js` | `mount(panel, hub)`: the canvas, the clock, running sketches, pausing when hidden |
| `editor.js` | A textarea over a highlighted copy of its text, using the page's own highlighter (`js/highlight.js`) |
| `style.css` | This tab's styles, loaded by `mount` |

## How time works

Hydra normally keeps its own clock: each `tick(dt)` adds `dt * speed` to `time`. Here it runs with `autoLoop: false`, and every animation frame:

1. captures the session state and reads `beatAtTime(now)`, `phaseAtTime(now, quantum)`, `tempo`, `isPlaying` and `timeForIsPlaying`;
2. sets `synth.time` one step back, `(beat - dt / 1000) * speed`, and calls `tick(dt)`, so after the tick `time` is exactly the session's beat (times `speed`).

`time` is never accumulated, so it can't drift, and a tempo or phase change from anyone (this page, another tab, Live) shows up on the next frame. `bpm` is pinned at 60, so Hydra's arrays (`osc([10, 20, 40])`) step once a beat. `speed` still works: it scales `time` and stays locked to the beat.

Sketches can read the clock through these helpers. Each is a function, so it works as a Hydra parameter, passed bare (`osc(10, 0.1, pulse)`) or inside an arrow function (`() => phase() / 4`):

| Helper | Value |
| --- | --- |
| `beat()` | the session's beat, which is `time` |
| `phase()` | where in the bar, from 0 up to the quantum |
| `bar()` | which bar |
| `tempo()` | beats per minute |
| `quantum()` | beats per bar |
| `playing()` | 1 while the session plays, else 0 |
| `pulse(k = 6)` | `exp(-k * fract(beat))` while playing, else 0 |
| `accent(k = 3)` | `exp(-k * phase)` while playing, else 0: the downbeat |

## Choices

- **Transport.** As in Link, beats keep counting while the session is stopped, so `time` keeps moving and the visuals stay in phase. Only `pulse()`, `accent()` and `playing()` wait for Play, so the starter sketch drifts quietly when stopped and kicks on the beat when playing. A start or stop counts from its `timeForIsPlaying` (the next bar line, from the session bar's Play), not from when it was asked for.
- **No session.** The tab runs on a free 120 BPM clock (with the hub's quantum) and counts as playing, so the starter still pulses. A note with a Connect button calls `hub.connect()`.
- **Hidden.** Drawing stops while the panel is hidden, scrolled out of view, or the page is in the background (a `MutationObserver` on `hidden`, an `IntersectionObserver` and `visibilitychange`). Time comes from the session, so it picks up in phase.
- **No globals.** `makeGlobal: false` keeps `osc`, `src`, `o0` and the rest off `window`, where the other tools live. A sketch runs inside `with (scope)`, where the scope is a proxy onto the synth and the helpers: reading falls through to the page's globals, and assigning `speed`, `update`, `afterUpdate` or `fps` reaches the synth, as with Hydra's globals. Assigning `time` or a helper is an error; assigning `bpm` is ignored with a note.
- **Errors.** Hydra reports most sketch errors with `console.warn` or `console.log` and carries on. While it runs, those are caught and shown in the tab instead. Run draws a frame straight away, so shader errors show up then; if anything fails, the last working sketch keeps running. Errors from a running sketch (a parameter function that throws) show once, not every frame.
- **Each Run is the whole sketch**: `speed`, `fps`, `update` and `afterUpdate` reset to their defaults first, and the output goes back to `o0`.
- **Editor.** A plain textarea, highlighted, rather than CodeMirror: no build step and no dependency tree from a CDN. Ctrl+Enter (⌘+Enter) runs it, Tab indents, and Escape then Tab leaves it. The sketch is kept in `localStorage`.
- **Resolution** follows the canvas's size at up to 2× device pixels, capped at about 1920×1080.

## Third-party code and licences

- **hydra-synth 1.4.0** by Olivia Jack and contributors, [github.com/ojack/hydra-synth](https://github.com/ojack/hydra-synth), licensed **AGPL-3.0**. Loaded at run time, not vendored: the UMD build from `https://cdn.jsdelivr.net/npm/hydra-synth@1.4.0/dist/hydra-synth.js`, pinned to that version and checked with Subresource Integrity (`sha384-/vOuuF0UsnMoxr7eN/uWmNuIDUgt5t++C+G6a+T9WpUwK3vbCAStyB5cq3IajAj0`). The bundle includes regl (MIT) and Meyda (MIT).
- Hydra's design and the starter sketch's functions (`shape`, `osc`, `noise`, `kaleid`, `modulate` ...) are Hydra's; the starter sketch itself is this project's.

Loading hydra-synth has side effects that can't be turned off: it adds `fast`, `smooth`, `ease`, `offset` and `fit` to `Array.prototype` and defines `window.Hydra` and `window.Meyda`.
