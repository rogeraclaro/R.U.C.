'use strict';
const PlayerState = {
  create(id, name, color, isHuman, aiProfile, shape) {
    const inventory = {};
    Object.keys(RESOURCE_DEFS).forEach((k) => { inventory[k] = CONFIG.START_INV[k] || 0; });
    return {
      id, name, color, shape, isHuman, aiProfile, cash: CONFIG.START_CASH, inventory, plots: [],
      score: CONFIG.START_CASH, lastTurnNetWorth: CONFIG.START_CASH,
      productionReport: null, eventLog: []
    };
  }
};
