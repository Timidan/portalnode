# Night-shift punch clock — implemented mechanism

## Scope

Phase 2 implements the accepted mechanical chain and the four review corrections in `web/src/anatomy/**`. The inventory is **199 physical parts**, under the accepted 203-part ceiling. Separate paint chunks retain a shared physical ID; teeth, cam sectors, tube segments, integral bosses and folded flanges are not extra physical parts. Fastener heads have named seats. `geometry.ts` exports the actual `MOUNTS` and `DRIVES` arrays used by the check and by the table below.

No dependencies, commits, application integration, live chain data, transactions, audio or messaging were added. `model.ts`, its timings/envelopes/STOPS/text, the `iso/` copy, `build.mjs`, and the `PunchClock` export/props remain unchanged. In particular, the captions retain **"files a receipt and raises an alert"** and **"receipt filed · alert raised"**.

## Why the old audit passed all eight defects

The actual `iso/audit.mjs` support test builds an undirected proximity graph from sampled shape surfaces (`touch = 0.15`, solid sinking threshold `0.5`), rooted at every `stand.*` shape. It does not require a particular contact face, fastened joint, two shaft bearings, or torque path. The build applies that test to the rest pose; the motion harness checks intersections and painter order, not mounting or drive continuity. Tube terminal checks see only recorded tubes; here the only route is the return spring.

1. **Unmeshed gears / floating shaft ends:** rear bearings touch `case.back`, so bearing → shaft → wheel passes the proximity graph although no front plate, pitch-circle tangency, tooth phasing or drive to the hand is tested.
2. **Tape post / no feed into case:** spool brackets and port parts can reach the case through contacts while `tape.paper` ends at the outer cheek and only its print moves; the audit requires neither a base flange, continuous paper through the slot, nor driven rollers.
3. **Coin bars / pyramid pole / floating outlet:** the existing floor-and-rail prisms can connect at their upper ends even if an outlet floats; the audit does not require a usable open channel or punch → hopper → fork → tray continuity, and the independent coin path is only collision-tested.
4. **Dangling rack rod / unsupported card transfer:** `punch.carrier` touches `punch.die-post` at one end and its stop at the other, satisfying support; `cardOffset` moves paper independently and no carriage or supported handoff is required.
5. **Hanging drum:** the drum's flat rear cap touches `case.back`, satisfying proximity without a bracket, standoff, clamping fastener or inspectable load-bearing attachment.
6. **Useless base-box shaft:** the visible assembly is `keeper.boss` / `keeper.lock` / `keeper.key-shaft`, not an additional named drive axle; its boss touches the front sill and the audit never asks whether the key drives an arming linkage.
7. **Stash ring beside hook:** the recorded pin already has nominal inner-rim tangency (pin radius 1.7 + centre offset 2.6 = bow inner radius 4.3), so the support graph accepts it; it does not verify a visibly engaged hanging joint or a retaining hook tip, which the reviewed drawing fails to communicate.
8. **Splitter post in front of drawer:** `splitter.foot` → `splitter.post` → `splitter.head` reaches the deck, but support/clearance checks require neither a feed from the punch nor a functional location clear of the drawer opening.

## A. Visible chain and dimensions

Tape unwinds from a mounted spool, passes through the cheek slot and paired rollers into a paper well; the feed shaft turns four meshing wheels and the dial arbor; that arbor winds a visible spring whose released barrel/cam opens the rack gate and drives the rail carriage; the keeper key turns a crank/link/dog coupling, letting the cam rocker punch the carried card; the full stroke releases the coin latch, the payout gate sends the coins through the hopper/common channel and opposite vane sides into two branch troughs/trays; the carriage files the marked card and its terminal ramp pulls the bell trip link; a separate guided bottom gate drops the missed-claim card onto a stop.

The tape is the first external input; the keeper key is the second. The other visible motions are prescribed kinematics from `modelAt`, including gravity on recorded guide surfaces and elastic release. There is no force/friction simulation. Reverse scrubbing reconstructs the same geometry without event accumulation.

### Ratios and tooth aliasing correction

Four **24-tooth involute gears**, module **1.5**, pressure angle **20°**, pitch radius **18**, root radius **16.125** and tip radius **19.5**, form three meshes. Every centre distance is **36**. The first three centres are horizontally aligned at `(-64,136), (-28,136), (8,136)` in X/Z; the output is above them at `(8,172)`. All teeth share one 3-unit face plane behind the tape rollers between two skeletal bearing plates with open fork seats beneath closed flanged bearings, with a real front/rear bearing on every shaft. The train is moved behind the punch to expose the meshes through the open-centred dial and plate windows.

