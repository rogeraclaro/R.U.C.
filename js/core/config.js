'use strict';
/* =====================================================================
 * 1. CONFIG, FEATURES, enums and registries
 * ===================================================================== */
const deepFreeze = (o) => {
  Object.values(o).forEach((v) => { if (v && typeof v === 'object') deepFreeze(v); });
  return Object.freeze(o);
};

/*
 * Source tags used in the comments below (README has the full table; docs/research/ has the reports):
 *   [manual]  EA/Ozark Player's Guide 1983 (C64 etext MULE10.TXT)   [card]  C64 Command Summary card
 *   [Atari code]  Kroah's commented disassembly of the Atari original + his write-up (docs/research/mechanics.md)
 *   [C64]  observed on a PAL C64 in VICE (docs/research/emulator-c64.md); takes precedence over the other sources.
 *   [PROVISIONAL]  R.U.C. value, NOT verified for the C64: kept until an emulator capture or binary inspection confirms it.
 */
const CONFIG = deepFreeze({
  W: 1280, H: 720, COLS: 9, ROWS: 5, RIVER_COL: 4, TOWN_ROW: 2,
  TILE: 96, MAP_X: 16, MAP_Y: 100,
  // Standard values below; CONFIG.LEVELS overrides them per level (see levelRules). Starting cash comes from the species.
  // [Atari code][C64] Standard: every colonist starts with 4 Food and 2 Energy.
  START_INV: { food: 4, energy: 2, smithore: 0 },
  // [Atari code][C64] Standard: the store starts with 8 Food, 8 Energy, 8 Smithore and 14 M.U.L.E.s ([manual] says 16: code wins).
  STORE_START: { food: 8, energy: 8, smithore: 8 },
  // [Atari code] the corral holds at most 14; between rounds the store builds min(14 - corral, smithore / 2), 2 Smithore each.
  RUC_START: 14, RUC_MAX: 14, SMITHORE_PER_RUC: 2,
  // [manual] Outfitting: Food $25, Energy $50, Smithore $75, Crystite $100 (the crystite shop opens only in Tournament).
  MODULE_COST: { food: 25, energy: 50, smithore: 75, crystite: 100 },
  // [manual] Every plot is worth $500 in the summary.
  PLOT_VALUE: 500,
  // [Atari code] score: each installed M.U.L.E. adds $35 on top of its outfit cost (plot 500 + outfit + 35).
  RUC_WORTH: 35,
  // [Atari code][C64] food required for the current round: 3 in rounds 1-4, 4 in 5-8, 5 in 9-12.
  FOOD_NEED: [{ from: 1, to: 4, n: 3 }, { from: 5, to: 8, n: 4 }, { from: 9, to: 12, n: 5 }],
  // [card] After consumption, 50% of the food left and 25% of the energy left spoil; ore (smithore, crystite) only spoils above 50 units.
  // Rounding of odd amounts is [PROVISIONAL]: floor (the spoiled part is rounded down).
  SPOILAGE: { foodPct: 50, energyPct: 25, oreCap: 50 },
  // [Atari code] per-plot output is clamped to 0..8. varAmp: Standard variation factor F = 0.5 (Beginner 0, Tournament 1, see LEVELS).
  PRODUCTION: { min: 0, max: 8, varAmp: 0.5 },
  // [Atari code] store price P: floors food 30 / energy 25 / smithore 20 (smithore: 50 before its random step), ceiling 250.
  // smithoreStep: the random term is 7 x binomial (amplitude 2), i.e. -28..+28.
  STORE_PRICE: { max: 250, smithoreInterimMin: 50, smithoreStep: 7, smithoreStepMax: 4 },
  /*
   * Goods auctions. Time is counted in units of the time bar, each lasting a number of PAL frames that depends on what happens:
   *   declareUnits x frames.declare: [C64] measured 31 units x 7 frames (~4.3 s) ([Atari code]: 30 ticks of ATU/4).
   *   tradeUnits x frames.idle: [C64] measured 72-75 units x 8 frames (~11.5 s) when nobody trades ([Atari code]: 70 ticks of ATU/4,
   *     ATU = 30 frames in Standard). We take 72, the low end of the C64 measurement.
   *   frames.contact: [C64] ~60 frames per unit while a buyer and a seller touch (the [Atari code] stops the clock instead; C64 wins).
   *   frames.push: [Atari code] the tick is the full ATU (30 frames) while a player pushes the stick (a computer has no stick).
   *     [PROVISIONAL] for the C64: not measured there.
   * The level's ATU scales every tick (CONFIG.LEVELS auctionAtu: Standard 30, Beginner 50; Beginner doubles it in round 1).
   * lineFrames: [Atari code] a marker moves one price step every 8 frames (humans and computers alike).
   * cadenceBtu: [Atari code] while two lines touch, one unit changes hands every 12, 12, 10, 8, 6, 4, 2, 2... BTU (4 frames each); the
   *   cadence starts again when the contact breaks.
   * sellerStartSteps / buyerStartSteps: [FN] sellers start 1 step above the store sell line, buyers 10 steps below the store buy line.
   * storeBuyCap: [Atari code] the only store stock limit seen (255).
   * playerPriceMax: technical UI limit for colonist-to-colonist prices when the store is out of stock ([manual]: no rule cap).
   * allOutMs / noOpMs: [PROVISIONAL] R.U.C. pacing: the auction ends early when every colonist stays out, or when no deal is possible.
   * pushMs: how long one human marker move keeps the "stick pushed" tick (input arrives per frame or per pointer event).
   * aiHoldMs: a computer re-thinks its target at most this often (not from the original: see AISystem).
   */
  AUCTION: {
    declareUnits: 31, tradeUnits: 72, frames: { declare: 7, idle: 8, push: 30, contact: 60 }, atuStandard: 30,
    lineFrames: 8, cadenceBtu: [12, 12, 10, 8, 6, 4, 2], btuFrames: 4,
    sellerStartSteps: 1, buyerStartSteps: 10, storeBuyCap: 255, playerPriceMax: 999,
    allOutMs: 3000, noOpMs: 5000, pushMs: 100, aiHoldMs: 1500,
    /*
     * [Atari code] collusion (Tournament goods auctions, sub_9926): the buttons of >= 2 humans pressed within windowFrames (10 jiffies,
     * incl. a Buyer and a Seller) start it; each press then has a cooldownFrames (100) cooldown; "COLLUSION" flashes 3 x (20 on + 20 off
     * = flashFrames 120); the colluders trade alone for `units` (50) time-bar units on a separate timer (the main timer is saved);
     * "COLLUSION IS OVER" then shows for overFrames (50) and the main timer resumes.
     */
    collusion: { windowFrames: 10, cooldownFrames: 100, flashFrames: 120, flashes: 3, units: 50, overFrames: 50 }
  },
  /*
   * Land auctions ([Atari code], Standard and Tournament only). firstStart: the first auction of the game starts at $160 ([C64] "BIDS
   * START AT $160"); drop: every later lot of a set starts $60 below the previous price, and a new round's set starts $60 below the
   * previous set's average; noBid: an unsold colony plot records start / 2 + 52 and ends the colony set; step: $4 per marker step.
   * maxLots: [Atari code] 1 + variation (0..3 in Standard). Timing: the same time units as the goods trade stage (tradeUnits, idle /
   * push ticks; [Atari code] 70 ATU per auction). minStart, bottomSteps, introMs, resultMs: [PROVISIONAL] R.U.C. values (the start
   * never drops below $4; bidders' markers start 10 steps below the start line; intro and result cards are shown 2 s and 2.5 s).
   */
  LAND_AUCTION: { firstStart: 160, drop: 60, noBidHalf: 52, step: 4, maxLots: 3, minStart: 4, bottomSteps: 10, introMs: 2000, resultMs: 2500 },
  // Land race: the game clock advances in fixed steps so the outcome never depends on the frame rate. The cursor speed and the
  // claim pause depend on the level (CONFIG.LEVELS cursorFrames; [Atari code] the pause is 4 cursor steps).
  LAND: { stepMs: 10, holdMs: 900, claimPauseSteps: 4 },
  // [Atari code] personal event: roll random[0..79], an event only if < 22 (27.5 %); search down at most 20 candidates;
  // money unit 25 x (floor(round / 4) + 1).
  EVENTS: { personalDie: 80, personalTries: 20, moneyUnit: 25 },
  // [manual] Standard: the colony must reach $60,000 in total ([Atari code] colony rating >= 3). No per-colonist requirement.
  SURVIVAL: { combined: 60000 },
  // [Atari code] colony rating = round((total - 10000) / 20000), clamped 0..6 (see COLONY_RATINGS).
  RATING: { offset: 10000, step: 20000, max: 6, founderMin: 3 },
  // [Atari code] the order is reversed when the corral has 7 M.U.L.E.s or fewer ([manual] says "less than 7": code wins).
  // unitBtu / btuFrames / palHz: [Atari code] one development time unit = 7 BTU of 4 frames = 28 frames; species and level add or
  // remove BTU (CONFIG.SPECIES btu, CONFIG.LEVELS extraBtu); [C64] PAL runs at 50.125 Hz (101 units ~ 56.4 s).
  // [C64] the turn starts when the player presses the button ("PRESS YOUR STICK BUTTON TO START"): there is no countdown.
  DEV: { lowCorral: 7, unitBtu: 7, btuFrames: 4, palHz: 50.125, baseUnits: 10, foodUnits: 91 },
  // [Atari code] computer turn: keeps installing while >= aiMinUnits are left; each install costs aiInstallUnits + aiDistUnits x
  // calcPlotDistFromStore (1..5, AISystem.storeDist; decreaseTimeFromAction shifts it left twice); then the pub if >= pubMinUnits are left.
  PUB: { pubMinUnits: 3, aiMinUnits: 35, aiInstallUnits: 25, aiDistUnits: 4, cap: 250, overflow: 255 },
  // Crystite ([Atari code], Tournament only, see CrystiteSystem): 3 seeds of level 3 (HIGH); store price 50 + rand(0..99) each round.
  // Computer assay: 10 + 4 x store distance PTU each (decreaseTimeFromAction), not under 22 PTU left, none once 3 HIGH plots are
  // known, 1/8 pick chance per candidate.
  CRYSTITE: { seeds: 3, high: 3, priceBase: 50, priceRand: 100, aiUnits: 10, aiDistUnits: 4, aiMinUnits: 22, aiStopHigh: 3, aiPick: 8 },
  // Walking during development. [C64] measured: map 0.667 px/frame horizontally and 0.333 vertically (a plot is ~32 x 32 C64 px:
  // ~48 / ~96 frames to cross it), town 1.33 px/frame horizontally. Scaled by TILE / c64Plot (96 / 32 = 3) to our pixels.
  // townPxPerFrame.y: [PROVISIONAL] not measured; half the horizontal speed, the same ratio as on the map ([Atari code] town step
  // 8 px x 4 scanlines). terrainFrames: [Atari code] frames per map step on plain / river / mountain (6 / 14 / 21): the slower
  // terrain scales the plain speed by 6/14 and 6/21. [manual] diagonal is the fastest way to move (the axes are not normalised).
  // installMs: not C64-sourced — our own pacing so the RUC visibly rises, gets its module and comes back down instead of installing at once.
  // fleeShuffleMs/fleeRunMs: not C64-sourced — our own flee choreography (a quick side-to-side jitter, then a dash off in a random direction).
  // The whole plot tile counts as "the house" (see DevWalk.atHouse), not just a small spot at its centre.
  // doorHoldMs: how long you must keep pushing at a shop/corral's doorway before it commits to a visit — a brief graze while
  // passing by on the street falls short of this and does nothing. visitMs: once committed, the colonist waits right at the
  // doorway while only the RUC walks on to the counter and back (see DevWalk.startVisit / MapScreen.drawVisiting). Neither is
  // C64-sourced.
  WALK: {
    stepMs: 10, c64Plot: 32, mapPxPerFrame: { x: 2 / 3, y: 1 / 3 }, townPxPerFrame: { x: 4 / 3, y: 2 / 3 },
    terrainFrames: { plain: 6, river: 14, mountain: 21 },
    doorHoldMs: 350, visitMs: 2200, installMs: 1800, fleeShuffleMs: 400, fleeRunMs: 900
  },
  /*
   * Game levels ([Atari code] level tables, [C64] title screen F3: BEGINNER / STANDARD / TOURNAMENT). Missing keys = the Standard
   * values above (see levelRules). cursorFrames: land-grant cursor, frames per plot ([C64] Standard 16; [Atari code] Beginner 8 BTU
   * = 32). extraBtu: [Atari code] Beginner +2 BTU per development unit. Beginner also: no production variation, smithore fixed at
   * $50, double store stocks with 25 M.U.L.E.s (smithore 0 and 25 M.U.L.E.s again every round), 8 food / 4 energy to start, no
   * land selling nor land auctions, and a M.U.L.E. never runs away on a wrong button press. auctionAtu: [Atari code] auction time unit
   * (Beginner 50 frames instead of 30, doubled in round 1: atuRound1x2). criticalBlocksAll: [Atari code] in Beginner every seller stops
   * at the critical level (in Standard only computers do).
   * Tournament ([Atari code], docs/research/tournament.md): cursor 3 BTU (12 frames), ATU 25, computers start with $1200 (aiCash),
   * variation amplitude 2 (F = 1, clamped to +-4: varMax), colony land auctions Normal(1, amplitude 2) = 0..5 per round
   * (landAuctionAmp / landAuctionMax), crystite + assay office, collusion in goods auctions, and the smarter computer rules (smartAi).
   */
  LEVELS: {
    beginner: {
      label: 'Principiant', rounds: 6, cursorFrames: 32, extraBtu: 2, varAmp: 0, smithorePrice: 50,
      startInv: { food: 8, energy: 4, smithore: 0 }, storeStart: { food: 16, energy: 16, smithore: 0 }, rucStart: 25, rucMax: 25,
      rucReset: true, missFlees: false, landSales: false, landAuctions: false,
      auctionAtu: 50, atuRound1x2: true, criticalBlocksAll: true
    },
    standard: { label: 'Estàndard', rounds: 12, cursorFrames: 16 },
    tournament: {
      label: 'Torneig', rounds: 12, cursorFrames: 12, auctionAtu: 25, aiCash: 1200, varAmp: 1, varMax: 4,
      landAuctionAmp: 1, landAuctionMax: 5, crystite: true, collusion: true, smartAi: true
    }
  },
  /*
   * The computer players' reactions (one level: the original has no AI strength setting). These are the former middle "Colònia"
   * values, kept because they play sensibly: reaction 400-900 ms (land race and auctions), valuation error +-8 %, food / energy
   * reserve of at least 3. Not from the original code ([Atari code] documents only the grant and install rules, see AISystem).
   */
  // minGain: [Atari code] playerTurnAi installs / re-outfits only for a rating gain >= 2 ([RE] says 3; the code compares with 2).
  // landDollarsPerPoint: [PROVISIONAL] money per land-auction rating point (the computers' bidding is undocumented, AISystem.landValue).
  AI: { reactMin: 400, reactMax: 900, valuationErr: 8, minReserve: 3, minGain: 2, landDollarsPerPoint: 3 },
  /*
   * [Atari code] Tournament-only computer rules (tournament.md §4.1, the only level-dependent AI branches):
   *   buyOut (auctionBuySellAi8 $AF00): Food / Energy auction with only Buyers, not the last round, store stock <= 20: a computer whose
   *     need is smaller than the store stock orders the whole stock if price x stock < its cash.
   *   holdBack ($AA62-$AA9A): a Seller with a Food surplus < 6 or Energy surplus < 9, start price <= 80 and enough cash sells only
   *     rand(0..surplus). holdBack.cash ("enough cash") is [PROVISIONAL].
   *   crystite ($AAA4-$AB59, $AB75; read with medium confidence): holding some with P < 100 it sells only the excess over 50 or what
   *     it needs to reach $1000; holding none it buys only when P < 86 and its cash >= 1100: (cash - 800) / P units, at most 25.
   */
  AI_TOURNAMENT: {
    buyOut: { maxStock: 20 }, holdBack: { food: 6, energy: 9, maxPrice: 80, cash: 300 },
    crystite: { sellBelow: 100, keep: 50, cashGoal: 1000, buyBelow: 86, buyCash: 1100, cashKeep: 800, maxBuy: 25 }
  },
  /*
   * [Atari code][C64] species: Flapper $1600 and +2 BTU per unit (x9/7 time), Humanoid $600 and -2 BTU (x5/7), the others $1000.
   * Computers are always Mechtrons. Descriptions are our own short Catalan blurbs (only money and time differ in the rules).
   */
  SPECIES: [
    { id: 'mechtron', label: 'Mechtron', cash: 1000, btu: 0, desc: 'Ésser mecànic, l\'espècie dels rivals de l\'ordinador. 1000 cr, temps normal.' },
    { id: 'gollumer', label: 'Gollumer', cash: 1000, btu: 0, desc: 'Criatura llefiscosa dels pantans. 1000 cr, temps normal.' },
    { id: 'packer', label: 'Packer', cash: 1000, btu: 0, desc: 'Acumulador incansable de tot el que troba. 1000 cr, temps normal.' },
    { id: 'bonzoid', label: 'Bonzoid', cash: 1000, btu: 0, desc: 'Petit, rodanxó i entremaliat. 1000 cr, temps normal.' },
    { id: 'spheroid', label: 'Spheroid', cash: 1000, btu: 0, desc: 'Una esfera que es mou rodolant. 1000 cr, temps normal.' },
    { id: 'flapper', label: 'Flapper', cash: 1600, btu: 2, desc: 'Volador lleuger: 1600 cr i més temps de torn (x9/7). Per a principiants.' },
    { id: 'leggite', label: 'Leggite', cash: 1000, btu: 0, desc: 'Tot cames i cap cervell. 1000 cr, temps normal.' },
    { id: 'humanoid', label: 'Humanoid', cash: 600, btu: -2, desc: 'Humà: només 600 cr i menys temps de torn (x5/7). Per a experts.' }
  ],
  PLAYER_COLORS: [
    { id: 'yellow', name: 'Groc', hex: '#f2c94c' }, { id: 'coral', name: 'Corall', hex: '#ff7a6b' },
    { id: 'cyan', name: 'Cian', hex: '#4fd1e6' }, { id: 'violet', name: 'Violeta', hex: '#b58cff' }
  ],
  SHAPES: ['circle', 'square', 'triangle', 'diamond'],
  AI_NAMES: [
    { name: 'Bran', profile: 'conservative' }, { name: 'Vela', profile: 'industrial' },
    { name: 'Nox', profile: 'opportunist' }, { name: 'Iris', profile: 'industrial' }
  ],
  // [Atari code] waitPlayersButtons ($308A): "PRESS ALL PLAYER BUTTONS TO GO ON" waits for every human, or 255 x 4 = 1020 jiffies
  // (~17 s); the computer demo (no humans) auto-advances after 2 x 255 jiffies (~8.5 s) and loops forever.
  HANDOVER: { timeoutMs: 17000, demoMs: 8500 },
  // The key stays the same so an old (schema 1-2) save is detected and refused with an explicit message.
  // Schema 3: original start stocks, store price P in the state, new food/time/score rules.
  // Schema 4: the 22 original personal events (used flags) and the planetary event bag (state.events).
  // Schema 5: game level (state.level replaces difficulty), species, land sales, original land/walk pacing.
  // Schema 6: original auction timing, continuous trading and critical levels; land auctions (state.landAuction, LAND_AUCTION phase).
  // Schema 7: the Mountain Wampus in the walk. Schema 8: Tournament (state.crystite: deposits, computers' known map, assays).
  // Schema 9: 1-4 human seats and the computer demo (player.keys: the human's control layout, null for a computer).
  SAVE_KEY: 'ruc-save-v1', SCHEMA_VERSION: 9, MAX_DT_MS: 50
});

