# Web Tempo Sync demos

Part of **Web Tempo Sync**: [spec and explainer](https://github.com/baylesj/web-tempo-sync) · [implementation and extension](https://github.com/baylesj/tempo-sync) · [demo](https://github.com/baylesj/web-tempo-sync-demo) · [all repos](https://github.com/search?q=topic%3Aweb-tempo-sync+user%3Abaylesj&type=repositories)

Live at **https://bayl.es/tempo-sync/**.

Web Tempo Sync is a proposed web API that lets a page play in time with music apps and hardware on the local network (anything that speaks Ableton Link) and with other pages. This site is its home: what it is, how to try it, and tools that use it, all sharing one session.

| Tab | What it is |
| --- | --- |
| home | What the API is, how to get it, and the proposal's documents |
| sampler | A sixteen-step drum pattern with a metronome, beat ring and latency clicks |
| strudel | Live coding with [Strudel](https://strudel.cc), its clock following the session |
| hydra | Live-coded visuals with [Hydra](https://hydra.ojack.xyz), timed in beats |
| tone.js | An instrument on a [Tone.js](https://tonejs.github.io) fork whose Transport follows the session |
| arpeggios | [Chrome Music Lab](https://musiclab.chromeexperiments.com)'s Arpeggios, playing along |
| setup | The extension, the prototype Chromium, Live, Move, and networks |
| api | Code samples and the WebIDL |

Each tool loads the first time its tab opens and keeps running when you switch away. **New window** opens the current tab on its own, to see separate pages sync too.

## Where the API comes from

The page uses `navigator.tempoSync` when the browser has it, from the [extension](https://github.com/baylesj/tempo-sync/tree/main/extension) on stable Chrome or from the prototype Chromium build. Otherwise it uses a stand-in (`js/stand-in.js`) that follows the draft's model and syncs this browser's tabs over a `BroadcastChannel`. The session bar says which one is in use.

The prototype Chromium v0.1.0 implements an earlier draft (`numPeers`, `tempochange`), so these tools need the extension or the stand-in until there's a new build. It's at https://bayl.es/tempo-sync-demo-builds/v0.1.0/Chromium-tempo-sync-macos-arm64.zip ([sha256](https://bayl.es/tempo-sync-demo-builds/v0.1.0/Chromium-tempo-sync-macos-arm64.zip.sha256)); the setup tab has the steps.

## Layout

- `index.html`, `css/style.css`: the page, on [bayl.es-style](https://style.bayl.es).
- `js/app.js`: the session bar, the tabs, and the log.
- `js/hub.js`: one session per document, shared by every tool. Tools call `hub.onSession()`, `hub.connect()`, `hub.requestPlaying()` and `hub.setTempo()` rather than the API directly, so they work the same on the browser's API and on the stand-in.
- `js/stand-in.js`: the API for browsers without it.
- `js/tools/<tab>/index.js`: each tool, exporting `mount(panel, hub)`.

## Run it

No build step. Serve the files with any static server, then open `http://localhost:8000`:

```bash
python3 -m http.server 8000
```

Tests:

```bash
node --test test/*.test.mjs
python3 test/test_http_serve.py
```

## Measuring output latency

In the sampler, turn on **measure output latency** to play full-volume clicks on every beat, higher on the first beat of the bar. Record the browser's output and Live's metronome into separate tracks of a DAW, and measure the gap between the transients. The panel shows `audioContext.baseLatency`, `outputLatency` and `sampleRate` for calibration.

## Notes from building the sampler

- Passing the `AudioContext` to `captureState()` avoids converting between `currentTime` and `performance.now()` by hand.
- Starting on the next bar is `Math.floor(state.beatAtTime(t) / q + 1) * q`, then `timeAtBeat()` of that. A helper for the next bar line would make this read better.
- Sixteenth notes are quarter beats. Scheduling with `timeAtBeat()` from a fresh snapshot each tick, and tracking only the last beat scheduled, stays correct through tempo changes.

An experiment with Web MIDI input lives on the `midi` branch.

## License

AGPL-3.0-or-later; see `LICENSE`. Every publish puts this commit's full source at https://bayl.es/tempo-sync/source.tar.gz (the footer's "source" link), and the Tone.js fork's at https://bayl.es/tempo-sync-demo-builds/source/, since this repository is private for now.

**TODO:** make this repository (and `tempo-sync`, `web-tempo-sync`) public, then link the footer to GitHub and set up GitHub Pages. The Strudel and Hydra tabs use AGPL-licensed libraries, so the whole site is AGPL and this repository is its source. The Tone.js and Chrome Music Lab code keeps its own licenses (MIT and Apache-2.0); see each tool's folder.
