# Web Tempo Sync Demo

This repository is a prototype demo for the Web Tempo Sync API. The API lets a web page join a local network musical tempo session that Ableton Live, Push 3, and Move use (compatible with Ableton Link).

The demo works in two modes:
1. Native API mode: Uses `navigator.tempoSync` when the browser flag is enabled.
2. In-page fake session mode: Falls back automatically when `navigator.tempoSync` is not present. It implements Ableton Link timeline semantics in JavaScript and synchronizes tempo and transport state across tabs via a `BroadcastChannel`.

## How to Run

No build step or external dependencies are required. Serve the files with any static HTTP server:

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000` in your browser.

To run the automated tests:

```bash
node test/test-fake-session.js
python3 test/test_http_serve.py
```

## Running Against Prototype Chromium

To test with the native browser implementation, launch Chromium with the `TempoSync` blink feature enabled:

```bash
out/Default/chrome --enable-blink-features=TempoSync http://localhost:8000
```

When native support is active, the status badge in the top right shows "Native API". The peer count reflects actual Ableton Link peers detected on your local network.

## Features

### Session Controls
- **Connect / Disconnect**: Requests a tempo session and initializes Web Audio.
- **Peer Count**: Shows connected peers. In native mode, this counts devices on the local network. In fake mode, this returns 0.
- **Tempo Control**: Slider and numeric input (60 to 200 BPM). Changes are committed at the current time and propagate to other tabs and Link peers.
- **Quantized Play / Stop**: When starting or stopping, transport changes are quantized to the next quantum boundary (using `state.timeAtBeat` of the next quantum multiple).
- **Quantum Selector**: Allows selecting 1, 2, 4, or 8 beats per bar (default is 4).

### Beat Ring Visualizer
A canvas visualizer driven by `requestAnimationFrame`. It calls `session.captureState()` with no arguments to get a snapshot in the `performance.now() / 1000` time base. It renders:
- A sweeping arc showing the current phase within the quantum.
- Beat tick marks with a highlighted downbeat marker on beat 0.
- A live readout of the current beat number, phase (`phase / quantum`), and tempo.

### 16-Step Sampler
A 4-track by 16-step drum machine (Kick, Snare, Hi-Hat, Clap):
- **Web Audio Synthesis**: All sounds are synthesized with Web Audio nodes (oscillators, filtered noise bursts, and gain envelopes). No audio files are needed to start.
- **Sample Loading**: Each track includes a `SMP` button that accepts WAV/MP3 files and decodes them into an `AudioBuffer`. This demonstrates the first step toward interactive sampling features for web music education sites.
- **Presets**: Includes built-in patterns ("Four on the Floor", "Breakbeat", "Syncopated", and "Clear All").
- **Track Controls**: Independent mute and solo toggles for each track.
- **Lookahead Scheduler**: Runs a `setInterval` at 25 ms that looks ahead 100 ms into `audioContext.currentTime`. On each tick, it calls `session.captureState(audioContext)` to obtain a fresh timeline snapshot in audio context seconds. For each 16th-note beat boundary in the window, it calculates `state.timeAtBeat(beat, quantum)` and schedules sound events at that exact context time. It never caches absolute timestamps across ticks, so tempo changes and timeline shifts take effect immediately.

### Latency Measurement Mode
Turn on the "Latency Measurement Mode" toggle to emit metronome clicks on every beat, with an accented pitch on beat 0 of each quantum.

To measure latency:
1. Route the browser audio output and Ableton Live's metronome into separate tracks of a DAW (or audio recorder).
2. Record a few bars of simultaneous playback.
3. Zoom in to the recorded waveforms and measure the time delta between the browser click transient and Live's metronome transient.
4. The panel displays `audioContext.baseLatency`, `audioContext.outputLatency`, and `sampleRate` to assist with calibration.

### Event Log
Logs all session events (`numpeerschange`, `tempochange`, `playingchange`) with timestamps.

## API Notes and Ergonomics

The application uses the proposed Web Tempo Sync API shape:

```javascript
const session = await navigator.tempoSync.requestSession({ quantum: 4, startStopSync: true });
session.numPeers;
session.quantum;
session.close();

// Events
session.addEventListener('tempochange', (e) => {});
session.addEventListener('playingchange', (e) => {});
session.addEventListener('numpeerschange', (e) => {});

// Snapshots
const audioState = session.captureState(audioContext); // audioContext.currentTime seconds
const visState = session.captureState();                 // performance.now() / 1000 seconds

// Timeline calculations
const beat = audioState.beatAtTime(t, quantum);
const phase = audioState.phaseAtTime(t, quantum);
const time = audioState.timeAtBeat(beat, quantum);

// Mutating and committing state
audioState.setTempo(128.0, atTime);
audioState.setIsPlaying(true, atTime);
session.commitState(audioState);
```

### Ergonomics Feedback from Building the Sampler

1. **Dual Timebases (`audioContext` vs `performance.now()`)**:
   Passing `audioContext` to `captureState(audioContext)` is convenient. It avoids manual conversions between `audioContext.currentTime` and `performance.now()`.
2. **Quantized Transport Changes**:
   Quantizing Play/Stop to the next bar boundary is straightforward with `Math.floor(state.beatAtTime(t, quantum) / quantum + 1) * quantum` followed by `state.timeAtBeat(nextBeat, quantum)`. Having a convenience helper such as `state.nextBeatBoundary(t, quantum)` on the API interface would make this even cleaner for web developers.
3. **Beats to Steps Mapping**:
   In musical sequencers, 16th notes correspond to quarter beats (`beat * 4`). Using `state.timeAtBeat(b, quantum)` in a lookahead loop while tracking the last scheduled beat number proved clean and resilient against tempo changes.
