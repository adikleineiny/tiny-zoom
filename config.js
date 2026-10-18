// ===== Tiny Zoom — tunable game config =====
// Units: 1 unit = 1 cm, speeds in cm/s, times in seconds, battery in %.
// Override at runtime with ?cfg={"vehicles":{"drone":{"thrust":120}}} (URL-encoded JSON, deep-merged).
export const CONFIG = {
  laps: 3,
  physicsHz: 120,
  maxAltitude: 110,          // "radio range" ceiling for flyers
  barrierHeight: 6,          // foam track barriers; flyers above this can cut over them
  droneShortcutMargin: 55,   // extra lateral room (cm) a flying drone gets beyond the barriers (0 near gates / tight sections)

  vehicles: {
    car: {
      label: 'RC Car',
      topSpeed: 118,       // on tile floor
      accel: 210,
      brakeDecel: 330,
      reverseTop: 45,
      coastDecel: 45,
      steerRate: 2.9,      // rad/s at full lock
      steerSpeedRef: 30,   // below this speed steering fades out
      highSpeedSteerLoss: 0.35,
      grip: 9,             // lateral slip damping (higher = less drift)
      halfWidth: 5, radius: 6.5, height: 7,
      batteryDrainBase: 0.10, batteryDrainThrottle: 0.15,   // %/s
    },
    drone: {
      label: 'Drone',
      thrust: 125,         // horizontal accel at full pitch; top speed ≈ thrust/drag
      drag: 1.25,          // low drag = more inertia (slow to start AND slow to stop)
      lateralDamp: 2.0,    // how quickly sideways drift dies out
      yawRate: 2.5,
      climbRate: 42,
      climbResponse: 3.5,
      spoolTime: 1.0,      // rotor spin-up before full thrust (slow take-off)
      takeoffAltitude: 3,  // below this the drone is "on the ground" and can't thrust properly
      groundFriction: 6,
      halfWidth: 6.5, radius: 6.5, height: 5,
      batteryDrainBase: 0.8, batteryDrainThrust: 0.7, batteryDrainClimb: 0.4, // %/s
    },
  },

  // Surface multipliers per vehicle type
  surfaces: {
    tile:  { label: 'Tiles', car: { speed: 1.0, accel: 1.0, grip: 1.0 }, drone: { speed: 1.0, accel: 1.0 } },
    grass: { label: 'Grass',    car: { speed: 0.64, accel: 0.6, grip: 0.7 }, drone: { speed: 1.0, accel: 1.0 } },
  },

  battery: {
    lowThreshold: 25,     // below this %, speed is reduced
    minSpeedFactor: 0.55, // speed factor at 0%
    padChargeRate: 45,    // %/s while on a pad
    padRadius: 20,
    padMaxAltitude: 9,    // drone must be this low (cm) over the pad to charge
  },

  ai: {
    lookahead: 28, lookaheadSpeedK: 0.32,
    cruiseAltitude: 30,
    rechargeBelow: 42, rechargeUntil: 90,
    latAcc: { car: 300, drone: 210 },
    brake: { car: 260, drone: 105 },
    sectionCap: { car: { 2: 100, 3: 85 }, drone: { 2: 88, 3: 72 } },
    skill: [0.985, 0.965, 0.95],
  },

  camera: {
    fov: 70,
    car:   { dist: 34, height: 13, lookAhead: 22, lookUp: 3 },
    drone: { dist: 38, height: 12, lookAhead: 22, lookUp: 2 },
  },
  render: { maxPixelRatio: 1.5 },
};

function deepMerge(t, s) {
  for (const k of Object.keys(s)) {
    if (s[k] && typeof s[k] === 'object' && !Array.isArray(s[k]) && t[k] && typeof t[k] === 'object') deepMerge(t[k], s[k]);
    else t[k] = s[k];
  }
}
try {
  const p = new URLSearchParams(location.search);
  if (p.get('cfg')) deepMerge(CONFIG, JSON.parse(p.get('cfg')));
  if (p.get('laps')) CONFIG.laps = Math.max(1, parseInt(p.get('laps')));
} catch (e) { console.warn('bad cfg param', e); }
if (typeof window !== 'undefined') window.RC_CONFIG = CONFIG;
