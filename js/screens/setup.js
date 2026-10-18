'use strict';
class SetupScreen {
  draw(game, r) {
    const st = game.setup;
    r.asset('bg_irata_sky', 0, 0, CONFIG.W, CONFIG.H); r.dim(0.5);
    r.panel(180, 40, 920, 640, {});
    r.text('Configuració de la partida', 220, 60, { size: 28, color: COL.amber });
    r.text('Nom', 220, 118, { size: 18, color: COL.dim });
    r.textField('f-name', st.name, 220, 144, 380, 44, { maxLen: 12, get: () => st.name, onChange: (v) => { st.name = v; } });
    r.text('Llavor', 640, 118, { size: 18, color: COL.dim });
    r.textField('f-seed', st.seed, 640, 144, 300, 44, { maxLen: 16, get: () => st.seed, onChange: (v) => { st.seed = v; } });
    r.button('s-rand', 'Nova', 950, 144, 110, 44, { onClick: () => { st.seed = game.randomSeed(); } });
    r.text('Color (la forma també t\'identifica)', 220, 212, { size: 18, color: COL.dim });
    CONFIG.PLAYER_COLORS.forEach((c, i) => {
      const x = 220 + i * 210;
      r.button(`s-col-${c.id}`, `   ${c.name}`, x, 240, 196, 52, { checked: st.color === c.id, onClick: () => { st.color = c.id; } });
      r.glyph(CONFIG.SHAPES[0], x + 30, 266, 12, c.hex, '#000');
    });
    r.text('Dificultat', 220, 318, { size: 18, color: COL.dim });
    Object.entries(CONFIG.DIFFICULTY).forEach(([id, d], i) => {
      const x = 220 + i * 280;
      r.button(`s-diff-${id}`, d.label, x, 346, 264, 52, { checked: st.difficulty === id, onClick: () => { st.difficulty = id; } });
      r.text(`IA ${d.reactMin}-${d.reactMax} ms · reserva ${d.minReserve} · temps segons el menjar`, x, 404, { size: 16, color: COL.dim, maxW: 270 });
    });
    r.wrap('Rivals: Bran (conservador), Vela (industrial) i Nox (oportunista). Durada orientativa: 35-50 minuts. La mateixa llavor i les mateixes accions donen el mateix resultat.', 220, 460, 840, 24, { size: 18, color: COL.text });
    r.button('s-start', 'Començar', 220, 600, 300, 56, { primary: true, size: 22, onClick: () => game.newGame({ seed: st.seed, difficulty: st.difficulty, playerName: st.name, colorId: st.color }) });
    r.button('s-back', 'Enrere', 560, 600, 200, 56, { size: 22, onClick: () => game.goTitle() });
  }
}
