# Fidelity plan — R.U.C. vs. original M.U.L.E. (C64, Standard)

Sources (in `docs/research/`): `mechanics.md` (Kroah's Atari disassembly + write-up, FujiNet timings), `events.md`
(event routines decoded from the disassembly), `emulator-c64.md` + `c64-strings.txt` (C64 PAL in VICE, round 1).
Precedence: C64 emulator observation > disassembly code > manual > secondary. Real-time durations use **C64 PAL**
(50 Hz frames) because the target is the C64 version.

## Decisions

- Difficulty levels Relaxada/Colònia/Implacable are replaced by the original game levels: **Principiant** (Beginner,
  6 rounds) and **Estàndard** (Standard, 12 rounds). Torneig (Tournament) needs crystite/assay/collusion → Phase B, shown
  disabled. AI strength is no longer a separate setting (the original has none).
- Still 1 human + 3 computer players (the original allows 1–4 humans; hotseat is out of scope for now).
- Game texts stay in Catalan, translating the original messages faithfully (same meaning, same numbers).
- Own UX additions that are not C64 rules are kept only if they don't change the rules (install/flee animation, door wait).
  The 3 s countdown is replaced by the original "press button to start" prompt.

## Gaps (current → original)

### Batch 1 — economy and turn
1. Player start inventory 6 food / 6 energy → **4 food / 2 energy**.
2. Store start 16/16/0, corral 16 → **8 food / 8 energy / 8 smithore, 14 MULEs**; corral cap 16 → **14**.
   Store builds min(14 − stock, smithore/2) MULEs between rounds.
3. Food need 2/3/4 → **3/4/5** (rounds 1–4 / 5–8 / 9–12).
4. Turn time 90/60/45 s with −25 %/unit → **units = 10 + floor(91 × min(1, food/need))**, 1 unit = 28 PAL frames
   (≈ 0.5586 s; full ≈ 56.4 s, zero food ≈ 5.6 s). Flapper ×9/7, Humanoid ×5/7 (when species exist).
5. Energy shortage: fixed priority → **one random non-energy MULE per missing unit produces nothing**.
6. Production variation a+b (−2..+2 triangular) → **−1/0/+1 at ~16/68/16 %** (±2 at ~0.1 %), clamp 0..8 (see mechanics.md).
7. Store prices: provisional ratio formula → **disassembly formula** (P × (0.25 + 0.75 × demand/supply), smithore random
   step, P becomes average traded price after each auction). Store buys/sells: food & energy **P−15 / P+20**,
   smithore **P / P+35**. Start P 30/25/50. Floors/ceiling per mechanics.md.
8. MULE price 100 + 10/missing → **2 × smithore price rounded down to $10**.
9. Score: RUC worth 0 → **plot $500 + outfit cost + $35 per installed MULE**; goods at store price.
10. Development order reversal: < 7 → **≤ 7** MULEs in the corral.
11. Colony fails early if no food (or energy) MULEs and no units anywhere ("THE COLONY FAILED BECAUSE OF A TOTAL LACK OF").

### Batch 2 — events
12. Personal events: 4 own events, 25 % → **the 22 original events**, 27.5 % (22/80), each once per game, leader never good,
    **last two** never bad, amount = |weight| × 25 × (floor(round/4) + 1), per-plot ones, unaffordable penalty cancelled,
    0-food non-leader gets the package. Shown before "press button to start".
13. Planetary events: 45 % random → **one per round 1–11 from a bag without replacement** (Pest 3, Pirates 2, Acid 3,
    Quake 3, Sunspot 3, Meteorite 2, Radiation 2, Fire 2); round 12 = "La nau ha tornat!". Exact effects and timing
    (before/after the production display) per events.md; add meteorite; pirates also take the store's smithore;
    fire zeroes store goods; pest/radiation target 1st or 2nd place.

### Batch 3 — town and turn start
14. Town layout like the C64: top row crystite (closed), smithore, energy, food; bottom row assay (closed), **land office**,
    **pub**, corral with "$price MULES".
15. **Pub**: ends the turn and pays round bonus (50/100/150/200) + rand(0..255) mod (2 × units left), max 250.
16. "Prem Acció per començar" replaces the 3 s countdown; time bar = vertical bar at the right edge.
17. **Species** selection for the human (8 species, Flapper $1600 & ×9/7 time, Humanoid $600 & ×5/7, others $1000);
    computers are Mechtrons with $1000.
18. Levels Principiant/Estàndard (see Decisions); Beginner differences per mechanics.md.

### Batch 4 — auctions
19. Timings: declare ≈ 31 × 7 frames (≈ 4.3 s); trading ≈ 72–75 units × 8 frames (≈ 12 s) idle, slower while trading.
20. **Continuous unit-by-unit transfer** while lines touch, accelerating.
21. Critical level: in Standard humans may sell below it; computers stop. Beginner blocks everyone.
22. **Land auctions** (Standard): after the grant, 0–3 plots/round (usually 1), bids start at $160, later ones $60 lower,
    $4 steps; player plots marked for sale at the land office are auctioned too.

### Batch 5 — pacing and end
23. Land grant: 16 frames/plot (0.32 s) Standard, ~1.28 s pause after a claim; Beginner slower (measure / mechanics.md).
24. Walking: town 1.33 px/frame, map 0.667 h / 0.333 v px/frame on a 32-px-ish plot (scale to our TILE); terrain slowdown
    6/14/21 frames per step (plain/river/mountain).
25. End screen: colony rating round((total − 10000)/20000) with the 7 original texts; First Founder only if ≥ $60,000.

## Status (2026-10-18)

Batches 1–5 done (commits 3239df5, 1510a95 refactor, cd14ad9, 5508b1d).

### Batch 6 — sound
26. Integrate the original-composition chiptune module (`docs/research/audio.md`): music only where the original had it
    (title, status screens, end); effects everywhere else. UI polish of truncated labels.

### Batch 7 — Mountain Wampus (Standard and Beginner)
27. Wampus per mechanics.md §9: reward 100 × (floor(round/4) + 1), appearance/hiding rules, once per turn, never while leading
    a RUC; computers never catch it.

### Batch 8 — Tournament level
28. Crystite (production, hidden deposits, auction between smithore and food, price rules), assay office (soil samples),
    collusion in auctions, Tournament pirates steal crystite, meteorite crystite text, Tournament timings.

### Batch 9 — players
29. 1–4 human players on one machine (key mappings per player for land grant and simultaneous auctions), computer demo mode.

### Batch 10 — QA
30. Full playtests in the browser at each level, fix what is found, push and verify the live deploy.
