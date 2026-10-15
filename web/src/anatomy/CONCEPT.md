# Night-shift punch clock

## 1. Size and scope — 2026-10-15 16:55 UTC

HERO, 80–150 physical parts, approximately 2–4 hours. First browser page inside one hour. Own only `web/src/anatomy/**`; no commits and no integration edits. Build the supplied punch-clock idea from scratch, with the user's chosen Anatomy kit (MIT). No previous attempt is an input.

Goal: a recognisable working time clock that explains reward claiming without labels pasted on boxes. Acceptance: one exported React `PunchClock`, pure model, calm accessible motion, dark/light pages, passing geometry/line audits, inspected desktop/phone/motion/junction PNGs, and passing project typecheck. Non-goals: chain connection, wallet actions, monetary estimates, shaders, sound, pause/replay controls, and an exploded view. The permanent cutaway already shows the mechanism; disassembly adds no explanatory value.

## 2. Truth before geometry — 2026-10-15 16:56 UTC

Read `docs/ARCHITECTURE.md` and `docs/HARDENING-LOG.md`. Keeper eligibility excludes the unfinished era and requires reward/exposure/points; the queue prioritises earliest expiry, signs one payout at a time with a small hot key, and counts only finalized reward events. Receipt storage is SQLite and the committed alert channel is Telegram. No stash/controller key touches the box. The successful legacy test used a third-party signer, then a duplicate payout failed with AlreadyClaimed. This drawing explains that successful whole-era path; it does not certify V3, wallet flows, deployment, live payouts, or all failure recovery.

User-supplied timing: 60 seconds per block, 6 sessions per era, 2 hours per session, 12 hours per era. HistoryDepth is 84 eras (also in the architecture). These are illustrative runtime parameters, not fresh network measurements. `model.ts` owns them, every visible numerical string, the dial divisions, claim states, and the tour. Time is deliberately compressed for explanation. No invented chain era, balance, fee, reward amount, or expiry timestamp is displayed. Coin count is symbolic, never a payout ratio.

An expiry is a separate missed-claim example, clearly named in the readout/caption. A newly closed era produces an unpunched card; an eligible card is armed, punched, paid and filed. A separate old card crosses the history boundary and falls out. This does not depict expiry as the keeper's normal schedule. Ordinary tour readouts explicitly say `Model`.

## 3. Object — 2026-10-15 16:56 UTC

Keep the NIGHT-SHIFT PUNCH CLOCK: one 12-hour hand closes a shift, a card enters the rack, the keeper key arms its punch, and the punched claim releases two payout paths before filing into a receipt drawer and ringing a bell.

One-to-one mapping:

- Side ticker tape and feed rollers = blocks arriving over P2P.
- Large shift dial, six session divisions = 6 × 2 hours per era.
- Unpunched cards in a real louvred rack = claims for closed eras.
- Open bottom/ejection slot and falling old card = rewards missed beyond 84 eras.
- Small key in an exposed lock/cam = keeper's low-balance signer.
- Larger key on its own outside hook, permanently stationary = operator stash.
- Punch marker plus forked coin chute into two trays = one payout_stakers pays validator and nominators (symbolic coins, not an equal-share promise).
- Shallow drawer of punched cards plus mechanical bell = SQLite receipts and Telegram alert.

The clock is the primary silhouette; the rack is attached to its base, not a separate diagram. A rounded hood, dial bezel, card throat and plinth identify it at 1×. The missing front/lower side panel exposes the real support and power train at 4×. No arrows, callouts or words in the drawing except one tiny engraved maker plate.

## 4. Parts list BEFORE geometry — 2026-10-15 16:57 UTC

Target 126 solids, with screws/scale/knurl details attached to their parent parts (not inflated into the solid count). Final count is reported by the build. Small dimensional changes are allowed to solve contacts and painter order.

### Base and case (1–24)
1–4 rubber feet; 5–8 foot collars; 9 cast plinth; 10 inset plinth deck; 11 rear arched casing; 12 left cheek; 13 right cutaway sill; 14 front lower sill; 15 crown hood; 16 left case bead; 17 right case bead; 18 rear cross brace; 19 mechanism bed; 20 dial support bridge; 21–22 hinge barrels; 23 maker plate; 24 service latch.

### Clock and time feed (25–49)
25 clock drum; 26 rear rim; 27 front bezel; 28 enamel dial; 29 hand; 30 hub; 31 winding crown stem; 32 knurled winding crown; 33 drive bearing; 34 drive axle; 35 main wheel; 36 intermediate bearing; 37 intermediate axle; 38 intermediate wheel; 39 escapement bearing; 40 escapement wheel; 41 tape port lower lip; 42 tape port upper lip; 43–44 feed roller brackets; 45 feed roller; 46 pressure roller; 47 ticker tape; 48 tape spool flange; 49 tape spool core.

