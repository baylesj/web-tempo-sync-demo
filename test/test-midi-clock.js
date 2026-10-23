// Node test for midi-clock.js
import assert from 'node:assert';
import { MidiClock, estimateClockBpm, parseMidiMessage, noteName, PPQN } from '../js/midi-clock.js';

// Deterministic pseudo-random numbers so a failure can be reproduced.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

// Feeds `beats` beats of clock at `bpm` from `start` ms, with timestamp jitter of +/- `jitter` ms.
// Returns the last result and the time after the last tick.
function feed(clock, bpm, beats, { start = 0, jitter = 0, random = rng(1) } = {}) {
  const interval = 60000 / (bpm * PPQN);
  let result = null;
  let t = start;
  for (let i = 0; i < beats * PPQN; i++) {
    t = start + i * interval;
    result = clock.tick(t + (random() * 2 - 1) * jitter);
  }
  return { result, next: t + interval };
}

function near(actual, expected, tol, what) {
  assert(actual !== null && Math.abs(actual - expected) <= tol, `${what}: expected ${expected} +/- ${tol}, got ${actual}`);
}

console.log('Testing midi-clock...');

// Not enough ticks: no tempo yet.
{
  const clock = new MidiClock();
  for (let i = 0; i < PPQN; i++) {
    clock.tick(i * 20.8333);
  }
  assert.strictEqual(clock.bpm, null, 'reported a tempo after one beat');
}

// Steady 120 BPM.
{
  const clock = new MidiClock();
  const { result } = feed(clock, 120, 4);
  assert(result.stable, 'steady clock not stable');
  near(clock.bpm, 120, 0.01, 'steady 120');
}

// Jittered 128 BPM (+/- 2 ms per tick, about 10% of an interval): the estimate settles and stays put.
{
  const clock = new MidiClock();
  const random = rng(42);
  let changes = 0;
  const interval = 60000 / (128 * PPQN);
  for (let i = 0; i < 16 * PPQN; i++) {
    const r = clock.tick(i * interval + (random() * 2 - 1) * 2);
    if (r.changed && i > 4 * PPQN) {
      changes++;
    }
  }
  near(clock.bpm, 128, 0.3, 'jittered 128');
  assert(changes <= 1, `jittered tempo kept changing after settling (${changes} changes)`);
}

// A single late tick (main thread stall) doesn't move the tempo.
{
  const clock = new MidiClock();
  const interval = 60000 / (100 * PPQN);
  for (let i = 0; i < 8 * PPQN; i++) {
    clock.tick(i * interval + (i === 6 * PPQN ? 15 : 0));
  }
  near(clock.bpm, 100, 0.1, 'late tick');
}

// Tempo change 120 -> 90: converges within a few beats.
{
  const clock = new MidiClock();
  const { next } = feed(clock, 120, 4);
  near(clock.bpm, 120, 0.01, 'before change');
  feed(clock, 90, 4, { start: next, jitter: 1, random: rng(7) });
  near(clock.bpm, 90, 0.2, 'after change');
}

// The estimate never reports while the window straddles the change.
{
  const points = [];
  for (let i = 0; i < 24; i++) {
    points.push([i, i * 20.8333]);
  }
  for (let i = 24; i < 48; i++) {
    points.push([i, 23 * 20.8333 + (i - 23) * 27.7778]);
  }
  assert.strictEqual(estimateClockBpm(points).stable, false, 'mixed window reported stable');
}

// Hysteresis: tiny drift doesn't change the reported value.
{
  const clock = new MidiClock();
  const { next } = feed(clock, 120, 4);
  const r = feed(clock, 120.03, 4, { start: next });
  assert.strictEqual(r.result.changed, false, 'reported a 0.03 BPM drift');
  near(clock.bpm, 120, 0.01, 'held through drift');
}

// A long gap (clock stopped) starts a fresh window; the new tempo is picked up cleanly.
{
  const clock = new MidiClock();
  const { next } = feed(clock, 120, 4);
  assert(!clock.isAlive(next + 1000), 'clock still alive after a 1 s gap');
  feed(clock, 140, 3, { start: next + 1000 });
  near(clock.bpm, 140, 0.05, 'after gap');
}

// Transport messages.
{
  const clock = new MidiClock();
  feed(clock, 120, 3);
  assert.strictEqual(clock.ticks, 3 * PPQN);
  assert.strictEqual(clock.transport(0xfa), 'start');
  assert.strictEqual(clock.ticks, 0, 'start did not reset the tick count');
  assert.strictEqual(clock.transport(0xfb), 'continue');
  assert.strictEqual(clock.transport(0xfc), 'stop');
  assert.strictEqual(clock.transport(0x90), null);
  near(clock.bpm, 120, 0.01, 'transport kept the tempo');
}

// Parsing.
{
  assert.deepStrictEqual(parseMidiMessage([0x91, 36, 100]), { type: 'note on', channel: 2, data1: 36, data2: 100 });
  assert.strictEqual(parseMidiMessage([0x90, 36, 0]).type, 'note off');
  assert.strictEqual(parseMidiMessage([0xf8]).type, 'clock');
  assert.strictEqual(parseMidiMessage([0xf8]).channel, null);
  assert.strictEqual(parseMidiMessage([0xbf, 7, 64]).channel, 16);
  assert.strictEqual(noteName(60), 'C3');
  assert.strictEqual(noteName(36), 'C1');
}

console.log('All midi-clock tests passed!');