/** The rules of the state's level: CONFIG.LEVELS entry over the Standard defaults. */
function levelRules(state) {
  const id = (state && state.level) || 'standard';
  const L = CONFIG.LEVELS[id] || CONFIG.LEVELS.standard;
  return {
    id, label: L.label, rounds: L.rounds, cursorFrames: L.cursorFrames || CONFIG.LEVELS.standard.cursorFrames, extraBtu: L.extraBtu || 0,
    varAmp: L.varAmp === undefined ? CONFIG.PRODUCTION.varAmp : L.varAmp, smithorePrice: L.smithorePrice || null,
    startInv: L.startInv || CONFIG.START_INV, storeStart: L.storeStart || CONFIG.STORE_START, rucStart: L.rucStart || CONFIG.RUC_START,
    rucMax: L.rucMax || CONFIG.RUC_MAX, rucReset: !!L.rucReset, missFlees: L.missFlees !== false, landSales: L.landSales !== false,
    landAuctions: L.landAuctions !== false, auctionAtu: L.auctionAtu || CONFIG.AUCTION.atuStandard, atuRound1x2: !!L.atuRound1x2,
    criticalBlocksAll: !!L.criticalBlocksAll, aiCash: L.aiCash || null, varMax: L.varMax || null,
    landAuctionAmp: L.landAuctionAmp || CONFIG.PRODUCTION.varAmp, landAuctionMax: L.landAuctionMax || CONFIG.LAND_AUCTION.maxLots,
    crystite: !!L.crystite && FEATURES.crystite, collusion: !!L.collusion, smartAi: !!L.smartAi
  };
}
/** The last round of the game (the ship comes back): 12 in Standard, 6 in Beginner. */
const lastRound = (state) => levelRules(state).rounds;
/** PAL frames -> ms, rounded to the 10 ms game-clock step. */
const framesMs = (frames) => Math.round(frames * 1000 / CONFIG.DEV.palHz / 10) * 10;
const speciesById = (id) => CONFIG.SPECIES.find((x) => x.id === id) || CONFIG.SPECIES[0];

