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
  W: 1280, H: 720, TURNS: 12, COLS: 9, ROWS: 5, RIVER_COL: 4, TOWN_ROW: 2,
  TILE: 96, MAP_X: 16, MAP_Y: 100,
  START_CASH: 1000,
  // [Atari code][C64] Standard: every colonist starts with 4 Food and 2 Energy.
  START_INV: { food: 4, energy: 2, smithore: 0 },
  // [Atari code][C64] Standard: the store starts with 8 Food, 8 Energy, 8 Smithore and 14 M.U.L.E.s ([manual] says 16: code wins).
  STORE_START: { food: 8, energy: 8, smithore: 8 },
  // [Atari code] the corral holds at most 14; between rounds the store builds min(14 - corral, smithore / 2), 2 Smithore each.
  RUC_START: 14, RUC_MAX: 14, SMITHORE_PER_RUC: 2,
  // [manual] Outfitting: Food $25, Energy $50, Smithore $75 (Crystite $100 is Phase B and not wired).
  MODULE_COST: { food: 25, energy: 50, smithore: 75 },
  // [manual] Every plot is worth $500 in the summary.
  PLOT_VALUE: 500,
  // [Atari code] score: each installed M.U.L.E. adds $35 on top of its outfit cost (plot 500 + outfit + 35).
  RUC_WORTH: 35,
  // [Atari code][C64] food required for the current round: 3 in rounds 1-4, 4 in 5-8, 5 in 9-12.
  FOOD_NEED: [{ from: 1, to: 4, n: 3 }, { from: 5, to: 8, n: 4 }, { from: 9, to: 12, n: 5 }],
  // [card] After consumption, 50% of the food left and 25% of the energy left spoil; ore only spoils above 50 units.
  // Rounding of odd amounts is [PROVISIONAL]: floor (the spoiled part is rounded down).
  SPOILAGE: { foodPct: 50, energyPct: 25, oreCap: 50 },
  // [Atari code] per-plot output is clamped to 0..8. varAmp: Standard variation factor F = 0.5 (Beginner 0, Tournament 1).
  PRODUCTION: { min: 0, max: 8, varAmp: 0.5 },
  // [Atari code] store price P: floors food 30 / energy 25 / smithore 20 (smithore: 50 before its random step), ceiling 250.
  // smithoreStep: the random term is 7 x binomial (amplitude 2), i.e. -28..+28.
  STORE_PRICE: { max: 250, smithoreInterimMin: 50, smithoreStep: 7, smithoreStepMax: 4 },
  AUCTION: {
    // declareMs: [PROVISIONAL] length of the buyer/seller declaration (the manual has a Declare Timer but gives no seconds).
    // playerPriceMax: technical UI limit for colonist-to-colonist prices when the store is out of stock ([manual]: no rule cap).
    declareMs: 5000, playerPriceMax: 999,
    maxMs: 45000, matchMs: 500, separateSteps: 2, allOutMs: 3000, noOpMs: 5000,
    storeIdleMs: 5000, storeNudgeMs: 2000, storeBuyCap: 24,
    aiHoldMs: 1500, aiMoveMs: 110,
    humanStepsPerSec: 9
  },
  // Land race: the game clock advances in fixed steps so the outcome never depends on the frame rate.
  // landClaimPauseMs: after every claim the cursor disappears this long (measured on the original: ~2.1 s). Same for all difficulties.
  LAND: { stepMs: 10, holdMs: 900, landClaimPauseMs: 2000 },
  // [Atari code] personal event: roll random[0..79], an event only if < 22 (27.5 %); search down at most 20 candidates;
  // money unit 25 x (floor(round / 4) + 1).
  EVENTS: { personalDie: 80, personalTries: 20, moneyUnit: 25 },
  // [manual] Standard: the colony must reach $60,000 in total. No per-colonist requirement.
  SURVIVAL: { combined: 60000 },
  // [Atari code] the order is reversed when the corral has 7 M.U.L.E.s or fewer ([manual] says "less than 7": code wins).
  // unitFrames / palHz: [Atari code] one development time unit = 7 BTU = 28 frames; [C64] PAL runs at 50.125 Hz (101 units ~ 56.4 s).
  // countdownMs: not C64-sourced — a "get ready" warning shown before the human's development slot starts, so the walk and its
  // clock never begin while the player is still getting their bearings (see the modal in MapScreen.drawTurnCountdown).
  DEV: { lowCorral: 7, countdownMs: 3000, unitFrames: 28, palHz: 50.125, baseUnits: 10, foodUnits: 91 },
  // Walking during development. Speeds/slow terrain [PROVISIONAL], not measured on the C64 yet.
  // [manual] river and mountains slow you down; diagonal is the fastest way to move (so the two axes are not normalised).
  // mapSpeed/townSpeed: 2/3 of the original PROVISIONAL values (0.18/0.3), per playtesting feedback, still PROVISIONAL.
  // installMs: not C64-sourced — our own pacing so the RUC visibly rises, gets its module and comes back down instead of installing at once.
  // fleeShuffleMs/fleeRunMs: not C64-sourced — our own flee choreography (a quick side-to-side jitter, then a dash off in a random direction).
  // The whole plot tile counts as "the house" (see DevWalk.atHouse), not just a small spot at its centre.
  // doorHoldMs: how long you must keep pushing at a shop/corral's doorway before it commits to a visit — a brief graze while
  // passing by on the street falls short of this and does nothing. visitMs: once committed, the colonist waits right at the
  // doorway while only the RUC walks on to the counter and back (see DevWalk.startVisit / MapScreen.drawVisiting). Neither is
  // C64-sourced.
  WALK: { stepMs: 10, mapSpeed: 0.12, townSpeed: 0.2, slowPct: 50, doorHoldMs: 350, visitMs: 2200, installMs: 1800, fleeShuffleMs: 400, fleeRunMs: 900 },
  DIFFICULTY: {
    relaxed: { label: 'Relaxada', reactMin: 700, reactMax: 1300, valuationErr: 15, minReserve: 2, landMsPerPlot: 500 },
    colony: { label: 'Colònia', reactMin: 400, reactMax: 900, valuationErr: 8, minReserve: 3, landMsPerPlot: 400 },
    ruthless: { label: 'Implacable', reactMin: 180, reactMax: 500, valuationErr: 3, minReserve: 4, landMsPerPlot: 300 }
  },
  PLAYER_COLORS: [
    { id: 'yellow', name: 'Groc', hex: '#f2c94c' }, { id: 'coral', name: 'Corall', hex: '#ff7a6b' },
    { id: 'cyan', name: 'Cian', hex: '#4fd1e6' }, { id: 'violet', name: 'Violeta', hex: '#b58cff' }
  ],
  SHAPES: ['circle', 'square', 'triangle', 'diamond'],
  AI_NAMES: [
    { name: 'Bran', profile: 'conservative' }, { name: 'Vela', profile: 'industrial' },
    { name: 'Nox', profile: 'opportunist' }
  ],
  // The key stays the same so an old (schema 1-2) save is detected and refused with an explicit message.
  // Schema 3: original start stocks, store price P in the state, new food/time/score rules.
  // Schema 4: the 22 original personal events (used flags) and the planetary event bag (state.events).
  SAVE_KEY: 'ruc-save-v1', SCHEMA_VERSION: 4, MAX_DT_MS: 50
});

