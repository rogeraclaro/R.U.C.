'use strict';
const SaveSystem = {
  serialize(state, rng) { state.rngState = rng.getState(); state.savedAt = Date.now(); return JSON.stringify(state); },
  /** Never accepts an incompatible save silently: an older schema (rules changed) or anything unreadable is refused with a reason. */
  deserialize(text) {
    let state;
    try { state = JSON.parse(text); } catch (e) { return { incompatible: true, reason: 'corrupt' }; }
    if (!state || typeof state !== 'object') return { incompatible: true, reason: 'corrupt' };
    if (state.schemaVersion !== CONFIG.SCHEMA_VERSION) {
      return { incompatible: true, reason: state.schemaVersion < CONFIG.SCHEMA_VERSION ? 'old_rules' : 'unknown', version: state.schemaVersion };
    }
    return { state };
  },
  save(state, rng) {
    try { localStorage.setItem(CONFIG.SAVE_KEY, this.serialize(state, rng)); return true; } catch (e) { return false; }
  },
  has() { try { return !!localStorage.getItem(CONFIG.SAVE_KEY); } catch (e) { return false; } },
  load() {
    try { const t = localStorage.getItem(CONFIG.SAVE_KEY); return t ? this.deserialize(t) : null; } catch (e) { return { incompatible: true, reason: 'corrupt' }; }
  },
  clear() { try { localStorage.removeItem(CONFIG.SAVE_KEY); } catch (e) { /* ignore */ } }
};
