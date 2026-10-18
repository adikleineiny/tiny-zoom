import * as THREE from './three.module.min.js';
import { CONFIG } from './config.js';

export const SECTION_NAMES = { 1: 'Kitchen Floor', 2: 'Under the Table', 3: 'Pet Door', 4: 'The Garden', 5: 'Back Home' };

// Centerline control points: [x, z, halfWidth, section]. Kitchen: x 0..1400, z 0..900; wall z=900; garden z>900.
const CP = [
  [350,150,55,1],[600,145,55,1],[850,150,55,1],[1080,170,55,1],[1240,240,55,1],[1300,380,55,1],[1250,520,55,1],[1120,600,52,1],
  [1030,635,48,2],[965,640,40,2],[905,642,44,2],[845,652,44,2],[790,630,44,2],[720,652,44,2],[650,640,44,2],[600,645,40,2],[560,645,36,2],
  [490,690,48,3],[440,770,40,3],[405,850,24,3],[400,900,15,3],[400,950,24,3],
  [430,1030,50,4],[560,1060,60,4],[760,1080,60,4],[960,1150,60,4],[1060,1300,60,4],[1000,1460,60,4],[820,1520,60,4],[620,1470,60,4],[450,1380,60,4],[300,1300,60,4],[170,1220,60,4],[120,1080,55,4],
  [130,960,55,5],[130,900,55,5],[130,800,55,5],[135,600,55,5],[145,400,55,5],[170,250,55,5],[240,170,55,5],
];

const GATES = [
  { x: 350, z: 150, h: 55, label: 'Start' },
  { x: 1080, z: 170, h: 55 },
  { x: 1250, z: 520, h: 55 },
  { x: 1030, z: 635, h: 32 },
  { x: 720, z: 652, h: 32 },
  { x: 400, z: 900, h: 26, door: true },
  { x: 1060, z: 1300, h: 55 },
  { x: 450, z: 1380, h: 55 },
  { x: 130, z: 900, h: 55 },
  { x: 145, z: 400, h: 55 },
];
const PADS = [{ x: 700, z: 145, lat: 28 }, { x: 620, z: 1470, lat: 25 }];

const wrapA = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
export { wrapA };

function blur(arr, rad, passes = 1) {
  const N = arr.length; let a = Float32Array.from(arr);
  for (let p = 0; p < passes; p++) {
    const out = new Float32Array(N); let sum = 0;
    for (let j = -rad; j <= rad; j++) sum += a[(j + N) % N];
    for (let i = 0; i < N; i++) {
      out[i] = sum / (2 * rad + 1);
      sum += a[(i + rad + 1) % N] - a[(i - rad + N) % N];
    }
    a = out;
  }
  return a;
}