/*
 * [Atari code] colony rating texts ("OVERALL, THE COLONY ..."), index = rating 0..6, faithful Catalan translations.
 */
const COLONY_RATINGS = Object.freeze([
  'En conjunt, la colònia ha fracassat... estrepitosament. La presó per a deutors de la Federació serà la vostra pròxima llar!',
  'En conjunt, la colònia ha fracassat... La Federació ja no hi enviarà més naus de comerç. Ara us heu d\'espavilar sols!',
  'En conjunt, la colònia ha sobreviscut... per poc. Viureu en tendes. Poques naus de comerç passaran per aquí!',
  'En conjunt, la colònia ha estat un èxit. Heu assolit els mínims fixats per la Federació, però la vida no us serà fàcil!',
  'En conjunt, la colònia ha triomfat. La Federació està satisfeta dels vostres esforços. Viureu còmodament!',
  'En conjunt, la colònia ha triomfat... extraordinàriament bé. Ara us podeu retirar en finques elegants!',
  'En conjunt, la colònia ha encantat la Federació amb el vostre èxit excepcional. La vostra jubilació serà luxosa!'
]);

/* Master switches (mutable on purpose). Crystite also needs a level that plays it (levelRules: Tournament only). */
const FEATURES = { crystite: true, landAuctions: true };