Each mesh is **−1:1**, total **−1:1**. Angles are `[−θ, θ+π/24, −θ, θ+π/24]`, with `θ=2π*m.shift`; the dial hand turns `θ`. The half-tooth base phases interleave teeth at both horizontal and vertical contact rays. The output hand makes exactly one sweep in the unchanged 0–7 s era interval.

Both nip rollers have radius **4** and the nip is **0.30** wide. Tape advance per symbolic block is **p = 2π×4/720 = π/90 ≈ 0.0349066 units**. Because `m.tape=720*m.shift`, one roller revolution advances one era and turns the hand once. The radius-11 supply spool rotates by `−(4/11)θ`. Tape markings visibly translate along the paper through the nip.

The unchanged smoothstep shift has maximum derivative **1.5/7 per second**. Each toothed wheel therefore peaks at **24×1.5/7 = 5.142857 teeth/s**, below 15. Maximum travel per 60 Hz frame is **0.085714 tooth pitches**, below 0.25. The check samples the motion, includes the analytic derivative bound, and prints the resulting maximum rates for all four gears.

### Service spring, followers and carriage reach

The winding arbor engages the spiral spring's inner tang; its outer tang seats in the open barrel. The release cam/latch holds the barrel during the era, releases it at 7 s and catches its home notch at the end. A spring pawl with a rounded contact tip holds the stopped output wheel. The release latch passes through a fitted fulcrum on the carriage pivot. The service cam makes one revolution over 7–30 s, with short eased acceleration/deceleration intervals. Five real grooves contain followers for the carriage, rack release, punch rocker, payout gate and expiry gate. Grooves and bores are actual removed geometry in the recorded solids; annular SVG surfaces leave the openings visible.

The carriage's rail runs from drawer **(-90,88,100)** to rack **(110,88,166)**, length **210.609**. Its level card seat reaches the die at station 0.5. One lever is journalled on a rigid offset support attached to the front bearing plate's integral lug. The support passes outside the hand's radius before returning to the lever axis: pivot **(8,74,162)**, length **128**, total swing **112.040°**. Its radius-1 pin enters the shoe's **98-unit** yoke slot, running from −101 to −3 along the rail normal; slot width is **2.6**. The minimum end clearance is **0.3852**, and the unloaded side has **0.6** clearance while the other side transmits the drive. A short lost-motion take-up reverses the driving face at era close and reset. The contacts check measures the actual pin and cut slot at all requested sample times and handoffs.

The card falls through its rack guide onto the carriage by 9.5 s, travels to the die over 10–12.5 s, dwells while armed/punched, then travels to the drawer over 20–22.5 s. The drawer guide strips it off the shoe over 22.5–23 s; the empty shoe resets over 28–30 s. The punch mark is at the actual die height and appears at the unchanged 16 s model event.

The rack gate retracts behind the card through a slot across its guide. The punch cam link rises to Z=185.5 while crossing the carriage path, then drops to its rocker slot; its lift leaves the passing card clear of the linkage. The payout link runs from its follower at Y=105 to its lower eye at Y=95, in front of the carriage, with a full-length pin through the lower eye.

### Coin and bell contacts

Coins roll on edge, radius **5.3**, on continuously downhill floors. The X/Z floor segments are magazine `(10,80)→(22,68)`, hopper `→(36,58)`, common trough `→(50,51)`, and branch outlets `(100,2)` / `(148,2)`. Hermite endpoint heights and tangents agree at every seam; sampled polygons and coin paths share those surfaces. The common channel and two branches have floors and low near/far walls; the fork vane separates the two lanes. Branch cradles meet the actual sloped undersides, and the outlets meet the tray floors. Both coins finish within 17.5–20.5 s. The check samples exact contact-point seam times and measures both adjacent floors.

The carriage's terminal ramp displaces the guided bell trip wire. Its upper end loads the spring striker leaf seated on the bell stem; release lets the head contact the dome and rebound. The saddle is fitted to the drum crown. The outside stash key hangs by its inner bow on an upturned retaining hook and never drives the punch.

## B. Actual mount/drive table

Each physical part occurs once below. Mount faces and active intervals come directly from `MOUNTS`; multiple rows for bearings, spring ends and handoffs are joined in the cell. `static` means no model motion. The last column lists parts mounted on or driven by this part. Numbers in brackets are tour seconds. An integral sub-piece before `@` selects that finite surface of the same physical part. Only `stand.plinth` is the root.