/* Mutable on purpose: Phase B modules are wired behind these flags. */
const FEATURES = { crystite: false, wampus: false, landAuctions: false };

const RESOURCE = Object.freeze({
  FOOD: 'food', ENERGY: 'energy', SMITHORE: 'smithore',
  CRYSTITE: 'crystite' // Phase B, disabled
});
const TERRAIN = Object.freeze({ RIVER: 'river', PLAIN: 'plain', MOUNTAIN: 'mountain', TOWN: 'town' });
const ROLE = Object.freeze({ BUYER: 'BUYER', SELLER: 'SELLER', OUT: 'OUT' });

// basePrice: [Atari code][C64] starting store price P (food 30, energy 25, smithore 50). priceFloor: [Atari code] lowest P.
// storeBuyOff / storeSellOff: [Atari code][C64] the store buys at P - buyOff and sells at P + sellOff (food & energy -15/+20,
// smithore 0/+35). minPrice / maxPrice: the auction's price window = floor - buyOff .. ceiling 250 + sellOff (marker bounds).
// Crystite is Phase B and deliberately left as it was.
const RESOURCE_DEFS = deepFreeze({
  food: { id: 'food', label: 'Menjar', icon: 'resource_food', module: 'module_food', enabled: true, basePrice: 30, priceFloor: 30, storeBuyOff: 15, storeSellOff: 20, minPrice: 15, maxPrice: 270, auctionStep: 1, color: '#7bd66f' },
  energy: { id: 'energy', label: 'Energia', icon: 'resource_energy', module: 'module_energy', enabled: true, basePrice: 25, priceFloor: 25, storeBuyOff: 15, storeSellOff: 20, minPrice: 10, maxPrice: 270, auctionStep: 1, color: '#4fd1e6' },
  smithore: { id: 'smithore', label: 'Smithore', icon: 'resource_smithore', module: 'module_smithore', enabled: true, basePrice: 50, priceFloor: 20, storeBuyOff: 0, storeSellOff: 35, minPrice: 20, maxPrice: 285, auctionStep: 2, color: '#ff9a3c' },
  crystite: { id: 'crystite', label: 'Crystite', icon: 'resource_smithore', module: 'module_smithore', enabled: false, basePrice: 90, minPrice: 30, maxPrice: 300, auctionStep: 3, color: '#d77bff' }
});

