# Demo script: Web Tempo Sync, five minutes with Ableton Live

For presenting the proposal live, for example at the W3C Audio Community Group. The demo runs in the middle of the talk, after the API slides. It shows a web page joining Live's Link session through `navigator.tempoSync`, then several independent tools playing in time with Live and each other.

## Before the call

**Software**

- [ ] Ableton Live open, **Link on** (Settings → Link, Tempo & MIDI → Show Link toggle, then turn Link on in the control bar). A short drum or bass loop in one clip, ready to launch. Tempo 120.
- [ ] Prototype Chromium v0.2 ([release](https://github.com/baylesj/web-tempo-sync-demo/releases/tag/v0.2.0)) running with the API on, in a profile of its own:

  ```sh
  ./Chromium.app/Contents/MacOS/Chromium --user-data-dir=/tmp/tempo-sync-demo \
    --enable-blink-features=TempoSync https://baylesj.github.io/web-tempo-sync-demo/#sampler
  ```

  Don't pass `--tempo-sync-port`: the demo needs Live's real session.
- [ ] Load each tool tab once (sampler, strudel, hydra, arpeggios) so nothing downloads on stage. Don't connect yet.
- [ ] Do Not Disturb on; close other apps that make sound.
- [ ] Wi-Fi on, even though everything is on one laptop. Confirm in rehearsal that Live sees the browser on the network you'll present from.

**The call**

- [ ] Share sound as well as the screen, and check that **both** Live's and the browser's audio reach the call. Zoom: tick "Share sound". Meet: a window share carries no audio, so share the entire screen with system audio, or test whatever you use.
- [ ] Browser zoom at 125% or so, so the session bar reads on a shared screen.
- [ ] A backup recording (60–90 s of the run below), open in QuickTime and ready to share.

## The run (about five minutes)

### 1. Join Live's session (sampler tab, 90 s)

1. Point at the **session bar** at the top: "Every tool page has this. Right now this tab isn't in any session."
2. Click **Connect**. The status reads **Playing along**, tagged `browser`, and Live's control bar shows **1 Link**.
   > "That's the browser joining Live's Link session, natively. The page never touched the network: it asked for a session and got snapshots of the timeline."
3. Launch the loop in **Live**, then press **Play** in Live's transport. The sampler starts on the next bar line with it.
4. Change Live's tempo (drag it to about 100). The page follows, still on the beat.
5. Type **128** in the page's tempo box. Live follows.
   > "Either side can change the tempo; both stay on the bar."

### 2. Strudel joins on the bar (strudel tab, 60 s)

1. Click **Connect** in the session bar, then **Run** (or ⌘+Enter) on the starter code.
2. It comes in on the next bar line, in time with Live and the sampler.
   > "That's unmodified Strudel, steered from outside through this API. Strudel's maintainers have wanted Link since 2023."

### 3. Hydra in focus mode (hydra tab, 45 s)

1. **Connect**, then press **F** (or the expand button) for focus mode. The visuals pulse on the beat, full screen.
   > "Hydra's `time` is the session's beat, so visuals land on the same bar lines."
2. **Esc** to leave focus mode.

### 4. Tools are independent (arpeggios tab, 60 s)

1. **Connect**: Arpeggios plays along with what's already playing. Tap a couple of chords on the wheel.
2. Press Arpeggios' own **pause** button. It stops on the next bar; Live, the sampler and Strudel keep playing.
   > "Each tool joins and leaves on its own. Starting or stopping one page's loop never moves anyone else's bar lines."
3. Press **Stop** in the session bar. Everything stops on the bar line, **Live included**.
   > "The shared transport is shared: that's the feature, and it's why the spec cares about one page wrecking a set."

### 5. Back to the deck (15 s)

> "One browser is one Link participant however many tabs are open: Live still shows 1 Link. The page learned one bit about the network: someone else is here."

## If something goes wrong

| What you see | What to do |
|---|---|
| Status says `stand-in`, not `browser` | Chromium is running without `--enable-blink-features=TempoSync`. Relaunch from the command above. |
| Status says `browser v0.1` | That's the old prototype build. Use v0.2. |
| Connected but **Alone**, and Live shows 0 Links | Link is off in Live, or the network blocks multicast. Toggle Link in Live; otherwise switch to the backup recording. |
| No sound from the page | Click anywhere on the page: audio needs a user gesture. |
| No sound on the call | Re-share with sound (see "The call"). |
| Anything else | Play the backup recording and carry on with the deck. |

**Avoid on stage:** fast tempo changes on the **tone.js** tab (its fork drifts for about a second after a change: [#1](https://github.com/baylesj/web-tempo-sync-demo/issues/1)), and starting from the tone.js tab against Live (it can land a few ms off the bar line: [#2](https://github.com/baylesj/web-tempo-sync-demo/issues/2)).

## Likely questions, short answers

Longer answers are in [OBJECTIONS.md](https://github.com/baylesj/web-tempo-sync/blob/main/OBJECTIONS.md).

- **Why not an extension or helper app?** We built one, and its timing is fine (~0.1 ms). It needs a native install, and it can't reach Android, ChromeOS or iOS: the learners and phones this is for.
- **Couldn't Ableton serve this over localhost?** For Live users on a desktop, yes. Not for anyone without Live running, phones, or other Link devices.
- **Direct Sockets?** Only in Isolated Web Apps, and every app would ship its own protocol.
- **Isn't this baking Ableton's protocol into the web?** The spec doesn't name a protocol. Link is how browsers would implement it today. Asking Ableton for a citable protocol document and a patent statement is [web-tempo-sync#2](https://github.com/baylesj/web-tempo-sync/issues/2).
- **What does a page learn about my network?** One bit, after a permission prompt: whether anyone else is in the session. No count, addresses or names. The browser is one participant however many tabs.
- **Can two sites talk through the timeline?** Only if both hold the permission, and they could already do it through any device on the network. The spec says the session isn't an isolation boundary.
- **Can a page wreck my set?** It can change the tempo or stop the transport, which is the feature. It can't move your bar lines by starting a loop. Indicators, a follow-only mode and rate limits are [web-tempo-sync#6](https://github.com/baylesj/web-tempo-sync/issues/6).
- **AudioWorklet?** Snapshots are serializable: post one to the worklet and schedule there. Whether Workers should request sessions directly is [web-tempo-sync#8](https://github.com/baylesj/web-tempo-sync/issues/8).
- **Android?** The hardest case: output latency, the multicast lock, and the OS local-network permission. Measurements are [web-tempo-sync#10](https://github.com/baylesj/web-tempo-sync/issues/10).
- **Over the internet?** A non-goal. Link-style sync needs a local network's low jitter.
- **Other browsers?** Positions not requested yet ([web-tempo-sync#3](https://github.com/baylesj/web-tempo-sync/issues/3)); the plan is after this group has seen it.
