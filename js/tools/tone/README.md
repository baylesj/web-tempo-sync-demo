# tone.js tab

A three-voice instrument (bass, chords, lead) on a fork of [Tone.js](https://tonejs.github.io) whose Transport follows the Web Tempo Sync session. It plays when the session plays, starting on its bar line; its bpm follows the session's tempo, and the Transport's bpm changes the session's. Play starts the session when it's stopped; while it plays, Play and Stop only start and stop this instrument, from the next bar line.

- `index.js`: the tab (`mount(panel, hub)`), the session wiring, the grid and readouts.
- `music.js`: moods (a scale and a four-bar progression) and seeded patterns.
- `instrument.js`: the Tone voices and sounds.
- `style.css`: the tab's layout.
- `vendor/`: the Tone.js fork's UMD bundle, its license, and `FORK.md` (upstream tag, branch and commit).

## The fork's API

```js
Tone.setContext(new AudioContext()); // a native context, so captureState() takes it
const session = await navigator.tempoSync.requestSession({ quantum: 4 });
const sync = Tone.getTransport().syncTempoSession(session, { quantum: 4 });
Tone.getTransport().start();   // the session's next bar line (now, when alone)
Tone.getTransport().bpm.value = 128; // committed to the session
sync.dispose();                // or Tone.getTransport().unsyncTempoSession()
```

The session is duck-typed: anything with `captureState(context?)` and `commitState(state)` (and, optionally, `timelinechange`/`playingchange` events). Transport position 0 is the bar line the session started playing in. Loops should be a whole number of bars.

For the console and tests, the tab sets `globalThis.__toneTab` (`Tone`, `transport`, `sync`, `stats()`).

## Rebuilding the bundle

```bash
git clone https://github.com/Tonejs/Tone.js && cd Tone.js
git checkout tempo-sync   # from the fork; see vendor/FORK.md for the commit
npm ci && npm run build
cp build/Tone.js build/Tone.js.LICENSE.txt LICENSE.md ../web-tempo-sync-demo/js/tools/tone/vendor/
sed -i '' '/^\/\/# sourceMappingURL=/d' ../web-tempo-sync-demo/js/tools/tone/vendor/Tone.js
```

Then update the commit in `vendor/FORK.md`. Tests: `npm test`, or just the new ones with `npx tsc && npx web-test-runner build/esm/Tone/core/clock/TempoSessionSync.test.js --config test/web-test-runner.config.js`.

## Credits and licenses

- [Tone.js](https://github.com/Tonejs/Tone.js) by Yotam Mann and contributors, MIT (`vendor/LICENSE.md`). The fork's changes are MIT too.
- It bundles [standardized-audio-context](https://github.com/chrisguttandin/standardized-audio-context) by Christoph Guttandin, MIT, and [tslib](https://github.com/microsoft/tslib), 0BSD.
- The tab's own code is part of this site, AGPL-3.0-or-later.