| Part | Mounted on: part / contact face | Driven by | Drives / touches |
|---|---|---|---|
| `stand.foot.0` | stand.plinth (top → bottom) | static | named mount face |
| `stand.foot.1` | stand.plinth (top → bottom) | static | named mount face |
| `stand.foot.2` | stand.plinth (top → bottom) | static | named mount face |
| `stand.foot.3` | stand.plinth (top → bottom) | static | named mount face |
| `stand.plinth` | root | static | stand.deck, stand.foot.0, stand.foot.1, stand.foot.2, stand.foot.3 |
| `stand.deck` | stand.plinth (bottom → top) | static | case.back, case.cheek, case.cut-sill, case.front-sill, case.maker-plate, tape.spool-anchor, rack.foot.left, rack.foot.right, tray.0.floor, tray.1.floor, receipt.foot.left, receipt.foot.right, stash.foot, chute.0.bracket, chute.1.bracket |
| `case.back` | stand.deck (bottom → top) | static | clock.standoff.left, clock.standoff.right, fix.drum.0, fix.drum.1 |
| `case.cheek` | stand.deck (bottom → top) | static | tape.port.lower, tape.port.upper, tape.bracket.22, bell.trip-link |
| `case.cut-sill` | stand.deck (bottom → top) | static | named mount face |
| `case.front-sill` | stand.deck (bottom → top) | static | case.bed |
| `case.bed` | case.front-sill (bottom → top) | static | train.plate.rear, train.plate.front, tape.well, punch.mount.left, punch.mount.right |
| `case.maker-plate` | stand.deck (bottom → top) | static | fix.maker.0, fix.maker.1 |
| `clock.standoff.left` | case.back (start → front) | static | clock.drum |
| `clock.standoff.right` | case.back (start → front) | static | clock.drum |
| `clock.drum` | clock.standoff.left (start → end); clock.standoff.right (start → end) | static | clock.bezel, bell.saddle |
| `clock.bezel` | clock.drum (start → end) | static | clock.face |
| `clock.face` | clock.bezel (start → end) | static | named mount face |
| `clock.hub` | gear.2.shaft (bore → outer) | gear.2.shaft: keyed | clock.hand |
| `clock.hand` | clock.hub (start → end) | clock.hub: keyed | named mount face |
| `train.plate.rear` | case.bed (bottom → top) | static | train.spacer.upper, train.spacer.lower, tape.bearing, gear.0.bearing, gear.1.bearing, gear.2.bearing |
| `train.plate.front` | case.bed (bottom → top); train.spacer.upper (start → end); train.spacer.lower (start → end) | static | tape.front-bearing, gear.0.front-bearing, gear.1.front-bearing, gear.2.front-bearing, carriage.pivot, fix.plate.0, fix.plate.1, cycle.hold-pawl |
| `train.spacer.upper` | train.plate.rear (start → end) | static | train.plate.front |
| `train.spacer.lower` | train.plate.rear (start → end) | static | train.plate.front |
| `tape.bearing` | train.plate.rear (end → start) | static | tape.shaft |
| `tape.front-bearing` | train.plate.front (start → end) | static | tape.cap, tape.shaft |
| `tape.shaft` | tape.bearing (outer → bore); tape.front-bearing (outer → bore) | tape.feed-roll: keyed | tape.feed-roll, tape.pinion |
| `tape.pinion` | tape.shaft (bore → outer) | tape.shaft: keyed | gear.0.wheel |
| `tape.cap` | tape.front-bearing (start → end) | static | named mount face |
| `gear.0.bearing` | train.plate.rear (end → start) | static | gear.0.shaft |
| `gear.0.front-bearing` | train.plate.front (start → end) | static | gear.0.cap, gear.0.shaft |
| `gear.0.shaft` | gear.0.bearing (outer → bore); gear.0.front-bearing (outer → bore) | gear.0.wheel: keyed | gear.0.wheel |
| `gear.0.wheel` | gear.0.shaft (bore → outer) | tape.pinion: mesh -1:1 | gear.0.shaft, gear.1.wheel |
| `gear.0.cap` | gear.0.front-bearing (start → end) | static | named mount face |
| `gear.1.bearing` | train.plate.rear (end → start) | static | gear.1.shaft |
| `gear.1.front-bearing` | train.plate.front (start → end) | static | gear.1.cap, gear.1.shaft |
| `gear.1.shaft` | gear.1.bearing (outer → bore); gear.1.front-bearing (outer → bore) | gear.1.wheel: keyed | gear.1.wheel |
| `gear.1.wheel` | gear.1.shaft (bore → outer) | gear.0.wheel: mesh -1:1 | gear.1.shaft, gear.2.wheel |
| `gear.1.cap` | gear.1.front-bearing (start → end) | static | named mount face |
| `gear.2.bearing` | train.plate.rear (end → start) | static | gear.2.shaft |
| `gear.2.front-bearing` | train.plate.front (start → end) | static | gear.2.cap, gear.2.shaft |
| `gear.2.shaft` | gear.2.bearing (outer → bore); gear.2.front-bearing (outer → bore) | gear.2.wheel: keyed | clock.hub, cycle.barrel, gear.2.wheel, cycle.power-spring, cycle.release-cam |
| `gear.2.wheel` | gear.2.shaft (bore → outer) | gear.1.wheel: mesh -1:1 | cycle.hold-pawl, gear.2.shaft |
| `gear.2.cap` | gear.2.front-bearing (start → end) | static | named mount face |
| `cycle.barrel` | gear.2.shaft (bore → outer) | cycle.power-spring: elastic return | cycle.cam, cycle.power-spring |
| `cycle.cam` | cycle.barrel (cycle.cam@end → start) | cycle.barrel: keyed | cycle.follower.1, cycle.follower.2, cycle.follower.3, cycle.follower.4, carriage.lever, cycle.latch |
| `cycle.power-spring` | gear.2.shaft (edge:481 → outer); cycle.barrel (edge:240 → cycle.barrel.rim@bore) | gear.2.shaft: elastic winding | cycle.barrel |
| `carriage.lever` | carriage.pivot (hole → carriage.pivot.journal@outer); cycle.cam (cycle.follower.0@outer → groove) | cycle.cam: captured groove | carriage.shoe |
| `cycle.follower.1` | cycle.cam (outer → groove) | cycle.cam: captured groove | rack.release-link |
| `cycle.follower.2` | cycle.cam (outer → groove) | cycle.cam: captured groove | punch.cam-link |
| `cycle.follower.3` | cycle.cam (outer → groove) | cycle.cam: captured groove | punch.coin-gate.link |
| `cycle.follower.4` | cycle.cam (outer → groove) | cycle.cam: captured groove | rack.expiry-link |
| `tape.port.lower` | case.cheek (bottom → hole) | static | named mount face |
| `tape.port.upper` | case.cheek (top → hole) | static | named mount face |
| `tape.feed-roll` | tape.shaft (bore → outer) | tape.paper: nip | tape.paper, tape.shaft |
| `tape.pressure-roll` | tape.pressure-shaft (bore → outer) | tape.paper: nip | tape.paper, tape.pressure-shaft |
| `tape.pressure-shaft` | tape.bracket.-10 (outer → bore); tape.bracket.22 (outer → hole) | tape.pressure-roll: keyed | tape.pressure-roll |
| `tape.bracket.-10` | tape.bracket.22 (tape.bracket.-10.arm@front → back) | static | tape.pressure-shaft |
| `tape.bracket.22` | case.cheek (left → right) | static | tape.bracket.-10, tape.pressure-shaft |
| `tape.paper` | tape.feed-roll (edge:0 → outer); tape.pressure-roll (upper-profile → outer); tape.spool.core (edge:0 → outer) | external:tape: input | tape.feed-roll, tape.pressure-roll, tape.spool.core |
| `tape.inner-guide` | tape.well (bottom → top) | static | named mount face |
| `tape.well` | case.bed (bottom → top) | static | tape.inner-guide |
| `tape.spool-anchor` | stand.deck (bottom → top) | static | tape.spool-bracket, fix.tape.0, fix.tape.1 |
| `tape.spool-bracket` | tape.spool-anchor (bottom → top) | static | tape.spool-upright |
| `tape.spool-upright` | tape.spool-bracket (tape.spool-upright.base@bottom → top) | static | tape.spool-shaft |
| `tape.spool-shaft` | tape.spool-upright (outer → hole); tape.spool-upright (outer → tape.spool-upright.front@hole) | tape.spool.core: keyed | tape.spool.core |
| `tape.spool.core` | tape.spool-shaft (bore → outer) | tape.paper: unwind | tape.spool.flange, tape.paper, tape.spool-shaft |
| `tape.spool.flange` | tape.spool.core (start → end) | tape.spool.core: keyed | named mount face |
| `rack.foot.left` | stand.deck (bottom → top) | static | rack.back |
| `rack.foot.right` | stand.deck (bottom → top) | static | rack.back |
| `rack.back` | rack.foot.left (bottom → top); rack.foot.right (bottom → top) | static | rack.stile.left, rack.stile.right, rack.pocket.0, rack.pocket.1, rack.pocket.2, rack.pocket.3, rack.pocket.4, rack.expiry-lip |
| `rack.stile.left` | rack.back (back → front) | static | punch.carrier |
| `rack.stile.right` | rack.back (back → front) | static | named mount face |
| `rack.pocket.0` | rack.back (back → front) | static | rack.card.0, rack.expiry-guide |
| `rack.card.0` | rack.pocket.0 (bottom → top) | static | named mount face |
| `rack.pocket.1` | rack.back (back → front) | static | rack.card.1 |
| `rack.card.1` | rack.pocket.1 (bottom → top) | static | named mount face |
| `rack.pocket.2` | rack.back (back → front) | static | rack.card.2 |
| `rack.card.2` | rack.pocket.2 (bottom → top) | static | named mount face |
| `rack.pocket.3` | rack.back (back → front) | static | rack.card.3 |
| `rack.card.3` | rack.pocket.3 (bottom → top) | static | named mount face |
| `rack.pocket.4` | rack.back (back → front) | static | rack.top-guide, rack.release-pivot |
| `rack.top-guide` | rack.pocket.4 (bottom → top) | static | punch.card |
| `rack.release-pivot` | rack.pocket.4 (start → rack.pocket.4.pivot-pad@top) | static | rack.release-lever |
| `rack.release-lever` | rack.release-pivot (hole → outer) | rack.release-link: pivoted gate | rack.release-link |
| `rack.expiry-guide` | rack.pocket.0 (back → front) | static | rack.expiry-gate, rack.expired-card |
| `rack.expiry-gate` | rack.expiry-guide (back → front) [0–25]; rack.expiry-link (rack.expiry-gate.pin@outer → rack.expiry-link.eye.1@bore) [25–30] | rack.expiry-link: sliding gate | rack.expiry-link, rack.expired-card |
| `rack.expiry-lip` | rack.back (back → front) | static | fix.rack.0, fix.rack.1 |
| `rack.expired-card` | rack.expiry-guide (back → front) [0–29.3] | rack.expiry-gate: gravity in guide | named mount face |
| `punch.mount.left` | case.bed (back → front) | static | punch.left-foot, fix.punch.0 |
| `punch.mount.right` | case.bed (back → front) | static | punch.right-foot, fix.punch.1 |
| `punch.left-foot` | punch.mount.left (bottom → top) | static | punch.standard.left |
| `punch.right-foot` | punch.mount.right (bottom → top) | static | punch.standard.right |
| `punch.standard.left` | punch.left-foot (bottom → top) | static | punch.bridge |
| `punch.standard.right` | punch.right-foot (bottom → top) | static | punch.bridge, keeper.boss, punch.coin-magazine, splitter.yoke, punch.coin-latch |
| `punch.bridge` | punch.standard.left (left → right); punch.standard.right (right → left) | static | punch.die-post, punch.sleeve-mount, punch.rocker-pivot |
| `punch.die-post` | punch.bridge (top → bottom) | static | punch.die |
| `punch.die` | punch.die-post (start → front) | static | named mount face |
| `punch.sleeve` | punch.sleeve-mount (outer → lower-profile) | static | punch.gland, keeper.dog, punch.rod |
| `punch.gland` | punch.sleeve (start → end) | static | punch.spring-seat |
| `punch.sleeve-mount` | punch.bridge (top → bottom) | static | punch.sleeve |
| `punch.rod` | punch.sleeve (punch.rod.inner@outer → bore) | punch.rocker: engaged dog | punch.shoe, keeper.dog, punch.return-seat |
| `punch.shoe` | punch.rod (start → punch.rod@end) | punch.rod: keyed | punch.return-seat |
| `punch.spring-seat` | punch.gland (start → end) | static | return-spring |
| `punch.return-seat` | punch.shoe (end → start) | punch.rod: keyed | punch.coin-latch, return-spring |
| `punch.card` | rack.top-guide (back → front) [0–9.5]; carriage.shoe (bottom → carriage.seat-tab.0@top) [9.5–22.5]; receipt.floor (bottom → top) [22.5–30]; receipt.stack (front → back) [23–30] | carriage.shoe: guided handoffs | named mount face |
| `punch.carrier` | rack.stile.left (edge:0 → rack.rail-cradle@edge:2); receipt.foot.left (edge:0 → receipt.rail-cradle@edge:2) | static | punch.carrier-stop, fix.rail.0, fix.rail.1, carriage.shoe |
| `punch.carrier-stop` | punch.carrier (edge:0 → edge:2) | static | named mount face |
| `carriage.shoe` | punch.carrier (carriage.shoe@profile → profile); carriage.lever (carriage.yoke@hole → carriage.pin@outer) | carriage.lever: pin in yoke | bell.trip-link, punch.card |
| `carriage.pivot` | train.plate.front (start → train.plate.front.lug@end) | static | carriage.lever, cycle.fulcrum |
| `cycle.fulcrum` | carriage.pivot (cycle.fulcrum.base@lower-profile → outer) | static | cycle.latch |
| `keeper.boss` | punch.standard.right (start → front) | static | keeper.lock, keeper.key-shaft |
| `keeper.lock` | keeper.boss (start → end) | static | named mount face |
| `keeper.key-shaft` | keeper.boss (outer → bore) | external:key: input | keeper.key-bow, keeper.key-bit, keeper.crank |
| `keeper.key-bow` | keeper.key-shaft (outer → end) | keeper.key-shaft: keyed | named mount face |
| `keeper.key-bit` | keeper.key-shaft (edge:3 → outer) | keeper.key-shaft: keyed | named mount face |
| `keeper.crank` | keeper.key-shaft (bore → outer) | keeper.key-shaft: keyed | keeper.link |
| `keeper.link` | keeper.crank (hole → keeper.crank.pin@outer); keeper.dog (hole → keeper.dog.pin@outer) | keeper.crank: pinned link | keeper.dog |
| `keeper.dog` | punch.sleeve (bottom → punch.sleeve.guide.lower@top); punch.rod (back → punch.rod.rear@end) [14.5–20]; punch.rocker (front → punch.rocker.nose@outer) [14.5–20] | keeper.link: sliding dog | keeper.link |
| `punch.rocker-pivot` | punch.bridge (punch.rocker-pivot.bracket@back → front) | static | punch.rocker |
| `punch.rocker` | punch.rocker-pivot (hole → outer) | punch.cam-link: 4:12 rocker | punch.cam-link, keeper.dog, punch.rod |
| `punch.cam-link` | cycle.follower.2 (punch.cam-link.root@hole → outer); punch.rocker (punch.cam-link.yoke@hole → punch.rocker.pin@outer) | cycle.follower.2: captured slot | punch.rocker |
| `punch.coin-magazine` | punch.standard.right (punch.coin-magazine.mount@right → left) | static | hopper.floor, punch.coin-gate, coin.0, coin.1 |
| `punch.coin-gate` | punch.coin-magazine (hole → punch.coin-gate.pivot@outer) | punch.coin-gate.link: latched gate | punch.coin-gate.link, punch.coin-latch, coin.0, coin.1 |
| `rack.release-link` | cycle.follower.1 (rack.release-link.eye.0@bore → outer); rack.release-lever (rack.release-link.eye.1@bore → rack.release-lever.pin@outer) | cycle.follower.1: pinned link | rack.release-lever |
| `punch.coin-gate.link` | cycle.follower.3 (punch.coin-gate.link.eye.0@bore → outer); punch.coin-gate (punch.coin-gate.link.eye.1@bore → punch.coin-gate.pin@outer) | cycle.follower.3: pinned link | punch.coin-gate |
| `rack.expiry-link` | cycle.follower.4 (rack.expiry-link.eye.0@bore → outer); rack.expiry-gate (rack.expiry-link.eye.1@bore → rack.expiry-gate.pin@outer) | cycle.follower.4: pinned link | rack.expiry-gate |
| `punch.coin-latch` | punch.standard.right (lead:start → front); punch.return-seat (punch.coin-latch.upper@lead:end → start); punch.standard.right (punch.coin-latch.lower@lead:start → front); punch.coin-gate (punch.coin-latch.lower@lead:end → hole) [0–15.95]; punch.coin-gate (punch.coin-latch.lower@lead:end → hole) [30–30] | punch.return-seat: trip and catch | named mount face |
| `cycle.latch` | cycle.release-cam (lead:start → outer); cycle.fulcrum (profile → bore); cycle.cam (lead:end → profile) [0–7]; cycle.cam (lead:end → profile) [30–30] | cycle.release-cam: trip and catch | named mount face |
| `cycle.hold-pawl` | train.plate.front (lead:start → end); gear.2.wheel (cycle.hold-pawl.tip@outer → profile) | gear.2.wheel: elastic ratchet | named mount face |
| `cycle.release-cam` | gear.2.shaft (hole → outer) | gear.2.shaft: keyed | cycle.latch |
| `hopper.floor` | punch.coin-magazine (left → right) | static | trough.common.floor, hopper.far-wall, hopper.near-wall, coin.0, coin.1 |
| `hopper.far-wall` | hopper.floor (front → back) | static | named mount face |
| `hopper.near-wall` | hopper.floor (back → front) | static | named mount face |
| `trough.common.floor` | hopper.floor (left → right) | static | trough.common.far-wall, trough.common.near-wall, splitter.vane, chute.0.floor, chute.1.floor, coin.0, coin.1 |
| `trough.common.far-wall` | trough.common.floor (front → back) | static | named mount face |
| `trough.common.near-wall` | trough.common.floor (back → front) | static | named mount face |
| `splitter.vane` | trough.common.floor (start → upper-profile) | static | named mount face |
| `splitter.yoke` | punch.standard.right (splitter.yoke.arm@back → front) | static | named mount face |
| `chute.0.floor` | trough.common.floor (left → right); chute.0.bracket (lower-profile → upper-profile) | static | chute.0.far-wall, chute.0.near-wall, coin.0 |
| `chute.0.far-wall` | chute.0.floor (front → back) | static | named mount face |
| `chute.0.near-wall` | chute.0.floor (back → front) | static | named mount face |
| `chute.0.bracket` | stand.deck (bottom → top) | static | chute.0.floor |
| `tray.0.floor` | stand.deck (bottom → top) | static | tray.0.back, tray.0.left, tray.0.right, coin.0 |
| `tray.0.back` | tray.0.floor (bottom → top) | static | named mount face |
| `tray.0.left` | tray.0.floor (bottom → top) | static | named mount face |
| `tray.0.right` | tray.0.floor (bottom → top) | static | named mount face |
| `coin.0` | punch.coin-gate (outer → punch.coin-gate.stop@outer) [0–17.5]; punch.coin-magazine (outer → profile); hopper.floor (outer → profile); trough.common.floor (outer → profile); chute.0.floor (outer → profile); tray.0.floor (outer → profile) | punch.coin-gate: gravity on floors | named mount face |
| `chute.1.floor` | trough.common.floor (left → right); chute.1.bracket (lower-profile → upper-profile) | static | chute.1.far-wall, chute.1.near-wall, coin.1 |
| `chute.1.far-wall` | chute.1.floor (front → back) | static | named mount face |
| `chute.1.near-wall` | chute.1.floor (back → front) | static | named mount face |
| `chute.1.bracket` | stand.deck (bottom → top) | static | chute.1.floor |
| `tray.1.floor` | stand.deck (bottom → top) | static | tray.1.back, tray.1.left, tray.1.right, coin.1 |
| `tray.1.back` | tray.1.floor (bottom → top) | static | named mount face |
| `tray.1.left` | tray.1.floor (bottom → top) | static | named mount face |
| `tray.1.right` | tray.1.floor (bottom → top) | static | named mount face |
| `coin.1` | punch.coin-gate (outer → punch.coin-gate.stop@outer) [0–17.5]; punch.coin-magazine (outer → profile); hopper.floor (outer → profile); trough.common.floor (outer → profile); chute.1.floor (outer → profile); tray.1.floor (outer → profile) | punch.coin-gate: gravity on floors | named mount face |
| `receipt.foot.left` | stand.deck (bottom → top) | static | punch.carrier, receipt.floor, fix.receipt.0 |
| `receipt.foot.right` | stand.deck (bottom → top) | static | receipt.floor |
| `receipt.floor` | receipt.foot.left (bottom → top); receipt.foot.right (bottom → top) | static | receipt.back, receipt.left, receipt.right, receipt.front, receipt.stack, fix.receipt.1, punch.card |
| `receipt.back` | receipt.floor (bottom → top) | static | bell.trip-link |
| `receipt.left` | receipt.floor (bottom → top) | static | named mount face |
| `receipt.right` | receipt.floor (bottom → top) | static | named mount face |
| `receipt.front` | receipt.floor (bottom → top) | static | receipt.pull.left, receipt.pull.right |
| `receipt.pull.left` | receipt.front (back → front) | static | receipt.pull |
| `receipt.pull.right` | receipt.front (back → front) | static | receipt.pull |
| `receipt.pull` | receipt.pull.left (back → front); receipt.pull.right (back → front) | static | named mount face |
| `receipt.stack` | receipt.floor (bottom → top) | static | punch.card |
| `bell.saddle` | clock.drum (bottom → outer) | static | bell.stem, fix.bell |
| `bell.stem` | bell.saddle (start → top) | static | bell.dome, bell.striker-arm |
| `bell.dome` | bell.stem (start → end) | static | named mount face |
| `bell.striker-arm` | bell.stem (left → outer) | bell.trip-link: elastic release | bell.striker, bell.trip-link |
| `bell.striker` | bell.striker-arm (outer → top) | bell.striker-arm: strike | named mount face |
| `bell.trip-link` | receipt.back (bell.trip-link.pin@outer → bell.trip-guide.lower@hole); case.cheek (profile → bell.trip-guide.upper@hole); bell.striker-arm (lead:end → back); carriage.shoe (bell.trip-link.pin@outer → carriage.bell-ramp@profile) | carriage.shoe: ramp | bell.striker-arm |
| `return-spring` | punch.spring-seat (lead:start → end); punch.return-seat (lead:end → start) | punch.return-seat: elastic return | named mount face |
| `stash.foot` | stand.deck (bottom → top) | static | stash.post, fix.stash |
| `stash.post` | stash.foot (bottom → end) | static | stash.arm |
| `stash.arm` | stash.post (left → right) | static | stash.hook |
| `stash.hook` | stash.arm (start → front) | static | stash.key-bow |
| `stash.key-bow` | stash.hook (bore → outer) | static | stash.key-shank |
| `stash.key-shank` | stash.key-bow (top → outer) | static | stash.key-bit |
| `stash.key-bit` | stash.key-shank (left → right) | static | named mount face |
| `fix.maker.0` | case.maker-plate (start → top) | static | named mount face |
| `fix.maker.1` | case.maker-plate (start → top) | static | named mount face |
| `fix.rack.0` | rack.expiry-lip (start → top) | static | named mount face |
| `fix.rack.1` | rack.expiry-lip (start → top) | static | named mount face |
| `fix.rail.0` | punch.carrier (start → front) | static | named mount face |
| `fix.rail.1` | punch.carrier (start → front) | static | named mount face |
| `fix.drum.0` | case.back (start → back) | static | named mount face |
| `fix.drum.1` | case.back (start → back) | static | named mount face |
| `fix.plate.0` | train.plate.front (start → front) | static | named mount face |
| `fix.plate.1` | train.plate.front (start → front) | static | named mount face |
| `fix.tape.0` | tape.spool-anchor (start → top) | static | named mount face |
| `fix.tape.1` | tape.spool-anchor (start → top) | static | named mount face |
| `fix.punch.0` | punch.mount.left (start → top) | static | named mount face |
| `fix.punch.1` | punch.mount.right (start → top) | static | named mount face |
| `fix.bell` | bell.saddle (start → top) | static | named mount face |
| `fix.stash` | stash.foot (start → top) | static | named mount face |
| `fix.receipt.0` | receipt.foot.left (start → edge:6) | static | named mount face |
| `fix.receipt.1` | receipt.floor (start → top) | static | named mount face |

