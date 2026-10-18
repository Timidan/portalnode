import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bondProblem, grossReward, mul, perbill, nominatorReward, POT } from './rewards.js';

test('runtime 1002 fork reward share includes stake and validator commission', () => {
  const gross = grossReward(10n, 100n, 110n * POT, 200n * POT, 1000n * POT, POT);
  assert.equal(gross, 400n * POT);
  assert.equal(nominatorReward(gross, perbill(20n, 100n), 50n, 100n), 160n * POT);
  assert.equal(mul(500_000_000n, 1n), 0n);
});

test('validator bond must sit inside both runtime 1002 bounds; the wizard names the failing one', () => {
  assert.equal(bondProblem(6000n * POT, 5000n * POT, 30000n * POT), null);
  assert.match(bondProblem(1000n * POT, 5000n * POT, 30000n * POT)!, /under the minimum .* short by 4000 POT/);
  assert.match(bondProblem(31000n * POT, 5000n * POT, 30000n * POT)!, /over the maximum .* by 1000 POT/);
  assert.equal(bondProblem(400n * POT, 0n, null), null);
});
