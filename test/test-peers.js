// Stand-in peers: tabs find each other over BroadcastChannel, count each other, and a joiner adopts the
// session's timeline. Node has BroadcastChannel, so two sessions in one process stand in for two tabs.
import assert from 'node:assert';
import { FakeTempoSyncSession } from '../js/fake-session.js';

const tick = (ms = 50) => new Promise((resolve) => setTimeout(resolve, ms));

console.log('Testing stand-in peers...');

const a = await FakeTempoSyncSession.requestSession({ quantum: 4 });
const state = a.captureState();
state.setTempo(97, performance.now() / 1000);
a.commitState(state);

let changes = 0;
a.addEventListener('numpeerschange', () => changes++);
const b = await FakeTempoSyncSession.requestSession({ quantum: 4 });
await tick();
assert.strictEqual(a.numPeers, 1, 'a sees b');
assert.strictEqual(b.numPeers, 1, 'b sees a');
assert.strictEqual(changes, 1, 'a got one numpeerschange');
assert.ok(Math.abs(b.captureState().tempo - 97) < 0.001, 'b adopted the session tempo on joining');

const c = await FakeTempoSyncSession.requestSession({ quantum: 4 });
await tick();
assert.strictEqual(a.numPeers, 2);
assert.strictEqual(c.numPeers, 2);

c.close();
await tick();
assert.strictEqual(a.numPeers, 1, 'a closed tab leaves at once');
assert.strictEqual(b.numPeers, 1);

a.close();
b.close();
console.log('All peer tests passed!');