const RESOURCE = Object.freeze({ FOOD: 'food', ENERGY: 'energy', SMITHORE: 'smithore', CRYSTITE: 'crystite' });
const TERRAIN = Object.freeze({ RIVER: 'river', PLAIN: 'plain', MOUNTAIN: 'mountain', TOWN: 'town' });
const ROLE = Object.freeze({ BUYER: 'BUYER', SELLER: 'SELLER', OUT: 'OUT' });

// basePrice: [Atari code][C64] starting store price P (food 30, energy 25, smithore 50). priceFloor: [Atari code] lowest P.
// storeBuyOff / storeSellOff: [Atari code][C64] the store buys at P - buyOff and sells at P + sellOff (food & energy -15/+20,
// smithore 0/+35). minPrice / maxPrice: the auction's price window = floor - buyOff .. ceiling 250 + sellOff (marker bounds).
// auctionStep: [Atari code] $1 per marker step for food, energy and smithore, $4 for crystite.
// Crystite ([Atari code], Tournament only): start P 100, re-drawn 50 + rand(0..99) every round; the store buys at P rounded down to a
// multiple of buyRound (4) and sells at that + 140 (storeSellOff over the buy line, see StoreSystem.ask). minPrice / maxPrice are the
// marker window: the lowest buy line (48) minus the buyers' 10 start steps, and the highest sell line (148 + 140 = 288) plus margin.
const RESOURCE_DEFS = deepFreeze({
  food: { id: 'food', label: 'Menjar', icon: 'resource_food', module: 'module_food', enabled: true, basePrice: 30, priceFloor: 30, storeBuyOff: 15, storeSellOff: 20, minPrice: 15, maxPrice: 270, auctionStep: 1, color: '#7bd66f' },
  energy: { id: 'energy', label: 'Energia', icon: 'resource_energy', module: 'module_energy', enabled: true, basePrice: 25, priceFloor: 25, storeBuyOff: 15, storeSellOff: 20, minPrice: 10, maxPrice: 270, auctionStep: 1, color: '#4fd1e6' },
  smithore: { id: 'smithore', label: 'Smithore', icon: 'resource_smithore', module: 'module_smithore', enabled: true, basePrice: 50, priceFloor: 20, storeBuyOff: 0, storeSellOff: 35, minPrice: 20, maxPrice: 285, auctionStep: 1, color: '#ff9a3c' },
  crystite: { id: 'crystite', label: 'Crystite', icon: 'resource_crystite', module: 'module_crystite', enabled: true, basePrice: 100, priceFloor: 50, buyRound: 4, storeBuyOff: 0, storeSellOff: 140, minPrice: 8, maxPrice: 300, auctionStep: 4, color: '#d77bff' }
});

