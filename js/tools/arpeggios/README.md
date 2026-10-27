# arpeggios tab

[Chrome Music Lab](https://musiclab.chromeexperiments.com)'s **Arpeggios**, ported to run in this page on the shared Tone.js fork, so it plays in time with the session: with the other tabs, other pages, and Ableton Live.

## Credits and license

- The original is the Arpeggios experiment in [googlecreativelab/chrome-music-lab](https://github.com/googlecreativelab/chrome-music-lab/tree/master/arpeggios) (archived), Copyright 2016 Google Inc., by Yotam Mann ([@tambien](https://github.com/tambien)), under the Apache License 2.0 (`LICENSE`).
- Every file in this folder is under the Apache License 2.0. Files ported from the original keep Google's header and say which original files they come from and what changed. `icons.js` and `README.md` are new.
- `images/icon_check_grey.png` and `images/icon_check_white.png` are from the original repository, unchanged.
- It runs on the page's Tone.js fork (`../tone/vendor`, MIT) through `../tone/runtime.js`.

## What changed

- **Modules:** AMD `define()` modules and webpack 1 became ES modules with no build step. `mount(panel, hub)` builds the tool inside its tab instead of on `document.body`.
- **Libraries:** jQuery became plain DOM. jquery-knob became an SVG dial (`metronome.js`) with the same 270° arc, thickness and colours, plus keyboard input. slick-carousel became a small swipeable track with arrows (`parts.js`). teoria became arithmetic (`data.js`: root at C3 = MIDI 48, triads over three octaves). tinycolor2's `darken(10)` became a small HSL function. StartAudioContext became a tap that resumes the context, and domready is gone.
- **Styles:** the Sass became plain CSS (`style.css`), scoped to `.arp-stage`, a box in the page rather than the whole window. Container queries stand in for the small-screen media queries. There's a dark variant for the page's dark theme.
- **Icons:** the icon font was served from the Music Lab site, not the repository, so `icons.js` draws inline SVG stand-ins (play, pause, arrows, harp, piano, metronome, turtle, rabbit).
- **Tone.js:** the bundled 2016 Tone (`Tone.MultiPlayer`, `Transport.progress`, `Tone.extend`) became the page's Tone 15 fork, shared with the tone.js tab.
- **Transport:** with the session stopped, Play is the shared Transport's `start()`, which the fork commits to the session: it starts on the session's next bar line (at once when alone). While the session plays, Play and Stop only start and stop the arpeggio, from the next bar line, so the sampler, the tone.js tab and other windows play on. The original looped its Transport over one bar. The Transport is shared now, so it doesn't loop. Instead, each note comes from the Transport's position modulo four beats, which the fork counts from the bar line the session started in. A pattern starts on every bar line when the bar is 2 or 4 beats, twice a bar at 8, and on every third bar line at 3, where each 12 beats are three patterns over four bars.
- **Tempo:** the metronome's dial sets the Transport's bpm, which the fork commits to the session, and it shows the session's tempo as it changes. When the original opened its metronome while stopped, it started its Transport muted, which here would start everyone's. So while stopped, the dial clicks on the session's beats without starting anything.
- **Dropped:** the orientation listener, which stopped the Transport on rotation (here that would stop the whole session), the loading spinner (nothing loads), and the `postMessage` calls to the Music Lab frame.

## Where the sounds come from

The original played MP3 samples of a harp and a piano. They aren't in the repository: `sound/Player.js` loaded them at runtime from `https://gweb-musiclab-site.appspot.com/static/sound/{harp,piano}/<note>.mp3`, one sample every seven semitones, repitched by up to three semitones either way. That server still answered in October 2026, but it belongs to an archived project, and the samples have no stated license. So this port doesn't use them.

Both instruments are **synthesized** with Tone.js (`sound.js`), shaped to match measurements of those samples:

- **Harp:** almost a sine (second harmonic about −23 dB, third about −32 dB) with a decay of about a second, plus a short, brighter layer for the pluck.
- **Piano:** a strong second harmonic (about −7 dB), a slower decay, a slightly detuned second layer and a short hammer transient.

As in the original, each note is held for its length in the pattern, then released over half a second. A tap on the wheel strums the chord's first four notes 50 ms apart, unless the arpeggio is playing. The metronome click is the original's `MembraneSynth` settings.
