// Prepares a local `portaldot_dev --dev` chain so it behaves like mainnet staking:
// a new era every session, mainnet's bond limits, and Alice as a bonded validator candidate.
import { ApiPromise, WsProvider, Keyring } from '@polkadot/api';

const UNIT = 10n ** 14n;
const api = await ApiPromise.create({
  provider: new WsProvider(process.env.PORTALNODE_RPC ?? 'ws://127.0.0.1:9944'),
  noInitWarn: true,
  types: { DispatchErrorModule: { index: 'u8', error: 'u8' } },
});
const alice = new Keyring({ type: 'sr25519' }).addFromUri('//Alice');

const send = (tx, who) => new Promise((res, rej) => tx.signAndSend(who, ({ status, dispatchError, events }) => {
  if (!status.isInBlock) return;
  const sudoFail = events.find(({ event }) => event.method === 'Sudid' && event.data[0].isErr);
  if (dispatchError || sudoFail) return rej(new Error(String(dispatchError ?? sudoFail.event.data[0])));
  res(status.asInBlock.toHex());
}).catch(rej));

await send(api.tx.sudo.sudo(api.tx.staking.forceNewEraAlways()), alice);
await send(api.tx.sudo.sudo(api.tx.staking.updateStakingLimits(1000n * UNIT, 5000n * UNIT, 30000n * UNIT, null, null)), alice);
await send(api.tx.staking.validate({ commission: 0, blocked: false }), alice);
console.log(JSON.stringify({
  forceEra: (await api.query.staking.forceEra()).toString(),
  minValidatorBond: (await api.query.staking.minValidatorBond()).toString(),
  candidates: (await api.query.staking.counterForValidators()).toNumber(),
  currentEra: (await api.query.staking.currentEra()).toString(),
}));
await api.disconnect();