/** Resources that take part in production, consumption, auctions and the score in this game (crystite: Tournament only). */
function enabledResources(state = null, defs = RESOURCE_DEFS) {
  return Object.values(defs).filter((d) => d.enabled && (d.id !== 'crystite' || levelRules(state).crystite));
}

/** [manual] Auction order: Smithore -> Crystite (Tournament only) -> Food -> Energy. Disabled goods are skipped. */
const AUCTION_ORDER = Object.freeze(['smithore', 'crystite', 'food', 'energy']);
function auctionResources(state = null, defs = RESOURCE_DEFS) {
  const on = enabledResources(state, defs);
  return AUCTION_ORDER.map((id) => on.find((d) => d.id === id)).filter(Boolean).concat(on.filter((d) => !AUCTION_ORDER.includes(d.id)));
}

/** [manual] Average base production: Food river/plain/mountain 4/2/1, Energy 2/3/1, Smithore 0/1/(1 + mountain symbols). */
const PRODUCTION_TABLE = deepFreeze({
  river: { 0: { food: 4, energy: 2, smithore: 0 } },
  plain: { 0: { food: 2, energy: 3, smithore: 1 } },
  mountain: { 1: { food: 1, energy: 1, smithore: 2 }, 2: { food: 1, energy: 1, smithore: 3 }, 3: { food: 1, energy: 1, smithore: 4 } }
});

