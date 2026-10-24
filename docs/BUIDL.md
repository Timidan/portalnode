# DoraHacks BUIDL form

Paste field by field. Numbers as of 24 Oct, 16:50 UTC; the live count is at https://portalnode.timidan.xyz/api/receipts.

## BUIDL name
PortalNode

## Logo
`docs/assets/logo.png` (512 × 512)

## Vision
Portaldot staking rewards expire unless someone claims them. PortalNode claims them every era for validators and their nominators, and alerts operators before their node causes a loss.

## Category / track
Node Operations & Tooling

## Is this BUIDL an AI agent?
No

## Links
- GitHub: https://github.com/Timidan/portalnode
- Project website (live demo): https://portalnode.timidan.xyz
- Console: https://portalnode.timidan.xyz/console
- Demo video: to come for the final

## Tags
Portaldot, staking, validator, node operations, keeper, monitoring

## Description (Markdown)

**PortalNode claims Portaldot staking rewards before they expire, and tells operators when their node needs attention.**

Portaldot pays staking rewards only when someone sends a payout transaction, and an unclaimed era is lost after 84 eras. Anyone may send it; usually nobody does. PortalNode sends it every era from a separate fee-only key, watches each validator's liveness the way the chain counts it, and alerts on Telegram or Discord before something goes wrong.

### What it does
- **Claims every era.** `payoutStakersByPage` on the V3 testnet, `payoutStakers` on mainnet runtime 1002, chosen from the runtime's shape.
- **Fee-only key.** The keeper key pays fees, nothing else. No stash or controller key touches the server.
- **Crash-safe, provable receipts.** Each attempt is saved before broadcast and settled only from a finalized receipt, kept with its block number and events so it outlives node pruning.
- **Liveness as the chain counts it** (`pallet-im-online`: blocks or a heartbeat). Warns before a validator is reported offline and checks the node holds its session keys.
- **Alerts with the fix.** Telegram and Discord: one message when a problem starts, one when it clears, each with the step that fixes it.
- **Public status API.** `GET /api/status/<stash>`: how far any validator is paid, open to any wallet or dApp.
- **Setup wizard.** Bond, keys and validate in one `utility.batchAll`, signed in Portaldot's Node Console.

### Evidence (Portaldot V3 testnet)
Nobody was claiming on V3. On 18 Oct PortalNode claimed all 48 open payouts, then kept going unattended, about a minute after each era closed.

- **96 payouts, 165.40 tPOT** paid to the validators by 24 Oct, every receipt re-verified against its finalized block.
- Keeper account: `5HCFicFwm7GoC8R4swpr2WTFFvkH1WkzJQdVcsq6jMFDQVk3`
- First payout: [block 90,847 in Node Console](https://node-console.portaldot.dev/?rpc=wss%3A%2F%2Ftest-node-v3.portaldot.dev#/explorer/query/0x8a413a135c18c6ec2349f16a3c24aa635f359db1ce7cf642e66d89f04590f62f)
- Live receipts: https://portalnode.timidan.xyz/api/receipts
- Endpoint: `wss://test-node-v3.portaldot.dev`

### Built with
Portaldot V3 staking, `@polkadot/api`, TypeScript, Express, SQLite, React 19, Docker Compose. Runs as an add-on next to any Portaldot node, or as a full stack with a pinned, SHA-256-verified mainnet node.

### Next
- Verify the guided Docker install end to end.
- Package a V3 node the day a V3 binary is published.
- Demo video and pitch deck for the final.
- Keeper signing on mainnet stays off this round; enable it with the community.

## Team
Timidan — solo builder

## Week 2 check-in (if the form asks for a progress update)
Use `docs/CHECKIN-WEEK2.md`, with "96 payouts, 165.40 tPOT by 24 Oct".
