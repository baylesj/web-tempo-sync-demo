# The strudel tab

Live coding with [Strudel](https://strudel.cc) in the page, its scheduler following the shared tempo session, so patterns play in time with the other tabs, other pages and Ableton Live.

## How it hooks Strudel

The editor is Strudel's own `<strudel-editor>` (CodeMirror, from `@strudel/repl`). Its scheduler is a `Cyclist`. Every 25 ms, and on every `timelinechange` and `playingchange`, the tool reads `session.captureState(audioContext)` and steers the scheduler:

- **One cycle is one bar**: `cps = tempo / 60 / quantum`. Cycle 0 is the bar the shared transport started on (`timeForIsPlaying`, rounded to a bar line in this page's beat numbering).
- **Lock**: the cycle Strudel reaches at its next tick is `lastEnd`, and that tick happens at `clock.getPhase()`. Its haps sound `latency` later. If `lastEnd` is more than 0.00025 cycles (0.5 ms at 120 BPM in 4/4) from the session's cycle at `getPhase() + latency`, or the tempo has changed, the tool sets `cps` and `lastEnd` and resets the tick counter (`num_ticks_since_cps_change` in 1.3.0, `num_ticks_since_checkpoint` on main), so the next tick re-anchors there.
- **Start**: Run evaluates the code. If the session isn't playing, Run asks for the next bar line through `hub.requestPlaying(true)`. That changes only start/stop and never moves anyone's beats or bars. The Cyclist starts at once, anchored to the session in a `beforeStart` hook. A filter on the pattern (`filterHaps`) holds back haps before cycle 0 and after the stop time, so the lead-in is silent and a stop doesn't run on into the lookahead.
- **Stop**: Strudel plays only while the shared transport plays. Stop here stops only Strudel, on the next bar line (its haps are gated at that cycle), and the session plays on; the session bar's Stop stops everyone. A session stop from anywhere ends Strudel at `timeForIsPlaying`. Code you've run stays armed: Play from anywhere starts it again, until you press Stop here.
- **Tempo from the code**: `setcps`, `setcpm` or a patterned `cps` changes `scheduler.cps`. When it differs from the last value the tool set, the tool calls `hub.setTempo(cps × 60 × quantum)`.

Ctrl+Enter and Ctrl+. come from Strudel. The tool adds ⌘+Enter and ⌘+.. `debug` (exported from `index.js`) exposes the scheduler, the session and cycle 0's beat for tests.

## Credits and licenses

- **Strudel** by Felix Roos, Alex McLean and the Strudel contributors, <https://codeberg.org/uzu/strudel>, AGPL-3.0-or-later. The tab loads `@strudel/repl@1.3.0`'s ES build (`dist/index-1NNF4L0p.js`) from jsDelivr, pinned, with a Subresource Integrity hash. The chunks that build imports on demand (tonal, soundfonts, midi, hydra) load from the same versioned path without a hash. Nothing is vendored.
- Strudel's default sample maps (`felixroos/dough-samples`, `tidalcycles/uzu-drumkit`, `todepond/samples` on GitHub) load at startup. The audio for a sample loads only when a pattern plays it. The starter pattern uses only Strudel's synths (`sbd`, `white`, `sawtooth`, `triangle`, `square`), so it needs no samples.

This site is AGPL-3.0-or-later too, and its repository is the source for this tab.

Strudel's project declines LLM-generated contributions. This integration lives only here and was not sent upstream.
