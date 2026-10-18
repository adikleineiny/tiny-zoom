import { CONFIG } from './config.js';
import { wrapA } from './track.js';

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export function battFactor(b) { const B = CONFIG.battery; return b >= B.lowThreshold ? 1 : B.minSpeedFactor + (1 - B.minSpeedFactor) * (b / B.lowThreshold); }

// Merged per-racer stats (vehicles[class] + models[model] overrides)
export function vehicleStats(r) { return { ...CONFIG.vehicles[r.type], ...(CONFIG.models[r.model] || {}) }; }
export const modelClass = m => CONFIG.models[m]?.class || (m === 'drone' ? 'drone' : 'car');
export const normModel = m => CONFIG.models[m] ? m : (m === 'drone' ? 'drone' : 'racecar');

export class Racer {
  constructor(o) {
    Object.assign(this, {
      id: 0, name: '', type: 'car', color: 0xff0000, isPlayer: false,
      x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, heading: 0, battery: 100, spool: 0,
      idx: 0, s: 0, lat: 0, progress: 0, lapsDone: 0, lapStart: 0, lapTimes: [], best: Infinity,
      finished: false, finishTime: 0, input: { thr: 0, steer: 0, alt: 0, pitch: 0 }, ai: null,
      onPad: false, wrongWayT: 0, surface: 'tile', section: 1, gateBlockT: 0, scrapeT: 0, charges: 0, padTime: 0,
      model: null, grounded: true, groundY: 0, jumpCD: 0, airT: 0, landImpact: 0, drifting: false,
      spinT: 0, spinDir: 1, tumbleT: 0, tumbleTot: 1, stunT: 0, immuneT: 0, turboT: 0, fireT: 0,
      weapon: null, rollT: 0, holdT: 0, bomb: null, hits: 0, shots: 0,
    }, o);
    this.input = { thr: 0, steer: 0, alt: 0, pitch: 0, jump: false, fire: false, ...(o.input || {}) };
    this.model = normModel(this.model || this.type); this.type = modelClass(this.model);
    this.V = vehicleStats(this);
  }
  get controllable() { return this.spinT <= 0 && this.tumbleT <= 0; }
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
    const line = r.type === 'car' ? T.carLine : T.droneLine, heli = r.model === 'heli';
    let tx = T.px[ti] + T.nx[ti] * line[ti] * this.lineK, tz = T.pz[ti] + T.nz[ti] * line[ti] * this.lineK;
    const prof = r.type === 'car' ? T.carSpeed : heli ? T.heliSpeed : T.droneSpeed;
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
    if (sp < 5 && !this.pad && running) this.stuckLong = (this.stuckLong || 0) + dt; else this.stuckLong = 0;
    if (this.stuckLong > 4.5) { this.stuckLong = 0; r.respawnReq = true; }
    // no forward progress for a while (wedged / knocked somewhere silly) → back on track
    if (running && !this.pad) { if (r.progress > (this.bestProg ?? -1e9) + 15) { this.bestProg = r.progress; this.noProgT = 0; } else if ((this.noProgT = (this.noProgT || 0) + dt) > 6) { this.noProgT = 0; this.bestProg = r.progress; r.respawnReq = true; } }
    inp.jump = false;
    if (r.type === 'car') {
      const sfx = r.surface === 'grass' && r.V.grass ? r.V.grass : CONFIG.surfaces[r.surface].car;
      vt = Math.min(vt, r.V.topSpeed * sfx.speed * this.skill * (r.turboT > 0 ? 2 : 1));
      if (this.recoverT > 0) { this.recoverT -= dt; inp.thr = -1; inp.steer = -Math.sign(err) || 1; return; }
      // hop small obstacles ahead, plus the odd jump just for fun
      if (sp > 30 && r.grounded) {
        const c = Math.cos(r.heading), s = Math.sin(r.heading);
        for (const dist of [8 + sp * 0.12, 4 + sp * 0.08]) {
          const hx = r.x + c * dist, hz = r.z + s * dist;
          for (const o of T.minorSolids) if (o.y1 <= A.hopMaxHeight && hx > o.x0 - 5 && hx < o.x1 + 5 && hz > o.z0 - 5 && hz < o.z1 + 5) inp.jump = true;
        }
        if (Math.abs(err) < 0.25 && Math.random() < A.randomJumpRate * dt) inp.jump = true;
      }
      // facing the wrong way (e.g. after a spin-out): J-turn in reverse until roughly aligned (hysteresis avoids crawling backwards forever)
      if (Math.abs(err) > 2.3 && sp < 40) this.turnT = 2.5;
      if (this.turnT > 0) { this.turnT -= dt; if (Math.abs(err) < 0.9) this.turnT = 0; else { inp.thr = -1; inp.steer = -Math.sign(err) || 1; return; } }
      inp.steer = clamp(err * 2.4, -1, 1);
      let thr = fwd < vt - 2 ? 1 : fwd > vt + 6 ? -1 : 0.3;
      if (Math.abs(err) > 1.2) thr = Math.min(thr, 0.4);
      inp.thr = thr; inp.alt = 0; inp.pitch = 0;
    } else {
      inp.steer = clamp(err * 2.2, -1, 1);
      inp.alt = clamp((targetAlt - r.y) / 7 - r.vy / 50, -1, 1);
      if (r.stunT > 0) inp.alt = 1; // fight the power cut
      if (this.recoverT > 0) { this.recoverT -= dt; inp.pitch = -0.8; inp.alt = 0.6; return; }
      let pitch = fwd < vt - 2 ? 1 : fwd > vt + 5 ? -1 : 0.25;
      if (this.pad && Math.hypot(this.pad.x - r.x, this.pad.z - r.z) < 10) { pitch = clamp(-fwd / 20, -1, 1); inp.steer *= 0.3; }
      if (Math.abs(err) > 0.9) pitch *= 0.3;
      if (r.y < r.V.takeoffAltitude + 1 && targetAlt > 5) pitch = 0; // wait for lift-off
      if (heli && r.tiltP > 0.5 && fwd > vt + 2) pitch = -1; // heli: brake early, it carries momentum
      inp.pitch = pitch;
    }
  }
}

