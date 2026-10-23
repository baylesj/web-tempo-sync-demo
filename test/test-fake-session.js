// Node test for fake-session.js
import assert from 'node:assert';
import { FakeTempoSyncSession } from '../js/fake-session.js';

async function runTests() {
  console.log('Testing FakeTempoSyncSession...');

  const session = await FakeTempoSyncSession.requestSession({ quantum: 4, startStopSync: true });
  assert.strictEqual(session.numPeers, 0);
  assert.strictEqual(session.quantum, 4);
  assert.strictEqual(session.startStopSync, true);

  // Capture state in performance time base
  const state = session.captureState();
  assert.strictEqual(state.tempo, 120.0);
  assert.strictEqual(state.isPlaying, false);

  // Test beatAtTime and timeAtBeat invertibility
  const t0 = 10.0;
  const beat = state.beatAtTime(t0, 4);
  const tCalculated = state.timeAtBeat(beat, 4);
  assert(Math.abs(t0 - tCalculated) < 1e-9, `Invertibility failed: ${t0} vs ${tCalculated}`);

  // At 120 bpm, 1 beat is 0.5s.
  // In 2 seconds, 4 beats should elapse.
  const beatPlus2s = state.beatAtTime(t0 + 2.0, 4);
  assert(Math.abs(beatPlus2s - (beat + 4)) < 1e-9, `Tempo calculation failed: ${beatPlus2s} vs ${beat + 4}`);

  // Test phaseAtTime
  const phase = state.phaseAtTime(t0, 4);
  assert(phase >= 0 && phase < 4, `Phase out of bounds: ${phase}`);

  // Test setTempo preserving beat
  state.setTempo(140.0, t0);
  assert.strictEqual(state.tempo, 140.0);
  const beatAfterTempoChange = state.beatAtTime(t0, 4);
  assert(Math.abs(beatAfterTempoChange - beat) < 1e-9, 'Beat jumped on setTempo');

  // Test requestBeatAtTime (aligns beat at time while preserving phase)
  const prevPhase = state.phaseAtTime(t0, 4);
  state.requestBeatAtTime(16.0, t0, 4);
  const newPhase = state.phaseAtTime(t0, 4);
  assert(Math.abs(prevPhase - newPhase) < 1e-6, `Phase changed during requestBeatAtTime: ${prevPhase} vs ${newPhase}`);

  // Test forceBeatAtTime (unconditionally sets beat at time)
  state.forceBeatAtTime(32.0, t0, 4);
  const forcedBeat = state.beatAtTime(t0, 4);
  assert(Math.abs(forcedBeat - 32.0) < 1e-9, `forceBeatAtTime failed: ${forcedBeat}`);

  // Test commitState and events
  let tempoEventFired = false;
  let playingEventFired = false;
  session.addEventListener('tempochange', (e) => {
    tempoEventFired = true;
    assert.strictEqual(e.detail.tempo, 140.0);
  });
  session.addEventListener('playingchange', (e) => {
    playingEventFired = true;
    assert.strictEqual(e.detail.isPlaying, true);
  });

  state.setIsPlaying(true, t0);
  session.commitState(state);

  assert(tempoEventFired, 'tempochange event did not fire');
  assert(playingEventFired, 'playingchange event did not fire');

  // Test audioContext offset mapping
  const mockAudioContext = {
    currentTime: 5.0,
    getOutputTimestamp: () => ({
      contextTime: 5.0,
      performanceTime: 12000.0, // 12 seconds in performance.now()
    }),
  };
  const audioState = session.captureState(mockAudioContext);
  assert.strictEqual(audioState.tempo, 140.0);
  const audioBeat = audioState.beatAtTime(5.0, 4);
  // In audioContext, time 5.0 corresponds to performance time 12.0
  const perfBeat = session.captureState().beatAtTime(12.0, 4);
  assert(Math.abs(audioBeat - perfBeat) < 1e-6, `AudioContext mapping mismatch: ${audioBeat} vs ${perfBeat}`);

  session.close();
  console.log('All tests passed!');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
