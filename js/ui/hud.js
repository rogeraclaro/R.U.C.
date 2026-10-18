'use strict';
/* =====================================================================
 * 5. Screens
 * Every screen draws through the Renderer's immediate-mode UI helpers (r.button / r.region), which also feed the
 * InputManager, so mouse, touch and keyboard all reach the same widgets.
 * ===================================================================== */
const COL = {
  bg: '#0a0e1a', panel: 'rgba(10,14,26,0.88)', panelSolid: '#0e1424', border: '#3b4a6b', text: '#e8ecf5', dim: '#aab4cb',
  cyan: '#4fd1e6', amber: '#ffb347', good: '#7bd66f', bad: '#ff7a6b', btn: '#1c2740', btnHi: '#2a3a5e', btnOff: '#131a2b', textOff: '#8892a8'
};
const fmtCr = (n) => `${n} cr`;
const resLabel = (id) => (RESOURCE_DEFS[id] ? RESOURCE_DEFS[id].label : id);
const colorIdOf = (hex) => (CONFIG.PLAYER_COLORS.find((c) => c.hex === hex) || CONFIG.PLAYER_COLORS[0]).id;
const portraitFrame = (p) => CONFIG.PLAYER_COLORS.findIndex((c) => c.hex === p.color);

/** Top bar shared by every in-game screen. */
const Hud = {
  draw(game, r) {
    const s = game.state; const human = s.players[0];
    r.panel(0, 0, CONFIG.W, 56, { fill: 'rgba(8,11,20,0.94)', frame: false });
    r.text(`Torn ${Math.min(s.turn, lastRound(s))}/${lastRound(s)}`, 16, 6, { size: 20 });
    const label = game.turns.phase ? game.turns.get(game.turns.phase).label : 'Final';
    r.text(label, 16, 31, { size: 16, color: COL.cyan, maxW: 300 });
    r.text(fmtCr(human.cash), 330, 8, { size: 20, color: COL.amber });
    r.text('efectiu', 330, 32, { size: 16, color: COL.dim });
    enabledResources().forEach((d, i) => {
      const x = 470 + i * 96;
      r.icon(d.id, x, 12, 32);
      r.text(String(human.inventory[d.id]), x + 38, 16, { size: 20 });
    });
    const tl = game.hudTimer();
    if (tl) {
      const urgent = tl.left / tl.total < 0.2;
      r.bar(766, 18, 164, 20, tl.left / tl.total, urgent ? COL.bad : COL.cyan);
      r.text('temps', 766, 40, { size: 14, color: COL.dim });
    }
    r.button('hud-pause', game.paused ? 'Reprèn' : 'Pausa', 940, 8, 100, 40, { onClick: () => game.togglePause() });
    r.button('hud-sound', game.settings.sound ? 'So: sí' : 'So: no', 1048, 8, 100, 40, { onClick: () => game.toggleSound() });
    r.button('hud-help', 'Ajuda', 1156, 8, 108, 40, { onClick: () => game.toggleHelp() });
  }
};
