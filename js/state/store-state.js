'use strict';
const StoreState = {
  create() {
    const stock = {};
    Object.keys(RESOURCE_DEFS).forEach((k) => { stock[k] = CONFIG.STORE_START[k] || 0; });
    return { stock, ruc: CONFIG.RUC_START };
  }
};
