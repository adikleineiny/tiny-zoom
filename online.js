// v3.9 online multiplayer: room codes, no accounts. Host = room creator and authority for the lobby, start/countdown,
// RC-parts crates, weapon rolls, projectiles, hits, bombs and the finish order. Each player's own vehicle is simulated
// on their own device (instant controls) and streamed to the others, who show it with ~0.1–0.2 s interpolation.
import { CONFIG } from './config.js';
import { Racer, AIDriver } from './sim.js';
import { WEAPON_KEYS } from './weapons.js';

export const MAX_PLAYERS = 6;
export const NET_COLORS = [0x3a86ff, 0xe63946, 0x2a9d8f, 0xf4a261, 0x9b5de5, 0xffd60a];
const PNAMES = ['Blue', 'Red', 'Teal', 'Orange', 'Purple', 'Yellow'];
const BOT_NAMES = ['Bolt', 'Buzz', 'Cork', 'Bee', 'Zip', 'Fizz'];
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
export const makeCode = (n = 5) => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => CODE_CHARS[b % CODE_CHARS.length]).join('');
export const validCode = c => /^[A-Z2-9]{4,5}$/.test(c) && [...c].every(ch => CODE_CHARS.includes(ch));
const SEND_HZ = 15, R2 = v => Math.round(v * 100) / 100, R1 = v => Math.round(v * 10) / 10;
const wrapA = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const EV_TYPES = new Set(['pickup', 'boxSpawn', 'gotWeapon', 'hit', 'boom', 'shock', 'emp', 'zap', 'ghost', 'turbo', 'fire', 'bombStick', 'bombPass', 'ballBounce', 'use']);

// own-vehicle state → compact array (motion + race progress); host-owned weapon fields are sent separately
function pack(r) {
  const f = (r.grounded ? 1 : 0) | (r.drifting ? 2 : 0) | (r.finished ? 4 : 0) | (r.scrapeT > 0 ? 8 : 0);
  return [R2(r.x), R2(r.y), R2(r.z), R2(r.heading), R1(r.vx), R1(r.vy), R1(r.vz), f, R2(r.spinT), R2(r.tumbleT), R2(r.tumbleTot), R2(r.stunT), R2(r.immuneT), R2(r.turboT),
    R2(r.rescueT), R1(r.progress), r.lapsDone, R2(r.finishTime), isFinite(r.best) ? R2(r.best) : -1, R2(r.input.steer || 0), R2(r.input.thr || 0), R2(r.spool || 0), R2(r.groundY || 0), R2(r.landImpact || 0), r.hits || 0, R2(r.input.pitch || 0), R2(r.input.alt || 0), R2(r.ghostT || 0)];
}
function unpackInto(r, a, T) {
  [r.x, r.y, r.z, r.heading, r.vx, r.vy, r.vz] = a; const f = a[7];
  r.grounded = !!(f & 1); r.drifting = !!(f & 2); r.scrapeT = f & 8 ? 0.1 : 0;
  r.spinT = a[8]; r.tumbleT = a[9]; r.tumbleTot = a[10] || 1; r.stunT = a[11]; r.immuneT = a[12]; r.turboT = a[13]; r.rescueT = a[14];
  r.progress = a[15]; r.lapsDone = a[16];
  if ((f & 4) && !r.finished) { r.finished = true; r.finishTime = a[17]; } r.best = a[18] < 0 ? Infinity : a[18];
  r.input.steer = a[19]; r.input.thr = a[20]; r.spool = a[21]; r.groundY = a[22]; r.landImpact = a[23]; if (a[24] > (r.hits || 0)) r.hits = a[24]; r.input.pitch = a[25] || 0; r.input.alt = a[26] || 0; r.ghostT = a[27] || 0;
  if (T) { const pr = T.project(r.x, r.z, r.idx); r.idx = pr.idx; r.s = pr.s; r.lat = pr.lat; r.section = T.section[r.idx]; r.surface = T.surfaceAt(r.x, r.z, r.idx); }
}
// interpolated motion between two packed samples
function lerpInto(r, a, b, u, T) {
  unpackInto(r, u < 0.5 ? a : b, null);
  const L = (i) => a[i] + (b[i] - a[i]) * u;
  r.x = L(0); r.y = L(1); r.z = L(2); r.heading = a[3] + wrapA(b[3] - a[3]) * u; r.vx = L(4); r.vy = L(5); r.vz = L(6); r.input.steer = L(19);
  const pr = T.project(r.x, r.z, r.idx); r.idx = pr.idx; r.s = pr.s; r.lat = pr.lat; r.section = T.section[r.idx]; r.surface = T.surfaceAt(r.x, r.z, r.idx);
}

