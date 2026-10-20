// v4.0 title screen 3D scene: a warm, sunlit kids'-room workbench ("toy garage") with the selected RC vehicle on the desk.
// All props and textures are procedural/original. The background is a pre-blurred painted room (cheap bokeh / depth of field).
import * as THREE from './three.module.min.js';
import { createVehicleMesh } from './vehicles.js';

const cv = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
const rnd = (a, b) => a + Math.random() * (b - a);
let seed = 7; const srnd = (a, b) => { seed = (seed * 16807) % 2147483647; return a + (seed / 2147483647) * (b - a); };

function woodTex() { return cv(1024, 512, (g, w, h) => {
  const planks = 5, ph = h / planks;
  for (let p = 0; p < planks; p++) {
    const base = [[178, 112, 62], [192, 124, 70], [168, 104, 58], [186, 120, 66], [174, 110, 60]][p];
    g.fillStyle = `rgb(${base})`; g.fillRect(0, p * ph, w, ph);
    for (let k = 0; k < 90; k++) { const y = p * ph + srnd(0, ph), a = srnd(0.04, 0.16); g.strokeStyle = `rgba(${srnd(0, 1) < 0.5 ? '90,50,20' : '235,180,120'},${a})`; g.lineWidth = srnd(0.6, 2.4);
      g.beginPath(); g.moveTo(0, y); for (let x = 0; x <= w; x += 32) g.lineTo(x, y + Math.sin(x / srnd(60, 140) + k) * srnd(1, 4)); g.stroke(); }
    for (let k = 0; k < 2; k++) { const kx = srnd(80, w - 80), ky = p * ph + srnd(20, ph - 20); const gr = g.createRadialGradient(kx, ky, 1, kx, ky, srnd(8, 16)); gr.addColorStop(0, 'rgba(80,40,15,.7)'); gr.addColorStop(1, 'rgba(80,40,15,0)'); g.fillStyle = gr; g.beginPath(); g.ellipse(kx, ky, 26, 9, 0, 0, 7); g.fill(); }
    g.fillStyle = 'rgba(60,30,10,.55)'; g.fillRect(0, p * ph, w, 2.5);
  }
}); }
function matTex() { return cv(512, 512, (g, w, h) => {
  g.fillStyle = '#2f6b55'; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(255,255,255,.22)'; g.lineWidth = 1; for (let k = 0; k <= w; k += 16) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k, h); g.stroke(); g.beginPath(); g.moveTo(0, k); g.lineTo(w, k); g.stroke(); }
  g.strokeStyle = 'rgba(255,255,255,.45)'; g.lineWidth = 2; for (let k = 0; k <= w; k += 80) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k, h); g.stroke(); g.beginPath(); g.moveTo(0, k); g.lineTo(w, k); g.stroke(); }
  g.strokeStyle = 'rgba(255,230,120,.5)'; g.beginPath(); g.moveTo(0, h); g.lineTo(w, 0); g.stroke();
}); }
function roomTex() { return cv(1024, 512, (g, w, h) => { // painted kids' room, blurred = bokeh background
  const sky = g.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, '#7a5a44'); sky.addColorStop(1, '#3d2a1f'); g.fillStyle = sky; g.fillRect(0, 0, w, h);
  // window with sunlit garden (upper left)
  g.fillStyle = '#ffe9b0'; g.fillRect(40, 20, 300, 250); g.fillStyle = '#9fd36a'; g.fillRect(40, 170, 300, 100); g.fillStyle = '#6fae48'; for (let k = 0; k < 9; k++) { g.beginPath(); g.arc(60 + k * 34, 175, 30, 0, 7); g.fill(); }
  g.fillStyle = '#5b3d28'; g.fillRect(185, 20, 12, 250); g.fillRect(40, 140, 300, 10);
  // posters & shelves with toys (right)
  for (const [x, y, c] of [[430, 40, '#3d6fb6'], [560, 30, '#d9473b'], [700, 50, '#f2c14e'], [840, 30, '#2a9d8f']]) { g.fillStyle = c; g.fillRect(x, y, 100, 120); g.fillStyle = 'rgba(255,255,255,.5)'; g.beginPath(); g.arc(x + 50, y + 60, 26, 0, 7); g.fill(); }
  g.fillStyle = '#8a5a34'; g.fillRect(400, 205, 624, 14); g.fillRect(400, 300, 624, 14);
  for (let k = 0; k < 14; k++) { g.fillStyle = ['#e63946', '#3a86ff', '#ffd166', '#06d6a0', '#f4a261', '#9b5de5'][k % 6]; g.fillRect(420 + k * 42, 165 + (k % 3) * 6, 28, 40 - (k % 3) * 6); g.fillRect(430 + k * 42, 262, 22, 38); }
  // warm desk lamp glow + bed with stars
  const lamp = g.createRadialGradient(760, 250, 4, 760, 250, 150); lamp.addColorStop(0, 'rgba(255,214,140,1)'); lamp.addColorStop(1, 'rgba(255,190,110,0)'); g.fillStyle = lamp; g.fillRect(560, 100, 400, 300);
  g.fillStyle = '#2f4f8f'; g.fillRect(820, 330, 220, 182); g.fillStyle = '#ffd166'; for (let k = 0; k < 8; k++) { g.beginPath(); g.arc(840 + k * 26, 370 + (k % 2) * 40, 6, 0, 7); g.fill(); }
  // bokeh dots
  for (let k = 0; k < 40; k++) { g.fillStyle = `rgba(255,${rnd(200, 240)},${rnd(140, 200)},${rnd(0.15, 0.4)})`; g.beginPath(); g.arc(rnd(0, w), rnd(0, h * 0.7), rnd(6, 22), 0, 7); g.fill(); }
  // blur pass
  const c2 = document.createElement('canvas'); c2.width = w; c2.height = h; const g2 = c2.getContext('2d'); g2.filter = 'blur(14px)'; g2.drawImage(g.canvas, 0, 0); g.clearRect(0, 0, w, h); g.drawImage(c2, 0, 0);
}); }
function battTex() { return cv(256, 64, (g) => { g.fillStyle = '#1b1b1b'; g.fillRect(0, 0, 256, 64); g.fillStyle = '#c8862d'; g.fillRect(0, 0, 90, 64); g.fillStyle = '#e8a64a'; g.fillRect(0, 6, 90, 6);
  g.fillStyle = '#f5f0e6'; g.font = '900 30px Arial Black, Arial'; g.fillText('AA', 140, 44); g.fillStyle = '#c8862d'; g.fillRect(110, 52, 130, 4); }); }
