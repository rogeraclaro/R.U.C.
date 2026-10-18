'use strict';
/* =====================================================================
 * 2. SeededRNG, AssetLoader
 * ===================================================================== */
class SeededRNG {
  constructor(seed) { this.s = SeededRNG.hash(String(seed)); }
  /** FNV-1a: turns any seed string into a 32-bit state. */
  static hash(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }
  /** mulberry32: tiny, fast, and its whole state is one uint32 (easy to serialise). */
  next() {
    this.s = (this.s + 0x6D2B79F5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(n) { return Math.floor(this.next() * n); }
  range(a, b) { return a + this.int(b - a + 1); }
  chance(pct) { return this.next() * 100 < pct; }
  pick(arr) { return arr[this.int(arr.length)]; }
  shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = this.int(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  getState() { return this.s >>> 0; }
  setState(s) { this.s = s >>> 0; }
}
