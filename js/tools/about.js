// The "about" line above each play tab: what the tool is, and what we changed so it plays in time.

const link = (href, text) => `<a href="${href}">${text}</a>`;

export const ABOUT = {
  sampler: {
    what: 'A sixteen-step drum machine written for this demo: four synthesized drums, a metronome and a beat ring.',
    how: `Built for the API from the start. Every 25 ms its scheduler captures the session in the AudioContext's
      time and schedules the next 100 ms of sixteenth notes at <code>timeAtBeat()</code>, so it follows tempo
      changes from anyone at once. Play and Stop take effect on the next bar line.`,
  },
  strudel: {
    what: `${link('https://strudel.cc', 'Strudel')} is TidalCycles for the browser: live-code patterns of rhythm
      and melody, and edit them while they play. AGPL-3.0, by the TidalCycles community.`,
    how: `Strudel 1.3.0, unmodified, loaded from a CDN. Its scheduler has no way to follow an outside clock, so
      this tab steers it: every 25 ms it compares Strudel's cycle position with the session's (one cycle is one
      bar) and re-anchors Strudel when they drift apart. A filter on the pattern keeps it silent before Play and
      after Stop, and <code>setcps()</code> or <code>setcpm()</code> in your code sets the session tempo. Strudel
      has wanted Link support since 2023; the pluggable clock source in
      ${link('https://codeberg.org/uzu/strudel/pulls/2135', 'uzu/strudel#2135')} would make this a small adapter.`,
  },
  hydra: {
    what: `${link('https://hydra.ojack.xyz', 'Hydra')} is live-coded video synthesis in the browser, by Olivia
      Jack: chain oscillators, shapes and feedback like a modular synth. AGPL-3.0.`,
    how: `hydra-synth 1.4.0, unmodified. Instead of running its own clock, this tab drives Hydra frame by frame
      with <code>time</code> set to the session's beat, so motion and array sequences move with the bar at
      anyone's tempo. Sketches also get <code>beat</code>, <code>phase</code>, <code>bar</code>,
      <code>pulse</code> and <code>accent</code>; the pulses wait for Play. Drawing pauses while the tab is
      hidden and comes back in phase.`,
  },
  tone: {
    what: `${link('https://tonejs.github.io', 'Tone.js')} is a framework for interactive music in the browser,
      by Yotam Mann: synths, effects, and a Transport for timing. MIT.`,
    how: `A fork of Tone.js 15.1.22 adds <code>Transport.syncTempoSession(session)</code>: the Transport's bpm
      follows the session, its bar lines land on the session's, and it starts and stops with the shared
      transport. Its own <code>start()</code>, <code>stop()</code> and bpm commit back to the session. The
      instrument here (bass, pad and an FM lead) is written for this demo on top of the fork.`,
  },
  arpeggios: {
    what: `Arpeggios is a ${link('https://musiclab.chromeexperiments.com/Arpeggios', 'Chrome Music Lab')}
      experiment from 2016, by Google Creative Lab: pick a chord on the wheel and hear it arpeggiated.
      Apache-2.0.`,
    how: `Ported from its 2016 build (AMD modules, webpack, jQuery and a 2016 Tone.js) to ES modules on the
      Tone.js fork, which it shares with the Tone.js tab: one Transport, synced to the session, so Play waits for
      the bar line and the tempo dial sets everyone's tempo. Its harp and piano samples weren't in the
      repository, so they're re-synthesized.`,
  },
};

export function aboutSection(name) {
  const about = ABOUT[name];
  if (!about) {
    return null;
  }
  const section = document.createElement('section');
  section.className = 'split tool-about';
  section.setAttribute('aria-label', `About ${name}`);
  section.innerHTML = `
    <h2 class="label">about</h2>
    <div class="stack">
      <p>${about.what}</p>
      <p class="soft"><b>To play along:</b> ${about.how}</p>
    </div>`;
  return section;
}
