# HACKATHON.md: PortalNode for the Portaldot Hacker House 2026

Open this at the start of every work session. The first task is always the top open MANDATORY item.
Research: `~/Documents/hackathon-research/portaldot-2026-11-06/` (brief, node structure, mainnet numbers, shortlists).

## 1. Event
| Field | Value |
|---|---|
| Hackathon | Portaldot Hacker House 2026 (DoraHacks), virtual |
| Page | https://dorahacks.io/hackathon/portaldot-hacker-house-2026/detail |
| Track | **Node Operations & Tooling** |
| Why this track | The Node Ops competitors found so far only watch the chain; none automates staking or analyses security, and both are named in the track brief |
| Coding window | **14 Oct – 6 Nov**; at least 3 commits in the window; no core modules dumped in the last 24 h |
| Check-in | **24 Oct 12:00 UTC** (13:00 Lagos) |
| Final / code freeze | **6 Nov 04:00 UTC** (05:00 Lagos); confirm in Discord |
| Live Demo Day | 8–9 Nov, Discord. Community vote 9–10 Nov |

## 2. Sources of rules
| Source | URL | Read? | Notes |
|---|---|---|---|
| DoraHacks Details | /detail | ☑ | Rubric, deliverables, compliance |
| DoraHacks Tracks tab | /tracks | ☑ | Node Ops goal: toolsets for the "global high-quality node program" (no public trace yet) |
| DoraHacks Q&A | /qa | ☑ | Two V3 questions, both unanswered |
| Discord | https://discord.gg/portaldot | ☑ (user, 13 Oct) | Answers from LevelMax/Titus, 8–13 Oct, below. Kick-off 14 Oct 12:00–14:00 UTC, channel not yet announced. Scam DMs reported; ignore DMs |
| V3 testnet guide (community translation) | github.com/ItsCogumellum/portaldot-v3-testnet-guide | ☑ | Single source; confirm officially |

## 3. Requirements
| Weight | Requirement | What satisfies it | Status |
|---|---|---|---|
| MANDATORY | Deploy on the Portaldot V3 testnet with verifiable on-chain interactions | Keeper payouts / bonds / keys on testnet, with tx hashes and explorer links | ☐ blocked: testnet offline |
| MANDATORY | Contract address + tx hash at check-in and final | **Open question:** are native-pallet tx hashes accepted without a contract? | ☐ ask at kick-off |
| MANDATORY | Public repo, full README, architecture diagram, dev records, ≥3 commits in window | GitHub repo owned by Timidan | ☐ |
| MANDATORY | Check-in (24 Oct): a demonstrable prototype of at least one core function + public repo, README, dev progress, architecture diagram, live demo or ≤3 min video. **A contract + tx hash alone is not enough.** Simulated data allowed; real testnet interactions encouraged (LevelMax, 8 Oct) | Keeper + network panel | ☐ |
| MANDATORY | Final: one-sentence overview, docs, deploy instructions, runnable demo, ≤3 min video, **pitch deck** (problem, why Portaldot, proof, why keep supporting) | — | ☐ |
| MANDATORY | Disclose SDKs and dependencies | DAppNode Polkadot package template, substrate-payctl if used, @polkadot/api | ☐ |
| WEIGHTED | Technical 30% / Innovation 30% / Ecosystem 20% / Business 20% | See §6 | ☐ |
| BONUS | Community Choice (Discord vote, 200) | Operators who used it vote | ☐ |

Discord answers so far (8–13 Oct):
- tPOT: no faucet yet. **The first batch goes only to registrants who entered a POT address in their DoraHacks registration** (Titus, 12–13 Oct). Later via Discord, every 24 h.
- V3 runtime pallets (imOnline / session / staking) are **unconfirmed even by the mods**. Gate (same as docs/PLAN.md): first build step is **one funded V3 payout + a no-op rerun**; if V3 has no staking or nothing claimable, re-scope the same week.
- Native-tx-only deployment for tooling projects: mods have asked the organisers, no answer yet.
- Pre-kickoff experiments: keep them separate from the competition repo; a clean commit history is the evidence.
- Other Node Ops entrants seen in Discord: xSTX (validator monitoring: heartbeats, era points), shaydez's team (failure injection and recovery, with pre-existing code). Still nobody automating staking.

Open questions for kick-off (14 Oct):
1. V3 testnet WS/ETH RPC, genesis, faucet, explorer?
2. Is the V3 node binary or source public? Can outsiders run a testnet validator, or is the set fixed by sudo?
3. Are native tx hashes accepted where the form asks for a contract address?
4. Which payout call does V3 use: `payout_stakers` or `payout_stakers_by_page`?
5. What is the "global high-quality node program", and who runs it?
6. What do operators have to do for the V3 mainnet upgrade? Are collators/parachains live on the testnet?
7. Bulk tPOT for testing (no faucet exists)?

## 4. Deliverables
| Deliverable | Constraint | Status |
|---|---|---|
| Public repo + README | public all event; README in rubric order | ☐ |
| Architecture diagram | required at check-in | ☐ |
| Testnet deployment info | addresses, tx hashes, explorer links | ☐ |
| Demo video | ≤3 min, real product, Portaldot integration visible, public link | ☐ |
| Pitch deck | PDF or link | ☐ |
| Runnable demo | hosted URL, or clear local instructions | ☐ |

## 5. Access
| Item | Needed for | Requested? | Received? | Fallback |
|---|---|---|---|---|
| V3 testnet endpoint | everything judged | ☐ | ☐ | Local dev node for development only (doesn't satisfy the rule) |
| tPOT | fees, a validator bond | ☐ **put a POT address in the DoraHacks registration** | ☐ | Discord requests (every 24 h) once the faucet opens |
| Validator slot on V3 testnet | installer/wizard demo | ☐ | ☐ | Install as a regular node only; keeper and panel unaffected |
| Discord access | kick-off, office hours, Demo Day | ☐ | ☐ | DoraHacks Message button |

## 6. Rubric → evidence
| Criterion | Weight | Where the judge sees it |
|---|---|---|
| Technical feasibility | 30% | Keeper payout tx hashes on testnet; commit history; runnable package |
| Innovation | 30% | First staking automation and security analysis on Portaldot; V3 node packaging and migration checks (gap: weak on revive/nfts) |
| Ecosystem contribution | 20% | Rewards rescued, validator seats filled, open-source package |
| Business potential | 20% | Operators and foundation as users; keeper fee or hosted plan; node-program scorecard |

## 7. Gates
| Gate | Status | Evidence |
|---|---|---|
| G0 enter/skip | PASS (user's decision, 13 Oct). Concurrency: Stipend due 14 Oct 03:59 UTC, Qloo 30 Oct | — |
| G1 rubric lock | PARTIAL. Weights and deliverables quoted; deadline not yet confirmed in Discord | §1, §3 |
| G2 idea lock | UNKNOWN for V3. Legacy-runtime kill experiment PASSED 13 Oct 21:36 UTC (third-party payout + AlreadyClaimed rerun; docs/HARDENING-LOG.md). V3 gate on 14 Oct: one funded V3 payout + no-op rerun, else re-scope that week. Evidence: reward formula validated against 511 mainnet Reward events (codex-numbers-corrected.md) | docs/PLAN.md, docs/HARDENING-LOG.md |
| G3 scope/architecture | ☐ | |
| G4 ugly submission | ☐ due by check-in, 24 Oct | |
