# Week 2 check-in (due 24 Oct 2026, 12:00 UTC)

Text for the DoraHacks form. Numbers as of 25 Oct; the live count is at https://portalnode.timidan.xyz/api/receipts.

## One sentence
PortalNode claims Portaldot staking rewards before they expire, for validators and their nominators, and tells operators when their node needs attention.

## Project progress
- **Keeper on the V3 testnet, live and unattended.** It claims every validator's payout page by page (`staking.payoutStakersByPage`) from its own fee-only key. Nobody was claiming on V3 when we started: we claimed all 48 open payouts on 18 Oct, and since then the agent has claimed each new era about a minute after it closed. Total by 25 Oct: 98 payouts, 168.86 tPOT paid to the validators, every receipt re-checked against its finalized block.
- **Validator health on-chain.** `ValidatorHealth` (Solidity, V3 EVM via `pallet-revive`) at `0x072a1022f537a0da496801239725539101a41bb2`. The keeper writes every validator's paid-through era and liveness each era with its own key; any contract calls `isHealthy()`.
- **Mainnet, read-only.** 102,913 POT unclaimed, 4 of 10 validators with no era claimed in the window, 2.78M POT bonded to an inactive validator, 93.7% of stake on one validator. Live at https://portalnode.timidan.xyz/mainnet/api/network.
- **Anyone can claim.** The account check builds the payout batch (oldest era first) and opens it in Node Console for the visitor's wallet, on V3 or mainnet.
- **Crash-safe.** Each signed attempt is saved before broadcast and settled only from a finalized receipt; tested by crashing between save and broadcast and restarting.
- **Liveness the way the chain counts it** (`pallet-im-online`: a heartbeat or an authored block), with a warning before a validator is reported offline, and a check that its session keys are loaded on the operator's node.
- **Alerts on Telegram and Discord**, one message when a problem starts and one when it clears: payouts nearing expiry, keeper paused or low on fees, runtime upgrades, offline risk, keys not loaded, a new upstream node commit. Each alert carries the step that fixes it. Telegram tested with a real bot.
- **Receipts that outlive the node.** Each payout stores its block number and decoded `Rewarded` events, so it stays provable after public nodes prune old blocks.
- **Public status API** for wallets and dApps: `GET /api/status/<stash>` returns how far any validator is paid and what is still unpaid, read from on-chain claim flags. Example: https://portalnode.timidan.xyz/api/status/5F4ZyJJ8R3QHZKRLAfDXdUuVE4w3Q7uq7tCNfAtvf2XEBfYY
- **Setup wizard:** preflight, keys from the operator's node, one `utility.batchAll` of bond, setKeys and validate, signed in Portaldot's Node Console; status read back from chain. Proven on a local runtime-1002 chain.
- **Console and landing page** with live network data, receipts and the account check; a pinned, SHA-256-verified mainnet node image; our own mainnet node synced from genesis.

## Remaining tasks
- Verify the guided Docker install (`setup` plus `addon`/`full` profiles) end to end.
- Sign the wizard's batch with the Portaldot extension in a real browser, and on V3 once a V3 node binary is public (none is published yet).
- Demo video and pitch deck for the final.
- Keeper signing on mainnet stays off this round; decide with the community whether to enable it.

## GitHub
https://github.com/Timidan/portalnode — README (architecture diagram, evidence, quickstart, API), `docs/ARCHITECTURE.md`, development records in `docs/HARDENING-LOG.md` and the commit history (14 Oct onward).

## Testnet evidence (Portaldot V3 testnet, `wss://test-node-v3.portaldot.dev`)
PortalNode uses native staking calls, so there is no contract address. Evidence is transactions and accounts:
- Keeper account (fee-only key): `5HCFicFwm7GoC8R4swpr2WTFFvkH1WkzJQdVcsq6jMFDQVk3`
- Funding transfer to the keeper: `0x7c17deb8f0db49dbb2727699270947215087030620c0499d5dd5bb5bf9e9ba73` (block 90,762)
- First payout: tx `0x9825048e2bcedfdad5f7b7b595aeebd556207086c077271b15103f0f8b128452`, block `0x8a413a135c18c6ec2349f16a3c24aa635f359db1ce7cf642e66d89f04590f62f` — [open in Node Console](https://node-console.portaldot.dev/?rpc=wss%3A%2F%2Ftest-node-v3.portaldot.dev#/explorer/query/0x8a413a135c18c6ec2349f16a3c24aa635f359db1ce7cf642e66d89f04590f62f)
- A recent unattended payout: tx `0x9fe5eb053f299ea2ad6584c6aede630c4de2b907286d0e27ed36e4dfb4283038`, block `0x05cce86bc073faed2a5e43f2a054821d197fc966cbbec7feea9d304517196401` — [open in Node Console](https://node-console.portaldot.dev/?rpc=wss%3A%2F%2Ftest-node-v3.portaldot.dev#/explorer/query/0x05cce86bc073faed2a5e43f2a054821d197fc966cbbec7feea9d304517196401)
- All receipts, re-verified live: https://portalnode.timidan.xyz/api/receipts
- Contract address: `0x072a1022f537a0da496801239725539101a41bb2` (EVM RPC `https://test-evm-rpc-v3.portaldot.dev`)
- Contract deploy: tx `0x2be541a935ca67ee63146598fe71b9fe54c7254fcc16e5084ad84cb21aa17705`, block 181,327 — [open in Node Console](https://node-console.portaldot.dev/?rpc=wss%3A%2F%2Ftest-node-v3.portaldot.dev#/explorer/query/0xcac13a8520efa94aae9385e64378dce6fdd0016ca12fd55de54de06bf8e721a9)
- First health report: tx `0xf9d5947ffb1a9e5875942deed65840495e1b6570d3fd03aa95a82b6a36723c5c`, block 181,352 — [open in Node Console](https://node-console.portaldot.dev/?rpc=wss%3A%2F%2Ftest-node-v3.portaldot.dev#/explorer/query/0x071ee8af96f9944ce8975aa2570905241e16c2e6d78c536a8848e220d45fe7dd)

## Demo
Working demo link: https://portalnode.timidan.xyz (the console is at `/console`; real V3 testnet data, no mock data).
