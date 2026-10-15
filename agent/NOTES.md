# PortalNode agent

Node 22 service: Express 5, better-sqlite3 and @polkadot/api 17. TypeScript builds to `dist/`; no extra test framework.

## Run

```sh
cd agent
npm install
npm run dev
# or: npm run build && npm start
```

Observer is the default. Operator example (provide the token from a secret manager; do not save it in shell history):

```sh
PORTALNODE_MODE=operator \
PORTALNODE_RPC=ws://127.0.0.1:9944 \
PORTALNODE_GENESIS=0x... \
PORTALNODE_KEEPER_FILE=/run/secrets/keeper.json \
PORTALNODE_ALLOWLIST=5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY \
PORTALNODE_TOKEN=<32+ character bearer> \
PORTALNODE_MAX_FEE=2 PORTALNODE_BUDGET_24H=10 PORTALNODE_MIN_RESERVE=1 \
PORTALNODE_DB=./portalnode.sqlite PORT=8080 npm start
```

The keeper JSON may contain `{"secretPhrase":"..."}` or `{"suri":"//Bob"}` for local development. Keep it owner-only (`chmod 600`). Fee values are decimal POT amounts. The fee policy can be set in these environment variables or with authenticated `PUT /api/keeper/policy`; a policy changed through the API lasts until restart. `PORTALNODE_NODE_RPC` (HTTP JSON-RPC) and `PORTALNODE_METRICS` are optional; without either, node sample fields are N/A. `PORTALNODE_ALLOWED_HOSTS` and `PORTALNODE_ALLOWED_ORIGINS` set the operator write-route allowlists. `PORTALNODE_CRASH_AFTER_PERSIST=1` is a one-shot restart-test failpoint: it exits with 75 after saving a signed attempt and before broadcast.

## API

- Read: `GET /api/health`, `/api/network`, `/api/node`, `/api/nominator/:address`, `/api/rewards`, `/api/rewards/:validator`, `/api/receipts` (receipt refs are checked against the referenced finalized block and `staking.Reward` events).
- Operator mode only, bearer protected: `POST /api/keeper/enable`, `/api/keeper/disable`, `/api/keeper/claim-now`, `PUT /api/keeper/policy`. Observer does not register these routes.
- Serves `../web/dist` when it exists.

The reward arithmetic in `src/rewards.ts` was ported from `~/Desktop/portalnode-lab/server/rewards.ts`, the 13 Oct design prototype. Hackathon disclosure: it is the Portaldot runtime-1002 stake-weighted formula, validated against historical `staking.Reward` events; all planned amounts remain estimates until receipts exist.

## Verification (15 Oct 2026)

- `npm run build` passed. Installed `@polkadot/api@17.0.2` (the available 17.x release), `express@5.3.0`, and `better-sqlite3@12.11.1`.
- `npx tsx --test src/rewards.test.ts` passed: fork stake weighting, nominator commission split, and half-down base-unit rounding.
- Devchain (`ws://127.0.0.1:9944`): runtime `portaldot/1002`, genesis `0xa07fa01c…72b398a5`, payout shape `whole-era`. `keeper:once` returned `{"action":"dry-run","planned":[],"submitted":0,"reason":"no funded exposure reward is claimable yet"}` at finalized block 302. Era 0 is active; Alice’s era-0 exposure is zero. `forceEra=ForceAlways`, BABE epoch length 1,200 slots at 6 seconds/slot. Era 1 should become active at the next session boundary (about 18:24:24 UTC); its rewards should become claimable only after the following boundary advances `ActiveEra` to 2 (about **20:24:24 UTC**, if the chain keeps producing blocks and era 1 has funded exposure/points). The claim condition is `era < ActiveEra`; re-check live state at that time.
- The requested positive-payout/no-op rerun and persisted-attempt/restart reconciliation were **not run**: there was no eligible devchain payout, so no genuine attempt could be persisted. No fake payout or attempt was inserted. The failpoint is present for the first eligible attempt.
- Mainnet observer (`wss://mainnet.portaldot.io`, expected genesis `0x83b5212c…0b8a54`): `/api/network` returned finalized block `2,727,534`, active era `3,893`, 93.6637% top-validator stake share, and a 6,052.3107 POT seven-day expiry estimate. `/api/rewards/5CPtEf…YPDiCY` returned 84 retained eras, 14 marked expiring; first projected expiry was era 3,809 at `2026-10-15T21:27:00Z`. `/api/receipts` was empty. `POST /api/keeper/enable` returned 404 in observer mode. This run made no mainnet writes.
- Local observer returned health `rpc: ok`; `/api/keeper/enable` returned 404. Node sample values were N/A because no local HTTP RPC or metrics endpoint was published to the host.

## Limits to carry forward

- Reward estimates are computed only for Portaldot runtime 1002. Payout modes other than whole-era are terminal for this keeper pass until page attribution is implemented.
- Node samples record heartbeat evidence when imOnline is present and use BABE epoch authorship plus local `author.hasKey` when node RPC permits it. No local HTTP node RPC/metrics endpoint was published here, so a real sample remains unverified.
- The full payout and restart recovery still need live verification when the devchain has an eligible exposure. The local node-health path needs an HTTP node endpoint; with `author.hasKey` hidden by RPC safety mode, authored counts remain N/A and heartbeat evidence is used where available.
