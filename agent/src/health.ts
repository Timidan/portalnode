// Once per era, writes every active validator's paid-through era and liveness to the ValidatorHealth contract.
import { Keyring } from '@polkadot/keyring';
import { cryptoWaitReady, decodeAddress, keccakAsHex } from '@polkadot/util-crypto';
import { u8aToHex } from '@polkadot/util';
import { finalized } from './chain.js';
import { paidThrough, snapshot } from './collector.js';
import { config, loadKeeper } from './config.js';
import { liveness } from './liveness.js';

const selector = (sig: string) => keccakAsHex(sig).slice(0, 10);
const word = (n: bigint | number) => BigInt(n).toString(16).padStart(64, '0');
const array = (items: string[]) => word(items.length) + items.join('');
const NONE = 0xffffffff;
let triedEra = -1;

export function encodeReport(stashes: string[], era: number, paid: (number | null)[], online: boolean[]) {
  const n = stashes.length,
    tail = 32 * (1 + n);
  return (
    selector('report(bytes32[],uint32,uint32[],bool[])') +
    word(128) +
    word(era) +
    word(128 + tail) +
    word(128 + 2 * tail) +
    array(stashes.map((s) => u8aToHex(decodeAddress(s)).slice(2))) +
    array(paid.map((p) => word(p ?? NONE))) +
    array(online.map((o) => word(o ? 1 : 0)))
  );
}

export async function reportHealth() {
  const era = snapshot?.network.era.active;
  if (!config.healthContract || era == null || era === triedEra) return;
  const parsed = loadKeeper();
  if (!parsed) return;
  await cryptoWaitReady();
  const pair = new Keyring({ type: 'sr25519' }).addFromUri(parsed.suri),
    { client, at, hash } = await finalized(),
    dest = config.healthContract;
  const { validators } = await liveness(at, hash.toHex());
  const stashes = validators.map((v) => v.stash);
  if (!stashes.length) return;
  const dryRun = async (data: string) =>
    (await (client.call as any).reviveApi.call(pair.address, dest, 0, null, null, data)).toJSON();
  const seen = await dryRun(selector('statusOf(bytes32)') + u8aToHex(decodeAddress(stashes[0])).slice(2));
  if (seen.result?.ok && parseInt(seen.result.ok.data.slice(2, 66), 16) >= era) return void (triedEra = era);
  const data = encodeReport(
    stashes,
    era,
    stashes.map(paidThrough),
    validators.map((v) => v.isOnline === true),
  );
  const sim = await dryRun(data);
  if (!sim.result?.ok || sim.result.ok.flags?.bits) throw new Error(`report would fail: ${JSON.stringify(sim.result)}`);
  triedEra = era;
  const deposit = sim.storageDeposit?.charge ?? 0;
  await client.tx.revive
    .call(dest, 0, sim.weightRequired, BigInt(deposit) + 10n ** 12n, data)
    .signAndSend(pair, { nonce: -1 });
  console.log(`Health report for era ${era} sent (${stashes.length} validators)`);
}
