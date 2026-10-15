import { test } from 'node:test';
import assert from 'node:assert/strict';
import { grossReward, mul, perbill, nominatorReward, POT } from './rewards.js';

test('runtime 1002 fork reward share includes stake and validator commission', () => {
  const gross = grossReward(10n, 100n, 110n * POT, 200n * POT, 1000n * POT, POT);
  assert.equal(gross, 400n * POT);
  assert.equal(nominatorReward(gross, perbill(20n, 100n), 50n, 100n), 160n * POT);
  assert.equal(mul(500_000_000n, 1n), 0n);
});
