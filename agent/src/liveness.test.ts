import assert from 'node:assert/strict';
import { test } from 'node:test';
import { status } from './liveness.js';

test('online from a block or a heartbeat; at risk only past heartbeatAfter', () => {
  assert.deepEqual(status(false, 270, true), { isOnline: true, atRisk: false });
  assert.deepEqual(status(true, 0, true), { isOnline: true, atRisk: false });
  assert.deepEqual(status(false, 0, false), { isOnline: false, atRisk: false });
  assert.deepEqual(status(false, 0, true), { isOnline: false, atRisk: true });
});
