# M.U.L.E. on a real C64 emulator — observations (2026-10-18)

Setup: VICE 3.10 `x64sc`, PAL C64 (50.125 Hz), disk `d64_MULE_1983_Electronic_Arts` (archive.org). Driven through the VICE
remote monitor (key variable poked directly, joystick through the I/O simulation port). Round 1 played several times.
Frame timings are exact for PAL; Atari/NTSC run at 60 Hz (~17 % faster). Verbatim strings: `c64-strings.txt`.

## Observed on screen (measured)

- **Title**: F3 cycles BEGINNER / STANDARD / TOURNAMENT. F5 cycles 4, 3, 2, 1 PLANETEER, then COMPUTER DEMO. F7 starts.
  Computer players are always Mechtrons.
- **Species** (3×3 grid). Standard starting money: Leggite/Mechtron $1000, Humanoid $600, Flapper $1600.
  Status Summary #0: MONEY 1000, LAND 0, GOODS 150, TOTAL 1150, COLONY 4600. "THE SHIP WILL BE BACK IN 12 MONTHS."
- **Land grant** (Standard): cursor moves one plot every 16 frames (0.32 s), row by row, skipping the town. ~1.28 s pause
  when a computer claims. Ends when all 4 have a plot. Preceded by ~6.7 s ship animation + 4 s gap.
- **Land auction** right after the grant (Standard, round 1): "BIDS START AT $160", computers raised in $24 steps about
  once per second, "SALE PRICE: $536".
- **Development**: "PRESS YOUR STICK BUTTON TO START" (the player starts the turn). Personal event text scrolls on the
  bottom line before that. Time bar = vertical bar at the right edge in the player's colour, height = units left.
  Full food: 101 units × 28 frames ≈ 56.6 s. Short food: "FOOD SHORTAGE DECREASES TIME."
- **Town** (C64): top row = blank yellow bldg (crystite, Tournament), SMITHORE, ENERGY, FOOD;
  bottom row = blank yellow bldg (assay, Tournament), LAND office, PUB, corral "$100 MULES". 12 MULEs left at my turn.
  "YOUR MONEY EQUALS $900" line under the town.
- **Outfitting** $25 food / $50 energy / $75 smithore, charged ~5 s after entering. "OUTFITTING MULE", "MULE INSTALLED.".
  Land office: "MARK PLOT TO SELL THEN COME BACK.".
- **Walking**: town 1.33 px/frame horizontal; map 0.667 px/frame horizontal, 0.333 px/frame vertical
  (~48 frames horizontally / ~96 frames vertically to cross a plot).
- **Pub, round 1**: $78 at 99 units left, $53 at 82, $58 at 10, $77 at 51. Message "WON $nn GAMBLING!".
- **Status screens**: PREVIOUS AMOUNT → USAGE → SPOILAGE → PRODUCTION → SURPLUS / SHORTAGE, black requirement line over
  each player's bar. Food required round 1 = 3. Energy required = 1 with no MULEs, 2 with one food MULE.
  "STORE HAS 8 UNITS" during declare.
- **Round-1 store prices (store buys / store sells)**: smithore 50/85, food 15/50, energy 10/45.
- **Auction**: declare "PUSH STICK TO DECLARE AS BUYER OR SELLER" ≈ 31 units × 7 frames (≈ 4.3 s). Trading ≈ 72–75 units
  × 8 frames (≈ 12 s) if nobody trades; ≈ 60 frames/unit while a trade runs. "UNITS TRADED", "SELLER AT CRITICAL LEVEL!",
  "AUCTION IS OVER".
- Events seen live: PLANETQUAKE ("MINING PRODUCTION HALF OF NORMAL."), PEST ATTACK, swamp eel contest (+$50).

## Read from memory/code (exact values, interpretation ours)

- Turn units = floor(91 × food / requirement) + 10 (0 food → 10 units ≈ 5.6 s).
- Pub = round bonus (50/100/150/200) + (rand 0–255 mod (2 × units left)), 250 if the sum passes 255. Matches every payout.
- Food requirement starts at 3, +1 every 4th round. Energy requirement = 1 + non-energy MULEs (as displayed).
- Players start with 4 food, 2 energy. Store: 8 food, 8 energy, 8 smithore, 14 MULEs. MULE $100. Outfits 25/50/75/100.
- Round-1 base prices: food 30, energy 25, smithore 50.

## Not covered

Later rounds, crystite, full computer-demo game, identity of the two blank buildings (no door in round 1).
