import { CONFIG } from './config.js';
import { wrapA } from './track.js';

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export function battFactor(b) { const B = CONFIG.battery; return b >= B.lowThreshold ? 1 : B.minSpeedFactor + (1 - B.minSpeedFactor) * (b / B.lowThreshold); }

export class Racer {
  constructor(o) {
    Object.assign(this, {
      id: 0, name: '', type: 'car', color: 0xff0000, isPlayer: false,
      x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, heading: 0, battery: 100, spool: 0,
      idx: 0, s: 0, lat: 0, progress: 0, lapsDone: 0, lapStart: 0, lapTimes: [], best: Infinity,
      finished: false, finishTime: 0, input: { thr: 0, steer: 0, alt: 0, pitch: 0 }, ai: null,
      onPad: false, wrongWayT: 0, surface: 'tile', section: 1, gateBlockT: 0, scrapeT: 0, charges: 0, padTime: 0,
    }, o);
  }
  get speed() { return Math.hypot(this.vx, this.vz); }
  get fwd() { return this.vx * Math.cos(this.heading) + this.vz * Math.sin(this.heading); }
}

export class AIDriver {
  constructor(track, o = {}) { this.T = track; this.skill = o.skill ?? 1; this.lineK = o.lineK ?? 1; this.altOff = o.altOff ?? 0; this.stuckT = 0; this.recoverT = 0; this.pad = null; this.charging = false; }
  update(r, dt, running) {
    const T = this.T, N = T.N, ds = T.ds, A = CONFIG.ai, inp = r.input;
    if (!running) { inp.thr = inp.steer = inp.alt = inp.pitch = 0; return; }
    const sp = r.speed, fwd = r.fwd;
    const look = A.lookahead + sp * A.lookaheadSpeedK;
    const ti = (r.idx + Math.round(look / ds)) % N;
    const line = r.type === 'car' ? T.carLine : T.droneLine;
    let tx = T.px[ti] + T.nx[ti] * line[ti] * this.lineK, tz = T.pz[ti] + T.nz[ti] * line[ti] * this.lineK;
    const prof = r.type === 'car' ? T.carSpeed : T.droneSpeed;
    let vt = prof[(r.idx + Math.round((8 + sp * 0.25) / ds)) % N] * this.skill;
    let targetAlt = Math.min(A.cruiseAltitude + this.altOff, T.droneSafeAlt[r.idx]);
    // drone recharge logic
    if (r.type === 'drone') {
      if (!this.pad && r.battery < A.rechargeBelow) {
        for (const p of T.pads) { const ah = T.wrapS(p.s - r.s); if (ah > 25 && ah < 450) { this.pad = p; break; } }
      }
      if (this.pad) {
        const p = this.pad, d = Math.hypot(p.x - r.x, p.z - r.z), ah = T.wrapS(p.s - r.s);
        if (r.battery >= A.rechargeUntil || ah < -70) { this.pad = null; }
        else {
          tx = p.x; tz = p.z; vt = Math.min(vt, Math.max(0, (d - 4) * 1.0));
          if (d < 45) targetAlt = 0; 
        }
      }
    }
    let desired = Math.atan2(tz - r.z, tx - r.x);
    if (r.type === 'drone' && sp > 15) { const va = Math.atan2(r.vz, r.vx); desired += clamp(wrapA(desired - va), -0.6, 0.6) * 0.6; }
    const err = wrapA(desired - r.heading);
    // stuck detection
    if (sp < 5 && !(this.pad) && r.y < 40) this.stuckT += dt; else this.stuckT = Math.max(0, this.stuckT - dt);
    if (this.stuckT > 1.0 && !(r.type === 'drone' && r.y < 3 && r.spool < 1)) { this.recoverT = 0.9; this.stuckT = 0; }
    if (r.type === 'car') {
      if (this.recoverT > 0) { this.recoverT -= dt; inp.thr = -1; inp.steer = -Math.sign(err) || 1; return; }
      if (Math.abs(err) > 2.3 && sp < 30) { inp.thr = -0.8; inp.steer = -Math.sign(err); return; }
      inp.steer = clamp(err * 2.4, -1, 1);
      let thr = fwd < vt - 2 ? 1 : fwd > vt + 6 ? -1 : 0.3;
      if (Math.abs(err) > 1.2) thr = Math.min(thr, 0.4);
      inp.thr = thr; inp.alt = 0; inp.pitch = 0;
    } else {
      inp.steer = clamp(err * 2.2, -1, 1);
      inp.alt = clamp((targetAlt - r.y) / 7 - r.vy / 50, -1, 1);
      if (this.recoverT > 0) { this.recoverT -= dt; inp.pitch = -0.8; inp.alt = 0.6; return; }
      let pitch = fwd < vt - 2 ? 1 : fwd > vt + 5 ? -1 : 0.25;
      if (this.pad && Math.hypot(this.pad.x - r.x, this.pad.z - r.z) < 10) { pitch = clamp(-fwd / 20, -1, 1); inp.steer *= 0.3; }
      if (Math.abs(err) > 0.9) pitch *= 0.3;
      if (r.y < CONFIG.vehicles.drone.takeoffAltitude + 1 && targetAlt > 5) pitch = 0; // wait for lift-off
      inp.pitch = pitch;
    }
  }
}

