// The stand-in session: the draft's model, and syncing between tabs.
// node --test test/*.test.mjs
//
// Each import of stand-in.js with its own query string is a separate module instance, which
// stands in for a separate tab: its own endpoint, talking to the others over BroadcastChannel.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const tab = async (name) => (await import(`../js/stand-in.js?${name}`)).StandInTempoSession;
const settle = (ms = 30) => new Promise((r) => setTimeout(r, ms));
const now = () => performance.now() / 1000;

test('a lone session is solo, and a second session in the document is a participant', async () => {
  const Session = await tab('solo');
  const a = await Session.requestSession({ quantum: 4 });
  assert.equal(a.hasPeers, false);
  let fired = 0;
  a.onpeerschange = () => fired++;
  const b = await Session.requestSession();
  await settle();
  assert.equal(a.hasPeers, true);
  assert.equal(fired, 1);
  b.close();
  await settle();
  assert.equal(a.hasPeers, false);
  a.close();
});

test('requestSession validates quantum', async () => {
  const Session = await tab('quantum');
  await assert.rejects(Session.requestSession({ quantum: 0 }), RangeError);
  await assert.rejects(Session.requestSession({ quantum: NaN }), TypeError);
});

test('beat and phase maths, and setTempo keeping the beat', async () => {
  const Session = await tab('maths');
  const s = await Session.requestSession();
  const state = s.captureState();
  const t = now();
  state.forceBeatAtTime(0, t);
  assert.ok(Math.abs(state.beatAtTime(t)) < 1e-9);
  assert.ok(Math.abs(state.beatAtTime(t + 1) - 2) < 1e-9, '120 bpm is two beats a second');
  assert.ok(Math.abs(state.phaseAtTime(t + 2.5) - 1) < 1e-9);
  state.setTempo(60, t + 1);
  assert.ok(Math.abs(state.beatAtTime(t + 1) - 2) < 1e-9);
  assert.ok(Math.abs(state.beatAtTime(t + 2) - 3) < 1e-9);
  s.commitState(state);
  assert.equal(s.captureState().tempo, 60);
  assert.throws(() => s.commitState(state), { name: 'InvalidStateError' });
  s.close();
  assert.throws(() => s.captureState(), { name: 'InvalidStateError' });
});

test('two tabs share tempo and phase, but number beats their own way', async () => {
  const A = await tab('sync-a');
  const B = await tab('sync-b');
  const a = await A.requestSession({ quantum: 4 });
  const b = await B.requestSession({ quantum: 4 });
  await settle();
  assert.equal(a.hasPeers, true, 'a sees b');
  assert.equal(b.hasPeers, true, 'b sees a');

  let tempoEvents = 0;
  b.ontimelinechange = () => tempoEvents++;
  const sa = a.captureState();
  sa.setTempo(97, now());
  a.commitState(sa);
  await settle();
  assert.ok(Math.abs(b.captureState().tempo - 97) < 1e-9, 'b follows a’s tempo');
  assert.equal(tempoEvents, 1);

  // b starts its loop at beat 0: with a present, that waits for the bar line and moves nothing for a.
  const before = a.captureState();
  const t = now();
  const sb = b.captureState();
  sb.requestBeatAtTime(0, t);
  const launch = sb.timeAtBeat(0);
  assert.ok(launch >= t - 1e-9 && launch - t <= (4 * 60) / 97 + 1e-9, 'within a bar');
  assert.ok(Math.abs(sb.phaseAtTime(launch)) < 1e-9, 'on a bar line');
  b.commitState(sb);
  await settle();
  const after = a.captureState();
  assert.ok(Math.abs(after.beatAtTime(t) - before.beatAtTime(t)) < 1e-6, 'a’s beats are untouched');
  assert.ok(Math.abs(b.captureState().phaseAtTime(t) - after.phaseAtTime(t)) < 1e-6, 'same phase in both');

  b.close();
  await settle();
  assert.equal(a.hasPeers, false, 'a closed tab leaves at once');
  a.close();
});

test("a stale snapshot doesn't undo another tab's tempo change", async () => {
  const A = await tab('stale-a');
  const B = await tab('stale-b');
  const a = await A.requestSession();
  const b = await B.requestSession();
  await settle();
  const stale = b.captureState();
  const sa = a.captureState();
  sa.setTempo(140, now());
  a.commitState(sa);
  await settle();
  stale.setIsPlaying(true, now());
  b.commitState(stale);
  await settle();
  assert.ok(Math.abs(a.captureState().tempo - 140) < 1e-9);
  assert.equal(a.captureState().isPlaying, true);
  a.close();
  b.close();
});