export class Sim {
  constructor(track) { this.T = track; this.racers = []; this.t = 0; this.running = false; this._pr = {}; this.finishOrder = []; this.events = []; this.weapons = null; }
  reset() { this.racers = []; this.t = 0; this.running = false; this.finishOrder = []; this.events.length = 0; if (this.weapons) this.weapons.reset(); }
  emit(e) { if (this.events.length < 400) this.events.push(e); }
  // Apply a weapon / ram hit. o: { kx, kz, up, spin, tumble, stun, slow, by, kind }
  hit(r, o) {
    const W = CONFIG.weapons.hit;
    if (r.immuneT > 0 || (r.finished && !r.isPlayer && false)) return false;
    const m = 1 / (r.V.mass || 1), slow = o.slow ?? 0.6;
    r.vx = r.vx * slow + (o.kx || 0) * m; r.vz = r.vz * slow + (o.kz || 0) * m;
    if (o.up) { r.vy = Math.max(r.vy, o.up * (r.type === 'drone' ? 0.6 : 1) * Math.sqrt(m)); r.grounded = false; }
    if (o.spin) { r.spinT = Math.max(r.spinT, o.spin); r.spinDir = Math.random() < 0.5 ? -1 : 1; }
    if (o.tumble) { r.tumbleT = r.tumbleTot = o.tumble; }
    if (o.stun) r.stunT = Math.max(r.stunT, o.stun);
    r.immuneT = W.immune; r.hits++; if (o.by && o.by !== r) o.by.landed = (o.by.landed || 0) + 1;
    this.emit({ type: 'hit', r, kind: o.kind, by: o.by });
    return true;
  }
  respawn(r) {
    const T = this.T, i = r.idx; r.x = T.px[i]; r.z = T.pz[i]; r.y = r.type === 'drone' ? Math.min(15, T.droneSafeAlt[i]) : 0;
    r.vx = r.vy = r.vz = 0; r.heading = Math.atan2(T.tz[i], T.tx[i]); r.lat = 0; r.grounded = true; r.groundY = 0;
    r.spinT = r.tumbleT = r.stunT = 0; r.immuneT = 1.5; r.respawnReq = false;
    this.emit({ type: 'respawn', r });
  }
  add(r) { r.id = this.racers.length; this.racers.push(r); return r; }
  placeGrid(order) {
    const T = this.T; const slots = [[-22, -20], [-22, 20], [-52, -20], [-52, 20], [-82, 0]];
    order.forEach((r, k) => {
      const [s, lat] = slots[k % slots.length]; const i = ((Math.round(s / T.ds)) % T.N + T.N) % T.N;
      r.x = T.px[i] + T.nx[i] * lat; r.z = T.pz[i] + T.nz[i] * lat; r.y = 0; r.heading = Math.atan2(T.tz[i], T.tx[i]);
      r.vx = r.vy = r.vz = 0; const pr = T.project(r.x, r.z, null); r.idx = pr.idx; r.s = pr.s; r.lat = pr.lat; r.progress = T.wrapS(pr.s);
    });
  }
  step(dt) {
    const T = this.T;
    if (this.running) this.t += dt;
    for (const r of this.racers) {
      if (r.ai && (!r.isPlayer || r.autopilot || r.finished)) r.ai.update(r, dt, this.running);
      if (!this.running) { r.input.thr = r.input.steer = r.input.alt = r.input.pitch = 0; r.input.jump = false; }
      if (r.respawnReq) this.respawn(r);
      r._px = r.x; r._pz = r.z; r._py = r.y; r._lat = r.lat;
      for (const k of ['spinT', 'tumbleT', 'stunT', 'immuneT', 'turboT', 'jumpCD']) if (r[k] > 0) r[k] = Math.max(0, r[k] - dt);
      if (r.type === 'car') { this.carStep(r, dt); this.collideSolids(r); this.groundSupport(r, dt); }
      else { this.droneStep(r, dt); this.collideSolids(r); }
    }
    // vehicle-vehicle: mass-weighted bouncy contact, turbo rams, sticky-bomb passing
    const R = this.racers, Wt = CONFIG.weapons.turbo;
    for (let a = 0; a < R.length; a++) for (let b = a + 1; b < R.length; b++) {
      const A = R[a], B = R[b]; const dx = B.x - A.x, dz = B.z - A.z; const d = Math.hypot(dx, dz);
      const ra = A.V.radius, rb = B.V.radius;
      if (d < ra + rb && d > 0.001 && Math.abs(A.y - B.y) < 7) {
        const nx = dx / d, nz = dz / d, ma = A.V.mass || 1, mb = B.V.mass || 1, ia = 1 / ma, ib = 1 / mb, pen = (ra + rb - d);
        A.x -= nx * pen * ia / (ia + ib); A.z -= nz * pen * ia / (ia + ib); B.x += nx * pen * ib / (ia + ib); B.z += nz * pen * ib / (ia + ib);
        const rel = (B.vx - A.vx) * nx + (B.vz - A.vz) * nz;
        if (rel < 0) { const j = -rel * 1.5 / (ia + ib); A.vx -= nx * j * ia; A.vz -= nz * j * ia; B.vx += nx * j * ib; B.vz += nz * j * ib; }
        for (const [P, Q, sg] of [[A, B, 1], [B, A, -1]]) {
          if (P.turboT > 0 && Q.immuneT <= 0) {
            // knock aside: push along contact normal + sideways
            const kx = nx * sg, kz = nz * sg, side = (kx * Math.sin(P.heading) - kz * Math.cos(P.heading)) >= 0 ? 1 : -1;
            this.hit(Q, { kx: kx * Wt.ramKnock - Math.sin(P.heading) * side * Wt.ramKnock * 0.5, kz: kz * Wt.ramKnock + Math.cos(P.heading) * side * Wt.ramKnock * 0.5, up: Wt.ramUp, spin: 0.6, slow: 0.6, by: P, kind: 'ram' });
          }
          if (P.bomb && !Q.bomb && P.bomb.passCD <= 0) { Q.bomb = { ...P.bomb, passCD: CONFIG.weapons.bomb.passCooldown, owner: P }; P.bomb = null; this.emit({ type: 'bombPass', from: P, to: Q }); }
        }
      }
    }
    if (this.weapons) this.weapons.step(dt);
    for (const r of this.racers) this.post(r, dt);
  }
  carStep(r, dt) {
    const c = r.V, sf = r.surface === 'grass' && c.grass ? c.grass : CONFIG.surfaces[r.surface].car, bf = battFactor(r.battery), inp = r.input;
    const ctl = r.controllable, power = ctl && r.stunT <= 0, turbo = r.turboT > 0, Wt = CONFIG.weapons.turbo;
    const ch = Math.cos(r.heading), sh = Math.sin(r.heading);
    let vF = r.vx * ch + r.vz * sh, vL = -r.vx * sh + r.vz * ch;
    const top = c.topSpeed * sf.speed * bf * (turbo ? Wt.speedMul : 1);
    let thr = power ? clamp(inp.thr, -1, 1) : 0; if (turbo && power) thr = 1;
    const steer = ctl ? clamp(inp.steer, -1, 1) : 0;
    r.drifting = false;
    if (r.grounded) {
      if (thr > 0.02) {
        const launch = 1 + c.launchBoost * Math.max(0, 1 - Math.max(0, vF) / top);
        if (vF < 0) vF = Math.min(0, vF + c.brakeDecel * thr * dt);
        else if (vF < top) vF = Math.min(top, vF + c.accel * sf.accel * bf * thr * launch * (turbo ? Wt.accelMul : 1) * dt);
      } else if (thr < -0.02) {
        if (vF > 0) vF = Math.max(0, vF + c.brakeDecel * thr * dt);
        else vF = Math.max(-c.reverseTop * bf, vF + c.accel * 0.6 * thr * dt);
      } else vF -= Math.sign(vF) * Math.min(Math.abs(vF), c.coastDecel * (power ? 1 : 2.5) * dt);
      if (vF > top) vF -= (vF - top) * 2.5 * dt;
      r.drifting = ctl && Math.abs(steer) > c.driftThreshold && vF > c.topSpeed * c.driftMinSpeed;
      let grip = c.grip * sf.grip * (r.drifting ? c.driftGrip : 1); if (r.spinT > 0) grip = 1.5;
      vL *= Math.exp(-grip * dt);
      const steerAmt = Math.min(1, Math.abs(vF) / c.steerSpeedRef) * (1 - c.highSpeedSteerLoss * Math.min(1, Math.abs(vF) / c.topSpeed));
      r.heading += steer * c.steerRate * steerAmt * (r.drifting ? c.driftSteerBoost : 1) * Math.sign(vF) * dt;
      if (ctl && inp.jump && r.jumpCD <= 0) { r.vy = c.jumpV; r.grounded = false; r.jumpCD = c.jumpCooldown + 0.2; this.emit({ type: 'jump', r }); }
    } else {
      r.heading += steer * c.airSteer * dt; // a little air control
      if (turbo) vF = Math.min(top, vF + c.accel * 0.5 * dt);
    }
    if (r.spinT > 0) { r.heading += r.spinDir * CONFIG.weapons.hit.spinRate * Math.min(1, r.spinT * 2) * dt; vF *= Math.exp(-1.8 * dt); }
    if (r.tumbleT > 0) { vF *= Math.exp(-1.2 * dt); }
    r.vx = vF * ch - vL * sh; r.vz = vF * sh + vL * ch;
    if (!r.grounded) { r.vy -= CONFIG.gravity * dt; r.airT += dt; }
    r.x += r.vx * dt; r.z += r.vz * dt; r.y += r.vy * dt;
    if (!r.onPad) r.battery -= (c.batteryDrainBase + c.batteryDrainThrottle * Math.max(0, thr)) * dt * (this.running ? 1 : 0);
  }
  // floor / obstacle-top support, landing detection
  groundSupport(r, dt) {
    const c = r.V, rad = c.radius - 2.5; let g = 0; const reach = Math.max(r.y, r._py) + c.stepUp + 0.01;
    for (const s of this.T.solids) if (s.y1 <= reach && s.y1 > g && r.x + rad > s.x0 && r.x - rad < s.x1 && r.z + rad > s.z0 && r.z - rad < s.z1) g = s.y1;
    r.groundY = g;
    if (r.y <= g + 0.01 && r.vy <= 0) {
      if (!r.grounded) { r.landImpact = Math.min(1, -r.vy / 320); if (r.airT > 0.12) this.emit({ type: 'land', r, impact: r.landImpact }); }
      r.y = g; r.vy = 0; r.grounded = true; r.airT = 0;
    } else if (r.y > g + 0.6 || r.vy > 0) r.grounded = false;
    else { r.y = g; r.vy = 0; r.grounded = true; } // small ledge drop: stick to ground
  }
  droneStep(r, dt) {
    const d = r.V, sf = CONFIG.surfaces[r.surface].drone, bf = battFactor(r.battery), inp = r.input;
    if (this.running) r.spool = Math.min(1, r.spool + dt / d.spoolTime);
    const ctl = r.controllable, power = ctl && r.stunT <= 0;
    if (ctl && inp.jump && r.jumpCD <= 0) { r.vy = Math.max(r.vy, d.hopV); r.jumpCD = 0.6; this.emit({ type: 'jump', r }); }
    if (power) {
      let tv = clamp(inp.alt, -1, 1) * d.climbRate * r.spool;
      if (d.hoverWobble && r.y > d.takeoffAltitude) { r._wob = (r._wob || 0) + (Math.random() - 0.5) * 6 * dt; r._wob *= Math.exp(-0.8 * dt); tv += clamp(r._wob, -1, 1) * d.hoverWobble - Math.abs(r.tiltP || 0) * d.hoverWobble * 0.6; }
      r.vy += (tv - r.vy) * Math.min(1, d.climbResponse * dt);
    }
    else if (r.stunT > 0) r.vy -= CONFIG.weapons.zap.droneDrop * 2 * dt;   // power cut: drops
    else r.vy += (-8 - r.vy) * Math.min(1, 1.2 * dt);                       // tumbling: floaty sink
    r.y += r.vy * dt;
    if (r.y <= 0) { r.y = 0; if (r.vy < 0) r.vy = 0; }
    if (r.y > CONFIG.maxAltitude) { r.y = CONFIG.maxAltitude; if (r.vy > 0) r.vy = 0; }
    const air = r.y > d.takeoffAltitude;
    const ch = Math.cos(r.heading), sh = Math.sin(r.heading);
    let pitch = power ? (r.turboT > 0 ? 1 : clamp(inp.pitch, -1, 1)) : 0;
    if (d.tiltResponse > 0) { r.tiltP = (r.tiltP || 0) + (pitch - (r.tiltP || 0)) * Math.min(1, d.tiltResponse * dt); pitch = r.tiltP; } // rotor disc tilts first, then thrust follows
    const a = pitch * d.thrust * sf.accel * bf * r.spool * (air ? 1 : 0.12) * sf.speed * (r.turboT > 0 ? CONFIG.weapons.turbo.droneThrustMul : 1);
    r.vx += ch * a * dt; r.vz += sh * a * dt;
    const dr = Math.exp(-d.drag * dt); r.vx *= dr; r.vz *= dr;
    let vF = r.vx * ch + r.vz * sh, vL = -r.vx * sh + r.vz * ch;
    vL *= Math.exp(-d.lateralDamp * dt);
    if (!air) { const g = Math.exp(-d.groundFriction * dt); vF *= g; vL *= g; }
    r.vx = vF * ch - vL * sh; r.vz = vF * sh + vL * ch;
    r.heading += (ctl ? clamp(inp.steer, -1, 1) : 0) * d.yawRate * Math.max(0.3, r.spool) * dt;
    if (r.spinT > 0) r.heading += r.spinDir * CONFIG.weapons.hit.spinRate * 0.8 * Math.min(1, r.spinT * 2) * dt;
    r.x += r.vx * dt; r.z += r.vz * dt;
    if (!r.onPad && this.running) r.battery -= (d.batteryDrainBase * r.spool + d.batteryDrainThrust * Math.abs(pitch) + d.batteryDrainClimb * Math.max(0, inp.alt)) * dt;
  }
  collideSolids(r) {
    const V = r.V, rad = V.radius - 1.5, h = V.height, isCar = r.type === 'car';
    for (const s of this.T.solids) {
      if (r.x + rad <= s.x0 || r.x - rad >= s.x1 || r.z + rad <= s.z0 || r.z - rad >= s.z1 || r.y + h <= s.y0 || r.y >= s.y1) continue;
      if (isCar && Math.max(r._py, r.y) >= s.y1 - V.stepUp - 0.01) continue; // on/over the top: handled by groundSupport
      const pxa = r.x + rad - s.x0, pxb = s.x1 - (r.x - rad), pza = r.z + rad - s.z0, pzb = s.z1 - (r.z - rad);
      const px = Math.min(pxa, pxb), pz = Math.min(pza, pzb);
      let py = 1e9, pyDir = 0;
      if (!isCar) { const pya = r.y + h - s.y0, pyb = s.y1 - r.y; if (pya < pyb) { py = pya; pyDir = -1; } else { py = pyb; pyDir = 1; } }
      else if (r._py + h <= s.y0 + 0.5) { py = r.y + h - s.y0; pyDir = -1; } // bonk head on a ceiling while jumping
      const kb = isCar ? V.wallBounce : 0.2, ks = isCar ? V.wallSlide : 0.97;
      if (py < px && py < pz) { r.y += pyDir * py; if (r.vy * pyDir < 0) r.vy = 0; }
      else if (px < pz) { const dir = pxa < pxb ? -1 : 1; r.x += dir * px; if (r.vx * dir < 0) { if (Math.abs(r.vx) > 60) this.emit({ type: 'bump', r }); r.vx *= -kb; } r.vz *= ks; r.scrapeT = 0.2; }
      else { const dir = pza < pzb ? -1 : 1; r.z += dir * pz; if (r.vz * dir < 0) { if (Math.abs(r.vz) > 60) this.emit({ type: 'bump', r }); r.vz *= -kb; } r.vx *= ks; r.scrapeT = 0.2; }
    }
  }
  post(r, dt) {
    const T = this.T, V = r.V, B = CONFIG.battery;
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
