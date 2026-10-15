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

## Pending
- Corrected reward numbers with the fork formula, validated against a real mainnet payout: Codex.
- Prove one wallet signing on runtime 1002 (needs the user's browser and a dev account): after kick-off.
- DAppNode networking on a real DAppNode: conditional, later.