### Punch and keeper (50–74)
50–51 upright punch standards; 52 punch bridge; 53 lower die; 54 platen; 55–56 card guides; 57 guide sleeve; 58 punch stem; 59 punch shoe; 60 return spring; 61 spring seat; 62 cam axle; 63 cam wheel; 64 linkage; 65 linkage pivot; 66 keeper lock boss; 67 lock face; 68 small key shaft; 69 small key bow; 70 small key bit; 71 punch card; 72 punch hole/claim marker; 73 carrier rail; 74 carrier stop.

### Card rack and expiry (75–96)
75 rack rear board; 76–77 rack feet; 78–79 outer stiles; 80–86 seven pocket ledges; 87–92 six other cards at different ages; 93 active card guide; 94 ejection throat; 95 expired card; 96 bottom catch lip. Seven visible pockets schematically represent the rolling history; never claim that seven pockets are 84 literal slots.

### Payout path and receipts (97–118)
97 splitter apex; 98–99 chute floors; 100–103 chute rails; 104–105 chute brackets; 106–107 tray floors; 108–111 tray front/back walls; 112–115 tray side walls; 116–117 symbolic payout coins; 118 receipt drawer assembly (floor, sides and front are individually counted in the final build if split for occlusion).

### Bell and outside stash key (119–132)
119 drawer pull; 120 receipt card stack; 121 bell pedestal; 122 bell stem; 123 bell dome; 124 striker arm; 125 striker head; 126 outside hook foot; 127 hook post; 128 hook arm; 129 hook pin; 130 stash key bow; 131 stash key shank; 132 stash key bit.

All stationary parts have a contact path to the plinth. Moving paper/coins are intentionally free during their transit. Bearings meet shaft ends; sleeves split exposed shaft segments; chutes support coins and lead into actual trays. Case walls are physical solids with open cutaway boundaries, never transparent wireframes. Only the card/punch contact has the lit accent.

## 5. World plan — completed

Floor x/y, z upward. Time clock occupies the left/centre; rack stands at the right; payout trays sit forward; the stash hook is isolated outside on the left. Camera looks at the front and cutaway side, with modest elevation to reveal the trays. Rounded plans, real thickness, bevels, four-tone kit shading. Use `fitProjection` and measured painter ordering with true recorded shapes. No blanket audit exclusions.

## 6. Geometry — completed

The final machine has 141 physical parts: 140 solids and one helical return spring, split into 50 drawing chunks for correct occlusion (190 paint items total). The final camera is azimuth 65°, elevation 23°, fitted into a 760 × 590 viewBox. The lower camera makes the clock face, punch and rack legible together. Five visible pockets and four retained cards replace the planned seven pockets; they represent the history schematically. The drawer is split into its actual floor, walls, pull and paper stack. Mounts and spring seats account for the remaining parts.

Static geometry is computed in plain TypeScript using the copied, intact MIT kit. Concave gear teeth and the curved case have their true polygon outlines; the bell uses an analytic profile; the spring is a real helix. The rod is `G.rodOut` recorded as `A.slide`, with its clip fixed at the gland. Only rotating keys/coins and the deforming spring rebuild their paths, and only when their input changes.

## 7. Painter order — completed

`A.recorder` records the actual geometry, `A.settle` solves rest order, and the same kit's overlap/order solver extends that solution across 451 model poses. Each paint frame uses those solved keys plus the actual depth displacement. The original rest-only solution failed in motion; it was replaced by the complete solve. No hand-tuned depth bias, allowed collision pair or stand-in audit shape is used. The 1,801-frame clearance sweep includes cards, both coin paths, rotating key parts and the sliding rod; the spring is checked through its stroke.

## 8. Frame — completed

Fig 1 / Night shift / interaction hint / model readout occupy the four corners, with keys and a factual caption below. The drawing contains only the tiny PORTALNODE maker engraving. Dark ships on #0a0a0b, with #efe9dc ink and one #ffb000 claim-card accent. The light theme is built from the same component. At 390 pixels the bottom corners stack without overlapping.

## 9. Motion — completed

The 30-second model loop sweeps a shift, drops a new claim into the rack, transfers it to the punch, turns the keeper key, punches and releases two symbolic coins, files the receipt, rings the bell, and shows a separate missed-claim expiry. The outside stash key is never in a motion group. Paper paths first withdraw clear of their guides, then move vertically; the return spring and fixed gland remain seated.

Pointer drag scrubs the model; a click or arrow key advances a meaningful stop; Home/End select the ends. Interaction holds the tour, which resumes after quiet time. It stops offscreen and stays still under reduced motion while remaining input-responsive. The live readout and accessible slider text use the same model instant. No pause/replay controls or sound.

## 10. Verification — completed 2026-10-15

The first working browser page was captured at approximately 17:11 UTC, within the first hour. Final audit: zero on every failing line, plus zero physical intersections over 1,801 frames and zero depth errors over 451 poses. Both final standalone pages pass `lines.mjs`; all ten keyboard stops and receipt transit pass the line check in both themes. Desktop 1440, phone 390, full figures including captions, hover, motion moments, a punch travel sheet and every junction region at 4× were captured and read. Pointer, keyboard, idle loop, offscreen stop/resume and reduced-motion checks passed. Project TypeScript checking passed. See NOTES.md for commands, evidence and limits.
