// One-off: deploys contracts/src/ValidatorHealth.sol from the keeper key. Usage: BYTECODE=0x... node dist/deploy-health.js
import { Keyring } from '@polkadot/keyring';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import { connect, finalized } from './chain.js';
import { loadKeeper } from './config.js';

const code = process.env.BYTECODE;
const parsed = loadKeeper();
if (!code?.startsWith('0x') || !parsed) throw new Error('Set BYTECODE and the keeper key');
await cryptoWaitReady();
await connect();
const { client } = await finalized();
const pair = new Keyring({ type: 'sr25519' }).addFromUri(parsed.suri);
const sim = (
  await (client.call as any).reviveApi.instantiate(pair.address, 0, null, null, { Upload: code }, '0x', null)
).toJSON();
if (!sim.result?.ok) throw new Error(`deploy would fail: ${JSON.stringify(sim.result)}`);
const deposit = BigInt(sim.storageDeposit?.charge ?? 0);
console.log(`Deposit ${Number(deposit) / 1e14} tPOT, address ${sim.result.ok.addr}`);
await new Promise<void>((done, fail) =>
  client.tx.revive
    .instantiateWithCode(0, sim.weightRequired, deposit + 10n ** 13n, code, '0x', null)
    .signAndSend(pair, ({ status, dispatchError, txHash }) => {
      if (dispatchError) fail(new Error(dispatchError.toString()));
      else if (status.isFinalized) {
        console.log(`Deployed at ${sim.result.ok.addr}, tx ${txHash.toHex()}, block ${status.asFinalized.toHex()}`);
        done();
      }
    })
    .catch(fail),
);
process.exit(0);
