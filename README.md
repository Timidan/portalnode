# PortalNode

PortalNode claims Portaldot staking rewards before they expire, for validators and their nominators, and tells operators when their node needs attention.

Portaldot Hacker House 2026 (DoraHacks), track **Node Operations & Tooling**. It runs as two containers on the operator's box: the official Portaldot node (pinned tarball, SHA-256 verified, non-root) and the PortalNode agent (keeper, collector, API and web console).

| Rubric | Where to look |
|---|---|
| Technical feasibility (30%) | [How it works](#how-it-works), [V3 testnet evidence](#v3-testnet-deployment-and-on-chain-evidence), [Security model](#security-model) |
| Innovation (30%) | [What is new](#what-is-new) |
| Ecosystem contribution (20%) | [Ecosystem](#ecosystem-contribution) |
| Business potential (20%) | [Business](#business-potential) |

## The problem

Anyone can trigger a validator's staking payout, but someone has to do it. Unclaimed rewards expire after **84 eras** (the history depth). On the V3 testnet an era is 6 hours, so the window is 21 days.

- **V3 testnet, 18 Oct 2026:** nobody was claiming. Every era from 1 to 24 was unclaimed for both validators: 48 payouts, an estimated 82.44 tPOT split by era points.
- **Mainnet (runtime 1002), at finalized block 2,724,352.** All amounts are gross estimates from Portaldot's own reward formula, which we checked against all 511 `staking.Reward` events of 10 historical payouts:
  - about 142,457 POT sat unclaimed inside the 84-era window;
  - about 6,051 POT was due to expire between 13 and 20 Oct. 96% of that belongs to the pools of a former validator (V11), whose 7 nominators still have 2.78M POT nominating it while it earns nothing;
  - big validators claim by hand, in `utility.batch` runs every week or two. Four small validators have no payout recorded since about era 3253.
- **Operators get little help.** 5 of 15 validator seats are empty with 0 waiting, 93.66% of stake sits on one validator, 0 of 10 validators set an identity, and there are no operator docs.

## How it works

1. **Chain adapter** (`agent/src/chain.ts`). It reads what the runtime can do from its shape (calls, storage, pallets), not from version labels. It picks a payout mode: `whole-era` (`payoutStakers`, runtime 1002) or `explicit-page` (`payoutStakersByPage`, V3). The genesis hash is checked on every connection.
2. **Collector** (`collector.ts`). On every new session, and every 10 minutes, it lists each claimable era (and page) inside the history window, with an estimate from the fork's reward formula. It also samples the node every 15 s (height, peers, sync, finality age) and builds a network snapshot: seats, stake concentration, finality margin from real authority weights.
3. **Keeper** (`keeper.ts`). For allowlisted validators only, it claims one payout per extrinsic, with one transaction in flight, earliest expiry first. Before signing it re-reads the era bounds, the claim marker and the runtime fingerprint, checks the fee policy, and writes the attempt to SQLite. Only then does it broadcast.
4. **Receipts.** A payout counts only when a finalized block holds our extrinsic and its reward event. Each one stores `(genesis, blockHash, extrinsicIndex, txHash)`, so anyone can re-check it.
5. **API and console** (`index.ts`, `web/`). The agent serves the console at `/console` (Overview, Rewards, Node, Network, Keeper) and a landing page at `/`.

| Route | Mode | Purpose |
|---|---|---|
| `GET /api/health`, `/api/node`, `/api/network` | both | Agent and node health; network snapshot with its block |
| `GET /api/rewards`, `/api/rewards/:validator` | both | Eras, statuses and recent attempts for allowlisted validators |
| `GET /api/receipts` | both | Receipt references, re-verified against finalized blocks |
| `GET /api/nominator/:address` | both | Nominator check: targets, active or not, commission, expiring rewards |
| `POST /api/keeper/enable`, `/disable`, `/claim-now`; `PUT /api/keeper/policy` | operator only | Keeper control. Needs the bearer token |

## Architecture

From [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md):

```mermaid
flowchart LR
  W[Operator browser + wallet extension] -->|host 127.0.0.1:8080 or SSH tunnel, bearer token| A
  subgraph Box[Operator box: shared network namespace]
    A[Agent: API + collector + keeper + console, listens 0.0.0.0:8080 in namespace] -->|127.0.0.1 RPC 9933/9944, metrics 9615| N[Portaldot node]
    A --> D[(SQLite)]
    K[Keeper hot key, low balance] --> A
    N --> V[(node base-path: chain DB + keystore)]
  end
  N <-->|P2P 30333| C[Portaldot network]
  A -->|optional| T[Telegram or Discord]
  A -->|receipt refs| P
  J[Anyone / judges] -->|HTTPS, read only| P[Observer: same agent + network page]
  P --> R[Public RPC]
```

**Operator mode** has the keeper key, the bearer token and the write routes. **Observer mode** is the same agent with no key, no secrets and no write routes registered. Not built yet: the Telegram or Discord alerts, the wallet signing (it belongs to the setup wizard), and a hosted observer. See [Status](#status-and-roadmap). On the V3 testnet the agent connects to the public V3 endpoint, because the node container packages the mainnet binary.

## V3 testnet deployment and on-chain evidence

| Item | Value |
|---|---|
| Endpoint | `wss://test-node-v3.portaldot.dev` (runtime `portaldot-v3` 3002, metadata v16) |
| Explorer | https://node-console.portaldot.dev |
| Staking | Paged: `staking.payoutStakersByPage(stash, era, page)`, event `Rewarded` |
| Keeper hot key | `5HCFicFwm7GoC8R4swpr2WTFFvkH1WkzJQdVcsq6jMFDQVk3` (its own low-balance key) |
| Funding transfer to the keeper key | `0x7c17deb8f0db49dbb2727699270947215087030620c0499d5dd5bb5bf9e9ba73` |
| First payout (era 1, validator `5F4ZyJ…`, paid 1.7051 tPOT) | `0x9825048e2bcedfdad5f7b7b595aeebd556207086c077271b15103f0f8b128452` |
| Second payout (paid 1.7300 tPOT) | `0xf026e3fd00828643ecb739b7c1a1d0e06010e95457175a9f71d2c75d6c1bf11a` |

No contract is deployed. PortalNode works with Portaldot's native staking pallet, so the evidence is the hashes of native `payoutStakersByPage` extrinsics, which can be looked up on the V3 explorer. The runtime quoted a fee of 0.016 tPOT per payout.

### V3 testnet receipts (full list)

> **PLACEHOLDER: to be filled from the keeper database. Do not add hashes by hand.**

<!-- SELECT a.era, a.validator, a.page, a.tx_hash, a.finalized_block, p.paid
     FROM tx_attempts a JOIN payouts p USING (genesis, validator, era, page)
     WHERE a.status = 'settled' ORDER BY a.id; -->

| Era | Validator | Page | Tx hash | Finalized block | Paid (tPOT) |
|---|---|---|---|---|---|
| _TBD_ | | | | | |

### Mainnet and dev chain

- **Mainnet (runtime 1002).** Our own node, synced from genesis on a VPS. Keeper signing on mainnet is off this round: the agent refuses to start in operator mode on the mainnet genesis, and the keeper refuses it again before it signs.
- **Dev chain (runtime 1002), [scripts/keeper-devchain-e2e.sh](scripts/keeper-devchain-e2e.sh).** The keeper, as a third party, claimed a validator's era (`0xcdd8b61b…981f16`). A rerun sent nothing. We crashed it right after it saved a signed attempt (exit 75). On restart, the attempt stayed unresolved inside its mortality window and nothing new was signed. After the window closed it was dropped, and the era was claimed again (`0x3357ba05…5525a1`). Earlier, a manual rerun of a claimed era failed with `staking.AlreadyClaimed` and still paid its fee, so the keeper never retries blindly. Full hashes and timings are in [docs/HARDENING-LOG.md](docs/HARDENING-LOG.md).

## What is new

- **One keeper for both runtimes.** It picks the payout mode from the runtime's shape, not a version label. It claimed whole eras on the runtime 1002 dev chain and paged payouts on V3.
- **Crash-safe claiming.** A signed attempt is saved before broadcast and settled only from a finalized receipt, so a crash does not lead to a blind resend. Unclear cases pause the keeper and raise an alert.
- **Portaldot's own reward maths.** The fork splits an era's payout by `points × ED + stake`, not by points as upstream Substrate does. Our formula reproduced 511 mainnet reward events to the base unit.
- **Honest network numbers.** The finality margin comes from real authority weights, every number shows its block, and a missing pallet shows as N/A, not zero.
- The other Node Ops entries we found watch the chain. None of them claims payouts.

## Ecosystem contribution

- Nominators get paid even when their validator does not claim. On V3, 48 payouts sat unclaimed until the keeper started.
- A read-only nominator check: paste an address to see whether its validators are active, their commission, and which rewards expire when.
- An open, pinned, verified way to run the official node, with its provenance in [deploy/provenance.json](deploy/provenance.json).

## Business potential

- **Users:** validator operators who want payouts on time, nominators of slow validators, and the foundation's node program, which needs a scorecard of healthy nodes.
- **Revenue options (not tested):** a small keeper fee per claim, or a hosted plan that runs the keeper and alerts for operators who do not want a box.
- The agent is self-hosted, so an operator never hands a stash key to us.

## Quick start

Requirements: Docker with Compose for the node, Node.js 22 for running the agent from source.

**A. Mainnet node with an observer console (Docker).** The agent starts in observer mode (read-only); operator mode refuses mainnet this round.

```bash
cd deploy
cp .env.example .env
docker compose up -d --build
ssh -L 8080:127.0.0.1:8080 your-server      # from your laptop, if the box is remote
# open http://127.0.0.1:8080/console
```

The node syncs mainnet from genesis. In our test that ran at about 190 blocks/s, roughly 4 hours.

**B. Keeper on the V3 testnet (from source).**

```bash
(cd web && npm ci && npm run build)
cd agent && npm ci
# 1. Observer first: read the chain and its genesis hash (curl from a second terminal)
PORTALNODE_RPC=wss://test-node-v3.portaldot.dev npm run dev
curl -s http://127.0.0.1:8080/api/network | jq -r .genesis
# 2. Stop the observer. Operator: a new low-balance key, never your stash.
#    keeper.json contains {"suri": "<secret phrase>"}; run chmod 600 keeper.json
export PORTALNODE_MODE=operator PORTALNODE_RPC=wss://test-node-v3.portaldot.dev
export PORTALNODE_GENESIS=<the genesis from step 1>
export PORTALNODE_KEEPER_FILE=$PWD/keeper.json PORTALNODE_ALLOWLIST=<stash>,<stash>
export PORTALNODE_TOKEN=$(openssl rand -hex 32); echo "$PORTALNODE_TOKEN"
export PORTALNODE_MAX_FEE=5 PORTALNODE_BUDGET_24H=50 PORTALNODE_MIN_RESERVE=1   # values from the e2e script; tighten for real funds
npm run dev
```

Then open `/console`, go to **Keeper**, paste the token and press **Turn on**. Or run `curl -X POST -H "Authorization: Bearer $PORTALNODE_TOKEN" http://127.0.0.1:8080/api/keeper/enable`. Set `PORTALNODE_KEEPER=on` to turn the keeper on at every start; otherwise it starts off. A fee policy set in the console lasts only until restart, so use the three env vars for a policy that stays. `npm run keeper:once` signs at most one payout and exits.

| Variable | Default | Purpose |
|---|---|---|
| `PORTALNODE_MODE` | `observer` | `operator` registers write routes and allows signing |
| `PORTALNODE_RPC` | `ws://127.0.0.1:9944` | Chain WebSocket endpoint |
| `PORTALNODE_GENESIS` | none | Required in operator mode. Must match the chain; mainnet is refused |
| `PORTALNODE_KEEPER_FILE` | none | JSON with `suri` or `secretPhrase`; must be `chmod 600` |
| `PORTALNODE_ALLOWLIST` | empty | Validator stashes the keeper may pay out for; empty means plan only |
| `PORTALNODE_TOKEN` | none | Bearer token for write routes, at least 32 characters |
| `PORTALNODE_MAX_FEE`, `PORTALNODE_BUDGET_24H`, `PORTALNODE_MIN_RESERVE` | none | Fee policy in POT, up to 14 decimals |
| `PORTALNODE_NODE_RPC`, `PORTALNODE_METRICS` | none | Local node HTTP RPC and metrics; loopback URLs only |
| `PORTALNODE_DB` | `./portalnode.sqlite` | SQLite file |
| `PORTALNODE_KEEPER` | off | `on` turns the keeper on at start (operator mode, fee policy and key required) |
| `PORT` | `8080` | Listen port |
| `PORTALNODE_ALLOWED_HOSTS`, `PORTALNODE_ALLOWED_ORIGINS` | localhost and 127.0.0.1 | Host and Origin allowlists for write routes |
| `NODE_NAME` | `portalnode` | Node name (Compose) |

## Security model

- **Hot key only.** The keeper key pays fees and nothing else. Payout calls are open to any account, and the chain pays each stash's own reward destination. No stash or controller key ever touches the box. The key file must be owner-only, or the keeper refuses to load it.
- **Fee policy.** Signing needs a maximum fee per transaction, a rolling 24-hour budget and a minimum reserve of at least the existential deposit. If the balance would fall below the reserve, the keeper turns itself off and raises a critical alert. These are application limits, not an on-chain cap: keep the balance small and top it up by hand.
- **Durable attempts.** One transaction in flight, enforced by a unique index. Each attempt (nonce, runtime fingerprint, 64-block mortality window, fee, tx hash) is saved before broadcast. On restart: found in a finalized block, settle it; nonce unchanged and window passed, drop and re-plan; anything else, or a runtime change, pause and alert. Oversize calls, expired eras and eras claimed by someone else are recorded once and never retried.
- **Mainnet signing off.** Checked twice, in `chain.ts` at connect and in `keeper.ts` before signing.
- **Console access.** Compose publishes port 8080 on the host's loopback only; reach it over an SSH tunnel. Write routes need the bearer token (constant-time compare) in the `Authorization` header, plus Host and Origin allowlists. Observer mode never registers them. Read routes have no token and rely on the loopback binding.
- **Containers.** The node tarball is pinned to an upstream commit and its SHA-256 is checked before extraction. The node runs as uid 10001 and the agent as `node`. Both containers drop all capabilities and set `no-new-privileges`; the agent's root filesystem is read-only. Node RPC and metrics stay on the shared namespace's loopback, with no external RPC flags.
- **Known limit.** The agent runs on the same box, so it cannot report the box itself going down.

## Development records

All commits fall inside the coding window (14 Oct to 6 Nov 2026). Experiments, failures and fixes are in [docs/HARDENING-LOG.md](docs/HARDENING-LOG.md); the design is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/PLAN.md](docs/PLAN.md).

| Date (UTC+1) | Commit | Change |
|---|---|---|
| 15 Oct 17:33 | `7c13b76` | Start PortalNode: design docs, dev-chain bootstrap and the Night shift landing |
| 15 Oct 18:10 | `dee2055` | Add the PortalNode agent and container deploy |
| 15 Oct 18:30 | `2d996e8` | Add the operator console and a keeper end-to-end script |
| 15 Oct 18:51 | `be85a47` | Add the night-shift punch clock figure to the landing page |
| 15 Oct 23:46 | `628602b` | Fix keeper broadcast and one-shot exit |
| 16 Oct 00:52 | `cdf6b36` | Rework the punch clock as a connected mechanism that plays on its own |
| 16 Oct 01:41 | `2aa1f85` | Keep an unsent payout attempt unresolved until its window closes |
| 18 Oct 17:03 | `87002f2` | Support paged staking payouts on the V3 testnet |
| 18 Oct 17:26 | `f35bc44` | Claim automatically while the keeper is enabled, and read V3 weights |

## Dependencies and SDKs

| Part | Dependency | Licence or source |
|---|---|---|
| Node | Official Portaldot node tarball, `portaldotVolunteer/Portaldot-node` commit `1ff0b2b3dc85…`, SHA-256 `539a43dbb37d…7ad0a` | Upstream; see [deploy/provenance.json](deploy/provenance.json) |
| Agent | `@polkadot/api` 17.0.2, `@polkadot/keyring` 14.0.3, `@polkadot/util-crypto` 14.0.3 | Chain access and signing |
| Agent | `express` ^5.1.0, `better-sqlite3` ^12.2.0; dev: `typescript`, `tsx` | API and storage |
| Web | `react` / `react-dom` 19.3.0, `vite` 6.4.3, `tailwindcss` ^4.3.3, `three` 0.186.1, `motion` ^13.4.1, `@phosphor-icons/react` ^2.1.7, Geist and Geist Mono via `@fontsource-variable` | Console and landing |
| Web | Anatomy kit by Ryan ([wheresryan22/anatomy](https://github.com/wheresryan22/anatomy)) in `web/src/anatomy/iso` | MIT, [LICENSE](web/src/anatomy/iso/LICENSE) |
| Web | Fibre-optic footage from Mixkit | Mixkit Stock Video Free License, [SOURCES.md](web/public/footage/SOURCES.md) |
| Images | `ubuntu:22.04`, `node:22-slim` | Docker Hub |

Not used: substrate-payctl and the DAppNode Polkadot package template.

## Status and roadmap

**Works today:** chain adapter for runtime 1002 and V3; collector; keeper with durable attempts and fee policy; SQLite receipts; API; console; read-only nominator check; Compose with the pinned mainnet node (agent in observer mode); signed payouts on the V3 testnet.

**Not built yet:**
- Setup wizard (bond, session keys, validate) and wallet signing.
- Telegram alerts. Alerts are stored in SQLite but not delivered anywhere.
- DAppNode package.
- Public hosted demo (observer instance). For now, run it locally with the Quick start.
- Update signals (upstream tarball hash or runtime version changes).

**Next, by 6 Nov:** setup wizard with one proven wallet, Telegram alerts, the public observer page with verified receipts, update signals. DAppNode only if its networking keeps node RPC private.

## Licence

To be added. The anatomy kit in `web/src/anatomy/iso` stays under its MIT licence.
