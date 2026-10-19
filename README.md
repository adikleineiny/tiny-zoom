# Tiny Zoom – RC toy racing v3.3

Original arcade RC-toy racer: 5 tiny RC vehicles racing through a giant kitchen, a backyard sandbox tunnel, rolling hills and a toy town, with ramps, jumps and secret weapons. Static site, Three.js r160 bundled in `vendor/`.

Run: `python3 -m http.server 8765` in this folder → open http://localhost:8765 (must be served over http, ES modules).

## v3.3 – turbo pads, equal vehicles, RC parts crates
- **Turbo pads replace the charging pads.** The 5 blue ⚡ charging pads and the whole battery mechanic (drain, low-battery slowdown, AI/assist landing to recharge, battery HUD) are gone. 11 orange **turbo pads** with glowing chevrons sit on the track centre: kitchen straights ×2, under the table, before the lawn kicker, before the tunnel, before the rolling hills, hills straight, before the Toy Town kicker, before the BIG JUMP, garden straight, west-wall straight. Driving over one – or flying over it within 40 cm – gives a short strong boost (`CONFIG.turboPads`: 0.9 s of turbo, 1.2 s cooldown) with the turbo flames/FOV/speed lines, an orange burst, a "🚀 TURBO PAD!" hint and a `turboPad` sim event + `window.RC_SOUND('turboPad')` sound hook. The flyer assist and AI dip to 18 cm over an upcoming pad, so pads are fair for every type. Nitro Turbo stays a crate item.
- **All vehicles equal.** `CONFIG.equal` (applied to every model, player and AI, after `?cfg`): same top speed 140 cm/s, accel 280, jump 150, grip, mass, size; flyers thrust = 140 × drag; turbo multiplier 1.55 for cars and flyers. AI rivals use the same tables for every type (latAcc/brake/section caps). Models keep look, sound and a little handling flavour (moto lean/drift, scooter twitchy steering, heli rotor-tilt + wobble). Terrain fairness: the lawn now slows flyers too (outdoor headwind, `surfaces.grass.drone` 0.885) to cancel the grass/hill advantage flyers had. Menu cards show equal stat bars + flavour text. Solo weapons-off best laps: race car 73.6, moto 72.8, scooter 73.4, drone 72.7, heli 74.2 s (spread 2.0%; v3.2 was 77.3 moto – 85.0 drone).
- **RC parts crates** replace the "?" item boxes: sturdy orange/black hazard-striped crate with an original lightning-bolt-in-a-gear emblem (slow turn, no rainbow/translucent look); the weapon slot shows the same bolt-gear icon ("Grab a crate").
- **Weapon slot moved directly above JUMP** (right thumb, same column, 14 px gap, 96×90, safe-area aware).
- Rescue `stuckTime` 1.6 → 1.4 s.

## v3.2 – tap the weapon slot to fire
The mystery-box weapon slot is now the FIRE button: a big 108×100 thumb button at the bottom left, right of the left stick (no overlap). It glows and pulses with "TAP TO FIRE" when a weapon is ready and shows a pressed state. The separate red FIRE button is gone; F still fires. It uses the same finger tracking as the sticks: a stick finger sliding onto it releases the stick and does not fire.