export class Online {
  // ctx: { sim, weapons, track, $, input, ui hooks… } from main.js
  constructor(ctx) {
    this.c = ctx; this.net = null; this.role = null; this.code = ''; this.hostId = null; this.players = []; this.bots = 'off';
    this.state = 'off'; this.model = 'racecar'; this.offset = 0; this.bestRtt = 1e9; this.offsetT = 0; this.raceSeq = 0;
    this.buf = new Map(); this.sendT = 0; this.pingT = 0; this.joinT = 0; this.left = new Set(); this.log = []; this.finishOrder = [];
    this.netMode = new URLSearchParams(location.search).get('net') || 'auto';
  }
  get active() { return this.state !== 'off'; }
  get racing() { return this.state === 'race'; }
  get isHost() { return this.role === 'host'; }
  hostNow() { return performance.now() + this.offset; }
  L(s) { this.log.push(Math.round(performance.now()) + ' ' + s); if (this.log.length > 200) this.log.shift(); }

  async open(role, code, model) {
    this.close(true);
    this.role = role; this.code = code; this.model = model; this.state = role === 'host' ? 'lobby' : 'joining'; this.left.clear();
    this.offset = 0; this.bestRtt = role === 'host' ? 0 : 1e9; this.players = []; this.hostId = null; this.bots = 'off';
    const { Net } = await import('./net.js');
    const net = this.net = new Net({ code, mode: this.netMode, onMsg: (m, f, link) => this.onMsg(m, f, link), onPeer: id => this.onPeer(id), onLeave: id => this.onLeave(id), log: s => this.L(s) });
    const id = await net.start(); if (net !== this.net) return;
    if (role === 'host') { this.hostId = id; this.players = [{ id, slot: 0, model, name: PNAMES[0] }]; }
    else this.joinT = performance.now();
    this.L(role + ' ' + code + ' as ' + id); this.c.ui();
  }
  close(silent) {
    if (this.net) this.net.close(); this.net = null; this.state = 'off'; this.role = null; this.buf.clear(); this.players = [];
    if (this.c.sim.standings !== this.c.sim.constructor.prototype.standings) delete this.c.sim.standings;
    this.c.sim.hitHook = null; this.c.sim.noHits = false; this.c.weapons.remote = false;
    if (this.savedLaps !== undefined) { CONFIG.laps = this.savedLaps; this.savedLaps = undefined; }
    if (!silent) this.c.ui();
  }
  me() { return this.players.find(p => p.id === this.net?.id); }
  setModel(m) { this.model = m; if (this.isHost) { const p = this.me(); if (p) p.model = m; this.sendLobby(); } else this.net?.send({ t: 'pick', model: m }, this.hostId); this.c.ui(); }
  setBots(v) { if (!this.isHost) return; this.bots = v; this.sendLobby(); this.c.ui(); }
  linkLabel(id) { if (id === this.net?.id) return 'you'; const l = this.net?.linkOf(this.isHost ? id : this.hostId === id ? id : id); return l === 'p2p' ? '⚡ direct P2P' : l === 'relay' ? '🛰️ via relay' : '…'; }

