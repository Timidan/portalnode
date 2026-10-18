# Hardening log

Experiments run in scratch, outside this repo, before the coding window. Each line is something we ran, not something we assumed.

## 13 Oct 2026: official binaries in podman (rootless)

| # | Finding | Evidence | Design consequence |
|---|---|---|---|
| 1 | The mainnet binary is from **24 Jun 2021** (`portaldot 2.0.0`). The tarball also carries `pot_mainnet_spec_raw.json` (chainType Live, protocolId `pot-main`, 2 bootnodes on 47.242.204.5 and 47.243.103.208). The binary isn't marked executable in the tarball | `tar -tzvf`; tarball SHA-256 `539a43db…7ad0a`. Dev tarball `9df4d633…a6327c`, binary dated 29 Dec 2025 | Installer: verify the SHA-256, `chmod +x`, pass `--chain pot_mainnet_spec_raw.json` explicitly, record both in `provenance.json` |
| 2 | Mainnet sync from genesis works at about 190 blocks/s with 4 peers, so a full sync takes about 4 h on this machine | `system_syncState` 9,936 / 2,724,607 after ~50 s | Wizard step "sync" shows real progress from `system_syncState`; don't promise minutes |
| 3 | A second container with `--network container:<node>` reaches the node's RPC (9933) and metrics (9615) on 127.0.0.1; the host cannot | sibling `fetch` OK; host `curl` → no connection | Compose `network_mode: service:node` design holds under podman. Docker and DAppNode still to verify |
| 4 | `--rpc-methods safe` hides `author_rotateKeys` ("Method not found"). The default `Auto` with RPC on loopback allows it, returning 128 bytes (4 × 32-byte keys). Any external flag (`--ws-external`) silently flips `Auto` to safe | three runs on the mainnet and dev binaries | Node runs with default `Auto`, **no external RPC/WS flags, and no `--rpc-methods safe`**. Agent health check: if rotateKeys is missing, say why |
| 5 | `--validator` defaults to archive pruning; anything else needs `--unsafe-pruning` | `--help` | Installer sizes disk for an archive node when the validator role is chosen |
| 6 | Metrics expose `substrate_block_height{best,finalized,sync_target}`, `substrate_sub_libp2p_peers_count`, `substrate_node_roles`, `substrate_ready_transactions_number` | `/metrics`, 559 lines | Health panel reads metrics, not just RPC |
| 7 | Runtime 1002 uses the **modern** `ValidatorPrefs {commission, blocked}` (the runtime rejected a legacy-shaped call: "Could not decode `ValidatorPrefs::blocked`"), but the **old 2-byte** `DispatchError::Module {index, error}`. @polkadot/api 17 can't decode blocks containing a failed extrinsic without the override `DispatchErrorModule: {index: 'u8', error: 'u8'}` | `diag4.mjs` decoded `staking.InsufficientBond` only with the override | Adapter ships a **verified** type bundle for runtime 1002 with exactly this override. Each override needs a decode test against real chain data |
| 8 | Portaldot's custom staking: `validate` needs `MinValidatorBond ≤ active ≤ MaxValidatorBond` and reports both failures as `InsufficientBond`. `update_staking_limits(minNominatorBond, minValidatorBond, maxValidatorBond, maxNominatorCount?, maxValidatorCount?)` is sudo-only. Mainnet: 5,000–30,000 POT | `validate` failed at 1,000 POT, failed at 6,000 POT with max 0, succeeded after the limits were set | Wizard checks both bounds before asking for a signature and explains "over the 30,000 POT maximum" instead of the misleading chain error |
| 9 | A validator candidate whose session keys aren't on a running node can halt block production if elected alone (we withdrew Charlie with `chill` before the election) | dev chain: Charlie's keys set from local public keys only | Wizard always generates keys on the node that will run them (rotateKeys) and checks `NextKeys` against that node's keystore before `validate` |
| 10 | On the dev genesis, Alice produces blocks but isn't a staking candidate (`CounterForValidators = 0`); era 0 has no exposure, so it can't be claimed | `erasStakers(0, Alice).total = 0` | Keeper never treats "no exposure" as "unclaimed"; dev-chain payout test waits for an era with exposure (running) |

## 13 Oct 2026: research and review folded in
| Source | Accepted | Rejected or flagged |
|---|---|---|
| Codex adversarial review (18 findings) | All 18: durable attempts with manual-recovery pause, fee accounting, first V3 payout as the build gate, console binding fix, keystore volume, runtime-change handling, explicit pages, pre-sign refresh, weight checks, one proven wallet, wizard preflight, receipt refs for the observer, heartbeat-or-authored health, scope cut, token rules, privileged-agent statement, wording fixes | — |
| Codex #4, checked against source by Claude | Portaldot's payout splits by `(points × ED + stake)`, not points. Earlier POT headlines withdrawn pending recount | — |
| Agy hardening research | Decoded preview in the console before signing; Portaldot's own extension as first wallet candidate (manifest + injection verified, signing untested); paged-payout detection via `ErasStakersOverview`; Telegram alerts outbound-only | DAppNode `network_mode` limitation is plausible but UNVERIFIED. "Validators don't need archive" contradicts this binary's `--help` and is rejected for 2.0 |

