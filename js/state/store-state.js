'use strict';
const StoreState = {
  create(rules = levelRules(null)) {
    const stock = {};
    Object.keys(RESOURCE_DEFS).forEach((k) => { stock[k] = rules.storeStart[k] || 0; });
    return { stock, ruc: rules.rucStart };
  }
};
