import * as THREE from './three.module.min.js';
import { CONFIG } from './config.js';
import { Track, SECTION_NAMES } from './track.js';
import { buildWorld } from './world.js';
import { Racer, AIDriver, Sim } from './sim.js';
import { createVehicleMesh, updateVehicleMesh } from './vehicles.js';
import { Input } from './input.js';
import { Weapons, WEAPONS, WEAPON_KEYS } from './weapons.js';
import { FX } from './fx.js';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, CONFIG.render.maxPixelRatio));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, 1, 0.5, 5000);
const track = new Track();
const world = buildWorld(scene, track, renderer);
track.finalize();
const sim = new Sim(track);
const weapons = new Weapons(sim, track);
const fx = new FX(scene, sim);
const input = new Input();

const SECTION_TIPS = { 1: 'Smooth tiles – floor it!', 2: 'Low ceiling – fly low!', 3: 'Narrow low gate!', 4: 'Grass – cars slow down', 5: 'Home through the glass door' };
const COLORS = [0x3a86ff, 0xe63946, 0x2a9d8f, 0xf4a261, 0x9b5de5];
const MODELS = Object.keys(CONFIG.models);
const NAMES = ['Bolt', 'Buzz', 'Cork', 'Bee', 'Zip'];
const normSel = t => CONFIG.models[t] ? t : (t === 'drone' ? 'drone' : 'racecar');
const fmt = (t, d = 2) => { if (!isFinite(t)) return '—'; const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s.toFixed(d).padStart(d + 3, '0')}`; };
const typeName = m => `${CONFIG.models[m]?.icon || ''} ${CONFIG.models[m]?.label || m}`;

let state = 'menu', selected = 'racecar', fovNow = CONFIG.camera.fov, rollIconT = 0, slotShown = '', meshes = [], player = null, countdownT = 0, acc = 0, lastSec = 0, hudT = 0, toastT = 0, finishShownT = -1, timeScale = parseFloat(params.get('speed') || '1');
const camPos = new THREE.Vector3(350, 30, 100), camLook = new THREE.Vector3();
let camHeading = 0, camOverride = null, speedOn = false;

function clearRacers() { for (const m of meshes) { scene.remove(m.root); scene.remove(m.shadow); } meshes = []; fx.clearAtt(); sim.reset(); }
function spawnMeshes() { meshes = sim.racers.map(r => { const m = createVehicleMesh(r.type, r.color, r.isPlayer ? null : r.name, r.model); scene.add(m.root); scene.add(m.shadow); return m; }); }

// AI rivals: the 4 other vehicle types minus one (rotates with your pick), so every type shows up
function rivalsFor(model) {
  const others = MODELS.filter(m => m !== model); others.splice(MODELS.indexOf(model) % others.length, 1);
  return others.slice(0, 3);
}
function setupRace(model, opts = {}) {
  model = normSel(model); clearRacers();
  const skills = CONFIG.ai.skill;
  const aiRacers = rivalsFor(model).map((m, k) => sim.add(new Racer({ name: NAMES[k], model: m, color: COLORS[k + 1], ai: new AIDriver(track, { skill: skills[k] ?? 0.96, lineK: 0.9 + 0.1 * k, altOff: (k - 1) * 3 }) })));
  player = sim.add(new Racer({ name: 'Me', model, color: COLORS[0], isPlayer: true, autopilot: !!opts.autopilot, ai: new AIDriver(track, { skill: 0.99 }) }));
  sim.placeGrid([...aiRacers, player]);
  spawnMeshes();
  input.setType(player.type);
}

function startRace(type = selected, opts = {}) {
  selected = normSel(type); setupRace(selected, opts);
  state = 'countdown'; countdownT = 3.2; acc = 0; lastSec = player.section; finishShownT = -1; slotShown = '';
  $('menu').classList.add('hidden'); $('finish').classList.add('hidden'); $('pause').classList.add('hidden');
  $('hud').classList.remove('hidden'); $('touchLayer').classList.remove('hidden');
  snapCamera();
}
function startDemo() {
  clearRacers(); player = null;
  ['moto', 'drone', 'racecar', 'heli', 'scooter'].forEach((m, k) => sim.add(new Racer({ name: NAMES[k], model: m, color: COLORS[k], ai: new AIDriver(track, { skill: 0.93 + 0.01 * k, lineK: 0.9 + 0.05 * k }) })));
  sim.placeGrid(sim.racers); spawnMeshes(); sim.running = true; state = 'menu';
  snapCamera();
}
function toMenu() {
  $('menu').classList.remove('hidden'); $('finish').classList.add('hidden'); $('pause').classList.add('hidden');
  $('hud').classList.add('hidden'); $('touchLayer').classList.add('hidden'); $('countdown').textContent = ''; $('speedlines').classList.remove('on'); speedOn = false;
  startDemo();
}

// ---------- UI wiring ----------
$('vehList').innerHTML = MODELS.map(m => { const M = CONFIG.models[m];
  return `<button class="vcard${m === selected ? ' sel' : ''}" data-type="${m}"><div class="vicon">${M.icon}</div><div class="vname">${M.label}</div>` +
    Object.entries(M.stats).filter(([k, v]) => !(k === 'Jump' && M.class === 'drone')).map(([k, v]) => `<div class="stat"><span>${k}</span><i style="--v:${v}%"></i></div>`).join('') +
    (M.class === 'drone' ? `<div class="stat"><span>Flies</span><i style="--v:100%"></i></div>` : '') + `<div class="vnote">${M.note}</div></button>`; }).join('');
document.querySelectorAll('.vcard').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('.vcard').forEach(x => x.classList.remove('sel')); b.classList.add('sel'); selected = b.dataset.type;
}));
function goFullscreen() {
  const el = document.documentElement;
  if (el.requestFullscreen && !document.fullscreenElement && matchMedia('(pointer:coarse)').matches)
    el.requestFullscreen().then(() => screen.orientation?.lock?.('landscape')).catch(() => {});
}
$('btnStart').addEventListener('click', () => { goFullscreen(); startRace(selected); });
$('btnHelp').addEventListener('click', () => $('help').classList.remove('hidden'));
$('btnHelpClose').addEventListener('click', () => $('help').classList.add('hidden'));
const pause = () => { if (state === 'race' || state === 'countdown') { state = 'paused:' + state; $('pause').classList.remove('hidden'); } };
const resume = () => { if (state.startsWith('paused:')) { state = state.slice(7); $('pause').classList.add('hidden'); } };
$('btnPause').addEventListener('click', pause); $('btnResume').addEventListener('click', resume);
$('btnRestart').addEventListener('click', () => startRace(selected)); $('btnAgain').addEventListener('click', () => startRace(selected));
$('btnMenu').addEventListener('click', toMenu); $('btnMenu2').addEventListener('click', toMenu);
$('btnReset').addEventListener('click', () => resetPlayer());
addEventListener('keydown', e => {
  if (e.code === 'Escape' || e.code === 'KeyP') state.startsWith('paused') ? resume() : pause();
  if (e.code === 'KeyR') resetPlayer();
  if (e.code === 'Enter' && state === 'menu' && $('help').classList.contains('hidden')) startRace(selected);
});
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

function resetPlayer() { if (player && state === 'race') sim.respawn(player); }

// ---------- camera ----------
function snapCamera() { const r = followed(); if (!r) return; camHeading = r.heading; updateCamera(1, true); }
function followed() { return player || sim.racers[0]; }
const tmpV = new THREE.Vector3();
function updateCamera(dt, snap) {
  const r = followed(); if (!r) return;
  const C = CONFIG.camera[r.type];
  let dh = r.heading - camHeading; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI;
  camHeading += dh * (snap ? 1 : Math.min(1, dt * 5));
  const fx = Math.cos(camHeading), fz = Math.sin(camHeading);
  const want = tmpV.set(r.x - fx * C.dist, r.y + C.height, r.z - fz * C.dist);
  // keep camera out of solids and under ceilings: pull toward the vehicle until free
  const vx = r.x, vy = r.y + 6, vz = r.z;
  for (let k = 0; k < 10; k++) {
    if (!track.insideSolid(want.x, want.y, want.z, 3)) break;
    want.x = vx + (want.x - vx) * 0.78; want.y = vy + (want.y - vy) * 0.78; want.z = vz + (want.z - vz) * 0.78;
  }
  const ce = track.ceilingAt(want.x, want.z); if (want.y > ce - 3 && r.y < ce) want.y = Math.max(2, ce - 3);
  if (want.y < 2) want.y = 2;
  if (snap) camPos.copy(want); else camPos.lerp(want, Math.min(1, dt * (7 + r.speed / 18)));
  camera.position.copy(camPos);
  camLook.set(r.x + fx * C.lookAhead, r.y + C.lookUp, r.z + fz * C.lookAhead);
  camera.lookAt(camLook);
  // speed feel: FOV widens with speed, kicks on turbo
  const top = r.type === 'car' ? r.V.topSpeed : r.V.thrust / r.V.drag;
  const wantFov = CONFIG.camera.fov + CONFIG.camera.speedFov * Math.min(1, r.speed / top) + (r.turboT > 0 ? CONFIG.camera.turboFov : 0);
  fovNow += (wantFov - fovNow) * (snap ? 1 : Math.min(1, dt * 4));
  if (Math.abs(camera.fov - fovNow) > 0.05) { camera.fov = fovNow; camera.updateProjectionMatrix(); }
}

// ---------- HUD ----------
const mm = $('minimap'), mctx = mm.getContext('2d');
let mmB = { x0: 1e9, x1: -1e9, z0: 1e9, z1: -1e9 };
for (let i = 0; i < track.N; i++) { mmB.x0 = Math.min(mmB.x0, track.px[i]); mmB.x1 = Math.max(mmB.x1, track.px[i]); mmB.z0 = Math.min(mmB.z0, track.pz[i]); mmB.z1 = Math.max(mmB.z1, track.pz[i]); }
const mmS = Math.min(130 / (mmB.x1 - mmB.x0), 92 / (mmB.z1 - mmB.z0));
const mmX = x => 10 + (x - mmB.x0) * mmS + (130 - (mmB.x1 - mmB.x0) * mmS) / 2, mmZ = z => 10 + (z - mmB.z0) * mmS;
function drawMinimap() {
  mctx.clearRect(0, 0, 150, 112);
  mctx.strokeStyle = 'rgba(255,255,255,.75)'; mctx.lineWidth = 5; mctx.lineJoin = 'round'; mctx.beginPath();
  for (let i = 0; i <= track.N; i += 4) { const k = i % track.N; i ? mctx.lineTo(mmX(track.px[k]), mmZ(track.pz[k])) : mctx.moveTo(mmX(track.px[k]), mmZ(track.pz[k])); }
  mctx.closePath(); mctx.stroke();
  mctx.strokeStyle = 'rgba(255,255,255,.35)'; mctx.lineWidth = 1; mctx.beginPath(); mctx.moveTo(mmX(0), mmZ(900)); mctx.lineTo(mmX(1400), mmZ(900)); mctx.stroke();
  for (const p of track.pads) { mctx.fillStyle = '#4cc9f0'; mctx.fillRect(mmX(p.x) - 3, mmZ(p.z) - 3, 6, 6); }
  for (const r of sim.racers) { mctx.fillStyle = '#' + r.color.toString(16).padStart(6, '0'); mctx.beginPath(); mctx.arc(mmX(r.x), mmZ(r.z), r.isPlayer ? 5 : 3.5, 0, 7); mctx.fill(); if (r.isPlayer) { mctx.strokeStyle = '#fff'; mctx.lineWidth = 2; mctx.stroke(); } }
}
function updateSlot(dt) {
  if (!player) return;
  const el = $('wslot'); let cls, icon, name;
  if (player.rollT > 0) {
    rollIconT -= dt; cls = 'rolling';
    const left = player.rollT; if (rollIconT <= 0) { rollIconT = 0.05 + 0.25 * (1 - left / CONFIG.weapons.rollTime) ** 2; slotShown = WEAPON_KEYS[(WEAPON_KEYS.indexOf(slotShown) + 1 + Math.floor(Math.random() * 3)) % WEAPON_KEYS.length] || WEAPON_KEYS[0]; }
    icon = WEAPONS[slotShown]?.icon || '?'; name = 'Rolling…';
  } else if (player.weapon) { cls = 'ready'; icon = WEAPONS[player.weapon].icon; name = WEAPONS[player.weapon].name; }
  else { cls = 'empty'; icon = '?'; name = 'Find a ? box'; }
  if (el.dataset.c !== cls + icon) { el.dataset.c = cls + icon; el.className = 'panel ' + cls; $('wicon').textContent = icon; $('wname').textContent = name; }
  $('btnFire').classList.toggle('off', !player.weapon);
}
function hudEvents() {
  if (!player) return;
  for (const e of sim.events) {
    if (e.type === 'gotWeapon' && e.r === player) toast(`${WEAPONS[e.w].icon} ${WEAPONS[e.w].name} – ${WEAPONS[e.w].tip}`);
    else if (e.type === 'hit' && e.by === player && e.r !== player) toast(`💥 Hit ${e.r.name}!`);
    else if (e.type === 'bombStick' && e.r === player) toast('💣 A sticky bomb is on you – bump someone to pass it!');
    else if (e.type === 'bombPass' && e.from === player) toast(`💣 Passed the bomb to ${e.to.name}!`);
  }
}
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); toastT = 2.2; }
function updateHUD(dt) {
  if (!player) return;
  toastT -= dt; if (toastT <= 0) $('toast').classList.remove('show');
  if (player.section !== lastSec && state === 'race') { lastSec = player.section; toast(`${SECTION_NAMES[lastSec]} · ${SECTION_TIPS[lastSec]}`); }
  hudT -= dt; if (hudT > 0) return; hudT = 0.1;
  const st = sim.standings(); $('posNum').textContent = st.indexOf(player) + 1;
  const lap = Math.min(CONFIG.laps, player.lapsDone + 1);
  $('lapNum').textContent = player.finished ? 'Finished!' : `Lap ${lap}/${CONFIG.laps}`;
  $('lapTime').textContent = fmt(player.finished ? player.lapTimes.at(-1) : (state === 'race' ? sim.t - player.lapStart : 0));
  $('totTime').textContent = fmt(player.finished ? player.finishTime : sim.t, 1); $('bestTime').textContent = fmt(player.best);
  const b = player.battery; $('batFill').style.width = b + '%'; $('batFill').style.background = b < CONFIG.battery.lowThreshold ? '#ff4d6d' : b < 50 ? '#ffd23f' : '#52d273';
  $('batPct').textContent = Math.round(b) + '%'; $('spd').textContent = Math.round(player.speed);
  $('alt').textContent = player.type === 'drone' ? `↕${Math.round(player.y)}` : '';
  const w = $('warn'); let msg = '', ok = false;
  if (player.bomb) msg = `💣 Sticky bomb ${player.bomb.t.toFixed(1)}s – bump someone!`;
  else if (player.stunT > 0) msg = '⚡ Power cut!';
  else if (player.gateBlockT > 0) msg = 'Lower! Pass under the gate';
  else if (player.wrongWayT > 1) msg = 'Wrong way!';
  else if (player.onPad && player.battery < 100) { msg = '⚡ Charging...'; ok = true; }
  else if (b < CONFIG.battery.lowThreshold) msg = player.type === 'drone' ? 'Low battery! Land on a ⚡ pad' : 'Low battery!';
  else if (player.type === 'drone' && player.y < 3 && state === 'race' && player.spool >= 1 && player.lapsDone === 0 && sim.t < 6) { msg = 'Left stick up to take off'; ok = true; }
  w.textContent = msg; w.classList.toggle('ok', ok);
  drawMinimap();
}
function showFinish() {
  const st = sim.standings(); const tb = $('results').querySelector('tbody'); tb.innerHTML = '';
  st.forEach((r, k) => {
    const tr = document.createElement('tr'); if (r.isPlayer) tr.className = 'me';
    tr.innerHTML = `<td>${k + 1}</td><td>${r.name}</td><td>${typeName(r.model)}</td><td class="mono">${r.finished ? fmt(r.finishTime) : 'Racing…'}</td><td class="mono">${fmt(r.best)}</td><td>${r.lapsDone}/${CONFIG.laps}</td><td>${r.landed || 0}</td>`;
    tb.appendChild(tr);
  });
  const best = t => { const v = sim.racers.filter(r => r.type === t && isFinite(r.best)).map(r => r.best); return v.length ? Math.min(...v) : Infinity; };
  const bc = best('car'), bd = best('drone');
  $('balance').textContent = `Balance check – best lap: ground ${fmt(bc)} · flyers ${fmt(bd)}` + (isFinite(bc) && isFinite(bd) ? ` (delta ${(bd - bc).toFixed(2)} s)` : '');
  const pos = st.indexOf(player) + 1; $('finTitle').textContent = pos === 1 ? '🏆 You won!' : `Finished in place ${pos}`;
  $('finish').classList.remove('hidden');
}

// ---------- main loop ----------
function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();
const H = 1 / CONFIG.physicsHz;
let last = performance.now(), simT = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now; simT += dt;
  const paused = state.startsWith('paused');
  if (!paused) {
    if (state === 'countdown') {
      countdownT -= dt; const n = Math.ceil(countdownT);
      $('countdown').textContent = countdownT > 0.2 ? String(Math.min(3, n)) : 'GO!';
      if (countdownT <= 0.2 && !sim.running) { sim.running = true; state = 'race'; }
    }
    if (state === 'race' && countdownT < -0.8) $('countdown').textContent = ''; else if (state === 'race') countdownT -= dt;
    if (player && !player.autopilot && !player.finished) input.read(player.input); else input.read({});
    acc += dt * timeScale; let n = 0;
    while (acc >= H && n < 40) { sim.step(H); acc -= H; n++; }
    if (acc > H) acc = 0;
    if (player && player.finished && state === 'race') { state = 'finished'; finishShownT = 1.5; toast('🏁 Finish!'); }
    if (state === 'finished') { finishShownT -= dt; if (finishShownT <= 0) { showFinish(); finishShownT = 0.5; } }
  }
  sim.racers.forEach((r, k) => meshes[k] && updateVehicleMesh(meshes[k], r, paused ? 0 : dt, simT));
  { const on = !!(player && player.turboT > 0 && state === 'race'); if (on !== speedOn) { speedOn = on; $('speedlines').classList.toggle('on', on); } }
  hudEvents(); fx.update(paused ? 0 : dt, sim.racers, meshes, camera); if (state !== 'menu') updateSlot(dt);
  world.update(simT, sim.racers);
  if (camOverride) { camera.position.set(...camOverride[0]); camera.lookAt(...camOverride[1]); }
  else updateCamera(dt);
  const fr = followed(); meshes.forEach((m, k) => { if (m.label) { const r = sim.racers[k]; const d = camera.position.distanceTo(m.root.position); m.label.visible = r !== fr && d > 55; m.label.material.opacity = Math.min(1, (d - 55) / 40); } });
  updateHUD(dt);
  renderer.render(scene, camera); window.__calls = renderer.info.render.calls;
  requestAnimationFrame(frame);
}

// ---------- test / debug hooks ----------
window.__rc = {
  sim, track, CONFIG, get state() { return state; }, get player() { return player; },
  startRace, toMenu, setTimeScale: s => (timeScale = s), weapons, WEAPONS,
  setCam(pos, look) { camOverride = pos ? [pos, look] : null; },
  give(w, r = player) { weapons.give(r, w); }, fire(r = player) { return weapons.use(r); },
  // fast headless race simulation (no rendering) for balance testing
  simulateRace(type = 'racecar', maxSeconds = 400, opts = {}) {
    const wasW = CONFIG.weapons.enabled; if (opts.weapons !== undefined) CONFIG.weapons.enabled = opts.weapons;
    setupRace(type, { autopilot: true });
    if (opts.rivals) { clearRacers(); opts.rivals.forEach((m, k) => sim.add(new Racer({ name: NAMES[k], model: m, color: COLORS[k + 1], ai: new AIDriver(track, { skill: CONFIG.ai.skill[k] ?? 0.96, lineK: Math.min(1.1, 0.9 + 0.1 * k) }) })));
      player = sim.add(new Racer({ name: 'Me', model: normSel(type), color: COLORS[0], isPlayer: true, autopilot: true, ai: new AIDriver(track, { skill: 0.99 }) })); sim.placeGrid(sim.racers); spawnMeshes(); }
    sim.running = true; state = 'sim';
    const steps = Math.round(maxSeconds / H);
    for (let k = 0; k < steps; k++) { sim.step(H); sim.events.length = 0; if (sim.racers.every(r => r.finished)) break; }
    CONFIG.weapons.enabled = wasW;
    const res = sim.standings().map(r => ({ name: r.name, type: r.model, hits: r.hits, landed: r.landed || 0, shots: r.shots, player: r.isPlayer, finished: r.finished, total: +r.finishTime.toFixed(2), best: +r.best.toFixed(2), laps: r.lapTimes.map(x => +x.toFixed(2)), charges: r.charges, padTime: +r.padTime.toFixed(1), battery: Math.round(r.battery), secT: Object.fromEntries(Object.entries(r.secT||{}).map(([k,v])=>[k,+(v/CONFIG.laps).toFixed(1)])), maxSp: Object.fromEntries(Object.entries(r.maxSp||{}).map(([k,v])=>[k,Math.round(v)])) }));
    toMenu(); return res;
  },
};

startDemo();
const auto = params.get('autostart');
if (auto) startRace(normSel(auto), { autopilot: params.get('autopilot') === '1' });
requestAnimationFrame(frame);
