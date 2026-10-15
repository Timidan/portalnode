# PortalNode plan

## 14 Oct gate (nothing past the adapter skeleton is built until this resolves)
Probe the V3 testnet's metadata the moment its endpoint is published.
- **Staking present:** the first build gate is **one funded V3 payout plus a no-op rerun** (an existing validator's era is fine; no new seat needed). Pallet presence alone is not a pass.
- **Staking present but nothing claimable** (no funded, unclaimed era; no tPOT; payouts already automated): choose the re-scope route the same week, not on 23 Oct.
- **Staking absent:** stop and re-scope before writing product code. Options: a verified V3 node/collator operations loop, organiser-approved native-tooling evidence, or re-scoping the entry.

Three decisions to record in HACKATHON.md at kick-off (from Codex):
1. **Which real V3 operator loop can we complete?** Get the RPC, genesis, metadata, node binary/source, tPOT and validator admission rules. With staking: prove one payout and a no-op rerun first.
2. **What counts as eligible and innovative evidence?** Native extrinsic hashes vs a mandatory contract address; which V3 feature the product genuinely uses (OpenGov upgrade radar, identity, collators if live).
3. **Who runs and funds it?** One self-hosted operator first (ours), Compose before DAppNode, low-balance keeper key, explicit allowlist and caps, one alert channel, a separate public observer.

## Kill experiment (legacy runtime): in progress 13 Oct
Local `portaldot_dev` (runtime 1002) in podman, era forced every session. Bob claims Alice's completed era, then claims again, and must be rejected. The actual `staking.Reward` total is also compared with Portaldot's stake-weighted formula (see ARCHITECTURE "Reward maths"). Result goes in HACKATHON.md §7, G2.

## Milestones
| Dates | Work | Gate |
|---|---|---|
| 14 Oct | Kick-off; V3 probe; repo + first commit; adapter `detect()` against dev chain, mainnet, V3 | G1, G2 |
| 15–17 Oct | Adapter claims + eraState; keeper with durable attempts and fee policy; **first real V3 payout + no-op rerun**; SQLite; API | G3 |
| 18–20 Oct | Rewards view; small read-only network panel; Compose with pinned tarball; agent on VPS against V3; receipt refs to observer | — |
| 21–23 Oct | README, dev records, architecture diagram, dependency disclosure; ≤3 min proof video | **Check-in 24 Oct 12:00 UTC (G4)** |
| 25–28 Oct | Prove one wallet flow end to end; wizard (preflight → bond → keys → validate); one alert channel | Office hours 28–29 Oct |
| 29 Oct–1 Nov | Console Overview + Network; public network page; update signals; first external operator. Conditional: DAppNode, nomination check, upgrade radar | G5, G6 |
| 2–5 Nov | Final ≤3 min video, pitch deck, README in rubric order, G7 checks from a logged-out browser | G7 |
| 6 Nov 04:00 UTC | Code freeze | — |

## Working rules
- At least one real commit per day from 14 Oct. Never commit a core module all at once in the last 24 h.
- Ask before every push and before making the repo public.
- No fake data anywhere a judge can see; demo replays are labelled.
- Copy pass (better-writing) on every judge-facing string; impeccable pass on the console and network page at the midpoint.