  // ---------- messages ----------
  onPeer(id) { this.L('peer ' + id + ' via ' + this.net.linkOf(id)); this.c.ui(); }
  onLeave(id) {
    this.L('left ' + id);
    if (this.isHost) {
      const p = this.players.find(q => q.id === id); if (!p) return;
      this.players = this.players.filter(q => q !== p);
      if (this.state === 'race') {
        const r = this.c.sim.racers.find(q => q.netId === id);
        if (r) {
          if (this.bots !== 'off') { r.puppet = false; r.netId = null; r.name = BOT_NAMES[r.slot] + ' (bot)'; r.ai = new AIDriver(this.c.track, { skill: 0.95 }); r.input.fire = false; this.c.relabel?.(r); }
          else { r.left = true; this.c.hideRacer?.(r); }
          this.c.toast(`👋 ${p.name} left – ${r.left ? 'removed' : 'a bot takes over'}`); this.net.send({ t: 'left', slot: r.slot, bot: !r.left });
        }
      }
      this.sendLobby(); this.c.ui();
    } else if (id === this.hostId) {
      this.c.hostLost(); this.close(true); this.c.ui();
    } else this.c.ui();
  }
  onMsg(m, from, link) {
    const c = this.c;
    if (this.isHost) {
      switch (m.t) {
        case 'join': {
          let p = this.players.find(q => q.id === from);
          if (!p) {
            if (this.players.length >= MAX_PLAYERS) { this.net.send({ t: 'reject', why: 'Room is full (6 players)' }, from); return; }
            const used = new Set(this.players.map(q => q.slot)); let slot = 0; while (used.has(slot)) slot++;
            p = { id: from, slot, model: CONFIG.models[m.model] ? m.model : 'racecar', name: PNAMES[slot], waiting: this.state === 'race' }; this.players.push(p);
            this.L('join ' + from + ' slot ' + slot); c.toast?.(`🙌 ${p.name} joined`);
          }
          this.net.send({ t: 'welcome', slot: p.slot, host: this.net.id }, from); this.sendLobby(); c.ui(); break;
        }
        case 'pick': { const p = this.players.find(q => q.id === from); if (p && CONFIG.models[m.model]) { p.model = m.model; this.sendLobby(); c.ui(); } break; }
        case 'ping': this.net.send({ t: 'pong', c: m.c, h: performance.now() }, from); break;
        case 'st': { const r = c.sim.racers.find(q => q.netId === from); if (r && m.k === this.raceSeq) this.push(r, m.ts, m.a); break; }
        case 'fire': { const r = c.sim.racers.find(q => q.netId === from); if (r && m.k === this.raceSeq && r.weapon) { if (m.a) unpackInto(r, m.a, c.track); r.input.fire = true; } break; }
        case 'bye': break;
      }
      return;
    }
    // ---- client ----
    switch (m.t) {
      case 'welcome': this.hostId = from; this.mySlot = m.slot; if (this.state === 'joining') this.state = 'lobby'; c.ui(); break;
      case 'reject': c.joinFailed(m.why); this.close(true); c.ui(); break;
      case 'lobby':
        if (from !== this.hostId && this.hostId) return; this.hostId = from; this.players = m.players; this.bots = m.bots;
        if (this.state === 'joining') this.state = 'lobby';
        if (m.phase === 'lobby' && this.state === 'race' && this.c.finishedView) this.state = 'lobby';
        c.ui(); break;
      case 'pong': {
        const now = performance.now(), rtt = now - m.c; this.rtt = rtt;
        if (rtt < this.bestRtt * 1.25 || now - this.offsetT > 8000) { this.bestRtt = Math.min(this.bestRtt * 1.02 + 1, rtt); this.offset = m.h + rtt / 2 - now; this.offsetT = now; }
        break;
      }
      case 'start': if (from === this.hostId && m.roster.some(e => e.id === this.net.id)) this.beginRace(m); break;
      case 's': if (from === this.hostId && this.state === 'race' && m.k === this.raceSeq) this.applySnap(m); break;
      case 'hit': if (this.state === 'race' && m.k === this.raceSeq && c.player) { const by = c.sim.racers[m.by]; c.sim.hit(c.player, { ...m.o, by, _net: true }); } break;
      case 'boost': if (c.player && m.k === this.raceSeq) { if (m.w === 'turbo') c.player.turboT = CONFIG.weapons.turbo.time; if (m.w === 'ghost') c.player.ghostT = CONFIG.weapons.ghost.time; } break; // owner runs the ghost timer and streams it
      case 'left': if (this.state === 'race') { const r = c.sim.racers[m.slot]; if (r) { if (m.bot) { r.name = BOT_NAMES[r.slot] + ' (bot)'; c.relabel?.(r); } else { r.left = true; c.hideRacer?.(r); } c.toast(`👋 ${r.name} left`); } } break;
    }
  }
  sendLobby() { if (!this.isHost || !this.net) return; this.net.send({ t: 'lobby', players: this.players.map(p => ({ id: p.id, slot: p.slot, model: p.model, name: p.name, waiting: !!p.waiting })), bots: this.bots, phase: this.state === 'race' ? 'race' : 'lobby' }); }

