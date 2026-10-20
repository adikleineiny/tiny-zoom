# v4.0 weapon buff – before / after (user-requested override of the v3.9 weapon freeze)

Only numbers in `js/config.js → CONFIG.weapons` changed, plus 3 config hooks in `js/weapons.js`
(rocket/bomb hit radius were a hard-coded `3`; homing lock-on cone was a hard-coded `0.3`).
Names, icons, designs, crate pick weights, Ghost immunity and Turbo/Nitro are **unchanged**.
`slow` multiplies the victim's velocity on hit → **lower = stronger**. Air/ground handling is unchanged
(every effect goes through the same `sim.hit()` path; no type-specific values were edited).

| Weapon | Key | v3.9 | v4.0 | Change |
|---|---|---|---|---|
| 🔴 Ball | life (s) = range | 4 | 5.8 | +45 % |
| | radius (hit + bounce) | 3.2 | 3.8 | +19 % |
| | knock | 170 | 200 | +18 % |
| | spin (s) | 0.6 | 0.75 | +25 % |
| | slow | 0.5 | 0.45 | stronger |
| 🚀 Rocket | life (s) | 4.5 | 6.5 | +44 % |
| | range (target search) | 800 | 1150 | +44 % |
| | turn (rad/s homing) | 4.5 | 6.5 | +44 % |
| | hitR (new key; was hard-coded) | 3 | 4 | +33 % |
| | lockCos (new key; front-cone lock-on, was hard-coded) | 0.3 | 0.15 | wider cone |
| | knock | 60 | 70 | +17 % |
| | tumble (s) | 1.0 | 1.25 | +25 % |
| | slow | 0.3 | 0.25 | stronger |
| 🌀 EMP Pulse | life (s) | 3.2 | 4.6 | +44 % |
| | range | 700 | 1000 | +43 % |
| | turn | 5 | 7 | +40 % |
| | trigger (proximity) | 10 | 12 | +20 % |
| | radius (burst) | 32 | 42 | +31 % |
| | lockCos (new key) | 0.3 | 0.15 | wider cone |
| | spin (s) | 0.85 | 1.05 | +24 % |
| | slow | 0.5 | 0.45 | stronger |
| 💥 Shockwave | radius | 70 | 91 | +30 % |
| | knock | 240 | 280 | +17 % |
| | tumble (s) | 0.6 | 0.75 | +25 % |
| | slow | 0.55 | 0.48 | stronger |
| 💣 Sticky Bomb | backThrow (× throwSpeed 170) | 0.6 | 0.9 | +50 % throw distance back |
| | radius (blast) | 42 | 55 | +31 % |
| | knock | 170 | 200 | +18 % |
| | tumble (s) | 1.1 | 1.35 | +23 % |
| | slow | 0.35 | 0.3 | stronger |
| | hitR (new key; stick on contact, was hard-coded) | 3 | 4 | +33 % |
| ⚡ Electrify | stun (s) | 0.6 | 0.75 | +25 % |
| | slow | 0.6 | 0.55 | stronger |
| 🔥 Fire Trail | patchRadius | 8 | 10.4 | +30 % |
| | coneReach | 32 | 42 | +31 % |
| | spin (s) | 0.7 | 0.85 | +21 % |
| | slow | 0.65 | 0.58 | stronger |
| 👻 Ghost | – | 4.5 s | 4.5 s | unchanged (immune to all of the above) |
| 💨 Turbo | – | – | – | unchanged (nitro/turbo frozen by the v4.0 brief) |
| Crate weights | – | ball 1, shock 1, rocket 0.8, pulse 1, zap 1, ghost 1, bomb 1, turbo 1.1, fire 1 | same | unchanged |
| Hit immunity | hit.immune | 1.4 s | 1.4 s | unchanged |
