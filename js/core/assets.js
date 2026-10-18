'use strict';
class AssetLoader {
  constructor(list = ASSET_LIST) {
    this.list = list;
    this.images = new Map();
    this.failed = new Set();
    this.cache = new Map();
    this.settled = 0;
    this.done = false;
    this.blocked = new Set(); // test hook: names forced to fail
  }
  get progress() { return this.list.length ? this.settled / this.list.length : 1; }
  load(base = 'assets/') {
    return Promise.all(this.list.map((a) => new Promise((resolve) => {
      const finish = () => { this.settled++; resolve(); };
      if (this.blocked.has(a.name)) { this.failed.add(a.name); finish(); return; }
      const img = new Image();
      img.onload = () => { this.images.set(a.name, img); finish(); };
      img.onerror = () => { this.failed.add(a.name); finish(); };
      img.src = `${base}${a.name}.png`;
    }))).then(() => { this.done = true; });
  }
  def(name) { return this.list.find((a) => a.name === name); }
  has(name) { return this.images.has(name); }
  /** Frame size is derived from the real image: never hardcode the spec sizes. */
  frameSize(name) {
    const img = this.images.get(name);
    const frames = (this.def(name) || { frames: 1 }).frames;
    return img ? { w: Math.floor(img.naturalWidth / frames), h: img.naturalHeight } : { w: 0, h: 0 };
  }
  /**
   * Returns a canvas with the requested frame scaled to w x h. Big art is halved step by step with smoothing
   * so the final nearest-neighbour blit stays crisp instead of aliasing (1024px -> 96px in one go looks broken).
   */
  scaled(name, w, h, frame = 0) {
    const key = `${name}|${w}|${h}|${frame}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const img = this.images.get(name);
    if (!img) return null;
    const fs = this.frameSize(name);
    let cur = document.createElement('canvas');
    cur.width = fs.w; cur.height = fs.h;
    let cx = cur.getContext('2d');
    cx.drawImage(img, frame * fs.w, 0, fs.w, fs.h, 0, 0, fs.w, fs.h);
    while (cur.width / 2 >= w * 1.5 && cur.height / 2 >= h * 1.5) {
      const nx = document.createElement('canvas');
      nx.width = Math.max(1, Math.floor(cur.width / 2)); nx.height = Math.max(1, Math.floor(cur.height / 2));
      const c2 = nx.getContext('2d');
      c2.imageSmoothingEnabled = true; c2.imageSmoothingQuality = 'high';
      c2.drawImage(cur, 0, 0, nx.width, nx.height);
      cur = nx;
    }
    const out = document.createElement('canvas');
    out.width = Math.max(1, Math.round(w)); out.height = Math.max(1, Math.round(h));
    const oc = out.getContext('2d');
    oc.imageSmoothingEnabled = true; oc.imageSmoothingQuality = 'high';
    oc.drawImage(cur, 0, 0, out.width, out.height);
    this.cache.set(key, out);
    return out;
  }
  /** Draws an asset stretched to the box; falls back to a Canvas placeholder if the PNG is missing. */
  draw(ctx, name, x, y, w, h, frame = 0) {
    const c = this.scaled(name, w, h, frame);
    if (c) { ctx.drawImage(c, Math.round(x), Math.round(y)); return true; }
    this.fallback(ctx, name, x, y, w, h);
    return false;
  }
  /** Same as draw but keeps the art aspect ratio inside the box, centred. */
  drawContain(ctx, name, x, y, w, h, frame = 0) {
    if (!this.has(name)) { this.fallback(ctx, name, x, y, w, h); return false; }
    const fs = this.frameSize(name);
    const k = Math.min(w / fs.w, h / fs.h);
    const dw = Math.max(1, Math.round(fs.w * k)); const dh = Math.max(1, Math.round(fs.h * k));
    return this.draw(ctx, name, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh, frame);
  }
  fallback(ctx, name, x, y, w, h) {
    const a = this.def(name) || { fb: '#444', label: '?' };
    ctx.save();
    ctx.fillStyle = a.fb; ctx.fillRect(x, y, w, h);
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 2;
    for (let i = -h; i < w; i += 14) { ctx.beginPath(); ctx.moveTo(x + i, y + h); ctx.lineTo(x + i + h, y); ctx.stroke(); }
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    if (w >= 56 && h >= 22) {
      ctx.fillStyle = '#e8ecf5'; ctx.font = 'bold 16px ui-monospace, Menlo, Consolas, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(a.label, x + w / 2, y + h / 2);
    }
  }
}