export class Track {
  constructor() {
    const pts = CP.map(c => new THREE.Vector3(c[0], 0, c[1]));
    const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
    this.curve = curve;
    const L = curve.getLength();
    const N = Math.round(L / 6);
    this.L = L; this.N = N; this.ds = L / N;
    const F = () => new Float32Array(N);
    Object.assign(this, { px: F(), pz: F(), tx: F(), tz: F(), nx: F(), nz: F(), s: F(), halfW: F(), curv: F(), marginF: F(), lineF: F(), ceil: F() });
    this.section = new Uint8Array(N); this.surface = new Array(N);
    const n = CP.length;
    for (let i = 0; i < N; i++) {
      const u = i / N; const p = curve.getPointAt(u); const t = curve.getTangentAt(u);
      const tl = Math.hypot(t.x, t.z) || 1;
      this.px[i] = p.x; this.pz[i] = p.z; this.tx[i] = t.x / tl; this.tz[i] = t.z / tl;
      this.nx[i] = -this.tz[i]; this.nz[i] = this.tx[i];
      this.s[i] = i * this.ds;
      const f = curve.getUtoTmapping(u) * n; const k = Math.floor(f) % n; const fr = f - Math.floor(f);
      const a = CP[k], b = CP[(k + 1) % n]; const sm = fr * fr * (3 - 2 * fr);
      this.halfW[i] = a[2] + (b[2] - a[2]) * sm;
      this.section[i] = a[3];
      this.surface[i] = p.z > 903 ? 'grass' : 'tile';
    }
    // curvature (positive = right turn)
    const ang = i => Math.atan2(this.tz[(i + N) % N], this.tx[(i + N) % N]);
    const raw = new Float32Array(N);
    for (let i = 0; i < N; i++) raw[i] = wrapA(ang(i + 4) - ang(i - 4)) / (8 * this.ds);
    this.curv = blur(raw, 6, 2);
    // gates & pads
    this.gates = GATES.map((g, gi) => { const i = this.nearestIdx(g.x, g.z); return { ...g, i, s: this.s[i], hw: this.halfW[i], index: gi }; });
    this.pads = PADS.map(pd => { const i = this.nearestIdx(pd.x, pd.z); return { i, s: this.s[i], x: this.px[i] + this.nx[i] * pd.lat, z: this.pz[i] + this.nz[i] * pd.lat }; });
    // lateral margin a flying drone gets (0 near gates & in tight sections)
    for (let i = 0; i < N; i++) {
      let dg = 1e9; for (const g of this.gates) dg = Math.min(dg, Math.abs(this.wrapS(this.s[i] - g.s)));
      let m = Math.min(1, Math.max(0, (dg - 50) / 80));
      const sec = this.section[i]; if (sec === 2 || sec === 3) m = 0;
      this.marginF[i] = m;
      this.lineF[i] = sec === 2 ? 0.2 : sec === 3 ? 0.3 : 1;
    }
    this.marginF = blur(this.marginF, 8, 1);
    for (let i = 0; i < N; i++) { const sec = this.section[i]; if (sec === 2 || sec === 3) this.marginF[i] = 0; }
    this.lineF = blur(this.lineF, 10, 2);
    this.solids = [];
  }
  wrapS(d) { const L = this.L; d %= L; if (d > L / 2) d -= L; if (d < -L / 2) d += L; return d; }
  nearestIdx(x, z) {
    let best = 0, bd = 1e18;
    for (let i = 0; i < this.N; i++) { const dx = x - this.px[i], dz = z - this.pz[i]; const d = dx * dx + dz * dz; if (d < bd) { bd = d; best = i; } }
    return best;
  }
  // Project a point onto the centerline. hint = previous sample index (local search) or null for global.
  project(x, z, hint, out) {
    const N = this.N; let lo, hi;
    if (hint == null) { const i = this.nearestIdx(x, z); lo = i - 3; hi = i + 3; } else { lo = hint - 26; hi = hint + 26; }
    let bd = 1e18, bi = 0, bt = 0;
    for (let k = lo; k <= hi; k++) {
      const i = (k + N) % N, j = (i + 1) % N;
      const ax = this.px[i], az = this.pz[i], ex = this.px[j] - ax, ez = this.pz[j] - az;
      let t = ((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez); t = t < 0 ? 0 : t > 1 ? 1 : t;
      const qx = ax + ex * t - x, qz = az + ez * t - z; const d = qx * qx + qz * qz;
      if (d < bd) { bd = d; bi = i; bt = t; }
    }
    out = out || {};
    out.idx = bi; out.s = (this.s[bi] + bt * this.ds) % this.L;
    out.lat = (x - this.px[bi]) * this.nx[bi] + (z - this.pz[bi]) * this.nz[bi];
    return out;
  }
  // lowest solid bottom above y=8 covering the point
  ceilingAt(x, z) {
    let c = CONFIG.maxAltitude;
    for (const s of this.solids) if (s.y0 > 8 && x > s.x0 && x < s.x1 && z > s.z0 && z < s.z1) c = Math.min(c, s.y0);
    return c;
  }
  insideSolid(x, y, z, pad = 0) {
    for (const s of this.solids) if (x > s.x0 - pad && x < s.x1 + pad && z > s.z0 - pad && z < s.z1 + pad && y > s.y0 - pad && y < s.y1 + pad) return true;
    return false;
  }
  // Called after world solids are registered: AI racing lines, speed profiles, safe altitudes.
  finalize() {
    const N = this.N, ds = this.ds, A = CONFIG.ai, V = CONFIG.vehicles;
    for (let i = 0; i < N; i++) this.ceil[i] = this.ceilingAt(this.px[i], this.pz[i]);
    for (const g of this.gates) for (let k = -2; k <= 2; k++) { const i = (g.i + k + N) % N; this.ceil[i] = Math.min(this.ceil[i], g.h); }
    // safe drone altitude: look ahead ~3m
    const eff = new Float32Array(N);
    for (let i = 0; i < N; i++) eff[i] = this.ceil[i] - V.drone.height - 8;
    this.droneSafeAlt = new Float32Array(N);
    for (let i = 0; i < N; i++) { let m = 1e9; for (let k = -4; k <= 50; k++) m = Math.min(m, eff[(i + k + N) % N]); this.droneSafeAlt[i] = Math.max(4, m); }
    // racing lines: bias toward the inside of corners
    const mk = (type) => {
      const hw = V[type].halfWidth; const arr = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        let maxOff = this.halfW[i] - hw - 4;
        if (type === 'drone') maxOff += CONFIG.droneShortcutMargin * this.marginF[i] * 0.85;
        const k = Math.max(-1, Math.min(1, this.curv[i] * 150));
        arr[i] = k * maxOff * this.lineF[i];
      }
      return blur(arr, 20, 2);
    };
    this.carLine = mk('car'); this.droneLine = mk('drone');
    // car obstacle avoidance on its line
    const hwc = V.car.halfWidth;
    for (const o of this.solids) {
      if (!o.minor) continue;
      const cx = (o.x0 + o.x1) / 2, cz = (o.z0 + o.z1) / 2; const pr = this.project(cx, cz, null);
      const ext = Math.max(o.x1 - o.x0, o.z1 - o.z0) / 2 + 2;
      if (Math.abs(pr.lat) > this.halfW[pr.idx] + ext) continue;
      const span = Math.round((ext + 90) / ds);
      for (let k = -span; k <= span; k++) {
        const i = (pr.idx + k + N) % N; const w = 0.5 + 0.5 * Math.cos(Math.PI * k / span);
        const lim = this.halfW[i] - hwc - 3;
        const right = pr.lat + ext + hwc + 6, left = pr.lat - ext - hwc - 6;
        const target = (lim - right) >= (left + lim) ? Math.min(right, lim) : Math.max(left, -lim);
        if (Math.abs(this.carLine[i] - pr.lat) < ext + hwc + 6 || w > 0.6) this.carLine[i] = this.carLine[i] * (1 - w) + target * w;
      }
    }
    // speed profiles
    const prof = (type) => {
      const VD = type === 'heli' ? { ...V.drone, ...CONFIG.models.heli } : V.drone;
      const top = type === 'car' ? 1e4 : VD.thrust / VD.drag; // cars: curvature-limited only, each model caps its own top speed
      const v = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        const sf = type === 'car' ? 1 : CONFIG.surfaces[this.surface[i]].drone.speed;
        let m = Math.min(top * sf * 0.98, Math.sqrt(A.latAcc[type] / Math.max(Math.abs(this.curv[i]), 1e-5)));
        if (type === 'car') m = Math.min(m, V.car.steerRate * 0.8 / Math.max(Math.abs(this.curv[i]), 1e-5));
        const cap = A.sectionCap[type][this.section[i]]; if (cap) m = Math.min(m, cap);
        v[i] = m;
      }
      const b = A.brake[type];
      for (let pass = 0; pass < 2; pass++) for (let i = N - 1; i >= 0; i--) { const j = (i + 1) % N; v[i] = Math.min(v[i], Math.sqrt(v[j] * v[j] + 2 * b * ds)); }
      return v;
    };
    this.minorSolids = this.solids.filter(o => o.minor);
    this.carSpeed = prof('car'); this.droneSpeed = prof('drone'); this.heliSpeed = prof('heli');
  }
}
