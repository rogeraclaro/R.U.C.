'use strict';
/* =====================================================================
 * 3. Models
 * State is plain, JSON-friendly data: JSON.parse(JSON.stringify(state)) must round-trip identically.
 * ===================================================================== */
const Plot = {
  create(id, x, y, terrain, richness = 0) {
    return { id, x, y, terrain, richness, ownerId: null, ruc: null, improvements: [], hiddenDeposit: null, productionModifier: 100 };
  },
  /** The town tile (map centre, [manual] "The Store is in the center") can never be claimed. */
  claimable(p) { return !p.ownerId && p.terrain !== TERRAIN.TOWN; },
  /** Mountain probability grows with the distance to the river column (spec section 5). */
  mountainPct(dist) { return dist === 1 ? 30 : dist <= 3 ? 50 : 75; },
  generateMap(rng) {
    for (let attempt = 0; attempt < 200; attempt++) {
      const plots = [];
      for (let y = 0; y < CONFIG.ROWS; y++) {
        for (let x = 0; x < CONFIG.COLS; x++) {
          const id = y * CONFIG.COLS + x;
          if (x === CONFIG.RIVER_COL && y === CONFIG.TOWN_ROW) { plots.push(Plot.create(id, x, y, TERRAIN.TOWN)); continue; }
          if (x === CONFIG.RIVER_COL) { plots.push(Plot.create(id, x, y, TERRAIN.RIVER)); continue; }
          const mountain = rng.chance(Plot.mountainPct(Math.abs(x - CONFIG.RIVER_COL)));
          plots.push(mountain ? Plot.create(id, x, y, TERRAIN.MOUNTAIN, rng.range(1, 3)) : Plot.create(id, x, y, TERRAIN.PLAIN));
        }
      }
      const plains = plots.filter((p) => p.terrain === TERRAIN.PLAIN).length;
      const mountains = plots.filter((p) => p.terrain === TERRAIN.MOUNTAIN).length;
      if (plains >= 8 && mountains >= 8) return plots;
    }
    throw new Error('map generation failed');
  },
  neighbours(plots, plot) {
    return [[1, 0], [-1, 0], [0, 1], [0, -1]]
      .map(([dx, dy]) => plots.find((p) => p.x === plot.x + dx && p.y === plot.y + dy)).filter(Boolean);
  }
};