  // ---------- race setup ----------
  canStart() { return this.isHost && this.state === 'lobby' && (this.players.length >= 2 || this.bots !== 'off'); }
  hostStart() {
    if (!this.canStart()) return false;
    for (const p of this.players) p.waiting = false;
    const humans = [...this.players].sort((a, b) => a.slot - b.slot), want = this.bots === 'off' ? 0 : Math.max(0, +this.bots - humans.length);
    const used = new Set(humans.map(p => p.slot)), roster = humans.map(p => ({ id: p.id, model: p.model, name: p.name, color: p.slot }));
    const models = Object.keys(CONFIG.models); let s = 0;
    for (let k = 0; k < want; k++) { while (used.has(s)) s++; used.add(s); roster.push({ id: null, model: models[(k + 1) % models.length], name: BOT_NAMES[s] + ' (bot)', color: s, bot: true }); }
    const m = { t: 'start', roster, goAt: performance.now() + 4300, k: (this.raceSeq || 0) + 1, laps: CONFIG.laps };
    this.net.send(m); this.beginRace(m); return true;
  }
  beginRace(m) {
    const c = this.c, sim = c.sim; this.raceSeq = m.k;
    if (m.laps && m.laps !== CONFIG.laps) { if (this.savedLaps === undefined) this.savedLaps = CONFIG.laps; CONFIG.laps = m.laps; } // host decides the lap count
    this.goAt = m.goAt; this.state = 'race'; this.buf.clear(); this.finishOrder = []; this.sendT = 0; this.snapT = 0; this.left.clear();
    c.clearRacers();
    let me = null;
    m.roster.forEach((e, k) => {
      const mine = e.id === this.net.id;
      const r = sim.add(new Racer({ name: mine ? 'Me' : e.name, model: e.model, color: NET_COLORS[e.color % 6], isPlayer: mine,
        ai: e.bot ? new AIDriver(c.track, { skill: CONFIG.ai.skill[k % 3] ?? 0.96, lineK: 0.9 + 0.05 * (k % 3) }) : mine ? new AIDriver(c.track, { skill: 0.99 }) : null }));
      r.slot = k; r.netId = e.id; r.netName = e.name; r.bot = !!e.bot;
      r.puppet = !mine && (!this.isHost || !e.bot); // host simulates bots; everybody simulates only their own vehicle
      if (mine) me = r;
    });
    sim.placeGrid(sim.racers);
    if (this.isHost) { sim.hitHook = (r, o) => this.hostHit(r, o); sim.noHits = false; c.weapons.remote = false; }
    else { sim.hitHook = (r, o) => !!o._net; sim.noHits = true; c.weapons.remote = true; c.weapons.reset(); }
    sim.standings = () => this.standings();
    c.beginOnlineRace(me, Math.max(0.3, (this.goAt - this.hostNow()) / 1000 + 0.2));
    this.L('race ' + m.k + ' with ' + m.roster.length);
  }
  standings() {
    const R = this.c.sim.racers.filter(r => !r.left);
    return R.sort((a, b) => { if (a.finished && b.finished) return a.finishTime - b.finishTime; if (a.finished) return -1; if (b.finished) return 1; return b.progress - a.progress; })
      .concat(this.c.sim.racers.filter(r => r.left));
  }
  countdownT() { return (this.goAt - this.hostNow()) / 1000 + 0.2; }
  // host: a hit on a remote player's vehicle is applied on their device
  hostHit(r, o) {
    if (!r.puppet || !r.netId) return true;
    if (r.immuneT > 0) return false;
    const W = CONFIG.weapons.hit, o2 = {}; for (const k of ['kx', 'kz', 'up', 'spin', 'tumble', 'stun', 'slow', 'kind']) if (o[k] !== undefined) o2[k] = o[k];
    this.net.send({ t: 'hit', k: this.raceSeq, o: o2, by: o.by ? o.by.slot : -1 }, r.netId);
    r.immuneT = W.immune; r.hits++; if (o.by && o.by !== r) o.by.landed = (o.by.landed || 0) + 1;
    if (o.spin) r.spinT = Math.max(r.spinT, o.spin); if (o.tumble) { r.tumbleT = r.tumbleTot = o.tumble; } // shown right away, corrected by their stream
    this.c.sim.emit({ type: 'hit', r, kind: o.kind, by: o.by });
    return false;
  }
  push(r, ts, a) {
    let b = this.buf.get(r); if (!b) { b = { s: [], off: null, last: 0 }; this.buf.set(r, b); }
    const now = performance.now(), o = now - ts; b.off = b.off === null ? o : Math.min(o, b.off + 0.02 * (now - b.last || 0)); b.last = now; // min-delay clock alignment (drifts up slowly)
    const t = ts + b.off; if (b.s.length && t <= b.s[b.s.length - 1].t) return;
    b.s.push({ t, a }); if (b.s.length > 30) b.s.shift();
  }
  interp() {
    const now = performance.now(), T = this.c.track;
    for (const [r, b] of this.buf) {
      if (!r.puppet || !b.s.length) continue;
      const S = b.s, delay = this.isHost || this.net?.linkOf(this.hostId) === 'p2p' ? 110 : 190, rt = now - delay;
      let i = S.length - 1; while (i > 0 && S[i - 1].t > rt) i--;
      if (i === 0 || S[i].t <= rt) { // past the newest sample: hold / short extrapolation
        const s = S[S.length - 1]; unpackInto(r, s.a, T); const ex = Math.min(0.25, Math.max(0, (rt - s.t) / 1000));
        if (ex > 0 && r.rescueT <= 0) { r.x += r.vx * ex; r.z += r.vz * ex; r.y += Math.max(-1, Math.min(1, r.vy * ex)); }
      } else { const a = S[i - 1], c = S[i]; lerpInto(r, a.a, c.a, (rt - a.t) / Math.max(1, c.t - a.t), T); }
      r._px = r.x; r._pz = r.z; r._py = r.y;
    }
  }

