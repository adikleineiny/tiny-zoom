import * as THREE from './three.module.min.js';
import { makeLabelTexture } from './world.js';

const lam = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, ...o });
let shadowTex = null;
function blobTex() {
  if (shadowTex) return shadowTex;
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 31); gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); shadowTex = new THREE.CanvasTexture(c); return shadowTex;
}

// Forward is +X in local space.
export function createVehicleMesh(type, color, name) {
  const root = new THREE.Group(); const tilt = new THREE.Group(); root.add(tilt);
  const parts = { root, tilt, wheels: [], frontPivots: [], rotors: [] };
  if (type === 'car') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(14, 3.2, 8.4), lam(color)); body.position.y = 3.6; tilt.add(body);
    const nose = new THREE.Mesh(new THREE.BoxGeometry(3, 2, 7.6), lam(color)); nose.position.set(7.5, 3.0, 0); tilt.add(nose);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(5.5, 2.6, 6.4), lam(0x222831)); cab.position.set(-1, 6.4, 0); tilt.add(cab);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(14.2, 0.4, 2), lam(0xffffff)); stripe.position.set(0, 5.25, 0); tilt.add(stripe);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.5, 9), lam(0x222831)); wing.position.set(-6.4, 7.6, 0); tilt.add(wing);
    for (const z of [-3, 3]) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.8, 2.6, 0.6), lam(0x222831)); st.position.set(-6.4, 6.2, z); tilt.add(st); }
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 7, 4), lam(0x111111)); ant.position.set(-4, 9, 3); tilt.add(ant);
    const wg = new THREE.CylinderGeometry(2.5, 2.5, 2.2, 14); wg.rotateX(Math.PI / 2);
    const tyre = lam(0x1b1b1b), hub = lam(0xdddddd);
    for (const [x, z] of [[4.6, 4.6], [4.6, -4.6], [-4.6, 4.6], [-4.6, -4.6]]) {
      const piv = new THREE.Group(); piv.position.set(x, 2.5, z); root.add(piv);
      const w = new THREE.Mesh(wg, tyre); piv.add(w);
      const h = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 2.3, 8).rotateX(Math.PI / 2), hub); w.add(h);
      parts.wheels.push(w); if (x > 0) parts.frontPivots.push(piv);
    }
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.8, 1.4), new THREE.MeshBasicMaterial({ color: 0xfff6b0 }));
    for (const z of [-2.6, 2.6]) { const m = hl.clone(); m.position.set(9.05, 3.2, z); tilt.add(m); }
  } else {
    const body = new THREE.Mesh(new THREE.BoxGeometry(6, 2.4, 5), lam(color)); body.position.y = 3; tilt.add(body);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(2.2, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), lam(0x222831)); dome.position.y = 4.2; tilt.add(dome);
    const armM = lam(0x2b2d42);
    for (const a of [Math.PI / 4, 3 * Math.PI / 4]) { const arm = new THREE.Mesh(new THREE.BoxGeometry(13, 0.8, 1), armM); arm.position.y = 3.4; arm.rotation.y = a; tilt.add(arm); }
    const rotorM = new THREE.MeshLambertMaterial({ color: 0xdddddd, transparent: true, opacity: 0.55 });
    for (const [x, z] of [[4.6, 4.6], [4.6, -4.6], [-4.6, 4.6], [-4.6, -4.6]]) {
      const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 1.4, 8), armM); motor.position.set(x, 3.9, z); tilt.add(motor);
      const rot = new THREE.Group(); rot.position.set(x, 4.8, z); tilt.add(rot);
      const blade = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.15, 0.7), rotorM); rot.add(blade);
      const blade2 = blade.clone(); blade2.rotation.y = Math.PI / 2; rot.add(blade2);
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(2.9, 2.9, 0.08, 16), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.12 })); rot.add(disc);
      parts.rotors.push(rot);
    }
    for (const z of [-2.2, 2.2]) { const sk = new THREE.Mesh(new THREE.BoxGeometry(7, 0.5, 0.5), armM); sk.position.set(0, 0.5, z); tilt.add(sk); const l1 = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.8, 0.4), armM); l1.position.set(1.8, 1.4, z); tilt.add(l1); const l2 = l1.clone(); l2.position.x = -1.8; tilt.add(l2); }
    const ledF = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 3), new THREE.MeshBasicMaterial({ color: 0x00ff88 })); ledF.position.set(3.1, 3, 0); tilt.add(ledF);
    const ledB = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 3), new THREE.MeshBasicMaterial({ color: 0xff2244 })); ledB.position.set(-3.1, 3, 0); tilt.add(ledB);
  }
  const sh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: blobTex(), transparent: true, depthWrite: false }));
  sh.rotation.x = -Math.PI / 2; parts.shadow = sh;
  if (name) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeLabelTexture(name, '#ffffffdd', '#111', 256, 80), transparent: true, depthWrite: false }));
    sp.scale.set(12, 3.75, 1); sp.position.y = 15; root.add(sp); parts.label = sp;
  }
  return parts;
}

export function updateVehicleMesh(p, r, dt, t) {
  p.root.position.set(r.x, r.y, r.z); p.root.rotation.y = -r.heading;
  const c = Math.cos(r.heading), s = Math.sin(r.heading);
  const fwd = r.vx * c + r.vz * s;
  if (r.type === 'car') {
    for (const w of p.wheels) w.rotation.z -= fwd / 2.5 * dt;
    for (const f of p.frontPivots) f.rotation.y = -r.input.steer * 0.45;
    const bump = r.surface === 'grass' ? Math.sin(t * 40 + r.id) * 0.25 * Math.min(1, Math.abs(fwd) / 40) : 0;
    p.tilt.rotation.x += ((r.input.steer * Math.min(1, Math.abs(fwd) / 80)) * 0.08 - p.tilt.rotation.x) * 0.2;
    p.tilt.rotation.z += (-r.input.thr * 0.04 - p.tilt.rotation.z) * 0.15; p.tilt.position.y = bump;
  } else {
    const spin = 10 + 60 * r.spool;
    p.rotors.forEach((rt, k) => rt.rotation.y += (k % 2 ? 1 : -1) * spin * dt);
    p.tilt.rotation.z += (-r.input.pitch * 0.28 * r.spool - p.tilt.rotation.z) * 0.12;
    p.tilt.rotation.x += (r.input.steer * 0.18 * r.spool - p.tilt.rotation.x) * 0.12;
    p.tilt.position.y = r.y > 3 ? Math.sin(t * 6 + r.id) * 0.3 : 0;
  }
  const alt = r.y; const sz = (r.type === 'car' ? 15 : 14) * (1 + alt / 40);
  p.shadow.scale.set(sz, sz * (r.type === "car" ? 0.7 : 1), 1); p.shadow.rotation.z = -r.heading; p.shadow.position.set(r.x, (r.groundY || 0) + 0.3, r.z);
  p.shadow.material.opacity = Math.max(0.15, 1 - alt / 90);
}
