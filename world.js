import * as THREE from './three.module.min.js';
import { CONFIG } from './config.js';

const lam = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, ...o });

function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}
function rnd(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

export function makeLabelTexture(text, bg = '#ffd23f', fg = '#222', w = 256, h = 96) {
  return canvasTex(w, h, (g) => {
    g.fillStyle = bg; g.beginPath(); g.roundRect(4, 4, w - 8, h - 8, 22); g.fill();
    g.lineWidth = 6; g.strokeStyle = '#222'; g.stroke();
    g.fillStyle = fg; g.font = `bold ${Math.floor(h * 0.55)}px Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.direction = 'ltr'; g.fillText(text, w / 2, h / 2 + 3);
  });
}

export function buildWorld(scene, track, renderer) {
  const solids = track.solids;
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const box = (x0, x1, y0, y1, z0, z1, mat, opt = {}) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), mat);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); (opt.parent || scene).add(m);
    if (opt.solid !== false) solids.push({ x0, x1, y0, y1, z0, z1, minor: !!opt.minor });
    return m;
  };
  const cyl = (x, z, r, y0, y1, mat, seg = 16, solid = true, minor = false) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, y1 - y0, seg), mat);
    m.position.set(x, (y0 + y1) / 2, z); scene.add(m);
    if (solid) solids.push({ x0: x - r * 0.85, x1: x + r * 0.85, z0: z - r * 0.85, z1: z + r * 0.85, y0, y1, minor });
    return m;
  };

  // ---------- lights / sky ----------
  scene.background = new THREE.Color(0x9fd3f5);
  scene.fog = new THREE.Fog(0x9fd3f5, 1400, 3800);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7a66, 1.05));
  const sun = new THREE.DirectionalLight(0xfff2dd, 1.1); sun.position.set(300, 500, 200); scene.add(sun);
  scene.add(new THREE.AmbientLight(0xffffff, 0.15));

  // ---------- floors ----------
  const tileTex = canvasTex(256, 256, (g, w, h) => {
    const r = rnd(7);
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
      const dark = (i + j) % 2 === 1; const v = (r() - 0.5) * 10;
      g.fillStyle = dark ? `rgb(${196 + v},${110 + v},${84 + v})` : `rgb(${240 + v / 2},${232 + v / 2},${214 + v / 2})`;
      g.fillRect(i * 128, j * 128, 128, 128);
      g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(i * 128 + 10, j * 128 + 10, 60, 30);
    }
    g.strokeStyle = '#9b8c78'; g.lineWidth = 5; for (let k = 0; k <= 2; k++) { g.beginPath(); g.moveTo(k * 128, 0); g.lineTo(k * 128, 256); g.stroke(); g.beginPath(); g.moveTo(0, k * 128); g.lineTo(256, k * 128); g.stroke(); }
  }, [1400 / 60, 900 / 60]);
  tileTex.anisotropy = aniso;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(1400, 900), lam(0xffffff, { map: tileTex }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(700, 0, 450); scene.add(floor);

  const grassTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#5fa83c'; g.fillRect(0, 0, w, h); const r = rnd(3);
    for (let k = 0; k < 2500; k++) { const v = r(); g.fillStyle = v < 0.5 ? '#4f9a32' : v < 0.85 ? '#74bd4a' : '#3d8226'; g.fillRect(r() * w, r() * h, 2, 5 + r() * 6); }
  }, [2600 / 120, 1000 / 120]);
  grassTex.anisotropy = aniso;
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(2600, 1000), lam(0xffffff, { map: grassTex }));
  grass.rotation.x = -Math.PI / 2; grass.position.set(700, -0.05, 1406); scene.add(grass);
  // patio stones path
  const stoneM = lam(0xc9c1b4);
  for (let k = 0; k < 6; k++) { const m = new THREE.Mesh(new THREE.CylinderGeometry(22, 24, 1.2, 10), stoneM); m.position.set(1150 + k * 60, 0.6, 980 + (k % 2) * 20); scene.add(m); }

  // ---------- walls ----------
  const wallM = lam(0xf3ead8), wallOut = lam(0xe8d6b5), baseM = lam(0xffffff);
  const H = 260, T0 = 894, T1 = 906;
  box(-12, 1412, 0, H, -12, 0, wallM); box(-12, 0, 0, H, 0, 900, wallM); box(1400, 1412, 0, H, 0, 900, wallM);
  // south wall with sliding door (x 60..200) and back door (340..460) holding the pet door
  box(-12, 60, 0, H, T0, T1, wallOut); box(60, 200, 215, H, T0, T1, wallOut); box(200, 340, 0, H, T0, T1, wallOut);
  box(340, 460, 205, H, T0, T1, wallOut); box(460, 1412, 0, H, T0, T1, wallOut);
  const doorM = lam(0x8a5a3b);
  box(340, 386, 0, 205, 898, 902, doorM); box(414, 460, 0, 205, 898, 902, doorM); box(386, 414, 26, 205, 898, 902, doorM);
  box(440, 446, 95, 100, 902, 905, lam(0xd4af37), { solid: false }); // door handle
  // pet door frame (white plastic)
  const petM = lam(0xf5f5f5);
  box(382, 386, 0, 30, 896, 904, petM, { solid: false }); box(414, 418, 0, 30, 896, 904, petM, { solid: false }); box(382, 418, 26, 30, 896, 904, petM, { solid: false });
  const flapPivot = new THREE.Group(); flapPivot.position.set(400, 26, 900); scene.add(flapPivot);
  const flap = new THREE.Mesh(new THREE.BoxGeometry(27, 25, 0.6), new THREE.MeshLambertMaterial({ color: 0x7fa6b8, transparent: true, opacity: 0.55 }));
  flap.position.y = -12.6; flapPivot.add(flap);
  // baseboards
  box(0, 1400, 0, 8, 0, 1.5, baseM, { solid: false }); box(0, 1.5, 0, 8, 0, 894, baseM, { solid: false }); box(1398.5, 1400, 0, 8, 0, 894, baseM, { solid: false });
  // window on west wall
  const win = new THREE.Mesh(new THREE.PlaneGeometry(200, 110), new THREE.MeshBasicMaterial({ color: 0xcdeeff })); win.rotation.y = Math.PI / 2; win.position.set(0.6, 150, 400); scene.add(win);
  // ceiling
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(1400, 900), lam(0xfaf7f0, { side: THREE.DoubleSide })); ceil.rotation.x = Math.PI / 2; ceil.position.set(700, H, 450); scene.add(ceil);
  // sliding glass door (slid open, behind wall section)
  const alu = lam(0xb8bcc2);
  box(200, 336, 0, 212, 884, 888, new THREE.MeshLambertMaterial({ color: 0xaad8ee, transparent: true, opacity: 0.35 }));
  box(196, 200, 0, 212, 882, 890, alu, { solid: false }); box(56, 60, 0, 215, T0, T1, alu, { solid: false }); box(200, 204, 0, 215, T0, T1, alu, { solid: false });
  box(60, 200, 0, 1.2, T0, T1, alu, { solid: false });

  // ---------- kitchen furniture ----------
  const cabM = lam(0x6fa8a0), topM = lam(0xe9e4dc), kickM = lam(0x3d4a48), handleM = lam(0xcccccc);
  box(200, 1150, 0, 10, 0, 55, kickM); box(200, 1150, 10, 86, 0, 60, cabM, { solid: false }); box(198, 1152, 86, 90, 0, 63, topM, { solid: false });
  for (let x = 200; x <= 1150; x += 60) box(x - 0.6, x + 0.6, 12, 84, 60, 60.8, kickM, { solid: false });
  for (let x = 230; x < 1150; x += 60) box(x - 6, x + 6, 74, 76, 60, 62, handleM, { solid: false });
  box(700, 760, 20, 70, 60, 61, lam(0x222222), { solid: false }); // oven glass
  box(200, 1150, 145, 215, 0, 35, cabM, { solid: false });
  // fridge
  box(1290, 1395, 0, 200, 0, 72, lam(0xdfe3e6)); box(1292, 1296, 90, 170, 72, 75, handleM, { solid: false });
  const magnetC = [0xff595e, 0xffca3a, 0x8ac926, 0x1982c4]; magnetC.forEach((c, k) => box(1320 + k * 15, 1328 + k * 15, 120 + (k % 2) * 15, 128 + (k % 2) * 15, 72, 73, lam(c), { solid: false }));
  // island
  box(575, 825, 0, 8, 280, 380, kickM); box(570, 830, 8, 86, 275, 385, cabM, { solid: false }); box(560, 840, 86, 92, 268, 392, topM, { solid: false });
  // fake contact shadows
  const shadowM = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false });
  const fshadow = (x0, x1, z0, z1, op = 0.22) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), op === 0.22 ? shadowM : new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: op, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, 0.12, (z0 + z1) / 2); scene.add(m); };
  fshadow(565, 835, 270, 390); fshadow(195, 1155, 0, 70);

  // dining table + chairs (section 2)
  const woodTex = canvasTex(256, 64, (g, w, h) => { g.fillStyle = '#b07a46'; g.fillRect(0, 0, w, h); const r = rnd(11); for (let k = 0; k < 40; k++) { g.strokeStyle = `rgba(90,50,20,${0.15 + r() * 0.2})`; g.lineWidth = 1 + r() * 2; g.beginPath(); const y = r() * h; g.moveTo(0, y); g.bezierCurveTo(w / 3, y + r() * 8 - 4, 2 * w / 3, y + r() * 8 - 4, w, y); g.stroke(); } });
  const woodM = lam(0xffffff, { map: woodTex }), legM = lam(0x8c5a30);
  box(596, 904, 70, 75, 586, 694, woodM);
  box(606, 894, 62, 70, 592, 595, legM); box(606, 894, 62, 70, 685, 688, legM);
  for (const [x, z] of [[600, 590], [894, 590], [600, 684], [894, 684]]) box(x, x + 6, 0, 70, z, z + 6, legM);
  fshadow(596, 904, 586, 694, 0.3);
  const chairM = lam(0xd9534f), chairLeg = lam(0x5a3a22);
  const chair = (cx, cz, back) => { // back: 'n','s','e','w' side where the backrest is
    const o = 16.5, lw = 1.75;
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const lx = cx + sx * o, lz = cz + sz * o;
      const isBack = (back === 'n' && sz < 0) || (back === 's' && sz > 0) || (back === 'e' && sx > 0) || (back === 'w' && sx < 0);
      box(lx - lw, lx + lw, 0, isBack ? 95 : 42, lz - lw, lz + lw, chairLeg);
    }
    box(cx - 20, cx + 20, 42, 45, cz - 20, cz + 20, chairM);
    if (back === 'n') box(cx - 18, cx + 18, 72, 92, cz - 18, cz - 15.5, chairM);
    if (back === 's') box(cx - 18, cx + 18, 72, 92, cz + 15.5, cz + 18, chairM);
    if (back === 'e') box(cx + 15.5, cx + 18, 72, 92, cz - 18, cz + 18, chairM);
    if (back === 'w') box(cx - 18, cx - 15.5, 72, 92, cz - 18, cz + 18, chairM);
    fshadow(cx - 21, cx + 21, cz - 21, cz + 21, 0.14);
  };
  chair(660, 600, 'n'); chair(750, 585, 'n'); chair(840, 605, 'n'); chair(705, 690, 's'); chair(800, 680, 's'); chair(945, 640, 'e'); chair(565, 645, 'w');
  // pendant lamp
  cyl(750, 640, 0.6, 140, H, lam(0x333333), 6, false); const shade = new THREE.Mesh(new THREE.ConeGeometry(28, 26, 20, 1, true), lam(0xffd23f, { side: THREE.DoubleSide })); shade.position.set(750, 128, 640); scene.add(shade);

  // decor (off-track)
  cyl(330, 870, 10, 0, 5, lam(0x1982c4), 20); // pet bowl
  const food = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 1, 16), lam(0x8b5a2b)); food.position.set(330, 4.8, 870); scene.add(food);
  box(355, 445, 0, 0.6, 820, 886, lam(0x7a8f5a), { solid: false }); // door mat
  box(880, 900, 0, 30, 300, 307, lam(0xffca3a)); // cereal box by the island
  box(881, 899, 10, 22, 307, 307.3, lam(0xff595e), { solid: false });
  box(1000, 1030, 0, 2, 300, 304, lam(0xc0c0c0), { solid: false }); // dropped spoon

  // ---------- minor obstacles on track (cars must avoid, drones fly over) ----------
  box(900, 930, 0, 4, 118, 140, lam(0x2e86de), { minor: true }); box(901, 929, 4, 4.4, 119, 139, lam(0xffffff), { solid: false });
  box(1262, 1276, 0, 5, 372, 390, lam(0xffe066), { minor: true }); box(1262, 1276, 5, 6.5, 372, 390, lam(0x3aa655), { solid: false });
  box(118, 130, 0, 12, 500, 512, lam(0xff595e), { minor: true });
  box(740, 744, 0, 3, 1035, 1080, lam(0x2f9e44), { minor: true }); // garden hose piece
  const ball = new THREE.Mesh(new THREE.SphereGeometry(9, 16, 12), lam(0xff6b6b)); ball.position.set(1050, 9, 1385); scene.add(ball);
  solids.push({ x0: 1042, x1: 1058, z0: 1377, z1: 1393, y0: 0, y1: 18, minor: true });

  // ---------- garden ----------
  const potM = lam(0xc0623b), leafM = lam(0x3f8f3a);
  for (const [x, z, r] of [[760, 1260, 22], [890, 1350, 16], [-60, 1100, 20], [1300, 1120, 18]]) { cyl(x, z, r, 0, r * 1.6, potM, 14); const b = new THREE.Mesh(new THREE.SphereGeometry(r * 1.3, 12, 10), leafM); b.position.set(x, r * 2.4, z); scene.add(b); }
  cyl(820, 1300, 16, 0, 220, lam(0x7a5230), 10); const crown = new THREE.Mesh(new THREE.SphereGeometry(120, 16, 12), lam(0x4c9a3f)); crown.position.set(820, 290, 1300); scene.add(crown);
  const fenceM = lam(0xe9dcc3); for (let x = -600; x <= 2000; x += 24) box(x, x + 16, 0, 150, 1880, 1886, fenceM, { solid: false });
  const r2 = rnd(5); const flowerC = [0xff595e, 0xffca3a, 0xffffff, 0xc77dff];
  for (let k = 0; k < 40; k++) { const x = -300 + r2() * 1800, z = 1350 + r2() * 450; const f = new THREE.Mesh(new THREE.SphereGeometry(4, 6, 5), lam(flowerC[k % 4])); f.position.set(x, 14, z); scene.add(f); }

  // ---------- track furniture: barriers, gates, start line, pads ----------
  const N = track.N; const step = Math.max(1, Math.round(10 / track.ds));
  const bpos = [];
  for (let i = 0; i < N; i += step) for (const side of [-1, 1]) {
    const off = side * (track.halfW[i] + 1.5);
    const x = track.px[i] + track.nx[i] * off, z = track.pz[i] + track.nz[i] * off;
    if (track.insideSolid(x, 2, z, 2)) continue;
    if (Math.abs(z - 900) < 12) continue;
    bpos.push([x, z, Math.atan2(track.tz[i], track.tx[i])]);
  }
  const bh = CONFIG.barrierHeight;
  const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(9.2, bh, 3), lam(0xffffff), bpos.length);
  const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
  bpos.forEach(([x, z, a], k) => { q.setFromAxisAngle(up, -a); mtx.compose(new THREE.Vector3(x, bh / 2, z), q, sc); inst.setMatrixAt(k, mtx); inst.setColorAt(k, col.set((k >> 1) % 2 ? 0xffffff : 0xe63946)); });
  scene.add(inst);

  const gateM = lam(0xffd23f), gateM2 = lam(0x1d3557);
  const noFlyTex = canvasTex(64, 64, (g) => { g.fillStyle = 'rgba(230,57,70,0.35)'; g.fillRect(0, 0, 64, 64); g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 8; for (let k = -64; k < 128; k += 24) { g.beginPath(); g.moveTo(k, 64); g.lineTo(k + 64, 0); g.stroke(); } }, [4, 1]);
  const noFlyM = new THREE.MeshBasicMaterial({ map: noFlyTex, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false });
  track.gates.forEach((g, gi) => {
    const grp = new THREE.Group(); const i = g.i; grp.position.set(track.px[i], 0, track.pz[i]); grp.rotation.y = -Math.atan2(track.tz[i], track.tx[i]); scene.add(grp);
    const w = g.hw + 3; const ceilG = track.ceilingAt(track.px[i], track.pz[i]);
    if (!g.door) {
      for (const sd of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(3, g.h, 3), gi === 0 ? gateM2 : gateM); p.position.set(0, g.h / 2, sd * w); grp.add(p); }
      const bar = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 2 * w + 3), gi === 0 ? gateM2 : gateM); bar.position.set(0, g.h + 1.5, 0); grp.add(bar);
      const top = Math.min(ceilG - 1, g.h + 45);
      if (top > g.h + 5) { const pnl = new THREE.Mesh(new THREE.PlaneGeometry(2 * w, top - g.h - 3), noFlyM); pnl.rotation.y = Math.PI / 2; pnl.position.set(0, (g.h + 3 + top) / 2, 0); grp.add(pnl); }
    }
    const lbl = new THREE.Mesh(new THREE.PlaneGeometry(16, 6), new THREE.MeshBasicMaterial({ map: makeLabelTexture(g.label || String(gi), gi === 0 ? '#ffffff' : '#ffd23f'), transparent: true, side: THREE.DoubleSide }));
    lbl.rotation.y = -Math.PI / 2; lbl.position.set(g.door ? -3 : 0, g.door ? 33 : g.h + 7, 0); grp.add(lbl);
  });
  // start line
  { const i = track.gates[0].i; const chk = canvasTex(128, 16, (g) => { for (let a = 0; a < 16; a++) for (let b = 0; b < 2; b++) { g.fillStyle = (a + b) % 2 ? '#111' : '#fff'; g.fillRect(a * 8, b * 8, 8, 8); } });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2 * track.halfW[i], 8), new THREE.MeshBasicMaterial({ map: chk })); m.rotation.x = -Math.PI / 2; m.rotation.z = -Math.atan2(track.tz[i], track.tx[i]) + Math.PI / 2; m.position.set(track.px[i], 0.2, track.pz[i]); scene.add(m); }
  // grid boxes
  const padTex = canvasTex(128, 128, (g) => { g.fillStyle = '#0b3d91'; g.beginPath(); g.arc(64, 64, 62, 0, 7); g.fill(); g.strokeStyle = '#4cc9f0'; g.lineWidth = 8; g.beginPath(); g.arc(64, 64, 54, 0, 7); g.stroke(); g.fillStyle = '#ffd23f'; g.beginPath(); g.moveTo(72, 18); g.lineTo(40, 70); g.lineTo(62, 70); g.lineTo(54, 110); g.lineTo(88, 54); g.lineTo(66, 54); g.closePath(); g.fill(); });
  const padRings = [];
  track.pads.forEach(p => {
    const m = new THREE.Mesh(new THREE.CircleGeometry(CONFIG.battery.padRadius, 32), new THREE.MeshBasicMaterial({ map: padTex })); m.rotation.x = -Math.PI / 2; m.position.set(p.x, 0.25, p.z); scene.add(m);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(CONFIG.battery.padRadius, 0.8, 6, 32), new THREE.MeshBasicMaterial({ color: 0x4cc9f0, transparent: true, opacity: 0.7 })); ring.rotation.x = -Math.PI / 2; ring.position.set(p.x, 1, p.z); scene.add(ring); padRings.push(ring);
  });

  return {
    update(t, racers) {
      let near = 0;
      for (const r of racers) { const d = Math.hypot(r.x - 400, r.z - 900); if (d < 22 && Math.abs(r.x - 400) < 16) near = Math.max(near, (1 - d / 22)) * Math.sign(r.vz || 1); }
      const target = -near * 1.3; flapPivot.rotation.x += (target - flapPivot.rotation.x) * 0.25;
      padRings.forEach((rg, k) => { const s = 1 + 0.12 * Math.sin(t * 4 + k); rg.scale.set(s, s, s); rg.position.y = 1 + 2 * (0.5 + 0.5 * Math.sin(t * 3 + k)); });
    }
  };
}
