# Tiny Zoom – RC toy racing v2

Original arcade RC-toy racer: 5 tiny RC vehicles racing through a giant kitchen and garden, with jumps and secret weapons. Static site, Three.js r160 bundled in `vendor/`.

Run: `python3 -m http.server 8765` in this folder → open http://localhost:8765 (must be served over http, ES modules).

## Vehicles (pick in the menu; AI rivals use them too)
| Vehicle | Class | Feel |
|---|---|---|
| 🏎️ RC Race Car | ground | grippy all-rounder, springy suspension, drifts on hard steer |
| 🏍️ RC Motorcycle | ground | highest top speed, leans into turns, wheelies on turbo/launch, light & twitchy |
| 🛴 RC Kick-Scooter | ground | best launch, most agile, very light (gets knocked around), biggest jump |
| 🛸 RC Drone | flyer | hovers precisely, flies over small obstacles, needs ⚡ charging |
| 🚁 RC Helicopter | flyer | rotor disc tilts first (lag), faster forward flight, heavy momentum, wobbly hover, needs ⚡ |

Flyers must still pass *under* every checkpoint gate and respect ceilings/battery, so they're a few seconds slower than ground vehicles in AI-vs-AI sims (shortcuts reward skilled pilots).

## Jump
Ground vehicles jump (JUMP button / Space) – hop over small obstacles (≤12 cm) and land with squash & suspension bounce. AI cars hop obstacles automatically and sometimes just for fun. Flyers: JUMP = quick upward HOP.

## Secret weapons
Drive through a glowing **?** box (they respawn after 4 s): the HUD slot rolls slot-machine style and gives a random weapon (hold one at a time, FIRE / F to use). Hits are short (≤1.1 s) and followed by 1.4 s immunity, so nobody gets stun-locked. Every weapon also works against flyers.
- 💣 **Sticky Bomb** – lobbed; sticks to a racer and beeps faster and faster. Bump another racer to pass it on before it blows (misses become a floor mine).
- 💨 **Nitro Turbo** – big speed boost with flame trail, FOV kick & speed lines; anyone you ram gets knocked aside.
- 🔥 **Fire Trail** – short flamethrower ahead + burning trail behind: cars spin out, flyers get thrown up by the heat.
- ⚡ **Electrify** – chain lightning jumps between up to 3 nearby racers and cuts their power (flyers drop).
- 🚀 **Homing Rocket** – chases the racer ahead of you and flips it.
- 🔴 **Bouncy Ball** – bounces off walls and bowls racers over.
- 💥 **Shockwave** – pushes everyone nearby away.
- 🛢️ **Oil Slick** – dropped behind; ground racers (and low-skimming flyers) spin out.
- 🥊 **Spring Glove** – boing! punches the racer in front.

## Track "From the Kitchen to the Garden" (~54 m, ~47–50 s/lap ground)
1. Kitchen tile floor (start/finish, recharge pad). 2. Under the dining table – chair legs, low ceiling. 3. Pet door – 30 cm wide × 26 cm high. 4. Garden – grass slows ground vehicles (per-vehicle), flyers unaffected. 5. Back home along the west wall. 10 checkpoint gates (no flying over them).

## Controls
Touch (landscape, RC-transmitter sticks; touch anywhere on the left/right half), plus round **FIRE** (left, inside the stick) and **JUMP/HOP** (right, inside the stick) buttons:
- Ground: left stick ↑ throttle / ↓ brake-reverse; right stick ↔ steering.
- Flyers: left stick ↑↓ altitude (center = hold); right stick ↔ yaw, ↑↓ forward/back.
Keyboard: W/S or ↑/↓ throttle / forward-back; A/D or ←/→ steer/yaw; Space = jump (ground) / up (flyers); E up, Shift/Q down; F fire; R reset to track; Esc/P pause; Enter start.

## Tuning
All balance values live in `js/config.js` (`CONFIG`): `vehicles` (physics classes), `models` (the 5 vehicles' overrides), `weapons` (box layout, roll time, weights, every weapon's strength/duration), `ai`, `camera` (incl. speed/turbo FOV). Runtime override: `?cfg={"weapons":{"enabled":false}}`.
Debug URL params: `?autostart=racecar|moto|scooter|drone|heli`, `&autopilot=1`, `&speed=4`, `&laps=1`.
Console: `__rc.simulateRace('heli', 500, {weapons:true})` → headless race results; `__rc.give('bomb')`, `__rc.fire()`.

## Code
`js/sim.js` physics + AI, `js/weapons.js` boxes/weapons logic (headless-safe), `js/fx.js` weapon/particle visuals, `js/vehicles.js` the 5 models, `js/track.js`, `js/world.js`, `js/input.js`, `js/main.js`.

## Tests (need playwright + Chrome; serve on :8765 first)
- `tests/sim_test.py` – headless balance sim for all 5 vehicles.
- `tests/weapons_test.py` – every weapon vs an AI car and an AI drone, box pickup/roll/respawn, jumps, obstacle hop, bomb passing.
- `tests/ui_test.py [url] [outdir]` – 844×390 touch: menu → race, sticks, JUMP/FIRE buttons, pickup, weapon effects, heli flight, finish; writes screenshots.