/*
 * Events: [Atari code] decoded from the 1983 disassembly (docs/research/events.md); the [C64] has the same 22 personal events in the
 * same order with the same texts (docs/research/c64-strings.txt). Texts are faithful Catalan translations of the original messages.
 * Personal: `quality` = the original weight (sign: good/bad; the money is |quality| x 25 x (floor(round / 4) + 1), see
 * EventSystem.amount); `perMule`: the module whose installed MULEs multiply it; `needs`: precondition (see EventSystem.precondition).
 * Planetary: `tickets` = the bag's initial count (max per game); `timing`: 'before' acts on the production before it is shown,
 * 'after' strikes after the production display. `art` = frame of event_cards_strip (0 bloom, 1 solar storm, 2 rich vein,
 * 3 breakdown, 4 ship, 5 dust, 6 scrap, 7 first-aid kit), reused as best fits.
 */
const EVENT_DEFS = deepFreeze({
  // Planetary events, in the original id order (roundEventsProbInit).
  pest_attack: { id: 'pest_attack', scope: 'planet', negative: true, tickets: 3, timing: 'after', name: 'Atac de plaga', art: 0, origin: 'c64', text: (p) => `La plaga ataca la parcel·la #${p.plot} de ${p.who}: s'hi perd tot el menjar (${p.amount}).` },
  pirates: { id: 'pirates', scope: 'planet', negative: true, tickets: 2, timing: 'after', name: 'Nau pirata', art: 4, origin: 'c64', text: (p) => `Els pirates s'enduen tot el ${p.res === 'crystite' ? 'crystite' : 'smithore'}! (${p.amount} unitats)` },
  acid_rain: { id: 'acid_rain', scope: 'planet', negative: false, tickets: 3, timing: 'before', name: 'Tempesta de pluja àcida', art: 5, origin: 'c64', text: () => 'Més producció de menjar, menys energia.' },
  planetquake: { id: 'planetquake', scope: 'planet', negative: true, tickets: 3, timing: 'before', name: 'Terratrèmol planetari', art: 3, origin: 'c64', text: (p) => `La producció minera és la meitat de la normal.${p.slide ? ` Una muntanya llisca de la parcel·la #${p.slide.from + 1} a la #${p.slide.to + 1}.` : ''}` },
  sunspot: { id: 'sunspot', scope: 'planet', negative: false, tickets: 3, timing: 'before', name: 'Activitat de taques solars', art: 1, origin: 'c64', text: () => 'La producció d\'energia augmenta.' },
  // [Atari code] the "new crystite deposit" subtext is printed only in Tournament; Standard shows just where it fell.
  meteorite: { id: 'meteorite', scope: 'planet', negative: true, tickets: 2, timing: 'before', name: 'Impacte de meteorit', art: 2, origin: 'c64', text: (p) => `Cau a la parcel·la #${p.plot}${p.mule ? ' i destrueix el RUC que hi havia' : ''}.${p.crystite ? ' El meteorit crea un nou jaciment de crystite.' : ''}` },
  radiation: { id: 'radiation', scope: 'planet', negative: true, tickets: 2, timing: 'before', name: 'Radiació', art: 3, origin: 'c64', text: (p) => `Un RUC es torna boig! (parcel·la #${p.plot} de ${p.who})` },
  store_fire: { id: 'store_fire', scope: 'planet', negative: true, tickets: 2, timing: 'after', name: 'Incendi a la botiga', art: 7, origin: 'c64', text: () => 'Tot l\'estoc de la botiga es perd!' },
  // Personal events, index = original id 00..21.
  package: { id: 'package', scope: 'individual', quality: 1, name: 'Paquet de casa', art: 4, origin: 'c64', text: () => 'Acabes de rebre un paquet dels teus parents del planeta natal amb 3 de menjar i 2 unitats d\'energia.' },
  traveler: { id: 'traveler', scope: 'individual', quality: 1, name: 'Viatger espacial', art: 2, origin: 'c64', text: () => 'Un viatger espacial errant t\'ha agraït l\'hospitalitat deixant-te dues barres de smithore.' },
  glac_elves: { id: 'glac_elves', scope: 'individual', quality: -1, name: 'Glac-elfs', art: 0, origin: 'c64', text: () => 'Uns glac-elfs entremaliats han entrat al teu cobert i t\'han robat la meitat del menjar.' },
  best_built: { id: 'best_built', scope: 'individual', quality: 2, needs: 'mule', name: 'El millor construït', art: 6, origin: 'c64', text: (p) => `El teu RUC ha estat declarat el «millor construït» a la fira de la colònia. Has guanyat ${p.amount} cr.` },
  lost_bolt: { id: 'lost_bolt', scope: 'individual', quality: -3, needs: 'mule', name: 'Un cargol perdut', art: 3, origin: 'c64', text: (p) => `A un dels teus RUCs li ha caigut un cargol. La reparació t'ha costat ${p.amount} cr.` },
  tap_dance: { id: 'tap_dance', scope: 'individual', quality: 4, needs: 'mule', name: 'Concurs de claqué', art: 6, origin: 'c64', text: (p) => `El teu RUC ha guanyat el concurs de claqué de la colònia. Has cobrat ${p.amount} cr.` },
  mining_repair: { id: 'mining_repair', scope: 'individual', quality: -2, perMule: ['smithore', 'crystite'], name: 'RUCs miners gastats', art: 3, origin: 'c64', text: (p) => `Els teus RUCs miners s'han deteriorat per l'ús intensiu i reparar-los costa ${p.each} cr cadascun. El cost total és de ${p.total} cr.` },
  solar_dirty: { id: 'solar_dirty', scope: 'individual', quality: -1, perMule: ['energy'], name: 'Col·lectors bruts', art: 1, origin: 'c64', text: (p) => `Els col·lectors solars dels teus RUCs d'energia estan bruts. Netejar-los t'ha costat ${p.each} cr cadascun, en total ${p.total} cr.` },
  agri_grant: { id: 'agri_grant', scope: 'individual', quality: 2, perMule: ['food'], name: 'Ajut agrícola', art: 0, origin: 'c64', text: (p) => `El Consell Agrícola de la colònia t'ha concedit ${p.each} cr per cada parcel·la de menjar que has desenvolupat. L'ajut total és de ${p.total} cr.` },
  wart_worm: { id: 'wart_worm', scope: 'individual', quality: 4, name: 'Cucs berruga', art: 0, origin: 'c64', text: (p) => `La colònia t'ha premiat amb ${p.amount} cr per aturar la plaga de cucs berruga.` },
  museum: { id: 'museum', scope: 'individual', quality: 8, name: 'Ordinador antic', art: 6, origin: 'c64', text: (p) => `El museu t'ha comprat l'ordinador personal antic per ${p.amount} cr.` },
  swamp_eel: { id: 'swamp_eel', scope: 'individual', quality: 2, name: 'Anguila de pantà', art: 5, origin: 'c64', text: (p) => `Has guanyat el concurs de menjar anguila de pantà de la colònia i has cobrat ${p.amount} cr. (Quin fàstic!)` },
  charity: { id: 'charity', scope: 'individual', quality: 3, name: 'Caritat', art: 4, origin: 'c64', text: (p) => `Una entitat benèfica del teu planeta natal s'ha compadit de tu i t'ha enviat ${p.amount} cr.` },
  investments: { id: 'investments', scope: 'individual', quality: 6, name: 'Dividends', art: 2, origin: 'c64', text: (p) => `Les teves inversions d'altres mons en Estupidesa Artificial t'han pagat ${p.amount} cr de dividends.` },
  inheritance: { id: 'inheritance', scope: 'individual', quality: 4, name: 'Herència', art: 2, origin: 'c64', text: (p) => `Un parent llunyà ha mort i t'ha deixat una gran fortuna. Però, després d'impostos, només n'has rebut ${p.amount} cr.` },
  moose_rat: { id: 'moose_rat', scope: 'individual', quality: 2, name: 'Rata-ant', art: 5, origin: 'c64', text: (p) => `Has trobat una rata-ant morta i n'has venut la pell per ${p.amount} cr.` },
  gypsy_inlaws: { id: 'gypsy_inlaws', scope: 'individual', quality: -6, needs: 'cash', name: 'Sogres espacials', art: 6, origin: 'c64', text: (p) => `Els teus sogres, gitanos espacials, han deixat el poble fet un desastre. Netejar-lo t'ha costat ${p.amount} cr.` },
  cat_bugs: { id: 'cat_bugs', scope: 'individual', quality: -4, needs: 'cash', name: 'Cuques-gat', art: 3, origin: 'c64', text: (p) => `Unes cuques-gat voladores s'han menjat el sostre de casa teva. La reparació costa ${p.amount} cr.` },
  kazinga: { id: 'kazinga', scope: 'individual', quality: -4, needs: 'cash', name: 'Curses de kazinga', art: 5, origin: 'c64', text: (p) => `Has perdut ${p.amount} cr apostant a les curses de kazinga de dues potes.` },
  bat_lizard: { id: 'bat_lizard', scope: 'individual', quality: -4, needs: 'cash', name: 'Llangardaix-ratpenat', art: 7, origin: 'c64', text: (p) => `Un llangardaix-ratpenat ha mossegat el teu fill i la factura de l'hospital t'ha costat ${p.amount} cr.` },
  lost_plot: { id: 'lost_plot', scope: 'individual', quality: -1, needs: 'mule', name: 'Parcel·la perduda', art: 5, origin: 'c64', text: (p) => `Has perdut una parcel·la perquè la reclamació no s'havia registrat. (parcel·la #${p.plot})` },
  extra_plot: { id: 'extra_plot', scope: 'individual', quality: 1, needs: 'free_plot', name: 'Parcel·la extra', art: 0, origin: 'c64', text: (p) => `Has rebut una parcel·la extra per fomentar el desenvolupament de la colònia. (parcel·la #${p.plot})` }
});
const PLANET_EVENT_IDS = Object.freeze(['pest_attack', 'pirates', 'acid_rain', 'planetquake', 'sunspot', 'meteorite', 'radiation', 'store_fire']);
const INDIVIDUAL_EVENT_IDS = Object.freeze(['package', 'traveler', 'glac_elves', 'best_built', 'lost_bolt', 'tap_dance', 'mining_repair', 'solar_dirty',
  'agri_grant', 'wart_worm', 'museum', 'swamp_eel', 'charity', 'investments', 'inheritance', 'moose_rat', 'gypsy_inlaws', 'cat_bugs', 'kazinga',
  'bat_lizard', 'lost_plot', 'extra_plot']);

const AI_PROFILES = deepFreeze({
  conservative: { label: 'conservador', margin: 10, extremeGuard: true },
  industrial: { label: 'industrial', margin: 18, extremeGuard: false },
  opportunist: { label: 'oportunista', margin: 25, extremeGuard: false }
});

const ASSET_LIST = Object.freeze([
  { name: 'bg_irata_sky', frames: 1, fb: '#141c3a', label: 'CEL' },
  { name: 'colony_store', frames: 1, fb: '#4a4238', label: 'BOTIGA' },
  { name: 'colony_habitat', frames: 1, fb: '#33405a', label: 'HÀBITAT' },
  { name: 'ruc_idle', frames: 1, fb: '#4fd1e6', label: 'RUC' },
  { name: 'ruc_walk_strip', frames: 8, fb: '#4fd1e6', label: 'RUC' },
  { name: 'colonists_strip', frames: 4, fb: '#f2c94c', label: 'COL.' },
  { name: 'resource_food', frames: 1, fb: '#7bd66f', label: 'MEN.' },
  { name: 'resource_energy', frames: 1, fb: '#4fd1e6', label: 'ENE.' },
  { name: 'resource_smithore', frames: 1, fb: '#ff9a3c', label: 'SMI.' },
  { name: 'module_food', frames: 1, fb: '#3f8f4a', label: 'M.MEN' },
  { name: 'module_energy', frames: 1, fb: '#2a8fa6', label: 'M.ENE' },
  { name: 'module_smithore', frames: 1, fb: '#b86a22', label: 'M.SMI' },
  { name: 'auction_hall_bg', frames: 1, fb: '#101828', label: 'LLOTJA' },
  { name: 'event_cards_strip', frames: 8, fb: '#3a3060', label: 'ESDEV.' },
  { name: 'ui_frame_9slice', frames: 1, fb: '#1a2238', label: 'MARC' }
]);
