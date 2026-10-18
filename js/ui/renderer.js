'use strict';
/** Canvas drawing helpers + immediate-mode widgets (rebuilt every frame, consumed by InputManager). */
class Renderer {
  constructor(canvas, game) {
    this.canvas = canvas; this.game = game; this.ctx = canvas.getContext('2d');
    this.widgets = []; this.focusId = null; this.showFocus = false; this.modalIndex = 0;
    this.font = 'ui-monospace, Menlo, Consolas, "Courier New", monospace';
  }
  begin() {
    const c = this.ctx; c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.imageSmoothingEnabled = false;
    c.setLineDash([]); c.fillStyle = COL.bg; c.fillRect(0, 0, CONFIG.W, CONFIG.H);
    this.widgets = []; this.modalIndex = 0;
  }
  focusables() { return this.widgets.filter((w, i) => w.focusable && !w.disabled && i >= this.modalIndex); }
  cycleFocus(dir) {
    const f = this.focusables(); if (!f.length) return;
    const i = f.findIndex((w) => w.id === this.focusId);
    this.focusId = f[(i + dir + f.length * 2) % f.length].id;
  }
  beginModal() { this.modalIndex = this.widgets.length; }
  asset(name, x, y, w, h, frame = 0) { return this.game.assets.draw(this.ctx, name, x, y, w, h, frame); }
  assetContain(name, x, y, w, h, frame = 0) { return this.game.assets.drawContain(this.ctx, name, x, y, w, h, frame); }
  assetFrame(name, x, y, w, h, frame) { return this.game.assets.drawContain(this.ctx, name, x, y, w, h, frame); }
  icon(resId, x, y, size) { const d = RESOURCE_DEFS[resId]; if (d) this.asset(d.icon, x, y, size, size); }
  dim(a) { this.ctx.fillStyle = `rgba(4,6,14,${a})`; this.ctx.fillRect(0, 0, CONFIG.W, CONFIG.H); }
  font_(size, bold = true) { return `${bold ? 'bold ' : ''}${size}px ${this.font}`; }
  measure(str, size) { this.ctx.font = this.font_(size); return this.ctx.measureText(str).width; }
  text(str, x, y, o = {}) {
    const c = this.ctx; let size = o.size || 16; let s = String(str);
    c.font = this.font_(size, o.bold !== false); c.textAlign = o.align || 'left'; c.textBaseline = 'top';
    if (o.fit && o.maxW) { // shrink (down to 70 %) before falling back to an ellipsis
      const min = Math.ceil(size * 0.7);
      while (size > min && c.measureText(s).width > o.maxW) { size -= 1; c.font = this.font_(size, o.bold !== false); }
    }
    if (o.maxW && c.measureText(s).width > o.maxW) {
      while (s.length > 1 && c.measureText(`${s}…`).width > o.maxW) s = s.slice(0, -1);
      s += '…';
    }
    if (o.shadow !== false) { c.fillStyle = 'rgba(0,0,0,0.75)'; c.fillText(s, x + 1, y + 1); }
    c.fillStyle = o.color || COL.text; c.fillText(s, x, y);
  }
  /** Word-wraps inside maxW and returns the height used. */
  wrap(str, x, y, maxW, lineH, o = {}) {
    const c = this.ctx; c.font = this.font_(o.size || 16, o.bold !== false);
    const words = String(str).split(' '); const lines = []; let cur = '';
    words.forEach((w) => { const t = cur ? `${cur} ${w}` : w; if (c.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; });
    if (cur) lines.push(cur);
    lines.forEach((l, i) => this.text(l, o.align === 'center' ? x + maxW / 2 : x, y + i * lineH, o));
    return lines.length * lineH;
  }
  bar(x, y, w, h, frac, color) {
    const c = this.ctx; c.fillStyle = 'rgba(20,28,48,0.9)'; c.fillRect(x, y, w, h);
    c.fillStyle = color; c.fillRect(x, y, Math.round(w * clamp(frac, 0, 1)), h);
    c.strokeStyle = COL.border; c.lineWidth = 1; c.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }
  /** Player identity glyph: shape + colour, so ownership never depends on colour alone. */
  glyph(shape, x, y, rad, color, stroke) {
    const c = this.ctx; c.beginPath();
    if (shape === 'circle') c.arc(x, y, rad, 0, Math.PI * 2);
    else if (shape === 'square') c.rect(x - rad, y - rad, rad * 2, rad * 2);
    else if (shape === 'triangle') { c.moveTo(x, y - rad); c.lineTo(x + rad, y + rad); c.lineTo(x - rad, y + rad); c.closePath(); }
    else { c.moveTo(x, y - rad * 1.2); c.lineTo(x + rad * 1.2, y); c.lineTo(x, y + rad * 1.2); c.lineTo(x - rad * 1.2, y); c.closePath(); }
    c.fillStyle = color; c.fill();
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = 2; c.stroke(); }
  }
  panel(x, y, w, h, o = {}) {
    const c = this.ctx;
    c.fillStyle = o.fill || COL.panel; c.fillRect(x, y, w, h);
    if (o.frame === false) return;
    c.strokeStyle = o.border || COL.border; c.lineWidth = 2; c.strokeRect(x + 1, y + 1, w - 2, h - 2);
    this.nineSlice(x, y, w, h, 10);
  }
  /** Border-only 9-slice (the centre is skipped on purpose: it is meant to be transparent and the panel already has a fill). */
  nineSlice(x, y, w, h, k) {
    const a = this.game.assets; const img = a.scaled('ui_frame_9slice', k * 3, k * 3);
    if (!img || w < k * 2 || h < k * 2) return;
    const c = this.ctx;
    c.drawImage(img, 0, 0, k, k, x, y, k, k); c.drawImage(img, 2 * k, 0, k, k, x + w - k, y, k, k);
    c.drawImage(img, 0, 2 * k, k, k, x, y + h - k, k, k); c.drawImage(img, 2 * k, 2 * k, k, k, x + w - k, y + h - k, k, k);
    c.drawImage(img, k, 0, k, k, x + k, y, w - 2 * k, k); c.drawImage(img, k, 2 * k, k, k, x + k, y + h - k, w - 2 * k, k);
    c.drawImage(img, 0, k, k, k, x, y + k, k, h - 2 * k); c.drawImage(img, 2 * k, k, k, k, x + w - k, y + k, k, h - 2 * k);
  }
  focusRing(id, x, y, w, h) {
    if (this.focusId !== id || !this.showFocus) return;
    const c = this.ctx; c.strokeStyle = '#ffffff'; c.lineWidth = 4; c.strokeRect(x - 3, y - 3, w + 6, h + 6);
    c.strokeStyle = '#000'; c.lineWidth = 2; c.strokeRect(x - 5, y - 5, w + 10, h + 10);
  }
  button(id, label, x, y, w, h, o = {}) {
    const c = this.ctx; const p = this.game.input.pointer;
    const hover = !o.disabled && p.x >= x && p.x <= x + w && p.y >= y && p.y <= y + h;
    c.fillStyle = o.disabled ? COL.btnOff : o.primary ? '#1d6e85' : o.checked ? '#27553a' : hover ? COL.btnHi : COL.btn;
    c.fillRect(x, y, w, h);
    c.strokeStyle = o.disabled ? '#2a3348' : o.checked ? COL.good : o.primary ? COL.cyan : COL.border; c.lineWidth = o.checked ? 3 : 2; c.strokeRect(x + 1, y + 1, w - 2, h - 2);
    this.text(`${o.checked ? '✓ ' : ''}${label}`, x + w / 2, y + (h - (o.size || 18)) / 2 - 1, { size: o.size || 18, align: 'center', color: o.disabled ? COL.textOff : COL.text, maxW: w - 10, shadow: false });
    this.widgets.push({ id, x, y, w, h, label, disabled: !!o.disabled, focusable: !o.disabled, primary: !!o.primary, onClick: o.onClick, onDown: o.onDown });
    this.focusRing(id, x, y, w, h);
  }
  region(id, x, y, w, h, o = {}) {
    this.widgets.push({ id, x, y, w, h, label: o.label, focusable: !!o.focusable, primary: !!o.primary, onClick: o.onClick, onDown: o.onDown, onMove: o.onMove, onUp: o.onUp, onWheel: o.onWheel, onKey: o.onKey });
    if (o.focusable) this.focusRing(id, x, y, w, h);
  }
  textField(id, value, x, y, w, h, o) {
    const c = this.ctx; const focused = this.focusId === id;
    c.fillStyle = '#0b1120'; c.fillRect(x, y, w, h);
    c.strokeStyle = focused ? COL.cyan : COL.border; c.lineWidth = 2; c.strokeRect(x + 1, y + 1, w - 2, h - 2);
    const caret = focused && Math.floor(this.game.now / 500) % 2 === 0 ? '|' : '';
    this.text(`${value}${caret}`, x + 10, y + (h - 20) / 2 - 1, { size: 20, maxW: w - 20, shadow: false });
    this.widgets.push({
      id, x, y, w, h, label: 'Camp de text', focusable: true,
      onClick: () => this.game.beginTextEdit(o.onChange, value, o.maxLen),
      // Read the live value (o.get): several keys can arrive inside one frame, so the drawn `value` may already be stale.
      onKey: (e) => {
        const cur = o.get ? o.get() : value;
        if (e.key === 'Backspace') { o.onChange(cur.slice(0, -1)); return true; }
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && cur.length < o.maxLen) { o.onChange(cur + e.key); return true; }
        return false;
      }
    });
    this.focusRing(id, x, y, w, h);
  }
}
