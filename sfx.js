// v4.0 tiny WebAudio sound engine (all sounds synthesised – no audio files). Listens to sim events only.
export class SFX {
  constructor() { this.vol = 0.7; this.muted = false; this.ctx = null; this.eng = null; }
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    try { this.ctx = new AC(); } catch (_) { return; }
    this.master = this.ctx.createGain(); this.master.connect(this.ctx.destination); this.apply();
  }
  apply() { if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : this.vol * 0.6, this.ctx.currentTime, 0.03); }
  setVolume(v) { this.vol = Math.max(0, Math.min(1, v)); this.apply(); }
  setMuted(m) { this.muted = !!m; this.apply(); }
  tone(f, d = 0.12, type = 'square', g = 0.25, slide = 0) {
    const c = this.ctx; if (!c || this.muted || !this.vol) return; const t = c.currentTime;
    const o = c.createOscillator(), a = c.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f * slide), t + d);
    a.gain.setValueAtTime(g, t); a.gain.exponentialRampToValueAtTime(0.001, t + d); o.connect(a); a.connect(this.master); o.start(t); o.stop(t + d + 0.02);
  }
  noise(d = 0.3, g = 0.4, lp = 1200) {
    const c = this.ctx; if (!c || this.muted || !this.vol) return; const t = c.currentTime, n = Math.ceil(c.sampleRate * d);
    const b = c.createBuffer(1, n, c.sampleRate), ch = b.getChannelData(0); for (let k = 0; k < n; k++) ch[k] = (Math.random() * 2 - 1) * (1 - k / n);
    const s = c.createBufferSource(), f = c.createBiquadFilter(), a = c.createGain(); s.buffer = b; f.type = 'lowpass'; f.frequency.value = lp; a.gain.value = g;
    s.connect(f); f.connect(a); a.connect(this.master); s.start(t);
  }
  ui() { this.tone(660, 0.06, 'triangle', 0.18); }
  count(n) { n === 'GO!' ? this.tone(880, 0.45, 'square', 0.22) : this.tone(440, 0.18, 'square', 0.2); }
  event(e, me) {
    const mine = e.r === me;
    switch (e.type) {
      case 'gotWeapon': if (mine) { this.tone(700, 0.08, 'triangle', 0.2); setTimeout(() => this.tone(1050, 0.1, 'triangle', 0.2), 70); } break;
      case 'hit': if (mine || e.by === me) this.noise(0.25, mine ? 0.5 : 0.3, 900); break;
      case 'boom': this.noise(0.5, 0.45, 500); break;
      case 'turboPad': if (mine) this.tone(300, 0.35, 'sawtooth', 0.15, 3); break;
      case 'lap': if (mine) this.tone(990, 0.2, 'triangle', 0.22); break;
    }
  }
  // continuous engine hum: pitch follows speed (0..1)
  engine(on, k = 0, fly = false) {
    const c = this.ctx; if (!c) return;
    if (on && !this.eng) { const o = c.createOscillator(), o2 = c.createOscillator(), f = c.createBiquadFilter(), a = c.createGain(); o.type = 'sawtooth'; o2.type = 'square'; f.type = 'lowpass'; f.frequency.value = 900; a.gain.value = 0;
      o.connect(f); o2.connect(f); f.connect(a); a.connect(this.master); o.start(); o2.start(); this.eng = { o, o2, a }; }
    if (!this.eng) return; const t = c.currentTime;
    if (!on) { this.eng.a.gain.setTargetAtTime(0, t, 0.05); return; }
    const base = fly ? 140 : 70; this.eng.o.frequency.setTargetAtTime(base + k * (fly ? 160 : 190), t, 0.05); this.eng.o2.frequency.setTargetAtTime((base + k * 190) * 0.502, t, 0.05);
    this.eng.a.gain.setTargetAtTime(0.05 + k * 0.05, t, 0.08);
  }
}
