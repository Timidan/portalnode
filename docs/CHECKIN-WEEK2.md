# Week 2 check-in (due 24 Oct 2026, 12:00 UTC)

Text for the DoraHacks form. Numbers as of 21 Oct.

## One sentence
PortalNode claims Portaldot staking rewards before they expire, for validators and their nominators, and tells operators when their node needs attention.

## Project progress
- **Keeper on the V3 testnet, live and unattended.** It claims every validator's payout page by page (`staking.payoutStakersByPage`) from its own fee-only key. Nobody was claiming on V3 when we started: we claimed all 48 open payouts on 18 Oct, and since then the agent has claimed each new era about a minute after it closed. Total by 21 Oct: 72 payouts, 123.86 tPOT paid to the validators, every receipt re-checked against its finalized block.
- **Crash-safe.** Each signed attempt is saved before broadcast and settled only from a finalized receipt; tested by crashing between save and broadcast and restarting.
- **Liveness the way the chain counts it** (`pallet-im-online`: a heartbeat or an authored block), with a warning before a validator is reported offline, and a check that its session keys are loaded on the operator's node.
- **Alerts on Telegram and Discord**, one message when a problem starts and one when it clears: payouts nearing expiry, keeper paused or low on fees, runtime upgrades, offline risk, keys not loaded, a new upstream node commit. Telegram tested with a real bot.
- **Setup wizard:** preflight, keys from the operator's node, one `utility.batchAll` of bond, setKeys and validate, signed in Portaldot's Node Console; status read back from chain. Proven on a local runtime-1002 chain.
- **Console and landing page** with live network data, receipts and the account check; a pinned, SHA-256-verified mainnet node image; our own mainnet node synced from genesis.

## Remaining tasks
- Verify the guided Docker install (`setup` plus `addon`/`full` profiles) end to end.
- Sign the wizard's batch with the Portaldot extension in a real browser, and on V3 once a V3 node binary is public (none is published yet).
- Demo video and pitch deck for the final.
- Keeper signing on mainnet stays off this round; decide with the community whether to enable it.

## GitHub
https://github.com/Timidan/portalnode — README (rubric order, architecture diagram, evidence), `docs/ARCHITECTURE.md`, development records in `docs/HARDENING-LOG.md` and the commit history (14 Oct onward).

## Testnet evidence (Portaldot V3 testnet, `wss://test-node-v3.portaldot.dev`)
PortalNode uses native staking calls, so there is no contract address. Evidence is transactions and accounts:
- Keeper account (fee-only key): `5HCFicFwm7GoC8R4swpr2WTFFvkH1WkzJQdVcsq6jMFDQVk3`
- Funding transfer to the keeper: `0x7c17deb8f0db49dbb2727699270947215087030620c0499d5dd5bb5bf9e9ba73` (block 90,762)
- First payout: tx `0x9825048e2bcedfdad5f7b7b595aeebd556207086c077271b15103f0f8b128452`, block `0x8a413a135c18c6ec2349f16a3c24aa635f359db1ce7cf642e66d89f04590f62f` — [open in Node Console](https://node-console.portaldot.dev/?rpc=wss%3A%2F%2Ftest-node-v3.portaldot.dev#/explorer/query/0x8a413a135c18c6ec2349f16a3c24aa635f359db1ce7cf642e66d89f04590f62f)
- A recent unattended payout: tx `0x9fe5eb053f299ea2ad6584c6aede630c4de2b907286d0e27ed36e4dfb4283038`, block `0x05cce86bc073faed2a5e43f2a054821d197fc966cbbec7feea9d304517196401` — [open in Node Console](https://node-console.portaldot.dev/?rpc=wss%3A%2F%2Ftest-node-v3.portaldot.dev#/explorer/query/0x05cce86bc073faed2a5e43f2a054821d197fc966cbbec7feea9d304517196401)
- All receipts, re-verified live: https://portalnode.timidan.xyz/api/receipts

## Demo
Working demo link: https://portalnode.timidan.xyz (the console is at `/console`; real V3 testnet data, no mock data).
