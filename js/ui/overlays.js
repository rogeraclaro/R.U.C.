'use strict';
const HELP_LINES = [
  ['Objectiu', 'Acaba amb el patrimoni net més alt. Si la colònia no suma 60.000 cr al final, ha fracassat i no hi ha First Founder.'],
  ['Cada torn', 'Terra (cursa) · desenvolupament per ordre de patrimoni · esdeveniment planetari · producció · estat (consum i malbaratament) · subhastes de smithore, menjar i energia.'],
  ['Terra', 'La selecció recorre el mapa una sola vegada. Clica o prem Enter quan és sobre una parcel·la lliure. Qui no reclama, aquest torn es queda sense.'],
  ['Desenvolupament', 'Camina amb les fletxes o el control tàctil. Entra al corral (compra un RUC), a un taller (l\'equipes) i porta\'l a la casa d\'una parcel·la teva: Acció l\'instal·la. Acció fora de la casa o temps esgotat amb el RUC: fuig. Tornar-lo al corral retorna el preu del robot, no l\'equip. El temps depèn del menjar que tens a l\'inici del torn.'],
  ['Producció', 'Els RUCs de menjar i smithore gasten 1 energia de la reserva; els d\'energia s\'autoalimenten. +1 si un veí teu fa el mateix, +1 per cada grup de 3 parcel·les teves iguals. La base és una mitjana: la collita varia.'],
  ['Estat', 'Després de menjar es malbarata el 50% del menjar i el 25% de l\'energia que queden de reserva (smithore, només per sobre de 50). La collita nova no es malbarata.'],
  ['Subhasta', 'Primer declara comprador, venedor o fora abans que s\'acabi el comptador; després el rol queda fix i només mous el preu. Tracte quan les línies es toquen 0,5 s.'],
  ['Controls', 'Tab focus · Enter/Espai acció · Esc pausa. Declaració: ↑/→ venedor, ↓/← comprador, Espai fora. Subhasta: ↑/↓ preu (Maj ×3). Tacte: fletxes en pantalla i botó Acció.']
];
class HelpOverlay {
  draw(game, r) {
    r.dim(0.72);
    r.panel(60, 40, 1160, 644, {});
    r.text('Com es juga', 100, 56, { size: 30, color: COL.amber });
    const col = [100, 660]; const y0 = 104; const ys = [y0, y0];
    HELP_LINES.forEach(([h, t], i) => {
      const k = i < 4 ? 0 : 1;
      r.text(h, col[k], ys[k], { size: 18, color: COL.cyan });
      ys[k] += 24 + r.wrap(t, col[k], ys[k] + 24, 520, 22, { size: 16 }) + 12;
    });
    r.button('help-close', 'Tanca', 540, 626, 200, 46, { primary: true, onClick: () => game.toggleHelp() });
  }
}

class PauseOverlay {
  draw(game, r) {
    r.dim(0.7);
    r.panel(440, 160, 400, 400, {});
    r.text('Pausa', 640, 180, { size: 34, color: COL.amber, align: 'center' });
    r.button('p-resume', 'Reprèn', 490, 240, 300, 52, { primary: true, onClick: () => game.togglePause() });
    r.button('p-sound', game.settings.sound ? 'So: sí' : 'So: no', 490, 304, 300, 52, { onClick: () => game.toggleSound() });
    r.button('p-motion', game.settings.reduceMotion ? 'Reduir moviment: sí' : 'Reduir moviment: no', 490, 368, 300, 52, { onClick: () => game.toggleReduceMotion() });
    r.button('p-title', 'Desa i surt al títol', 490, 432, 300, 52, { onClick: () => game.exitToTitle() });
    r.text('Tots els rellotges estan aturats.', 640, 510, { size: 16, color: COL.dim, align: 'center' });
  }
}
