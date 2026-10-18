'use strict';
/* =====================================================================
 * 4. Systems
 * ===================================================================== */
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
/**
 * [Atari code] calcBinomiale: a symmetric bell-shaped draw on [-6, 6), scaled by an amplitude factor F and rounded (production
 * variation, the smithore price step). [PROVISIONAL] mechanism: we draw it as the sum of 12 uniforms - 6 (Irwin-Hall) and round half
 * away from zero; this reproduces the report's published shares (Standard F = 0.5: -1/0/+1 = 16.06/67.66/16.06 %, +-2 ~0.1 % each;
 * F = 1: 0 = 37.7 %). The exact byte-level routine was not transcribed.
 */
const binomialStep = (rng, F) => {
  let x = -6;
  for (let i = 0; i < 12; i++) x += rng.next();
  const v = F * x;
  return Math.sign(v) * Math.round(Math.abs(v));
};
const playerById = (state, id) => state.players.find((p) => p.id === id);
const plotById = (state, id) => state.plots.find((p) => p.id === id);
