// RC-transmitter style twin sticks + keyboard + JUMP / FIRE buttons.
// Left stick:  vertical = throttle (ground) / altitude (flyer).  Right stick: horizontal = steering / yaw, vertical = forward/back pitch (flyer).
export class Input {
  constructor() {
    this.keys = new Set(); this.sticks = { L: { x: 0, y: 0, id: null }, R: { x: 0, y: 0, id: null } };
    this.type = 'car'; this.maxR = 55; this.jumpHeld = false; this.fireQueued = false;
    addEventListener('keydown', e => {
      this.keys.add(e.code); if (['ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
      if (e.code === 'KeyF' && !e.repeat) this.fireQueued = true;
    });
    addEventListener('keyup', e => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.jumpHeld = false; });
    this.elL = document.getElementById('stickL'); this.elR = document.getElementById('stickR');
    const layer = document.getElementById('touchLayer'); this.layer = layer;
    const down = e => {
      const side = e.clientX < innerWidth / 2 ? 'L' : 'R'; const st = this.sticks[side];
      if (st.id !== null) return; st.id = e.pointerId; st.ox = e.clientX; st.oy = e.clientY; st.x = st.y = 0;
      try { layer.setPointerCapture(e.pointerId); } catch (_) {}
      this.used = true; e.preventDefault();
    };
    const move = e => {
      for (const k of ['L', 'R']) { const st = this.sticks[k]; if (st.id !== e.pointerId) continue;
        let dx = (e.clientX - st.ox) / this.maxR, dy = -(e.clientY - st.oy) / this.maxR; const m = Math.hypot(dx, dy); if (m > 1) { dx /= m; dy /= m; }
        st.x = dx; st.y = dy; }
      e.preventDefault();
    };
    const up = e => { for (const k of ['L', 'R']) { const st = this.sticks[k]; if (st.id === e.pointerId) { st.id = null; st.x = st.y = 0; } } };
    layer.addEventListener('pointerdown', down); layer.addEventListener('pointermove', move);
    layer.addEventListener('pointerup', up); layer.addEventListener('pointercancel', up); layer.addEventListener('lostpointercapture', up);
    // action buttons (sit above the touch layer, between the two stick zones)
    const btn = (id, on, off) => {
      const el = document.getElementById(id); if (!el) return;
      const ids = new Set();
      el.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); ids.add(e.pointerId); try { el.setPointerCapture(e.pointerId); } catch (_) {} el.classList.add('down'); on(); });
      const rel = e => { if (!ids.delete(e.pointerId)) return; if (!ids.size) { el.classList.remove('down'); off && off(); } };
      el.addEventListener('pointerup', rel); el.addEventListener('pointercancel', rel); el.addEventListener('lostpointercapture', rel);
      el.addEventListener('contextmenu', e => e.preventDefault());
    };
    btn('btnJump', () => { this.jumpHeld = true; }, () => { this.jumpHeld = false; });
    btn('btnFire', () => { this.fireQueued = true; });
  }
  setType(t) {
    this.type = t;
    document.getElementById('lblL').textContent = t === 'car' ? 'Throttle / Brake' : 'Altitude ↑↓';
    document.getElementById('lblR').textContent = t === 'car' ? 'Steer ⟷' : 'Yaw ⟷ · Forward ↑↓';
    const lj = document.getElementById('lblJump'); if (lj) lj.textContent = t === 'car' ? 'JUMP' : 'HOP';
  }
  read(out) {
    const k = this.keys, L = this.sticks.L, R = this.sticks.R; const dz = v => Math.abs(v) < 0.08 ? 0 : v;
    const kUp = k.has('KeyW') || k.has('ArrowUp'), kDn = k.has('KeyS') || k.has('ArrowDown');
    const kL = k.has('KeyA') || k.has('ArrowLeft'), kR = k.has('KeyD') || k.has('ArrowRight');
    const kRise = k.has('Space') || k.has('KeyE'), kSink = k.has('ShiftLeft') || k.has('ShiftRight') || k.has('KeyQ');
    const kb = (a, b) => (a ? 1 : 0) - (b ? 1 : 0);
    if (this.type === 'car') {
      out.thr = clamp1(dz(L.y) + kb(kUp, kDn)); out.steer = clamp1(dz(R.x) + kb(kR, kL)); out.alt = 0; out.pitch = 0;
      out.jump = this.jumpHeld || k.has('Space');
    } else {
      out.alt = clamp1(dz(L.y) + kb(kRise, kSink)); out.steer = clamp1(dz(R.x) + kb(kR, kL)); out.pitch = clamp1(dz(R.y) + kb(kUp, kDn)); out.thr = 0;
      out.jump = this.jumpHeld;
    }
    if (this.fireQueued) { out.fire = true; this.fireQueued = false; }
    // stick visuals
    const kx = this.type === 'car' ? 0 : L.x;
    this.elL.style.setProperty('--kx', (kx * 32) + 'px'); this.elL.style.setProperty('--ky', (-L.y * 32) + 'px');
    this.elR.style.setProperty('--kx', (R.x * 32) + 'px'); this.elR.style.setProperty('--ky', (this.type === 'car' ? 0 : -R.y * 32) + 'px');
    return out;
  }
}
const clamp1 = v => v < -1 ? -1 : v > 1 ? 1 : v;
