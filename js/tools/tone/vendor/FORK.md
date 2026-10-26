# Tone.js fork

`Tone.js` here is the UMD bundle (`build/Tone.js`) of a fork of [Tone.js](https://github.com/Tonejs/Tone.js) (MIT, `LICENSE.md`; bundle license notice in `Tone.js.LICENSE.txt`).

- Upstream: tag `15.1.22` (`d2d52ffa8803b35debd9f19f2da08ad1c3540de0`)
- Branch: `tempo-sync`, commit `d31f6d00817994040bd7555e9d34792d50ab717e`
- Change: `Transport.syncTempoSession(session, { quantum })` and the `TempoSessionSync` class (`Tone/core/clock/TempoSessionSync.ts`), with tests in `TempoSessionSync.test.ts`.
- The `//# sourceMappingURL` line is removed, since the map isn't vendored.
