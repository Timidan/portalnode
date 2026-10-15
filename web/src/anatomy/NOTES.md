# PunchClock phase 2 evidence

Phase 2 implements the accepted mechanical chain inside `web/src/anatomy/**`. No commits, new dependencies, or parent application edits. `model.ts`, the `iso/` kit, `build.mjs`, the public export, and `PunchClockProps` are unchanged.

## Inventory and time

- **199 physical parts**, below the 203-part ceiling. Integral bosses, teeth, curved sheet sections and occlusion fragments keep the parent physical ID. The current rendering has 1,305 paint items / 1,209 recorded solids.
- Phase 2 began **2026-10-15 18:25 UTC**. Verification is still running; the completion time and elapsed duration will be recorded here after the final checks.
- `CONCEPT.md` contains the dimensions, drive ratios, and table generated from the actual `MOUNTS` / `DRIVES` exports.

The four wheels each have 24 involute teeth, module 1.5, and form three 1:1 meshes. Each wheel peaks at **5.142857 teeth/s** and **0.085714 tooth pitches per 60 Hz frame**. Tape pitch is π/90 units per symbolic block. The 128-unit carriage lever swings 112.040° through a 98-unit yoke slot; the sampled minimum end clearance is 0.3852 units and the unloaded side has 0.6 units clearance.

## Commands

From the repository root:

```sh
node web/src/anatomy/build.mjs --audit
node web/src/anatomy/contacts-check.mjs
cd web && npx tsc --noEmit -p .
```

`build.mjs` reconstructs 1,801 model frames for solid collision checks and 451 poses for wire / thin-link clearance and depth order, solves `order.json`, then runs the kit audit and builds both standalone HTML themes. The checks use the actual shapes and the same pose functions as the renderer. Conservative world/screen bounds skip only geometrically disjoint pairs; unchanged depth pairs reuse previously measured constraints. The 0.3-radius payout link also gets the kit's stricter tube check, because the ordinary solid audit's 0.5 penetration threshold can miss it crossing a thin carriage tab. Only that link's own material is omitted from its self-comparison. No kit tolerances or collision allowlists were changed.

The cycle latch and bell trip wire pass through real guide bores. Route gaps delimit those fitted guides for the kit's free-wire clearance check; the contact checker measures the full wire against each guide, and the motion checker tests the full wires for penetration. Annular joints and concave sheet profiles are split into their actual surfaces for painter order. An area assertion guards the polygon splits.

## Current verification status

- Current static audit: **audit passed**, zero problems in every category (`shots/static-audit-work-12.txt`).
- Full motion audit: running; `shots/audit-final.txt` is not yet a passing result.
- Contact check: **contacts: 0 problems**, 199 parts / 252 declared mounts / 199 drive entries (`shots/contacts-final.txt`).
- TypeScript: exit 0 after the latest geometry and autoplay changes.
- Working-preview autoplay (`shots/autoplay-work-10.txt`): six-second hover advanced 0.960 → 7.972 and changed the readout; arrow input resumed 8.998 → 9.707; drag resumed 15.773 → 16.539; fully offscreen time/frame count held at 16.682 / 225 for 2.5 s; 30 visible pixels resumed 16.682 → 17.638; loop wrapped 28.653 → 0.263. Browser console clean.
- Final standalone line checks, final viewport captures, reduced-motion proof, slowed sheets and both-theme junction close-ups remain pending.

## Behavior and scope

The figure starts and loops while any part of its stage is visible. Hover and focus do not pause. Only a drag past the small movement threshold or an arrow key takes over; autoplay resumes about two seconds after the last input. The visible readout always follows the model. Reduced motion advances discretely through STOPS, holding each for about three seconds. The hint is “Plays on its own · drag to scrub”.

This is an illustrative kinematic model, not a force/friction simulation or manufacturing drawing. It does not fetch chain data, sign transactions, make payouts, write SQLite or send alerts. The immutable model retains “files a receipt and raises an alert” and “receipt filed · alert raised”.

Browser verification uses Chromium. Safari, Firefox, physical touch hardware and deployment are not checked. No audio, exploded view, new control panel or speculative live-data interface was added.

## Rework stopped early (16 Oct, 23:50 UTC)
The 199-part rework was stopped by the user before its final checks finished.
- Verified: `contacts-check.mjs` prints `contacts: 0 problems` (shots/contacts-final.txt); gears ≤ 5.2 teeth/s; carriage pin stays in its yoke over the full travel; targeted motion/depth check passed 29 poses; typecheck passes; autoplay runs while hovered (11.8 → 17.0 s in 5 s, browser).
- Not verified: the full `--audit` run (interrupted at 3.25/30 s; the previous full run failed on a link depth order that was then fixed), `lines.mjs` on both themes, close-ups and contact sheets. `punch-clock.html` / `punch-clock-light.html` are stale (first figure) until `build.mjs` is rerun.