/** Resources that take part in production, consumption and auctions. Registry-driven so Phase B needs no engine rewrite. */
function enabledResources(defs = RESOURCE_DEFS) {
  return Object.values(defs).filter((d) => d.enabled && (d.id !== 'crystite' || FEATURES.crystite));
}

/** [manual] Auction order: Smithore -> Crystite (Tournament only) -> Food -> Energy. Disabled goods are skipped. */
const AUCTION_ORDER = Object.freeze(['smithore', 'crystite', 'food', 'energy']);
function auctionResources(defs = RESOURCE_DEFS) {
  const on = enabledResources(defs);
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
  pirates: { id: 'pirates', scope: 'planet', negative: true, tickets: 2, timing: 'after', name: 'Nau pirata', art: 4, origin: 'c64', text: (p) => `Els pirates s'enduen tot el smithore! (${p.amount} unitats)` },
  acid_rain: { id: 'acid_rain', scope: 'planet', negative: false, tickets: 3, timing: 'before', name: 'Tempesta de pluja àcida', art: 5, origin: 'c64', text: () => 'Més producció de menjar, menys energia.' },
  planetquake: { id: 'planetquake', scope: 'planet', negative: true, tickets: 3, timing: 'before', name: 'Terratrèmol planetari', art: 3, origin: 'c64', text: (p) => `La producció minera és la meitat de la normal.${p.slide ? ` Una muntanya llisca de la parcel·la #${p.slide.from + 1} a la #${p.slide.to + 1}.` : ''}` },
  sunspot: { id: 'sunspot', scope: 'planet', negative: false, tickets: 3, timing: 'before', name: 'Activitat de taques solars', art: 1, origin: 'c64', text: () => 'La producció d\'energia augmenta.' },
  // [Atari code] the "new crystite deposit" subtext is printed only in Tournament; Standard shows just where it fell.
  meteorite: { id: 'meteorite', scope: 'planet', negative: true, tickets: 2, timing: 'before', name: 'Impacte de meteorit', art: 2, origin: 'c64', text: (p) => `Cau a la parcel·la #${p.plot}${p.mule ? ' i destrueix el RUC que hi havia' : ''}.` },
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
  conservative: { label: 'conservador', reserveTurns: 2, margin: 10, extremeGuard: true, prefers: 'food' },
  industrial: { label: 'industrial', reserveTurns: 1, margin: 18, extremeGuard: false, prefers: 'smithore' },
  opportunist: { label: 'oportunista', reserveTurns: 1, margin: 25, extremeGuard: false, prefers: 'energy' }
});

const ASSET_LIST = Object.freeze([
  { name: 'bg_irata_sky', frames: 1, fb: '#141c3a', label: 'CEL' },
  { name: 'map_ground_base', frames: 1, fb: '#2a2530', label: 'TERRA' },
  { name: 'tile_river_01', frames: 1, fb: '#1f5c73', label: 'RIU' },
  { name: 'tile_river_02', frames: 1, fb: '#1a6a80', label: 'RIU' },
  { name: 'tile_plain_01', frames: 1, fb: '#4a4a6a', label: 'PLANA' },
  { name: 'tile_plain_02', frames: 1, fb: '#514f70', label: 'PLANA' },
  { name: 'tile_mountain_01', frames: 1, fb: '#3a2c2a', label: 'MUNT.' },
  { name: 'tile_mountain_02', frames: 1, fb: '#2c3a44', label: 'MUNT.' },
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
