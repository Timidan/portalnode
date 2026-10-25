# Dependencies and SDKs

| Part | Dependency | Licence or source |
|---|---|---|
| Node | Official Portaldot node tarball, `portaldotVolunteer/Portaldot-node` commit `1ff0b2b3dc85…`, SHA-256 `539a43dbb37d…7ad0a` | Upstream; see [deploy/provenance.json](deploy/provenance.json) |
| Agent | `@polkadot/api` 17.0.2, `@polkadot/keyring` 14.0.3, `@polkadot/util-crypto` 14.0.3 | Chain access and signing |
| Agent | `express` ^5.1.0, `better-sqlite3` ^12.2.0; dev: `typescript`, `tsx` | API and storage |
| Web | `react` / `react-dom` 19.3.0, `vite` 6.4.3, `tailwindcss` ^4.3.3, `three` 0.186.1, `motion` ^13.4.1, `@phosphor-icons/react` ^2.1.7, Geist and Geist Mono via `@fontsource-variable` | Console and landing |
| Web | Anatomy kit by Ryan ([wheresryan22/anatomy](https://github.com/wheresryan22/anatomy)) in `web/src/anatomy/iso` | MIT, [LICENSE](web/src/anatomy/iso/LICENSE) |
| Web | Fibre-optic footage from Mixkit | Mixkit Stock Video Free License, [SOURCES.md](web/public/footage/SOURCES.md) |
| Contract | Solidity 0.8.28 compiled with Foundry (`forge`); deployed to V3's `pallet-revive` EVM; `cast` checks the report calldata in `agent/src/health.test.ts` | GPL-3.0 compiler and MIT/Apache-2.0 Foundry tools; build-time only |
| Images | `ubuntu:22.04`, `node:22-slim` | Docker Hub |

Not used: substrate-payctl and the DAppNode Polkadot package template.
