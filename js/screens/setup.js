'use strict';
class SetupScreen {
  draw(game, r) {
    const st = game.setup; const colorHex = (CONFIG.PLAYER_COLORS.find((c) => c.id === st.color) || CONFIG.PLAYER_COLORS[0]).hex;
    const colorFrame = CONFIG.PLAYER_COLORS.findIndex((c) => c.id === st.color);
    r.asset('bg_irata_sky', 0, 0, CONFIG.W, CONFIG.H); r.dim(0.5);
    r.panel(140, 16, 1000, 688, {});
    r.text('Configuració de la partida', 180, 32, { size: 28, color: COL.amber });
    r.text('Nom', 180, 78, { size: 18, color: COL.dim });
    r.textField('f-name', st.name, 180, 102, 380, 44, { maxLen: 12, get: () => st.name, onChange: (v) => { st.name = v; } });
    r.text('Llavor', 640, 78, { size: 18, color: COL.dim });
    r.textField('f-seed', st.seed, 640, 102, 300, 44, { maxLen: 16, get: () => st.seed, onChange: (v) => { st.seed = v; } });
    r.button('s-rand', 'Nova', 950, 102, 110, 44, { onClick: () => { st.seed = game.randomSeed(); } });
    r.text('Color (la forma també t\'identifica)', 180, 160, { size: 18, color: COL.dim });
    CONFIG.PLAYER_COLORS.forEach((c, i) => {
      const x = 180 + i * 226;
      r.button(`s-col-${c.id}`, `   ${c.name}`, x, 186, 210, 44, { checked: st.color === c.id, onClick: () => { st.color = c.id; } });
      r.glyph(CONFIG.SHAPES[0], x + 30, 208, 11, c.hex, '#000');
    });
    // [Atari code][C64] the 8 species: only money and turn time differ (Flapper / Humanoid); computers are always Mechtrons.
    r.text('Espècie', 180, 244, { size: 18, color: COL.dim });
    CONFIG.SPECIES.forEach((sp, i) => {
      const x = 180 + (i % 4) * 226; const y = 270 + Math.floor(i / 4) * 96;
      const on = st.species === sp.id;
      r.button(`s-sp-${sp.id}`, '', x, y, 210, 86, { onClick: () => { st.species = sp.id; } });
      // Selected: the usual "checked" look, with the tick in the corner so it never covers the name or the cash.
      if (on) { r.ctx.fillStyle = '#27553a'; r.ctx.fillRect(x + 2, y + 2, 206, 82); r.ctx.strokeStyle = COL.good; r.ctx.lineWidth = 3; r.ctx.strokeRect(x + 1.5, y + 1.5, 207, 83); r.text('✓', x + 190, y + 8, { size: 18, color: COL.good, shadow: false }); }
      SpeciesArt.draw(r, sp.id, x + 10, y + 11, 64, colorHex, colorFrame);
      r.text(sp.label, x + 84, y + 16, { size: 18, maxW: 120, shadow: false });
      r.text(`${sp.cash} cr`, x + 84, y + 44, { size: 16, color: sp.cash === 1000 ? COL.dim : COL.amber, shadow: false });
    });
    const sel = speciesById(st.species);
    r.text(`${sel.label}: ${sel.desc}`, 180, 466, { size: 16, color: COL.text, maxW: 920 });
    r.text('Nivell', 180, 500, { size: 18, color: COL.dim });
    Object.entries(CONFIG.LEVELS).forEach(([id, L], i) => {
      const x = 180 + i * 306;
      r.button(`s-lvl-${id}`, L.label, x, 526, 290, 48, { checked: st.level === id, disabled: !!L.disabled, onClick: () => { st.level = id; } });
      const note = L.disabled ? L.note : id === 'beginner' ? '6 mesos · regles simplificades' : '12 mesos · regles completes';
      r.text(note, x, 580, { size: 16, color: COL.dim, maxW: 290 });
    });
    r.text('Rivals: Bran, Vela i Nox (Mechtrons). Mateixa llavor i mateixes accions, mateix resultat.', 180, 612, { size: 16, color: COL.dim, maxW: 920 });
    r.button('s-start', 'Començar', 180, 640, 300, 52, { primary: true, size: 22, onClick: () => game.newGame({ seed: st.seed, level: st.level, species: st.species, playerName: st.name, colorId: st.color }) });
    r.button('s-back', 'Enrere', 500, 640, 200, 52, { size: 22, onClick: () => game.goTitle() });
  }
}
