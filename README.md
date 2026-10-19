# Tiny Zoom – RC toy racing v3.2

Original arcade RC-toy racer: 5 tiny RC vehicles racing through a giant kitchen, a backyard sandbox tunnel, rolling hills and a toy town, with ramps, jumps and secret weapons. Static site, Three.js r160 bundled in `vendor/`.

Run: `python3 -m http.server 8765` in this folder → open http://localhost:8765 (must be served over http, ES modules).

## v3.2 – tap the weapon slot to fire
The mystery-box weapon slot is now the FIRE button: a big 108×100 thumb button at the bottom left, right of the left stick (no overlap). It glows and pulses with "TAP TO FIRE" when a weapon is ready and shows a pressed state. The separate red FIRE button is gone; F still fires. It uses the same finger tracking as the sticks: a stick finger sliding onto it releases the stick and does not fire.

## v3.1 – never stuck, robust touch
- **Touch (iOS Safari)**: sticks are tracked by `Touch.identifier` (Touch Events; pointer events only for mouse/pen). Every touchstart/touchend/touchcancel re-checks `e.touches` and releases any stick/button whose finger is gone; a stale stick slot is reclaimed by a new finger; sliding off-screen or onto FIRE/JUMP/pause/reset releases the stick; blur / visibilitychange / pagehide / orientationchange / pause release everything; a 300 ms watchdog zeroes a stick that gets no events and is not in the active touch list. iOS gestures, callouts, selection, double-tap zoom are blocked.
- **Lakitu rescue** (`CONFIG.rescue`, player + AI, all 5 vehicles): stuck while trying to move (1.6 s), wedged against a prop (4 s), no progress (5 s), wrong way (3.5 s), off track, fallen / inside a solid, flyers pinned at a gate/ceiling → lift + fade, put back on the track ~30 cm behind, facing forward, 1.6 s invulnerable + small boost. Three rescues in a row at the same spot → put past the obstacle. ↺ / R uses the same rescue. HUD hint "Stuck? Rescue coming…".
- **Collisions**: circle-vs-box push-out (round corners, glancing hits slide, nose-into-wall turns along it), ramp sides slide on one axis, invisible soft boundary steers back before the hard barrier, pet-door opening hitbox 31 cm wide (hidden under the frame) so nothing wedges on the frame.
- **Camera**: marches from the vehicle to the chase spot and stops before the first wall/door (thin pet-door wall included), never lerps through a wall.
- Tests: `tests/touch_test.py` (CDP multi-touch, touchcancel, lost touchend, watchdog, slide onto buttons, blur/pagehide/orientation, fuzz, pet door, camera), `tests/stuck_test.py [url] [seeds]` (random-input bot races ×5 vehicles, no racer still > 3 s, all finish; every solid probed).

## Vehicles (pick in the menu; AI rivals use them too)
| Vehicle | Class | Feel |
|---|---|---|
| 🏎️ RC Race Car | ground | grippy all-rounder, springy suspension, drifts on hard steer |
| 🏍️ RC Motorcycle | ground | highest top speed, leans into turns, wheelies on turbo/launch, light & twitchy |
| 🛴 RC Kick-Scooter | ground | best launch, most agile, very light (gets knocked around), biggest jump |
| 🛸 RC Drone | flyer | hovers precisely, flies over small obstacles, needs ⚡ charging |
| 🚁 RC Helicopter | flyer | rotor disc tilts first (lag), faster forward flight, heavy momentum, wobbly hover, needs ⚡ |

Flyers must still pass *under* every checkpoint gate, go *through* the drain-pipe tunnel and the doghouse, and respect ceilings/battery, so they're ~5–8 s/lap slower than ground vehicles in AI-vs-AI sims (corner-cutting over the rolling hills rewards skilled pilots).

### Flight assist (drone + helicopter)
`CONFIG.flyerAssist` (level 0–1, default 0.85): left stick centred = auto altitude hold that follows the hills and ducks under the next gate / table / tunnel ceiling; climbing is softly capped below ceilings; when you don't steer the nose eases toward the track direction; yaw expo for fine corrections; extra lateral damping + air-brake (no more sliding); helicopter rotor-tilt lag and hover wobble reduced; auto-lands over a ⚡ pad when the battery isn't full. Turn it down with `?cfg={"flyerAssist":{"level":0}}`.

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
1. **Kitchen Floor** – tiles, start/finish, ⚡ pad. 2. **Under the Table** – chair legs, low ceiling. 3. **Pet Door** – 30 × 26 cm flap.
4. **The Lawn** – grass slows ground vehicles, ⚡ pad, kicker ramp. 5. **Sandbox Tunnel** – a drain pipe through a sand hill; 22 cm ceiling, gates at both ends: flyers can't go over the hill.
6. **Rolling Hills** – five bumps on the grass (ground vehicles catch air over the crests), ⚡ pad; flyers get extra room to cut the corners (risky shortcut: far from the next pad).
7. **Toy Town** – play-mat road between toy houses (narrow alleys, no flyer shortcut): kicker ramp → **garage-roof shortcut** (ramp up onto a toy garage, skipping the mud patch) → ⚡ pad → **BIG JUMP** over the puddle (puddles/mud slow ground vehicles).
8. **Gnome Garden & Home** – gnome village, through the **doghouse** (40 cm roof), ⚡ pad, back in through the sliding door, up the west wall.
15 checkpoint gates (no flying over them), 11 rows of ? boxes, 5 charging pads.

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
- `tests/sim_test.py` – headless balance sim for all 5 vehicles; fails if anyone doesn't finish, lap out of range, or flyers out-lap ground vehicles.
- `tests/weapons_test.py` – every weapon vs an AI car and an AI drone, box pickup/roll/respawn, jumps, obstacle hop, bomb passing; terrain: every ramp launches all 3 ground vehicles, hills give air, garage-roof shortcut, tunnel blocks high flyers / lets low ones through / ceiling holds.
- `tests/ui_test.py [url] [outdir]` – 844×390 touch: menu → race, sticks, JUMP button + tap-the-slot FIRE, pickup, weapon effects, heli flight, drone flight assist, tunnel / big jump / toy town / hills, draw calls, finish; writes screenshots (01–14).