  // ---------- per frame (called from main.js) ----------
  preStep(dt) {
    if (!this.net) return;
    const c = this.c, now = performance.now();
    if (!this.isHost && (this.pingT -= dt) <= 0) { this.pingT = this.state === 'race' ? 2 : 1; if (this.hostId) this.net.send({ t: 'ping', c: now }, this.hostId); }
    if (this.state === 'joining') {
      if ((this.joinT2 = (this.joinT2 || 0) - dt) <= 0) { this.joinT2 = 1; this.net.send({ t: 'join', model: this.model, v: '3.9' }); }
      if (now - this.joinT > 20000) { c.joinFailed(`Room ${this.code} not found – check the code, and that the host is still on the lobby screen.`); this.close(true); c.ui(); }
      return;
    }
    if (this.state !== 'race') return;
    const p = c.player;
    if (!this.isHost && p && p.input.fire) { p.input.fire = false; if (p.weapon && c.sim.running) this.net.send({ t: 'fire', k: this.raceSeq, a: pack(p) }, this.hostId); }
    this.interp();
  }
  postStep(dt) {
    if (!this.net || this.state !== 'race') return;
    const c = this.c, sim = c.sim;
    if (this.isHost) {
      // remember events for the clients before the FX layer consumes them
      this.evq = this.evq || [];
      for (const e of sim.events) if (EV_TYPES.has(e.type)) {
        const s = this.ser(e); if (s) this.evq.push(s);
        if (e.type === 'use' && e.r.puppet && e.r.netId && (e.w === 'turbo' || e.w === 'ghost')) this.net.send({ t: 'boost', k: this.raceSeq, w: e.w }, e.r.netId);
      }
      for (const r of sim.racers) if (r.finished && !this.finishOrder.includes(r.slot)) this.finishOrder.push(r.slot);
      if ((this.snapT -= dt) <= 0) { this.snapT = 1 / SEND_HZ; this.sendSnap(); }
    } else {
      if ((this.sendT -= dt) <= 0 && c.player) { this.sendT = 1 / SEND_HZ; this.net.send({ t: 'st', k: this.raceSeq, ts: performance.now(), a: pack(c.player) }, this.hostId); }
      // own racer: crate/weapon fields come from the host; fire trail & glove timers tick here
      const p = c.player; if (p) { if (p.fireT > 0) p.fireT = Math.max(0, p.fireT - dt); if (p.gloveT > 0) p.gloveT = Math.max(0, p.gloveT - dt); if (p.rollT > 0) p.rollT = Math.max(0, p.rollT - dt); if (p.bomb) p.bomb.t -= dt; }
    }
  }
  ser(e) {
    const o = { y: e.type }; if (e.r) o.r = e.r.slot;
    switch (e.type) {
      case 'pickup': case 'boxSpawn': o.b = this.c.weapons.boxes.indexOf(e.b); break;
      case 'gotWeapon': case 'use': o.w = e.w; break;
      case 'hit': o.kind = e.kind; o.by = e.by ? e.by.slot : -1; break;
      case 'boom': case 'shock': case 'emp': o.p = [R1(e.x), R1(e.y), R1(e.z)]; o.s = e.size; o.R = e.R; o.c = e.color; break;
      case 'zap': o.ch = e.chain.map(q => q.r ? q.r.slot : -1); break;
      case 'bombPass': o.a = e.from.slot; o.b2 = e.to.slot; break;
      case 'ballBounce': o.p = [R1(e.p.x), R1(e.p.y), R1(e.p.z)]; break;
    }
    return o;
  }
  sendSnap() {
    const c = this.c, W = c.weapons, now = performance.now();
    const R = c.sim.racers.map(r => {
      let a, age = 0;
      if (r.puppet) { const b = this.buf.get(r); const s = b?.s[b.s.length - 1]; if (!s) return null; a = s.a; age = Math.round(now - s.t); }
      else a = pack(r);
      return [r.slot, age, a, r.weapon ? WEAPON_KEYS.indexOf(r.weapon) : -1, R2(r.rollT), r.bomb ? R2(r.bomb.t) : -1, R2(r.fireT || 0), R2(r.gloveT || 0), r.landed || 0, r.shots || 0, r.left ? 1 : 0];
    });
    let bm = ''; for (const b of W.boxes) bm += b.active ? '1' : '0';
    const P = W.proj.map(p => [p.id, p.kind, R1(p.x), R1(p.y), R1(p.z), R1(p.vx), R1(p.vy), R1(p.vz)]);
    const H = W.haz.map(h => [h.id, h.kind, R1(h.x), R1(h.y), R1(h.z), R1(h.R), R2(h.life), R2(h.age)]);
    this.net.send({ t: 's', k: this.raceSeq, ts: now, R, bm, P, H, ev: this.evq || [], fo: this.finishOrder, st: R2(c.sim.t) });
    this.evq = [];
  }
  applySnap(m) {
    const c = this.c, sim = c.sim, W = c.weapons, me = c.player;
    for (const e of m.R) {
      if (!e) continue; const [slot, age, a, wi, rollT, bombT, fireT, gloveT, landed, shots, left] = e; const r = sim.racers[slot]; if (!r) continue;
      if (r.puppet) this.push(r, m.ts - age, a);
      r.weapon = wi >= 0 ? WEAPON_KEYS[wi] : null; r.landed = landed; r.shots = shots;
      if (r === me) { if (Math.abs((r.rollT || 0) - rollT) > 0.25 || rollT === 0) r.rollT = rollT; } else r.rollT = rollT;
      if (bombT >= 0) { if (!r.bomb) r.bomb = { t: bombT, passCD: 1 }; else r.bomb.t = bombT; } else r.bomb = null;
      r.fireT = fireT; r.gloveT = gloveT; if (left && !r.left) { r.left = true; c.hideRacer?.(r); }
    }
    if (m.bm) W.boxes.forEach((b, k) => { b.active = m.bm[k] === '1'; });
    W.proj = m.P.map(([id, kind, x, y, z, vx, vy, vz]) => ({ id, kind, x, y, z, vx, vy, vz, age: 0 }));
    W.haz = m.H.map(([id, kind, x, y, z, R, life, age]) => ({ id, kind, x, y, z, R, life, age }));
    this.finishOrder = m.fo || [];
    for (const o of m.ev || []) {
      const r = o.r !== undefined ? sim.racers[o.r] : undefined;
      if (o.y === 'hit' && r === me) continue; // applied locally via the 'hit' message
      const e = { type: o.y, r };
      switch (o.y) {
        case 'pickup': case 'boxSpawn': e.b = W.boxes[o.b]; if (!e.b) continue; break;
        case 'gotWeapon': case 'use': e.w = o.w; break;
        case 'hit': e.kind = o.kind; e.by = sim.racers[o.by]; break;
        case 'boom': case 'shock': case 'emp': [e.x, e.y, e.z] = o.p; e.size = o.s; e.R = o.R; e.color = o.c; break;
        case 'zap': e.chain = o.ch.map(s => { const q = sim.racers[s]; return q ? { x: q.x, y: q.y + 4, z: q.z, r: q } : null; }).filter(Boolean); if (!e.r) continue; break;
        case 'bombPass': e.from = sim.racers[o.a]; e.to = sim.racers[o.b2]; break;
        case 'ballBounce': e.p = { x: o.p[0], y: o.p[1], z: o.p[2] }; break;
      }
      sim.emit(e);
    }
  }
  // projectile motion between snapshots (clients only; purely visual)
  coast(dt) { if (!this.net || this.isHost || this.state !== 'race') return; for (const p of this.c.weapons.proj) { p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; } }
  backToLobby() { if (this.isHost) { this.state = 'lobby'; this.sendLobby(); } else this.state = 'lobby'; this.c.ui(); }
}