## C. Keep and replace

Kept and reshaped where the chain needs it: base/feet, drum, face/ticks, rack posts/shelves, bell dome, return spring and motion harness. Kept unchanged: model/STOPS/text, kit, build script, public component interface.

Replaced: non-meshing gears and unsupported shaft ends with the four-wheel train between bearing plates; tall tape post with a flanged spool fork and actual slot/nip/well; coin bars/pyramid with open continuous troughs, a mounted vane and fitted cradles; dangling rod with the captured rail carriage and driven yoke; unused base-box shaft with the keeper crank/link/dog. Added fitted drum standoffs, seated bell saddle, retained key hook, drawer-end supports and the guided expiry slot. Retired decorative case hinges/latch/crown that served no motion. The final inventory reduces the accepted 203 to 199 by using integral mounting flanges, guide lips and folded tray edges; it does not add disconnected hardware to meet an earlier drawing.

## D. Checks and evidence contract

`contacts-check.mjs` bundles the same geometry and model as the renderer, reconstructs actual recorded poses and prints every declared mount at 24 specified times plus card, coin and bell handoff endpoints. Surface witnesses must lie on the named finite faces with positive gap ≤0.05; journals additionally need axial engagement and ≤0.05 lateral/skew error. Mount reachability uses the active measured rows. Missing IDs, missing mounts/drivers, orphan motion, unexplained drive cycles, lost contact, invalid gear phase, a pin leaving its yoke or excessive tooth speed fail the process. Separate checks cover fixed link lengths, nip and tape angular ratios.

The retained full motion audit measures 1,801 poses at 60 Hz for solid collisions and 451 poses for depth/wire clearance. The kit's tolerances and support rules are unchanged; no collision allowlist or enlarged tolerances were added. The actual audit result, both line-check outputs, contact results, typecheck, slowed sheets, close-ups and autoplay evidence are recorded in `NOTES.md`; this design text alone is not evidence of passing them. Browser inspection remains necessary because correct contact can still be obscured in projection.
