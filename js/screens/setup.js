'use strict';
/**
 * Game setup. [C64] F5 cycles the planeteers (4, 3, 2, 1, COMPUTER DEMO): here 1-4 humans or the demo. Each human seat has its own name,
 * colour (unique: picking a colour another seat holds swaps them) and species, and its own controls (PlayerControls / gamepad).
 */
class SetupScreen {
  /** The game options of the current setup (`humans` [] = the computer demo). */
  static options(st) {
    return { seed: st.seed, level: st.level, humans: st.seats.slice(0, st.humans).map((x) => ({ name: x.name, colorId: x.color, species: x.species })) };
  }
  /** Gives seat `k` the colour `id`; another active seat holding it takes seat k's old colour. */
  static pickColor(st, k, id) {
    const other = st.seats.findIndex((x, i) => i !== k && i < st.humans && x.color === id);
    if (other >= 0) st.seats[other].color = st.seats[k].color;
    st.seats[k].color = id;
  }
  /** Changing the number of humans keeps every active seat's colour unique. */
  static setHumans(st, n) {
    st.humans = n; st.seat = Math.min(st.seat, Math.max(0, n - 1));
    for (let k = 1; k < n; k++) {
      if (st.seats.slice(0, k).some((x) => x.color === st.seats[k].color)) {
        st.seats[k].color = CONFIG.PLAYER_COLORS.find((c) => !st.seats.slice(0, k).some((x) => x.color === c.id)).id;
      }
    }
  }
  draw(game, r) {
    const st = game.setup; const demo = st.humans === 0; const seat = st.seats[st.seat];
    const colorHex = (CONFIG.PLAYER_COLORS.find((c) => c.id === seat.color) || CONFIG.PLAYER_COLORS[0]).hex;
    const colorFrame = CONFIG.PLAYER_COLORS.findIndex((c) => c.id === seat.color);
    r.asset('bg_irata_sky', 0, 0, CONFIG.W, CONFIG.H); r.dim(0.5);
    r.panel(140, 12, 1000, 700, {});
    r.text('Configuració de la partida', 180, 24, { size: 28, color: COL.amber });
    r.text('Jugadors', 180, 70, { size: 18, color: COL.dim });
    [1, 2, 3, 4].forEach((n, i) => r.button(`s-hum-${n}`, String(n), 280 + i * 74, 62, 64, 40, { checked: st.humans === n, onClick: () => SetupScreen.setHumans(st, n) }));
    r.button('s-hum-0', 'Demo (només ordinadors)', 580, 62, 300, 40, { checked: demo, onClick: () => SetupScreen.setHumans(st, 0) });
    r.text('Llavor', 894, 70, { size: 18, color: COL.dim });
    r.textField('f-seed', st.seed, 966, 62, 96, 40, { maxLen: 16, get: () => st.seed, onChange: (v) => { st.seed = v; } });
    r.button('s-rand', 'Nova', 1068, 62, 60, 40, { size: 16, onClick: () => { st.seed = game.randomSeed(); } });
    if (demo) this.drawDemo(game, r);
    else this.drawSeat(game, r, st, seat, colorHex, colorFrame);
    r.text('Nivell', 180, 534, { size: 18, color: COL.dim });
    Object.entries(CONFIG.LEVELS).forEach(([id, L], i) => {
      const x = 180 + i * 306;
      r.button(`s-lvl-${id}`, L.label, x, 558, 290, 44, { checked: st.level === id, disabled: !!L.disabled, onClick: () => { st.level = id; } });
      const note = L.disabled ? L.note : id === 'beginner' ? '6 mesos · regles simplificades' : id === 'tournament' ? '12 mesos · crystite i col·lusió' : '12 mesos · regles completes';
      r.text(note, x, 606, { size: 16, color: COL.dim, maxW: 290 });
    });
    const rivals = CONFIG.AI_NAMES.slice(0, 4 - st.humans).map((a) => a.name);
    r.text(rivals.length ? `Ordinadors (Mechtrons): ${rivals.join(', ')}. Mateixa llavor, mateix resultat.` : 'Quatre jugadors humans: cap ordinador.', 180, 630, { size: 16, color: COL.dim, maxW: 920 });
    r.button('s-start', demo ? 'Veure la demostració' : 'Començar', 180, 654, 300, 50, { primary: true, size: 22, onClick: () => game.newGame(SetupScreen.options(st)) });
    r.button('s-back', 'Enrere', 500, 654, 200, 50, { size: 22, onClick: () => game.goTitle() });
  }
  drawDemo(game, r) {
    r.wrap('Demostració: els quatre colons són ordinadors (Bran, Vela, Nox i Iris). Les pantalles avancen soles i, quan la partida s\'acaba, en comença una altra amb una llavor nova. Prem qualsevol tecla o toca la pantalla per tornar al títol.', 180, 130, 920, 26, { size: 18 });
  }
  drawSeat(game, r, st, seat, colorHex, colorFrame) {
    // One tab per human seat, with its colour, shape and controls.
    for (let k = 0; k < st.humans; k++) {
      const x = 180 + k * 232; const hex = CONFIG.PLAYER_COLORS.find((c) => c.id === st.seats[k].color).hex;
      r.button(`s-seat-${k}`, `   J${k + 1}: ${st.seats[k].name || '—'}`, x, 112, 220, 40, { checked: st.seat === k, size: 16, onClick: () => { st.seat = k; } });
      r.glyph(CONFIG.SHAPES[k], x + 22, 132, 9, hex, '#000');
    }
    const pads = Object.values(game.padSeats || {}).includes(st.seat) ? ' · comandament connectat' : '';
    r.text(`Controls de J${st.seat + 1}: ${PlayerControls.label(st.seat)}${st.seat === 0 ? ' (i ratolí o tacte)' : ''}${pads}`, 180, 160, { size: 16, color: COL.cyan, maxW: 920 });
    r.text('Nom', 180, 186, { size: 18, color: COL.dim });
    r.textField(`f-name-${st.seat}`, seat.name, 240, 180, 300, 38, { maxLen: 12, get: () => seat.name, onChange: (v) => { seat.name = v; } });
    r.text('Color (la forma també t\'identifica)', 560, 186, { size: 16, color: COL.dim, maxW: 540 });
    CONFIG.PLAYER_COLORS.forEach((c, i) => {
      const x = 180 + i * 226;
      r.button(`s-col-${c.id}`, `   ${c.name}`, x, 226, 210, 38, { checked: seat.color === c.id, onClick: () => SetupScreen.pickColor(st, st.seat, c.id) });
      r.glyph(CONFIG.SHAPES[st.seat], x + 30, 245, 10, c.hex, '#000');
    });
    // [Atari code][C64] the 8 species: only money and turn time differ (Flapper / Humanoid); computers are always Mechtrons.
    r.text('Espècie', 180, 272, { size: 18, color: COL.dim });
    CONFIG.SPECIES.forEach((sp, i) => {
      const x = 180 + (i % 4) * 226; const y = 296 + Math.floor(i / 4) * 84;
      const on = seat.species === sp.id;
      r.button(`s-sp-${sp.id}`, '', x, y, 210, 76, { onClick: () => { seat.species = sp.id; } });
      // Selected: the usual "checked" look, with the tick in the corner so it never covers the name or the cash.
      if (on) { r.ctx.fillStyle = '#27553a'; r.ctx.fillRect(x + 2, y + 2, 206, 72); r.ctx.strokeStyle = COL.good; r.ctx.lineWidth = 3; r.ctx.strokeRect(x + 1.5, y + 1.5, 207, 73); r.text('✓', x + 190, y + 6, { size: 18, color: COL.good, shadow: false }); }
      SpeciesArt.draw(r, sp.id, x + 10, y + 8, 60, colorHex, colorFrame);
      r.text(sp.label, x + 80, y + 12, { size: 18, maxW: 120, shadow: false });
      r.text(`${sp.cash} cr`, x + 80, y + 40, { size: 16, color: sp.cash === 1000 ? COL.dim : COL.amber, shadow: false });
    });
    const sel = speciesById(seat.species);
    r.text(`${sel.label}: ${sel.desc}`, 180, 470, { size: 16, color: COL.text, maxW: 920 });
    if (st.humans > 1) r.text('Terra i subhastes: tots alhora, cadascú amb els seus controls. Desenvolupament: un per un.', 180, 498, { size: 16, color: COL.dim, maxW: 920 });
  }
}
