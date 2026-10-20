// v3.9 online transport (no accounts, no server of our own).
// 1) WebRTC peer-to-peer data channels via Trystero (signaling over public Nostr relays, public STUN: Google + Cloudflare).
// 2) Automatic fallback per peer: if no direct WebRTC path comes up (strict / symmetric NAT, UDP blocked, no TURN),
//    messages travel end-to-end encrypted (AES-GCM, key derived from the room code) as ephemeral Nostr events through
//    the same kind of public relays. Discovery/presence also runs over that relay channel so the lobby always works.
// Libraries are bundled locally in vendor/ and loaded lazily, only when the player opens Online.
const APP = 'tinyzoom-v39';
export const RELAYS = ['nos.lol', 'nostr.red5d.dev', 'relay.aarpia.com', 'nostr.chaima.info', 'nostr.christiansass.de', 'relay.agentry.com']; // measured: accept ~15 ephemeral events/s, 35–190 ms
const KIND = 20391; // ephemeral (20000–29999): relays forward but never store
const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');

export class Net {
  // opts: { code, mode: 'auto'|'relay'|'p2p', onMsg(msg, from, link), onPeer(id), onLeave(id), log }
  constructor(opts) {
    this.o = opts; this.code = opts.code.toUpperCase(); this.mode = opts.mode || 'auto';
    this.peers = new Map(); this.p2p = new Set(); this.seq = 0; this.seen = new Map(); this.socks = []; this.closed = false;
    this.stats = { p2pIn: 0, relayIn: 0, p2pOut: 0, relayOut: 0, relaysUp: 0, p2pErrors: 0 };
    this.id = null; this.gcT = 0;
  }
  async start() {
    if (!globalThis.crypto?.subtle) throw new Error('This browser has no WebCrypto (needs https)');
    const [ty, nt] = await Promise.all([this.mode === 'relay' ? null : import('./trystero-nostr.min.js'), import('./nostr-pure.min.js')]);
    this.nt = nt; this.sk = nt.generateSecretKey(); // throw-away key per session (not an identity)
    const kraw = await crypto.subtle.digest('SHA-256', enc.encode(APP + ':key:' + this.code));
    this.key = await crypto.subtle.importKey('raw', kraw, 'AES-GCM', false, ['encrypt', 'decrypt']);
    this.topic = hex(await crypto.subtle.digest('SHA-256', enc.encode(APP + ':topic:' + this.code))).slice(0, 32); // relays never see the code
    this.id = ty ? ty.selfId : Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 12);
    if (ty) {
      try {
        this.room = ty.joinRoom({ appId: APP, relayConfig: { urls: RELAYS.slice(0, 5).map(h => 'wss://' + h), warnOnRelayFailure: false } }, this.code, { onJoinError: d => { this.stats.p2pErrors++; this.o.log?.('p2p: ' + (d?.error || 'join error')); } });
        this.act = this.room.makeAction('tz');
        this.act.onMessage = (d, meta) => this.recv(d, meta?.peerId ?? meta, 'p2p');
        this.room.onPeerJoin = id => { this.p2p.add(id); this.touch(id, 'p2p'); };
        this.room.onPeerLeave = id => { this.p2p.delete(id); const p = this.peers.get(id); if (p) p.link = 'relay'; };
      } catch (e) { this.o.log?.('p2p unavailable: ' + e.message); }
    }
    for (const host of RELAYS) this.openRelay(host);
    this.hb = setInterval(() => this.tick(), 1000);
    return this.id;
  }
  openRelay(host, tries = 0) {
    if (this.closed) return;
    const s = { host, ok: false }; this.socks.push(s);
    let w; try { w = new WebSocket('wss://' + host); } catch (_) { return; }
    s.w = w;
    w.onopen = () => { s.ok = true; this.stats.relaysUp++; w.send(JSON.stringify(['REQ', 'tz', { kinds: [KIND], '#t': [this.topic], since: Math.floor(Date.now() / 1000) - 10 }])); };
    w.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch (_) { return; } if (m[0] === 'EVENT' && m[2]?.content) this.open(m[2].content); };
    w.onclose = () => { if (s.ok) this.stats.relaysUp--; s.ok = false; this.socks.splice(this.socks.indexOf(s), 1); if (!this.closed && tries < 6) setTimeout(() => this.openRelay(host, tries + 1), 2000 + tries * 3000); };
    w.onerror = () => {};
  }
  async open(content) {
    try {
      const raw = unb64(content), pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.subarray(0, 12) }, this.key, raw.subarray(12));
      const env = JSON.parse(dec.decode(pt)); this.recv(env, env.f, 'relay');
    } catch (_) { /* not ours / wrong key */ }
  }
  recv(env, from, link) {
    if (this.closed || !env || env.f === this.id || !env.f) return;
    if (env.to && env.to !== this.id) return;
    const k = env.f + ':' + env.n; if (this.seen.has(k)) return; this.seen.set(k, performance.now()); // the same message can arrive via both paths
    link === 'p2p' ? this.stats.p2pIn++ : this.stats.relayIn++;
    this.touch(env.f, this.p2p.has(env.f) ? 'p2p' : link);
    if (env.m?.t === 'bye') { this.drop(env.f); return; }
    if (env.m && env.m.t !== 'hb') this.o.onMsg?.(env.m, env.f, link);
  }
  touch(id, link) {
    let p = this.peers.get(id);
    if (!p) { p = { id, link, last: performance.now() }; this.peers.set(id, p); this.o.onPeer?.(id); }
    p.last = performance.now(); if (link === 'p2p' || !this.p2p.has(id)) p.link = this.p2p.has(id) ? 'p2p' : link;
  }
  drop(id) { if (this.peers.delete(id)) { this.p2p.delete(id); this.o.onLeave?.(id); } }
  linkOf(id) { return this.p2p.has(id) ? 'p2p' : (this.peers.has(id) ? 'relay' : null); }
  // send to one peer (to) or everyone (to omitted)
  send(m, to) {
    if (this.closed || !this.id) return;
    const env = { f: this.id, n: ++this.seq, m }; if (to) env.to = to;
    const usable = this.mode !== 'relay' && this.act;
    if (to) {
      if (usable && this.p2p.has(to)) { this.act.send(env, { target: to }); this.stats.p2pOut++; return; }
      if (this.mode !== 'p2p' || m.t === 'hello' || m.t === 'hb' || m.t === 'bye') this.publish(env);
      return;
    }
    const targets = [...this.peers.keys()];
    const direct = usable ? targets.filter(id => this.p2p.has(id)) : [];
    if (direct.length) { this.act.send(env, { target: direct }); this.stats.p2pOut++; }
    if (direct.length < targets.length || !targets.length) { if (this.mode !== 'p2p' || ['hello', 'hb', 'bye'].includes(m.t)) this.publish(env); }
  }
  async publish(env) {
    const open = this.socks.filter(s => s.ok && s.w.readyState === 1); if (!open.length) return;
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, this.key, enc.encode(JSON.stringify(env))));
    const all = new Uint8Array(12 + ct.length); all.set(iv); all.set(ct, 12);
    const ev = this.nt.finalizeEvent({ kind: KIND, created_at: Math.floor(Date.now() / 1000), tags: [['t', this.topic]], content: b64(all) }, this.sk);
    const s = JSON.stringify(['EVENT', ev]); for (const o of open) { try { o.w.send(s); } catch (_) {} }
    this.stats.relayOut++;
  }
  tick() {
    const now = performance.now();
    this.send({ t: 'hb' });
    for (const [id, p] of this.peers) if (now - p.last > 7000) this.drop(id); // silent for 7 s → gone
    if (++this.gcT % 10 === 0) for (const [k, t] of this.seen) if (now - t > 30000) this.seen.delete(k);
  }
  close() {
    if (this.closed) return; try { this.send({ t: 'bye' }); } catch (_) {}
    this.closed = true; clearInterval(this.hb);
    setTimeout(() => { for (const s of this.socks) try { s.w.close(); } catch (_) {} try { this.room?.leave(); } catch (_) {} }, 300);
  }
}
