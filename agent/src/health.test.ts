import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cryptoWaitReady, decodeAddress } from '@polkadot/util-crypto';
import { u8aToHex } from '@polkadot/util';
import { encodeReport } from './health.js';

const CAST = process.env.CAST ?? 'cast';
const hasCast = !spawnSync(CAST, ['--version']).error;

test('report calldata matches the Solidity ABI', { skip: !hasCast && 'needs Foundry cast on PATH or in CAST' }, async () => {
  await cryptoWaitReady();
  const a = '5F4ZyJJ8R3QHZKRLAfDXdUuVE4w3Q7uq7tCNfAtvf2XEBfYY',
    b = '5Grj5uKAoduL2EDfgizp2MMbURJKa4rL6Q5pGUnVhhhjhwjk';
  const expected = execFileSync(CAST, [
    'calldata',
    'report(bytes32[],uint32,uint32[],bool[])',
    `[${u8aToHex(decodeAddress(a))},${u8aToHex(decodeAddress(b))}]`,
    '49',
    '[48,4294967295]',
    '[true,false]',
  ]).toString().trim();
  assert.equal(encodeReport([a, b], 49, [48, null], [true, false]), expected);
});
