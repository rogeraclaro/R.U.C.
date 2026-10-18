'use strict';
class TitleScreen {
  draw(game, r) {
    r.asset('bg_irata_sky', 0, 0, CONFIG.W, CONFIG.H);
    r.dim(0.35);
    r.assetContain('colony_habitat', 690, 250, 560, 380);
    r.text('R.U.C.', 60, 70, { size: 96, color: COL.amber });
    r.text('Reinterpretació de M.U.L.E. · un jugador contra tres rivals IA', 64, 190, { size: 20 });
    const x = 64; let y = 260;
    r.button('t-new', 'Nova partida', x, y, 340, 56, { primary: true, size: 22, onClick: () => game.goSetup() }); y += 70;
    if (SaveSystem.has()) { r.button('t-cont', 'Continuar', x, y, 340, 56, { size: 22, onClick: () => game.continueGame() }); y += 70; }
    r.button('t-help', 'Com es juga', x, y, 340, 56, { size: 22, onClick: () => game.toggleHelp() }); y += 70;
    r.button('t-sound', game.settings.sound ? 'So: sí' : 'So: no', x, y, 340, 56, { size: 22, onClick: () => game.toggleSound() });
    r.text('Ratolí, teclat (Tab, fletxes, Enter, Espai, Esc) o tacte.', 64, 660, { size: 16, color: COL.dim });
  }
}