## v3.1 – never stuck, robust touch
- **Touch (iOS Safari)**: sticks are tracked by `Touch.identifier` (Touch Events; pointer events only for mouse/pen). Every touchstart/touchend/touchcancel re-checks `e.touches` and releases any stick/button whose finger is gone; a stale stick slot is reclaimed by a new finger; sliding off-screen or onto FIRE/JUMP/pause/reset releases the stick; blur / visibilitychange / pagehide / orientationchange / pause release everything; a 300 ms watchdog zeroes a stick that gets no events and is not in the active touch list. iOS gestures, callouts, selection, double-tap zoom are blocked.
- **Lakitu rescue** (`CONFIG.rescue`, player + AI, all 5 vehicles): stuck while trying to move (1.6 s), wedged against a prop (4 s), no progress (5 s), wrong way (3.5 s), off track, fallen / inside a solid, flyers pinned at a gate/ceiling → lift + fade, put back on the track ~30 cm behind, facing forward, 1.6 s invulnerable + small boost. Three rescues in a row at the same spot → put past the obstacle. ↺ / R uses the same rescue. HUD hint "Stuck? Rescue coming…".
- **Collisions**: circle-vs-box push-out (round corners, glancing hits slide, nose-into-wall turns along it), ramp sides slide on one axis, invisible soft boundary steers back before the hard barrier, pet-door opening hitbox 31 cm wide (hidden under the frame) so nothing wedges on the frame.
- **Camera**: marches from the vehicle to the chase spot and stops before the first wall/door (thin pet-door wall included), never lerps through a wall.
- Tests: `tests/touch_test.py` (CDP multi-touch, touchcancel, lost touchend, watchdog, slide onto buttons, blur/pagehide/orientation, fuzz, pet door, camera), `tests/stuck_test.py [url] [seeds]` (random-input bot races ×5 vehicles, no racer still > 3 s, all finish; every solid probed).

## Vehicles (pick in the menu; AI rivals use them too) – v3.3: identical performance, flavour only
| Vehicle | Class | Feel |
|---|---|---|
| 🏎️ RC Race Car | ground | grippy all-rounder, springy suspension, drifts on hard steer |
| 🏍️ RC Motorcycle | ground | leans into turns, wheelies on turbo/launch, looser drift |
| 🛴 RC Racing Scooter | ground | light-footed, twitchy steering, loves tight turns |
| 🛸 RC Drone | flyer | hovers precisely, flies over small obstacles |
| 🚁 RC Helicopter | flyer | rotor disc tilts first (lag), swoopy forward flight, wobbly hover |

Flyers must still pass *under* every checkpoint gate, go *through* the drain-pipe tunnel and the doghouse, and respect ceilings. Since v3.3 all vehicles have equal performance (see above).

### Flight assist (drone + helicopter)
`CONFIG.flyerAssist` (level 0–1, default 0.85): left stick centred = auto altitude hold that follows the hills and ducks under the next gate / table / tunnel ceiling; climbing is softly capped below ceilings; when you don't steer the nose eases toward the track direction; yaw expo for fine corrections; extra lateral damping + air-brake (no more sliding); helicopter rotor-tilt lag and hover wobble reduced; dips low over upcoming turbo pads. Turn it down with `?cfg={"flyerAssist":{"level":0}}`.

## Jump
Ground vehicles jump (JUMP button / Space) – hop over small obstacles (≤12 cm) and land with squash & suspension bounce. AI cars hop obstacles automatically and sometimes just for fun. Flyers: JUMP = quick upward HOP.

## Secret weapons
Drive through a glowing **?** box (they respawn after 4 s): the HUD slot rolls slot-machine style and gives a random weapon (hold one at a time, tap the slot / F to use). Hits are short (≤1.1 s) and followed by 1.4 s immunity, so nobody gets stun-locked. Every weapon also works against flyers.
- 💣 **Sticky Bomb** – lobbed; sticks to a racer and beeps faster and faster. Bump another racer to pass it on before it blows (misses become a floor mine).
- 💨 **Nitro Turbo** – big speed boost with flame trail, FOV kick & speed lines; anyone you ram gets knocked aside.
- 🔥 **Fire Trail** – short flamethrower ahead + burning trail behind: cars spin out, flyers get thrown up by the heat.
- ⚡ **Electrify** – chain lightning jumps between up to 3 nearby racers and cuts their power (flyers drop).
- 🚀 **Homing Rocket** – chases the racer ahead of you and flips it.
- 🔴 **Bouncy Ball** – bounces off walls and bowls racers over.
- 💥 **Shockwave** – pushes everyone nearby away.
- 🛢️ **Oil Slick** – dropped behind; ground racers (and low-skimming flyers) spin out.
- 🥊 **Spring Glove** – boing! punches the racer in front.

