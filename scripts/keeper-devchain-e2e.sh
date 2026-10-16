#!/usr/bin/env bash
# End-to-end keeper test on a local portaldot_dev chain (runtime 1002), bootstrapped by
# devchain-bootstrap.mjs. Claims a real era as a third party, proves a rerun submits
# nothing, then crashes after persisting a signed attempt and proves the restart reconciles.
set -uo pipefail
cd "$(dirname "$0")/../agent"
RPC=${PORTALNODE_RPC:-ws://127.0.0.1:9944}
WORK=$(mktemp -d)
ALICE=5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY
echo '{"suri":"//Bob"}' > "$WORK/keeper.json" && chmod 600 "$WORK/keeper.json"

claimable() {
  node --input-type=module -e "
    import { ApiPromise, WsProvider } from '@polkadot/api';
    const api = await ApiPromise.create({ provider: new WsProvider('$RPC'), noInitWarn: true, types: { DispatchErrorModule: { index: 'u8', error: 'u8' } } });
    const active = (await api.query.staking.activeEra()).unwrap().index.toNumber();
    const ledger = (await api.query.staking.ledger('$ALICE')).unwrap();
    const claimed = ledger.claimedRewards.map((e) => e.toNumber());
    let n = 0;
    for (let e = 0; e < active; e++) if (!claimed.includes(e) && (await api.query.staking.erasStakers(e, '$ALICE')).total.toBigInt() > 0n && (await api.query.staking.erasValidatorReward(e)).isSome) n++;
    console.log(n); await api.disconnect();" 2>/dev/null | tail -1
}
genesis() {
  node --input-type=module -e "
    import { ApiPromise, WsProvider } from '@polkadot/api';
    const api = await ApiPromise.create({ provider: new WsProvider('$RPC'), noInitWarn: true });
    console.log(api.genesisHash.toHex()); await api.disconnect();" 2>/dev/null | tail -1
}
finalized_height() {
  node --input-type=module -e "
    import { ApiPromise, WsProvider } from '@polkadot/api';
    const api = await ApiPromise.create({ provider: new WsProvider('$RPC'), noInitWarn: true });
    console.log((await api.rpc.chain.getHeader(await api.rpc.chain.getFinalizedHead())).number.toNumber()); await api.disconnect();" 2>/dev/null | tail -1
}
wait_for() { until [ "$(claimable)" -ge "$1" ] 2>/dev/null; do echo "$(date -u +%H:%M) waiting for $1 claimable era(s)"; sleep 300; done; }

export PORTALNODE_MODE=operator PORTALNODE_RPC=$RPC PORTALNODE_GENESIS=$(genesis) \
  PORTALNODE_KEEPER_FILE=$WORK/keeper.json PORTALNODE_ALLOWLIST=$ALICE \
  PORTALNODE_TOKEN=$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n') \
  PORTALNODE_MAX_FEE=5 PORTALNODE_BUDGET_24H=50 PORTALNODE_MIN_RESERVE=1 PORTALNODE_DB=$WORK/e2e.sqlite

echo "== 1. claim (genesis $PORTALNODE_GENESIS)"; wait_for 1
npx tsx src/once.ts; echo "exit $?"
echo "== 2. rerun: must submit nothing"
npx tsx src/once.ts; echo "exit $?"
echo "== 3. crash after persisting a signed attempt"; wait_for 1
PORTALNODE_CRASH_AFTER_PERSIST=1 npx tsx src/once.ts; echo "exit $? (expect 75)"
echo "== 4. restart inside the mortality window: attempt stays unresolved, nothing new is signed"
npx tsx src/once.ts; echo "exit $?"
echo "== 5. after the window: the unsent attempt is dropped and the era is claimed again"
death=$(node -e "console.log(require('better-sqlite3')('$PORTALNODE_DB').prepare('SELECT max(death) d FROM tx_attempts').get().d)")
until [ "$(finalized_height)" -gt "$death" ] 2>/dev/null; do sleep 20; done
npx tsx src/once.ts; echo "exit $?"
echo "== attempts table"
node -e "const db=require('better-sqlite3')('$PORTALNODE_DB'); console.log(JSON.stringify(db.prepare('SELECT id, validator, era, status, tx_hash, finalized_block, extrinsic_index, error FROM tx_attempts').all(), null, 1))" 2>&1 | head -60