export class Sim {
  constructor(track) { this.T = track; this.racers = []; this.t = 0; this.running = false; this._pr = {}; this.finishOrder = []; }
  reset() { this.racers = []; this.t = 0; this.running = false; this.finishOrder = []; }
  add(r) { r.id = this.racers.length; this.racers.push(r); return r; }
  placeGrid(order) {
    const T = this.T; const slots = [[-22, -20], [-22, 20], [-52, -20], [-52, 20]];
    order.forEach((r, k) => {
      const [s, lat] = slots[k % 4]; const i = ((Math.round(s / T.ds)) % T.N + T.N) % T.N;
      r.x = T.px[i] + T.nx[i] * lat; r.z = T.pz[i] + T.nz[i] * lat; r.y = 0; r.heading = Math.atan2(T.tz[i], T.tx[i]);
      r.vx = r.vy = r.vz = 0; const pr = T.project(r.x, r.z, null); r.idx = pr.idx; r.s = pr.s; r.lat = pr.lat; r.progress = T.wrapS(pr.s);
    });
  }
  step(dt) {
    const T = this.T;
    if (this.running) this.t += dt;
    for (const r of this.racers) {
      if (r.ai && (!r.isPlayer || r.autopilot || r.finished)) r.ai.update(r, dt, this.running);
      if (!this.running) { r.input.thr = r.input.steer = r.input.alt = r.input.pitch = 0; }
      r._px = r.x; r._pz = r.z; r._py = r.y; r._lat = r.lat;
      if (r.type === 'car') this.carStep(r, dt); else this.droneStep(r, dt);
      this.collideSolids(r);
    }
    // vehicle-vehicle
    const R = this.racers;
    for (let a = 0; a < R.length; a++) for (let b = a + 1; b < R.length; b++) {
      const A = R[a], B = R[b]; const dx = B.x - A.x, dz = B.z - A.z; const d = Math.hypot(dx, dz);
      const ra = CONFIG.vehicles[A.type].radius, rb = CONFIG.vehicles[B.type].radius;
      if (d < ra + rb && d > 0.001 && Math.abs(A.y - B.y) < 6) {
        const nx = dx / d, nz = dz / d, pen = (ra + rb - d) / 2;
        A.x -= nx * pen; A.z -= nz * pen; B.x += nx * pen; B.z += nz * pen;
        const rel = (B.vx - A.vx) * nx + (B.vz - A.vz) * nz;
        if (rel < 0) { const j = -rel * 0.6; A.vx -= nx * j; A.vz -= nz * j; B.vx += nx * j; B.vz += nz * j; }
      }
    }
    for (const r of this.racers) this.post(r, dt);
  }
  carStep(r, dt) {
    const c = CONFIG.vehicles.car, sf = CONFIG.surfaces[r.surface].car, bf = battFactor(r.battery), inp = r.input;
    const ch = Math.cos(r.heading), sh = Math.sin(r.heading);
    let vF = r.vx * ch + r.vz * sh, vL = -r.vx * sh + r.vz * ch;
    const top = c.topSpeed * sf.speed * bf; const thr = clamp(inp.thr, -1, 1);
    if (thr > 0.02) {
      if (vF < 0) vF = Math.min(0, vF + c.brakeDecel * thr * dt);
      else if (vF < top) vF = Math.min(top, vF + c.accel * sf.accel * bf * thr * dt);
    } else if (thr < -0.02) {
      if (vF > 0) vF = Math.max(0, vF + c.brakeDecel * thr * dt);
      else vF = Math.max(-c.reverseTop * bf, vF + c.accel * 0.6 * thr * dt);
    } else vF -= Math.sign(vF) * Math.min(Math.abs(vF), c.coastDecel * dt);
    if (vF > top) vF -= (vF - top) * 2.5 * dt;
    vL *= Math.exp(-c.grip * sf.grip * dt);
    const steerAmt = Math.min(1, Math.abs(vF) / c.steerSpeedRef) * (1 - c.highSpeedSteerLoss * Math.min(1, Math.abs(vF) / c.topSpeed));
    r.heading += clamp(inp.steer, -1, 1) * c.steerRate * steerAmt * Math.sign(vF) * dt;
    r.vx = vF * ch - vL * sh; r.vz = vF * sh + vL * ch; r.vy = 0;
    r.x += r.vx * dt; r.z += r.vz * dt; r.y = 0;
    if (!r.onPad) r.battery -= (c.batteryDrainBase + c.batteryDrainThrottle * Math.max(0, thr)) * dt * (this.running ? 1 : 0);
  }
  droneStep(r, dt) {
    const d = CONFIG.vehicles.drone, sf = CONFIG.surfaces[r.surface].drone, bf = battFactor(r.battery), inp = r.input;
    if (this.running) r.spool = Math.min(1, r.spool + dt / d.spoolTime);
    const tv = clamp(inp.alt, -1, 1) * d.climbRate * r.spool;
    r.vy += (tv - r.vy) * Math.min(1, d.climbResponse * dt);
    r.y += r.vy * dt;
    if (r.y <= 0) { r.y = 0; if (r.vy < 0) r.vy = 0; }
    if (r.y > CONFIG.maxAltitude) { r.y = CONFIG.maxAltitude; if (r.vy > 0) r.vy = 0; }
    const air = r.y > d.takeoffAltitude;
    const ch = Math.cos(r.heading), sh = Math.sin(r.heading);
    const pitch = clamp(inp.pitch, -1, 1);
    const a = pitch * d.thrust * sf.accel * bf * r.spool * (air ? 1 : 0.12) * sf.speed;
    r.vx += ch * a * dt; r.vz += sh * a * dt;
    const dr = Math.exp(-d.drag * dt); r.vx *= dr; r.vz *= dr;
    let vF = r.vx * ch + r.vz * sh, vL = -r.vx * sh + r.vz * ch;
    vL *= Math.exp(-d.lateralDamp * dt);
    if (!air) { const g = Math.exp(-d.groundFriction * dt); vF *= g; vL *= g; }
    r.vx = vF * ch - vL * sh; r.vz = vF * sh + vL * ch;
    r.heading += clamp(inp.steer, -1, 1) * d.yawRate * Math.max(0.3, r.spool) * dt;
    r.x += r.vx * dt; r.z += r.vz * dt;
    if (!r.onPad && this.running) r.battery -= (d.batteryDrainBase * r.spool + d.batteryDrainThrust * Math.abs(pitch) + d.batteryDrainClimb * Math.max(0, inp.alt)) * dt;
  }
  collideSolids(r) {
    const V = CONFIG.vehicles[r.type], rad = V.radius - 1.5, h = V.height, isCar = r.type === 'car';
    for (const s of this.T.solids) {
      if (r.x + rad <= s.x0 || r.x - rad >= s.x1 || r.z + rad <= s.z0 || r.z - rad >= s.z1 || r.y + h <= s.y0 || r.y >= s.y1) continue;
      const pxa = r.x + rad - s.x0, pxb = s.x1 - (r.x - rad), pza = r.z + rad - s.z0, pzb = s.z1 - (r.z - rad);
      const px = Math.min(pxa, pxb), pz = Math.min(pza, pzb);
      let py = 1e9, pyDir = 0;
      if (!isCar) { const pya = r.y + h - s.y0, pyb = s.y1 - r.y; if (pya < pyb) { py = pya; pyDir = -1; } else { py = pyb; pyDir = 1; } }
      if (py < px && py < pz) { r.y += pyDir * py; if (r.vy * pyDir < 0) r.vy = 0; }
      else if (px < pz) { const dir = pxa < pxb ? -1 : 1; r.x += dir * px; if (r.vx * dir < 0) r.vx *= -0.2; r.vz *= 0.97; r.scrapeT = 0.2; }
      else { const dir = pza < pzb ? -1 : 1; r.z += dir * pz; if (r.vz * dir < 0) r.vz *= -0.2; r.vx *= 0.97; r.scrapeT = 0.2; }
    }
  }
  post(r, dt) {
    const T = this.T, V = CONFIG.vehicles[r.type], B = CONFIG.battery;
    const pr = T.project(r.x, r.z, r.idx, this._pr);
    // lateral limits (barriers / drone shortcut margin)
    const i = pr.idx, hwT = T.halfW[i], inner = hwT - V.halfWidth;
    let maxL = inner, minL = 0;
    if (r.type === 'drone') {
      const m = CONFIG.droneShortcutMargin * T.marginF[i]; const high = r.y > CONFIG.barrierHeight + 0.5;
      if (high) maxL = inner + m;
      else if (Math.abs(r._lat) > hwT + 1 && hwT + 3 + V.halfWidth <= inner + m) { maxL = inner + m; minL = hwT + 3 + V.halfWidth; }
    }
    const al = Math.abs(pr.lat), sg = Math.sign(pr.lat) || 1, nx = T.nx[i], nz = T.nz[i];
    let corr = 0; if (al > maxL) corr = al - maxL; else if (al < minL) corr = al - minL;
    if (corr !== 0) {
      r.x -= nx * sg * corr; r.z -= nz * sg * corr; pr.lat -= sg * corr;
      const vn = (r.vx * nx + r.vz * nz) * sg * Math.sign(corr);
      if (vn > 0) { r.vx -= nx * sg * Math.sign(corr) * vn * 1.15; r.vz -= nz * sg * Math.sign(corr) * vn * 1.15; }
      r.vx *= 0.995; r.vz *= 0.995; r.scrapeT = 0.2;
    }
    // gates (must pass under the bar)
    const sPrev = r.s; let sNew = pr.s;
    for (const g of T.gates) {
      const rp = T.wrapS(sPrev - g.s), rn = T.wrapS(sNew - g.s);
      if (rp < 0 && rn >= 0 && rp > -60) {
        if (r.y + V.height > g.h) {
          r.x = r._px; r.z = r._pz; sNew = sPrev; pr.idx = r.idx; pr.lat = r._lat;
          const tx = T.tx[g.i], tz = T.tz[g.i]; const vt = r.vx * tx + r.vz * tz;
          if (vt > 0) { r.vx -= tx * vt * 1.4; r.vz -= tz * vt * 1.4; }
          r.gateBlockT = 1.5;
        } else if (r.isPlayer) r.lastGate = g.index;
      }
    }
    r.progress += T.wrapS(sNew - sPrev);
    r.idx = pr.idx; r.s = sNew; r.lat = pr.lat;
    r.section = T.section[r.idx]; if (this.running && !r.finished) { r.secT = r.secT || {}; r.secT[r.section] = (r.secT[r.section] || 0) + dt; r.maxSp = r.maxSp||{}; r.maxSp[r.section] = Math.max(r.maxSp[r.section]||0, r.speed); } r.surface = r.z > 903 ? 'grass' : 'tile';
    // pads
    r.onPad = false;
    for (const p of T.pads) if (Math.hypot(p.x - r.x, p.z - r.z) < B.padRadius && r.y < B.padMaxAltitude) {
      if (this.running && r.battery < 100) { r.battery = Math.min(100, r.battery + B.padChargeRate * dt); r.padTime += dt; }
      r.onPad = true;
    }
    if (r.onPad && !r._wasOnPad && r.battery < 95) r.charges++;
    r._wasOnPad = r.onPad;
    r.battery = clamp(r.battery, 0, 100);
    // wrong way
    const dot = Math.cos(r.heading) * T.tx[r.idx] + Math.sin(r.heading) * T.tz[r.idx];
    r.wrongWayT = (dot < -0.3 && r.speed > 8) ? r.wrongWayT + dt : 0;
    r.gateBlockT = Math.max(0, r.gateBlockT - dt); r.scrapeT = Math.max(0, r.scrapeT - dt);
    // laps
    if (this.running && !r.finished && r.progress >= (r.lapsDone + 1) * T.L) {
      r.lapsDone++; const lt = this.t - r.lapStart; r.lapTimes.push(lt); r.best = Math.min(r.best, lt); r.lapStart = this.t;
      if (r.lapsDone >= CONFIG.laps) { r.finished = true; r.finishTime = this.t; this.finishOrder.push(r); }
    }
  }
  standings() {
    return [...this.racers].sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1; if (b.finished) return 1;
      return b.progress - a.progress;
    });
  }
}
