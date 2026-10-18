# Tiny Zoom – RC toy racing prototype v1

Original arcade RC-toy racer (tiny RC car / drone in a giant kitchen). Static site, Three.js r160 bundled in `vendor/`.

Run: `python3 -m http.server 8765` in this folder → open http://localhost:8765 (must be served over http, ES modules).

## Track "From the Kitchen to the Garden" v1 (~54 m, ~56–60 s/lap)
1. Kitchen tile floor (start/finish, recharge pad) – cars accelerate fastest; drones spool up slowly.
2. Under the dining table – chair legs, end chairs you drive *under*, low ceiling; checkpoint gates at 32 cm.
3. Pet door – 30 cm wide × 26 cm high opening; everyone must pass.
4. Garden – grass slows cars (×0.64), drones unaffected; second recharge pad; loop around the tree.
5. Back home through the open sliding door, along the west wall.
9 checkpoint gates; flying above a gate bar bounces you back (striped "no-fly" panels).

## Controls
Touch (landscape, RC-transmitter sticks; touch anywhere on the left/right half):
- Car: left stick ↑ throttle / ↓ brake-reverse; right stick ↔ steering.
- Drone: left stick ↑↓ altitude (center = hold); right stick ↔ yaw, ↑↓ forward/back.
Keyboard: W/S or ↑/↓ throttle (car) / forward-back (drone); A/D or ←/→ steer/yaw; Space/E up, Shift/Q down; R reset to track; Esc/P pause; Enter start.

## Tuning
All balance values live in `js/config.js` (`CONFIG`). Runtime override: `?cfg={"vehicles":{"drone":{"thrust":130}}}`.
Debug URL params: `?autostart=car|drone`, `&autopilot=1` (AI drives you), `&speed=4` (time scale), `&laps=1`.
Console: `__rc.simulateRace('drone', 500)` → headless 3-lap race results (lap times, section times, pad stops).

## Tests
`tests/sim_test.py` (headless balance sim) and `tests/ui_test.py` (menu → race via synthetic touch, screenshots). Need playwright + Chrome.