function mugTex() { return cv(256, 128, (g) => { g.fillStyle = '#f4ead2'; g.fillRect(0, 0, 256, 128); g.strokeStyle = '#3a3a3a'; g.lineWidth = 4; g.beginPath(); g.arc(128, 60, 28, 0.2, Math.PI - 0.2); g.stroke(); g.fillStyle = '#3a3a3a'; g.beginPath(); g.arc(114, 46, 4, 0, 7); g.arc(142, 46, 4, 0, 7); g.fill(); }); }

export class Garage {
  constructor(renderer, envMap) {
    this.renderer = renderer; const S = this.scene = new THREE.Scene();
    S.environment = envMap || null; S.background = new THREE.Color(0x3d2a1f);
    this.camera = new THREE.PerspectiveCamera(30, 16 / 9, 1, 2000);
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    // lights: golden-hour window sun + warm bounce + lamp
    S.add(new THREE.HemisphereLight(0xffe8c8, 0x6b4224, 0.9));
    const sun = this.sun = new THREE.DirectionalLight(0xffd59a, 2.6); sun.position.set(-60, 70, -40); sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024); Object.assign(sun.shadow.camera, { left: -50, right: 50, top: 40, bottom: -40, near: 10, far: 220 }); sun.shadow.bias = -0.0005; sun.shadow.radius = 4; S.add(sun);
    const lamp = new THREE.PointLight(0xffc27a, 900, 160, 2); lamp.position.set(40, 30, -30); S.add(lamp);
    // desk
    const wood = woodTex(); wood.wrapS = wood.wrapT = THREE.RepeatWrapping; wood.repeat.set(1.4, 1.4);
    const desk = new THREE.Mesh(new THREE.BoxGeometry(240, 6, 140), new THREE.MeshStandardMaterial({ map: wood, roughness: 0.55, metalness: 0 }));
    desk.position.set(0, -3, 0); desk.receiveShadow = true; S.add(desk);
    // blurred room backdrop
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(520, 260), new THREE.MeshBasicMaterial({ map: roomTex(), toneMapped: false }));
    bg.material.color.setScalar(1.08); bg.position.set(0, 60, -150); S.add(bg); this.bg = bg;
    // cutting mat (front-left)
    const mat = new THREE.Mesh(new THREE.BoxGeometry(46, 0.4, 30), new THREE.MeshStandardMaterial({ map: matTex(), roughness: 0.8 })); mat.position.set(-20, 0.2, 26); mat.rotation.y = 0.12; mat.receiveShadow = true; S.add(mat);
    const props = this.props = new THREE.Group(); props.position.set(16, 0, 14); S.add(props);
    const std = (c, r = 0.5, m = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
    const add = (mesh, x, y, z, ry = 0) => { mesh.position.set(x, y, z); mesh.rotation.y = ry; mesh.castShadow = mesh.receiveShadow = true; props.add(mesh); return mesh; };
    // AA batteries
    const bt = battTex();
    for (const [x, z, ry] of [[-40, 18, 0.3], [-30, 22, 0.1], [-48, 8, -0.4]]) { const b = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 5, 24), new THREE.MeshStandardMaterial({ map: bt, roughness: 0.35, metalness: 0.3 })); body.rotation.z = Math.PI / 2; b.add(body);
      const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.3, 12), std(0xcfcfcf, 0.2, 1)); tip.rotation.z = Math.PI / 2; tip.position.x = 2.65; b.add(tip);
      b.traverse(o => { o.castShadow = o.receiveShadow = true; }); add(b, x, 0.8 + 0.4, z, ry); }
    // screws
    for (let k = 0; k < 7; k++) { const s = new THREE.Group(); const head = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.25, 14), std(0xbfc4c8, 0.25, 1)); const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.05, 1.6, 8), std(0xa8adb2, 0.3, 1)); sh.rotation.z = Math.PI / 2; sh.position.x = 0.9; head.rotation.z = Math.PI / 2; s.add(head, sh);
      s.traverse(o => o.castShadow = true); add(s, rnd(-55, -16) + (k > 4 ? 60 : 0), 0.5, rnd(4, 30), rnd(0, 6)); }
    // wrench (extruded)
    { const sh = new THREE.Shape(); sh.absarc(0, 0, 1.6, 0.6, Math.PI * 2 - 0.6, false); sh.lineTo(11, -0.55); sh.absarc(12.2, 0, 1.3, Math.PI, -Math.PI, true); sh.lineTo(1.3, 0.55);
      const g = new THREE.ExtrudeGeometry(sh, { depth: 0.5, bevelEnabled: true, bevelSize: 0.15, bevelThickness: 0.15, bevelSegments: 2 }); g.rotateX(-Math.PI / 2);
      add(new THREE.Mesh(g, std(0xc9ced3, 0.25, 1)), -28, 0.4, 30, 0.25); }
    // red screwdriver
    { const s = new THREE.Group(); const h = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 0.9, 7, 10), std(0xd62828, 0.35)); h.rotation.z = Math.PI / 2; const b = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 7, 8), std(0xcccccc, 0.2, 1)); b.rotation.z = Math.PI / 2; b.position.x = 7; s.add(h, b); s.traverse(o => o.castShadow = true); add(s, -56, 1.1, 24, -0.2); }
    // pencil mug (back-left)
    { const m = new THREE.Mesh(new THREE.CylinderGeometry(5, 4.6, 10, 32, 1, true), new THREE.MeshStandardMaterial({ map: mugTex(), roughness: 0.4, side: THREE.DoubleSide })); add(m, -58, 5, -16, 0.8);
      const bot = new THREE.Mesh(new THREE.CircleGeometry(4.6, 24), std(0xe9dcc0)); bot.rotation.x = -Math.PI / 2; add(bot, -58, 0.3, -16);
      for (let k = 0; k < 6; k++) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 15, 6), std(['#e63946', '#3a86ff', '#ffd166', '#2a9d8f', '#222', '#f4a261'][k], 0.5)); p.position.set(-58 + rnd(-2.5, 2.5), 9, -16 + rnd(-2.5, 2.5)); p.rotation.set(rnd(-0.25, 0.25), 0, rnd(-0.25, 0.25)); p.castShadow = true; props.add(p); } }
    // spare tyres stacked (left)
    for (let k = 0; k < 2; k++) { const t = new THREE.Mesh(new THREE.TorusGeometry(3.3, 1.5, 12, 28), std(0x1c1c1c, 0.9)); t.rotation.x = Math.PI / 2; add(t, -70, 1.5 + k * 3, 0); }
    // stickers sheet + paint pots (right)
    { const st = cv(256, 192, g => { g.fillStyle = '#fffaf0'; g.fillRect(0, 0, 256, 192); for (const [x, y, c, s] of [[50, 50, '#e63946', '★'], [130, 50, '#3a86ff', '⚡'], [205, 50, '#2a9d8f', '7'], [50, 135, '#f4a261', '♥'], [130, 135, '#9b5de5', '☺'], [205, 135, '#ffd166', '✦']]) { g.fillStyle = c; g.beginPath(); g.arc(x, y, 30, 0, 7); g.fill(); g.fillStyle = '#fff'; g.font = '900 34px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(s, x, y + 2); } });
      const sheet = new THREE.Mesh(new THREE.BoxGeometry(16, 0.1, 12), new THREE.MeshStandardMaterial({ map: st, roughness: 0.6 })); add(sheet, 42, 0.05, 24, -0.25); }
    for (const [x, z, c] of [[56, 6, 0xe63946], [63, 12, 0x3a86ff]]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 3, 20), std(c, 0.3)); add(p, x, 1.5, z); const l = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.3, 0.6, 20), std(0xeeeeee, 0.3)); add(l, x, 3.2, z); }
    // turntable disc under the car
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(11, 11.5, 0.8, 48), new THREE.MeshStandardMaterial({ color: 0xf2e6cf, roughness: 0.45 })); disc.position.set(4, 0.6, 4); disc.scale.set(1.6, 1.4, 1.6); disc.receiveShadow = true; S.add(disc);
    this.stand = new THREE.Group(); this.stand.position.set(4, 1.1, 4); this.stand.scale.setScalar(1.6); S.add(this.stand);
    this.angle = 0.65; this.car = null; this.t = 0;
  }
  setVehicle(type, color, model) {
    if (this.car) this.stand.remove(this.car.root);
    const m = this.car = createVehicleMesh(type, color, null, model);
    m.root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    if (m.shadow) m.shadow.visible = false;
    m.root.position.set(0, type === 'drone' ? 5 : 0, 0); this.stand.add(m.root); this.type = type;
  }
  frame(w, h, thumb) {
    const cam = this.camera; cam.aspect = w / h;
    if (thumb) { cam.fov = 26; cam.position.set(39, 22, 52); cam.lookAt(4, 6.5, 4); cam.clearViewOffset(); }
    else { const narrow = w / h < 1.6; cam.fov = narrow ? 40 : 30; cam.position.set(12, 17, narrow ? 96 : 80); cam.lookAt(8, 8, 0);
      // put the car centre-left (as in the mockup): shift the view so the right third is free for the cards
      cam.setViewOffset(w, h, w * 0.14, h * 0.03, w, h); }
    cam.updateProjectionMatrix();
  }
  update(dt) { this.t += dt; if (!this.reduced) this.angle += dt * 0.22; this.stand.rotation.y = this.angle; if (this.type === 'drone' && this.car) this.car.root.position.y = 5 + Math.sin(this.t * 2) * 0.6;
    if (this.car) for (const r of this.car.rotors || []) r.rotation.y += dt * 4; }
  render(w, h) { this.frame(w, h); this.renderer.render(this.scene, this.camera); }
  // small vehicle portrait for the carousel (rendered once into a data URL)
  thumbnail(type, color, model, W = 240, H = 160) {
    const r = this.renderer, old = new THREE.Vector2(); r.getSize(old); const pr = r.getPixelRatio();
    const keep = this.angle; this.setVehicle(type, color, model); this.stand.rotation.y = 0.7; this.bg.visible = false; this.props.visible = false;
    r.setPixelRatio(1); r.setSize(W, H, false); this.frame(W, H, true); r.render(this.scene, this.camera);
    const c = document.createElement('canvas'); c.width = W; c.height = H; c.getContext('2d').drawImage(r.domElement, 0, 0, W, H, 0, 0, W, H);
    this.bg.visible = true; this.props.visible = true; r.setPixelRatio(pr); r.setSize(old.x, old.y, false); this.angle = keep;
    return c.toDataURL('image/png');
  }
}