## 13 Oct 2026, 21:36 UTC: kill experiment PASSED (legacy runtime 1002, dev chain)
- Era 1 completed with exposure (Alice, 30,000 POT bonded). Bob (third party, not the validator) called `staking.payoutStakers(Alice, 1)`:
  tx `0x84b7fb2f…6d05c9a` → `staking.Reward` 79.1615 to Alice (equals the era's whole pool: Alice was the only validator), `claimedRewards` became `[1]`.
  Alice's balance rose by the reward plus 0.286, her 20% author share of Bob's fee (the other 80%, 1.1446, went to the treasury).
- Rerun of the same claim: tx `0x545c26f9…9485a93` rejected with `staking.AlreadyClaimed` (module 9, error 14, decoded via the `DispatchErrorModule` override). The failed call still paid its fee, so the keeper must never retry blindly.
- Result: permissionless third-party payout works on runtime 1002, the claim marker prevents double payment, and errors decode. G2 legacy-runtime experiment: PASS. V3 still untested.

## 15 Oct 2026, 22:46 UTC: keeper e2e on the dev chain, steps 1–5 PASS after two fixes
- First run failed: after signing, `keeper.ts` rebuilt the tx with `createType('Extrinsic', hex)`, which has no `send()` ("txSigned.send is not a function"); `once.ts` then hung because the open WS kept Node alive. Fixed by sending the signed `tx` directly and exiting after the one-shot run.
- Rerun: the keeper (Bob, third party) claimed Alice's era: tx `0xcdd8b61b…981f16`, finalized `0x140d3612…b2184`, extrinsic index 1, paid 79161591859790 (79.16 at the dev chain's default 12 decimals). Rerun: no claimable era, nothing submitted.
- Step 3 PASS: crash right after persisting a signed attempt exits 75.
- Step 4 first FAILED: on restart, `reconcile` paused the never-broadcast attempt with a critical alert while its mortality window was still open, contradicting ARCHITECTURE rule 5 (stay unresolved until included, or dropped once the window passes with the nonce unchanged). Every crash would have stopped the keeper. Fixed: inside the window with an unchanged nonce the attempt stays unresolved; the nonce is read at the finalized head.
- 16 Oct, 00:41 UTC, rerun on the same DB: attempt 2 dropped after its window (block 4890); crash persisted attempt 3 (exit 75); immediate restart left it unresolved, signed nothing and raised no alert; after block 4957 it was dropped and era 2 was claimed: attempt 4 settled, tx `0x3357ba05…5525a1`, paid 79161571515094. Log: keeper-reconcile.log.

## 18 Oct 2026: V3 testnet is live with staking
- Endpoint moved to `wss://test-node-v3.portaldot.dev` (EVM `https://test-evm-rpc-v3.portaldot.dev`, chain ID 420420777; explorer https://node-console.portaldot.dev). Runtime `portaldot-v3` 3002, metadata v16, 69 pallets incl. Staking, NominationPools, Revive. 6 s blocks, 600-block sessions, 6 sessions per era (6 h eras), history depth 84, tPOT with 14 decimals, ED 0.1 tPOT.
- Paged staking: `payoutStakersByPage(stash, era, page)`, `erasStakersOverview`, per-page `claimedRewards(era, stash)`, event `Rewarded {stash, dest, amount}`, `historyDepth` is a constant. Two validators with only their own stake show `pageCount 0`, yet still have one payable page (page 0).
- Nobody claims: every era 1–24 is unclaimed for both validators, 48 payouts, 82.44 tPOT by points share.
- Agent changes: the 1002 `DispatchErrorModule` override now applies only to specName `portaldot` (checked: 1002 decodes 2-byte, V3 keeps the metadata's `[u8;4]`); collector lists paged payouts; keeper signs `payoutStakersByPage` and matches `Rewarded`. Observer run on V3: explicit-page, no capability gaps, 48 planned. `AuthorizeCall` and `EthSetOrigin` extensions carry no data, so polkadot.js signs valid extrinsics; the runtime quoted 0.016 tPOT per payout.
- 18 Oct, 16:14–17:10 UTC, V3 gate PASSED: funded the keeper with 10 tPOT (tx `0x7c17deb8…ba73`), then the agent service, enabled with `PORTALNODE_KEEPER=on`, claimed all 48 unclaimed pages by itself (eras 1–24, both validators). Each settled with its `Rewarded` event; total paid 82.4409 tPOT (equal to the collector's estimate), fees 0.7158 tPOT. A rerun through `/api/keeper/claim-now` returned `noop`. Receipts: README and `build/v3/keeper.sqlite` in the research folder.
- Found on the way and fixed: the service never claimed on its own (nothing called `runOnce`); the block weight limit is an Option of a two-part weight on V3; the keeper paused itself on a metadata-hash difference with identical code hash (fingerprint now spec + tx version + code hash; metadata fetched only for a new fingerprint, since the 1 MB download timed out on this endpoint).
- The local dev chain cannot restart: its container mounted the node binary from a /tmp scratch folder that the reboot wiped. Chain data is intact in the `portalnode-devchain` volume.

## Pending
- Corrected reward numbers with the fork formula, validated against a real mainnet payout: Codex.
- Prove one wallet signing on runtime 1002 (needs the user's browser and a dev account): after kick-off.
- DAppNode networking on a real DAppNode: conditional, later.
