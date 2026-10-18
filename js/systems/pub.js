'use strict';
/**
 * The pub ([Atari code] "Gambling", [C64] confirmed against four round-1 payouts): going in ends the development turn and pays
 * round bonus + (random 0..255 mod (2 x units left)); a sum above 255 pays 250 instead ([C64] reading of the code: so 251..255
 * can still be paid). The random byte is derived from the state with a hash (like the flee direction in DevWalk), so the seeded
 * PRNG stream is not disturbed by a walk and the result stays deterministic.
 */
const PubSystem = {
  /** [Atari code] 50 x (floor(round / 4) + 1): rounds 1-3 $50, 4-7 $100, 8-11 $150, 12 $200. */
  bonus(round) { return 50 * (Math.floor(round / 4) + 1); },
  payout(bonus, rand, unitsLeft) {
    const sum = bonus + (unitsLeft > 0 ? rand % (2 * unitsLeft) : 0);
    return sum > CONFIG.PUB.overflow ? CONFIG.PUB.cap : sum;
  },
  rand(state, pid, unitsLeft) { return SeededRNG.hash(`pub|${state.seed}|${state.turn}|${pid}|${unitsLeft}`) % 256; },
  /** Pays the colonist (money comes from outside the colony, like the events) and returns the amount. */
  visit(state, pid, unitsLeft) {
    const won = this.payout(this.bonus(state.turn), this.rand(state, pid, unitsLeft), unitsLeft);
    ResourceLedger.moveCash(state, 'nature', pid, won);
    return won;
  }
};