## Track "From the Kitchen to the Garden" XL (~88 m, ~77–82 s/lap ground, ~83–88 s flyers)
1. **Kitchen Floor** – tiles, start/finish, turbo pad. 2. **Under the Table** – chair legs, low ceiling. 3. **Pet Door** – 30 × 26 cm flap.
4. **The Lawn** – grass slows ground vehicles, turbo pad, kicker ramp. 5. **Sandbox Tunnel** – a drain pipe through a sand hill; 22 cm ceiling, gates at both ends: flyers can't go over the hill.
6. **Rolling Hills** – five bumps on the grass (ground vehicles catch air over the crests), turbo pad; flyers get extra room to cut the corners (risky shortcut: ).
7. **Toy Town** – play-mat road between toy houses (narrow alleys, no flyer shortcut): kicker ramp → **garage-roof shortcut** (ramp up onto a toy garage, skipping the mud patch) → turbo pad → **BIG JUMP** over the puddle (puddles/mud slow ground vehicles).
8. **Gnome Garden & Home** – gnome village, through the **doghouse** (40 cm roof), turbo pad, back in through the sliding door, up the west wall.
15 checkpoint gates (no flying over them), 11 rows of RC parts crates, 11 turbo pads.

### Terrain physics
Ground vehicles follow terrain height (ramps, hills, garage roof), slopes slow you uphill / speed you up downhill, and when the ground falls away faster than gravity (ramp lips, hill crests) the car becomes airborne with a per-ramp take-off kick and floaty arcade air, then lands with suspension squash. Ramp sides act like walls. Tunables: `CONFIG.terrain`; ramps/hills/puddles live in `FEATURES` in `js/track.js`.

## Controls
Touch (landscape, RC-transmitter sticks; touch anywhere on the left/right half), plus the **weapon slot = FIRE** button (bottom left, next to the left stick) and the round **JUMP/HOP** button (right, inside the stick):
- Ground: left stick ↑ throttle / ↓ brake-reverse; right stick ↔ steering.
- Flyers: left stick ↑↓ altitude (center = hold); right stick ↔ yaw, ↑↓ forward/back.
Keyboard: W/S or ↑/↓ throttle / forward-back; A/D or ←/→ steer/yaw; Space = jump (ground) / up (flyers); E up, Shift/Q down; F fire; R reset to track; Esc/P pause; Enter start.

## Tuning
All balance values live in `js/config.js` (`CONFIG`): `terrain`, `flyerAssist`, `sectionFlyMargin`, `vehicles` (physics classes), `models` (the 5 vehicles' overrides), `weapons` (box layout, roll time, weights, every weapon's strength/duration), `ai`, `camera` (incl. speed/turbo FOV). Runtime override: `?cfg={"weapons":{"enabled":false}}`.
Debug URL params: `?autostart=racecar|moto|scooter|drone|heli`, `&autopilot=1`, `&speed=4`, `&laps=1`.
Console: `__rc.simulateRace('heli', 500, {weapons:true})` → headless race results; `__rc.give('bomb')`, `__rc.fire()`.

## Code
`js/sim.js` physics + AI, `js/weapons.js` boxes/weapons logic (headless-safe), `js/fx.js` weapon/particle visuals, `js/vehicles.js` the 5 models, `js/track.js` (centerline, gates, pads, terrain FEATURES, tunnel/doghouse, AI lines), `js/world.js` (scenery; small parts merged into vertex-coloured batches for few draw calls), `js/input.js`, `js/main.js`.

## Tests (need playwright + Chrome; serve on :8765 first)
- `tests/sim_test.py` – headless balance sim for all 5 vehicles; fails if anyone doesn't finish, lap out of range, flyers out-lap ground vehicles by >4%, or the weapons-off per-vehicle best-lap spread exceeds 3%.
- `tests/weapons_test.py` – every weapon vs an AI car and an AI drone, box pickup/roll/respawn, jumps, obstacle hop, bomb passing; terrain: every ramp launches all 3 ground vehicles, hills give air, garage-roof shortcut, tunnel blocks high flyers / lets low ones through / ceiling holds.
- `tests/ui_test.py [url] [outdir]` – 844×390 touch: menu → race, sticks, JUMP button + tap-the-slot FIRE, pickup, weapon effects, heli flight, drone flight assist, tunnel / big jump / toy town / hills, draw calls, finish; writes screenshots (01–14).
