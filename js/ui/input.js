'use strict';
/* =====================================================================
 * 6. InputManager, AudioManager, Renderer, Game and bootstrap
 * ===================================================================== */
/** Mouse, touch (Pointer Events) and keyboard. Keyboard handlers live in independent contexts (a stack). */
class InputManager {
  constructor(canvas, game) {
    this.canvas = canvas; this.game = game;
    this.pointer = { x: -1, y: -1, down: false };
    this.keys = new Set(); this.contexts = []; this.captured = null;
    canvas.addEventListener('pointerdown', (e) => this.onDown(e));
    canvas.addEventListener('pointermove', (e) => this.onMove(e));
    canvas.addEventListener('pointerup', (e) => this.onUp(e));
    canvas.addEventListener('pointercancel', () => {
      const w = this.captured; this.pointer.down = false; this.captured = null;
      if (w && w.onUp) w.onUp(this.pointer.x, this.pointer.y); // a held touch control must never stay stuck
    });
    canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('keyup', (e) => this.keys.delete(e.key));
    window.addEventListener('blur', () => this.keys.clear());
  }
  pushContext(ctx) { this.contexts.push(ctx); return ctx; }
  popContext(ctx) { const i = this.contexts.indexOf(ctx); if (i >= 0) this.contexts.splice(i, 1); }
  toLogical(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * CONFIG.W / r.width, y: (e.clientY - r.top) * CONFIG.H / r.height };
  }
  hit(x, y) {
    const ws = this.game.renderer.widgets;
    for (let i = ws.length - 1; i >= 0; i--) {
      const w = ws[i];
      if (x >= w.x && x <= w.x + w.w && y >= w.y && y <= w.y + w.h && !w.disabled) return w;
    }
    return null;
  }
  onDown(e) {
    const p = this.toLogical(e); Object.assign(this.pointer, p, { down: true });
    this.game.audio.unlock();
    try { this.canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    const w = this.hit(p.x, p.y); this.captured = w;
    if (w) {
      if (w.focusable) { this.game.renderer.focusId = w.id; this.game.renderer.showFocus = false; }
      if (w.onDown) w.onDown(p.x, p.y);
    }
    e.preventDefault();
  }
  onMove(e) {
    const p = this.toLogical(e); Object.assign(this.pointer, p);
    const w = this.captured || this.hit(p.x, p.y);
    if (w && w.onMove) w.onMove(p.x, p.y, this.pointer.down);
  }
  onUp(e) {
    const p = this.toLogical(e); Object.assign(this.pointer, p, { down: false });
    const w = this.captured; this.captured = null;
    const under = this.hit(p.x, p.y);
    if (w && w.onUp) w.onUp(p.x, p.y);
    // Widgets are rebuilt every frame, so `w` (captured on pointerdown) and `under` are never the same object once a
    // frame has passed. Match by stable id and fire the current frame's widget so its closures are fresh.
    const sameWidget = w && under && (under === w || (w.id !== undefined && under.id === w.id));
    if (sameWidget && under.onClick) { this.game.audio.play('click'); under.onClick(p.x, p.y); }
  }
  onWheel(e) {
    const p = this.toLogical(e); const w = this.hit(p.x, p.y);
    if (w && w.onWheel) { w.onWheel(e.deltaY); e.preventDefault(); }
  }
  onKeyDown(e) {
    const g = this.game;
    if (document.activeElement && document.activeElement.id === 'hid') return; // typing into the hidden text input
    this.keys.add(e.key);
    g.audio.unlock();
    if (e.key === 'Escape') { g.onEscape(); e.preventDefault(); return; }
    for (let i = this.contexts.length - 1; i >= 0; i--) {
      const c = this.contexts[i];
      if (c.onKeyDown && c.onKeyDown(e)) { e.preventDefault(); return; }
    }
    const r = g.renderer;
    if (e.key === 'Tab') { r.cycleFocus(e.shiftKey ? -1 : 1); r.showFocus = true; e.preventDefault(); return; }
    const w = r.widgets.find((x) => x.id === r.focusId && !x.disabled);
    if (w) {
      r.showFocus = true;
      if (w.onKey && w.onKey(e)) { e.preventDefault(); return; }
      if ((e.key === 'Enter' || e.key === ' ') && w.onClick) { g.audio.play('click'); w.onClick(w.x + w.w / 2, w.y + w.h / 2); e.preventDefault(); return; }
    }
    if (e.key.startsWith('Arrow') || e.key === ' ') e.preventDefault();
  }
}
