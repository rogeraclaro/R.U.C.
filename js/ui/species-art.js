'use strict';
/**
 * Small procedural portraits of the 8 species (no asset exists for them; not C64 art). The Humanoid reuses the colonists_strip
 * portrait of the player's colour. Everything is drawn inside the square (x, y, size), with the player's colour as the body
 * colour so the identity colour still reads.
 */
const SpeciesArt = {
  draw(r, id, x, y, size, color, frame = 0) {
    if (id === 'humanoid') { r.assetFrame('colonists_strip', x, y, size, size, Math.max(0, frame)); return; }
    const c = r.ctx; const u = size / 16; // a 16 x 16 grid of "pixels"
    const box = (px, py, w, h, fill) => { c.fillStyle = fill; c.fillRect(x + px * u, y + py * u, w * u, h * u); };
    const disc = (px, py, rad, fill) => { c.fillStyle = fill; c.beginPath(); c.arc(x + px * u, y + py * u, rad * u, 0, Math.PI * 2); c.fill(); };
    const ink = '#0b0f1c'; const eye = '#ffffff';
    c.save();
    if (id === 'mechtron') {
      box(7.5, 0.5, 1, 2, ink); disc(8, 0.6, 0.8, COL.bad);
      box(4, 2.5, 8, 5, color); box(5, 4, 6, 1.6, ink); box(5.6, 4.3, 1.4, 1, COL.cyan); box(9, 4.3, 1.4, 1, COL.cyan);
      box(3, 8, 10, 5, color); box(6, 9, 4, 2, ink); box(4, 13, 2.5, 3, ink); box(9.5, 13, 2.5, 3, ink);
    } else if (id === 'gollumer') {
      c.fillStyle = color; c.beginPath();
      c.moveTo(x + 2 * u, y + 15 * u); c.quadraticCurveTo(x + 1 * u, y + 3 * u, x + 8 * u, y + 2 * u);
      c.quadraticCurveTo(x + 15 * u, y + 3 * u, x + 14 * u, y + 15 * u); c.closePath(); c.fill();
      disc(5.5, 6, 2.2, eye); disc(10.5, 6, 2.2, eye); disc(6, 6.5, 1, ink); disc(11, 6.5, 1, ink);
      box(5, 11, 6, 1, ink); box(2, 14.5, 3, 1.5, color); box(11, 14.5, 3, 1.5, color);
    } else if (id === 'packer') {
      box(1, 5, 4, 8, ink); box(1.5, 5.5, 3, 7, '#8a6a3a');
      box(4, 3, 10, 10, color); box(6, 5, 2, 2, ink); box(10, 5, 2, 2, ink); box(7, 9, 4, 1, ink);
      box(5, 13, 3, 3, ink); box(10, 13, 3, 3, ink);
    } else if (id === 'bonzoid') {
      disc(3, 4, 2.5, color); disc(13, 4, 2.5, color); disc(8, 9, 6, color);
      disc(6, 8, 1.4, eye); disc(10, 8, 1.4, eye); disc(6.3, 8.3, 0.7, ink); disc(10.3, 8.3, 0.7, ink);
      box(6, 11.5, 4, 1, ink); box(5, 14.5, 2, 1.5, ink); box(9, 14.5, 2, 1.5, ink);
    } else if (id === 'spheroid') {
      disc(8, 7.5, 6.5, color); disc(8, 7, 2.6, eye); disc(8.5, 7.3, 1.3, ink);
      c.strokeStyle = ink; c.lineWidth = Math.max(1, u * 0.6); c.beginPath(); c.arc(x + 8 * u, y + 7.5 * u, 6.5 * u, 0.2, Math.PI - 0.2); c.stroke();
      disc(5, 15, 1.2, ink); disc(11, 15, 1.2, ink);
    } else if (id === 'flapper') {
      c.fillStyle = color; c.beginPath();
      c.moveTo(x + 8 * u, y + 7 * u); c.lineTo(x + 0.5 * u, y + 2 * u); c.lineTo(x + 2 * u, y + 9 * u); c.closePath(); c.fill();
      c.beginPath(); c.moveTo(x + 8 * u, y + 7 * u); c.lineTo(x + 15.5 * u, y + 2 * u); c.lineTo(x + 14 * u, y + 9 * u); c.closePath(); c.fill();
      disc(8, 8, 3.2, color); disc(8, 4, 2.2, color); disc(7.2, 3.6, 0.7, ink); disc(8.8, 3.6, 0.7, ink);
      box(7.4, 5, 1.2, 1.2, COL.amber); box(6.5, 11, 1, 4, ink); box(8.5, 11, 1, 4, ink);
    } else if (id === 'leggite') {
      disc(8, 3.5, 3, color); disc(7, 3, 0.8, ink); disc(9, 3, 0.8, ink);
      c.strokeStyle = color; c.lineWidth = Math.max(1.5, u * 1.1); c.lineCap = 'round'; c.beginPath();
      [[3, 15.5], [6, 15.5], [10, 15.5], [13, 15.5]].forEach(([fx, fy]) => { c.moveTo(x + 8 * u, y + 6 * u); c.lineTo(x + fx * u, y + fy * u); });
      c.stroke();
    }
    c.restore();
  }
};
