'use strict';
/**
 * Procedural map art (our own drawing, after the C64 look: ONE continuous light ground, a meandering river band down the river
 * column, small 1-3 peak mountain sprites where the peak count is the smithore richness, an implied grid).
 * Every "random" choice comes from MapArt.hash(seed, ...): a pure hash of the game seed and the plot coordinates. The game's
 * SeededRNG is never touched, so rendering can never change a deterministic run, and a game looks the same after a reload.
 * The pure helpers (hash, rand, peaks, decor, riverEdge, cacheKey) are covered by the self-tests; paint() needs a 2D context.
 */
const MapArt = {
  /** Seed string -> uint32 (FNV-1a). */
  seedHash(seed) {
    let h = 2166136261;
    const str = String(seed);
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  },
  /** uint32 hash of a seed hash and up to three integers (a murmur3-style finaliser keeps neighbouring inputs uncorrelated). */
  mix(sh, a = 0, b = 0, c = 0) {
    let h = sh ^ Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 2246822519);
    h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^ (h >>> 16)) >>> 0;
  },
  hash(seed, a, b, c) { return this.mix(this.seedHash(seed), a, b, c); },
  /** [0, 1) from (seed, a, b, c). */
  rand(seed, a, b, c) { return this.hash(seed, a, b, c) / 4294967296; },
  /** Small local stream for one plot / feature: a pure function of its inputs, independent of the game PRNG. */
  stream(seed, a, b, salt) {
    const sh = this.seedHash(seed); let i = 0;
    return () => this.mix(sh, a * 131 + b, salt, i++) / 4294967296;
  },
  /** The terrain fingerprint: a planetquake slide changes it, so the cached layer is rebuilt. */
  cacheKey(state) { return `${state.seed}|${state.plots.map((p) => `${p.terrain[0]}${p.richness}`).join('')}`; },
  /**
   * Peak sprites of a mountain plot, in plot-local pixels (T = tile size): one per level of richness, back to front.
   * Laid out on fixed slots (so 3 peaks never pile up) with a small seeded jitter.
   */
  peaks(seed, plot, T) {
    const n = plot.terrain === TERRAIN.MOUNTAIN ? clamp(plot.richness, 1, 3) : 0;
    const slots = [[], [[0.5, 0.66]], [[0.36, 0.7], [0.64, 0.6]], [[0.3, 0.72], [0.52, 0.56], [0.72, 0.74]]][n];
    const rnd = this.stream(seed, plot.x, plot.y, 7);
    return slots.map(([sx, sy]) => {
      const big = n === 1 ? 1.15 : n === 2 ? 1 : 0.88;
      const w = T * (0.42 + rnd() * 0.1) * big; const h = T * (0.36 + rnd() * 0.12) * big;
      return { x: T * sx + (rnd() - 0.5) * T * 0.08, y: T * sy + (rnd() - 0.5) * T * 0.06, w, h, skew: (rnd() - 0.5) * 0.3 };
    }).sort((p, q) => p.y - q.y);
  },
  /**
   * Scattered ground details of a plot (plot-local pixels): pebbles, grass tufts and the odd crater. River plots get none (the
   * band is drawn over them) and mountain plots fewer (the peaks need the room).
   */
  decor(seed, plot, T) {
    if (plot.terrain === TERRAIN.RIVER || plot.terrain === TERRAIN.TOWN) return [];
    const rnd = this.stream(seed, plot.x, plot.y, 3);
    const n = (plot.terrain === TERRAIN.MOUNTAIN ? 3 : 6) + Math.floor(rnd() * 4);
    const out = [];
    for (let i = 0; i < n; i++) {
      const r = rnd(); const kind = r < 0.55 ? 'pebble' : r < 0.9 ? 'tuft' : 'crater';
      out.push({ kind, x: 6 + rnd() * (T - 12), y: 6 + rnd() * (T - 12), s: kind === 'crater' ? 5 + rnd() * 5 : 1.5 + rnd() * 2.5, v: rnd() });
    }
    return out;
  },
  /**
   * River band edges at map height `y` (pixels, whole map): left/right x relative to the river column's left edge. Two slow sine
   * waves with seeded phases make a gentle meander that is continuous across rows (a pure function of y, not of the row).
   */
  riverEdge(seed, y, T) {
    const sh = this.seedHash(seed); const ph1 = (this.mix(sh, 11) / 4294967296) * 6.283; const ph2 = (this.mix(sh, 12) / 4294967296) * 6.283;
    const centre = T / 2 + Math.sin(y / 70 + ph1) * T * 0.09 + Math.sin(y / 23 + ph2) * T * 0.025;
    const half = T * 0.27 + Math.sin(y / 41 + ph2) * T * 0.035;
    return { l: centre - half, r: centre + half };
  },

  /* ---- painting (needs a canvas) ---- */
  PAL: {
    ground: [229, 210, 168], groundLo: [214, 186, 146], grid: 'rgba(110,78,44,0.16)',
    rockLit: '#c49a8a', rockShade: '#86605f', rockEdge: 'rgba(72,44,40,0.75)', rockCap: '#f2e2d4',
    shadow: 'rgba(110,70,35,0.26)', waterDeep: '#3f88b0', water: '#5ea9cc', waterHi: 'rgba(235,250,255,0.75)',
    bank: 'rgba(122,92,52,0.45)', reed: '#7d9a4c', pebble: '#a88e6e', pebbleHi: '#f3e8d2', tuft: '#8aa152', crater: 'rgba(130,98,62,0.35)'
  },
  /** Paints the whole static layer into `ctx` (cols * T by rows * T). */
  paint(ctx, state, T) {
    const seed = state.seed; const W = CONFIG.COLS * T; const H = CONFIG.ROWS * T;
    this.paintGround(ctx, seed, W, H);
    state.plots.forEach((p) => this.paintDecor(ctx, seed, p, T));
    this.paintRiver(ctx, seed, T, H);
    state.plots.forEach((p) => { if (p.terrain === TERRAIN.MOUNTAIN) this.paintFoothills(ctx, seed, p, T); });
    state.plots.forEach((p) => { if (p.terrain === TERRAIN.MOUNTAIN) this.peaks(seed, p, T).forEach((k) => this.paintPeak(ctx, p.x * T + k.x, p.y * T + k.y, k.w, k.h, k.skew)); });
    state.plots.forEach((p) => { if (p.terrain === TERRAIN.TOWN) this.paintTown(ctx, p.x * T, p.y * T, T); });
    this.paintGrid(ctx, T, W, H);
    state.plots.forEach((p) => this.paintLabel(ctx, p, T));
  },
  /** Seamless value noise over the whole map (two octaves + fine grain), in one ImageData pass. */
  paintGround(ctx, seed, W, H) {
    const sh = this.seedHash(seed); const img = ctx.createImageData(W, H); const d = img.data;
    const lat = (ix, iy, o) => this.mix(sh, ix, iy, o) / 4294967296;
    const smooth = (t) => t * t * (3 - 2 * t);
    const noise = (x, y, cell, o) => {
      const fx = x / cell; const fy = y / cell; const ix = Math.floor(fx); const iy = Math.floor(fy);
      const tx = smooth(fx - ix); const ty = smooth(fy - iy);
      const a = lat(ix, iy, o); const b = lat(ix + 1, iy, o); const c = lat(ix, iy + 1, o); const e = lat(ix + 1, iy + 1, o);
      return (a + (b - a) * tx) + ((c + (e - c) * tx) - (a + (b - a) * tx)) * ty;
    };
    const [r0, g0, b0] = this.PAL.ground; const [r1, g1, b1] = this.PAL.groundLo;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const k = noise(x, y, 150, 1) * 0.65 + noise(x, y, 48, 2) * 0.35; // 0..1: patches of lighter / warmer soil
        const grain = (this.mix(sh, x, y, 9) / 4294967296 - 0.5) * 10;
        const i = (y * W + x) * 4;
        d[i] = r1 + (r0 - r1) * k + grain; d[i + 1] = g1 + (g0 - g1) * k + grain; d[i + 2] = b1 + (b0 - b1) * k + grain * 0.8; d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  },
  paintDecor(ctx, seed, p, T) {
    const P = this.PAL; const ox = p.x * T; const oy = p.y * T;
    this.decor(seed, p, T).forEach((d) => {
      const x = ox + d.x; const y = oy + d.y;
      if (d.kind === 'pebble') {
        ctx.fillStyle = P.pebble; ctx.beginPath(); ctx.ellipse(x, y, d.s * 1.3, d.s, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = P.pebbleHi; ctx.fillRect(x - d.s * 0.6, y - d.s * 0.6, Math.max(1, d.s * 0.6), 1);
      } else if (d.kind === 'tuft') {
        ctx.strokeStyle = P.tuft; ctx.lineWidth = 1.4; ctx.beginPath();
        for (let k = -1; k <= 1; k++) { ctx.moveTo(x + k * 2, y); ctx.lineTo(x + k * 3.5 + (d.v - 0.5) * 2, y - 4 - d.s); }
        ctx.stroke();
      } else {
        ctx.fillStyle = P.crater; ctx.beginPath(); ctx.ellipse(x, y, d.s, d.s * 0.6, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(255,246,226,0.55)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.ellipse(x, y + 0.8, d.s, d.s * 0.6, 0, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
      }
    });
  },
  paintRiver(ctx, seed, T, H) {
    const P = this.PAL; const X0 = CONFIG.RIVER_COL * T; const step = 4;
    const edges = []; for (let y = -step; y <= H + step; y += step) edges.push({ y, ...this.riverEdge(seed, y, T) });
    const band = (grow) => {
      ctx.beginPath();
      edges.forEach((e, i) => { if (i) ctx.lineTo(X0 + e.l - grow, e.y); else ctx.moveTo(X0 + e.l - grow, e.y); });
      for (let i = edges.length - 1; i >= 0; i--) ctx.lineTo(X0 + edges[i].r + grow, edges[i].y);
      ctx.closePath();
    };
    // Damp banks, then the water (deeper in the middle), then reeds and a few static glints.
    ctx.fillStyle = P.bank; band(5); ctx.fill();
    const g = ctx.createLinearGradient(X0, 0, X0 + T, 0);
    g.addColorStop(0, P.water); g.addColorStop(0.5, P.waterDeep); g.addColorStop(1, P.water);
    ctx.fillStyle = g; band(0); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.5; band(0); ctx.stroke();
    const rnd = this.stream(seed, CONFIG.RIVER_COL, 0, 5);
    ctx.strokeStyle = P.reed; ctx.lineWidth = 1.5;
    for (let i = 0; i < 26; i++) {
      const y = rnd() * H; const e = this.riverEdge(seed, y, T); const left = rnd() < 0.5;
      const x = X0 + (left ? e.l - 4 - rnd() * 6 : e.r + 4 + rnd() * 6);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 1.5, y - 7); ctx.moveTo(x + 2, y); ctx.lineTo(x + 3, y - 6); ctx.stroke();
    }
    ctx.strokeStyle = P.waterHi; ctx.lineWidth = 2; ctx.lineCap = 'round';
    for (let i = 0; i < 18; i++) {
      const y = rnd() * H; const e = this.riverEdge(seed, y, T); const x = X0 + e.l + 8 + rnd() * (e.r - e.l - 22);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 5 + rnd() * 8, y); ctx.stroke();
    }
    ctx.lineCap = 'butt';
  },
  /** A soft darker patch under a mountain plot's peaks: the range sits IN the ground instead of on a tile. */
  paintFoothills(ctx, seed, p, T) {
    const cx = p.x * T + T / 2; const cy = p.y * T + T * 0.66;
    const g = ctx.createRadialGradient(cx, cy, 4, cx, cy, T * 0.55);
    g.addColorStop(0, 'rgba(150,108,80,0.32)'); g.addColorStop(1, 'rgba(150,108,80,0)');
    ctx.fillStyle = g; ctx.fillRect(p.x * T, p.y * T, T, T);
  },
  /** One peak, base centre (x, baseY): light from the upper left, soft shadow cast to the lower right, a pale cap. */
  paintPeak(ctx, x, baseY, w, h, skew) {
    const P = this.PAL; const ax = x + skew * w; const ay = baseY - h; const mid = x + w * 0.06;
    ctx.fillStyle = P.shadow; ctx.beginPath(); ctx.ellipse(x + w * 0.22, baseY + 1, w * 0.62, h * 0.15, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = P.rockLit; ctx.beginPath(); ctx.moveTo(x - w / 2, baseY); ctx.lineTo(ax, ay); ctx.lineTo(mid, baseY); ctx.closePath(); ctx.fill();
    ctx.fillStyle = P.rockShade; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(x + w / 2, baseY); ctx.lineTo(mid, baseY); ctx.closePath(); ctx.fill();
    const k = 0.28; // cap: the top 28 % of the peak
    ctx.fillStyle = P.rockCap; ctx.beginPath();
    ctx.moveTo(ax, ay); ctx.lineTo(ax + (x - w / 2 - ax) * k, ay + h * k); ctx.lineTo(ax + (mid - ax) * k * 0.7, ay + h * k * 0.8); ctx.lineTo(ax + (x + w / 2 - ax) * k * 0.6, ay + h * k * 0.6); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = P.rockEdge; ctx.lineWidth = 1.5; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(x - w / 2, baseY); ctx.lineTo(ax, ay); ctx.lineTo(x + w / 2, baseY); ctx.stroke();
    ctx.strokeStyle = 'rgba(72,44,40,0.35)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(mid, baseY); ctx.stroke();
  },
  /** The town ([C64] a black-and-white store block over the river): a paved pad and a clean store front. */
  paintTown(ctx, ox, oy, T) {
    const m = 9;
    ctx.fillStyle = 'rgba(80,58,36,0.3)'; ctx.fillRect(ox + m + 3, oy + m + 4, T - 2 * m, T - 2 * m);
    ctx.fillStyle = '#efe5cf'; ctx.fillRect(ox + m, oy + m, T - 2 * m, T - 2 * m);
    ctx.strokeStyle = '#6b5638'; ctx.lineWidth = 2; ctx.strokeRect(ox + m + 1, oy + m + 1, T - 2 * m - 2, T - 2 * m - 2);
    const bx = ox + 18; const by = oy + 18; const bw = T - 36; const bh = 40;
    ctx.fillStyle = '#20232c'; ctx.fillRect(bx, by, bw, bh); // roof band + facade
    ctx.fillStyle = '#f6f1e4';
    for (let i = 0; i < 4; i++) ctx.fillRect(bx + 5 + i * (bw - 10) / 4, by + 5, (bw - 10) / 4 - 5, 10); // windows
    ctx.fillRect(bx + 5, by + 21, 8, 15); ctx.fillRect(bx + bw - 13, by + 21, 8, 15); // pillars
    ctx.fillStyle = COL.amber; ctx.fillRect(bx + bw / 2 - 8, by + 21, 16, 19); // door
  },
  paintGrid(ctx, T, W, H) {
    ctx.strokeStyle = this.PAL.grid; ctx.lineWidth = 1; ctx.beginPath();
    for (let x = T; x < W; x += T) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); }
    for (let y = T; y < H; y += T) { ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); }
    ctx.stroke();
  },
  /**
   * Terrain must never rely on colour alone: a small letter chip (P/R/M) in the bottom-left corner. The richness pips are gone:
   * a mountain's peak count IS its richness, and the tooltip / land panel still print it.
   */
  paintLabel(ctx, p, T) {
    const x = p.x * T + 4; const y = p.y * T + T - 21;
    ctx.font = 'bold 14px ui-monospace, Menlo, Consolas, monospace'; ctx.textBaseline = 'middle';
    if (p.terrain === TERRAIN.TOWN) {
      ctx.fillStyle = 'rgba(32,35,44,0.9)'; ctx.fillRect(p.x * T + T / 2 - 30, y - 2, 60, 18);
      ctx.fillStyle = COL.amber; ctx.textAlign = 'center'; ctx.fillText('POBLE', p.x * T + T / 2, y + 7);
      return;
    }
    ctx.fillStyle = 'rgba(255,250,238,0.78)'; ctx.fillRect(x, y, 17, 17);
    ctx.strokeStyle = 'rgba(90,62,36,0.55)'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, 16, 16);
    ctx.fillStyle = '#3a2a1a'; ctx.textAlign = 'center';
    ctx.fillText(p.terrain === TERRAIN.RIVER ? 'R' : p.terrain === TERRAIN.PLAIN ? 'P' : 'M', x + 8.5, y + 9);
  }
};
