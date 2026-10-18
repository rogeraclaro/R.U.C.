# M.U.L.E. (1983) — exact game mechanics, with sources

Target: Atari 8-bit original, **Standard** level, 4 players, 12 rounds. Tournament and Beginner values are listed where they differ, so a level switch is easy later.

## 0. Sources (best first)

| ID | Source | What it is | Read? |
|---|---|---|---|
| **[DIS]** | http://bringerp.free.fr/RE/Files/MULE%20-%20Disassembled%20Memory.zip (from http://bringerp.free.fr/RE/Mule/downloads.php5) | Kroah's **full commented disassembly** of the Atari 800 memory snapshot (ATR CRC32 F76D2896). 49,981 lines, labelled, comments in French. | **Yes.** Downloaded and grepped. I checked level tables, price code, mule build, start money and critical level directly. |
| **[RE]** | http://bringerp.free.fr/RE/Mule/reverseEngineering.php5 | Kroah's reverse-engineering write-up, made from [DIS]. Mixed English and French. | **Yes, in full.** |
| **[FN]** | https://github.com/FujiNetWIFI/fujinet-multiplayer-mule (`docs/RULES.md`, `docs/TIMING.md`, `internal/rules/*.go`) | GPLv3 Go server that re-implements **Tournament** mode from [RE]. Timings were **measured frame by frame** on the same ATR in an emulator. | **Yes.** RULES.md, TIMING.md, constants.go, store.go, production.go and normal.go. |
| **[MAN]** | https://archive.org/details/Mule_atari8 (OCR: https://archive.org/download/Mule_atari8/MULE_djvu.txt) | 1983 EA Atari 8-bit manual. | **Yes** (OCR). In several places it **contradicts the code**; those cases are marked. |
| [REF] | https://mocagh.org/ea/mule-refcard.pdf | C64 reference card | Seen in search results only. Its spoilage figures (50% / 25% / >50) agree with the rest. |
| [PM] | Planet M.U.L.E. (2009) | Remake. Its source is not public and no formula documentation exists. Search results say it changes energy spoilage to 1/3 and removes species differences. | Not usable as an authority. |
| — | worldofmule.net | Now parked (only an ad pixel is served) | Dead |
| — | muttoo.on.ca/mulemanual | Connection refused | Dead |

**Confidence key:** **H** = read in the code, or measured and stated by [RE] and [FN] in agreement. **M** = one source, or an inference from code I only skimmed. **L** = manual only, or a conflict between sources.

**Units.** Jiffy = 1/60 s (NTSC). BTU = 4 jiffies. PTU = 7 BTU = 28 jiffies by default (the turn-bar pixel). **Platform for every value below: Atari 8-bit, NTSC**, unless the row says otherwise. I found no C64-specific disassembly. The C64 port is believed to share the logic, but PAL C64s run at 50 Hz, so everything is about 20% slower in real seconds there (inference, **L**).

---

## 1. Food and turn time

| Value | Platform | Source | Conf. |
|---|---|---|---|
| Food required **for the current round**: rounds 1–4 → 3, rounds 5–8 → 4, rounds 9–12 → 5 ([RE] table: R1–4=3, R5–8=4, R9–12=5) | Atari | [RE] "Player Food requirement" | H |
| Next-round requirement (shown as the "critical level" in the Food auction): R1–3 → 3, R4–7 → 4, R8–11 → 5, R12 → 0. In code: `foodFuturReq = foodReq; if (round % 4 == 0) foodFuturReq++` | Atari | [RE], [DIS] `$3159–$3166` | H |
| ⚠ [FN] uses 3/4/5 by rounds 1–3 / 4–7 / 8–11 / 12 as the *current* need. That is the "next" column shifted by one round, so [FN] is off by one round at R4/R8 versus [RE]'s current-round table. **Use the [RE] table.** | — | [FN] constants.go `FoodRequired` | M |
| Turn length = **10 + 91 × min(1, food_owned / food_required)** PTU. Full = 101 PTU. Food is counted at the start of the turn; it is consumed later, at production. | Atari | [RE] "Available time", [FN] measured | H |
| PTU = 7 BTU (28 jiffies, 0.467 s). **Flapper +2 BTU** (36 jiffies), **Humanoid −2 BTU** (20 jiffies), **Beginner +2 BTU**. Code: `playersTurnTimeWait = 7`, then INC×2 / DEC×2 | Atari | [DIS] `initGame $45CC–$46F9`, [RE] | H |
| Full turn: 101 × 28 = **2828 jiffies = 47.1 s** (measured). Flapper 60.6 s, Humanoid 33.7 s. | Atari NTSC | [FN] TIMING.md (measured) | H |
| With 0 food: **10 PTU = 4.67 s** (Flapper 6 s, Humanoid 3.3 s) | Atari | [RE] | H |
| The countdown "tick" sound plays while fewer than 30 PTU are left, at an interval equal to the PTU count left (in jiffies) | Atari | [FN] TIMING.md (code `$5E98`) | H |

## 2. Energy

| Value | Platform | Source | Conf. |
|---|---|---|---|
| Each Food, Smithore or Crystite M.U.L.E. needs 1 Energy unit, left over from the previous round. Energy M.U.L.E.s need none. | Atari | [RE] "Player Energy requirement", [MAN] | H |
| Shortage: missing = required − owned. **For each missing unit, the production of one random exploitation of that player is set to 0.** [RE] says "a random exploitation owned by the player". [FN] draws only from non-energy plots. | Atari | [RE] "Exploitation production", [FN] production.go | H (rule) / M (whether energy plots can be hit) |
| Energy critical level (next round) = current number of non-energy M.U.L.E.s **+ 1** (allows for one new M.U.L.E.) | Atari | [RE] "Energy players status" | H |

## 3. Production

| Value | Platform | Source | Conf. |
|---|---|---|---|
| Base (EBPC) — Food: plain 2, river 4, mountain 1. Energy: plain 3, river 2, mountain 1. Smithore: plain 1, river not allowed, mountain ×1 / ×2 / ×3 = 2 / 3 / 4. Crystite: deposit level 0–4, not allowed on the river. | Atari | [RE] EBPC table, [FN] | H |
| ⚠ [MAN] back cover says Energy on the river is 2 and Food on the plains is 2, which agrees. | Atari | [MAN] | H |
| **Learning curve:** +1 per plot for every **3** plots of the same type owned (`count / 3`, anywhere on the map, counting this plot) | Atari | [RE] EPC, [MAN] "Economics" | H |
| **Economies of scale:** +1 if **at least one** orthogonally adjacent plot of yours makes the same good. The maximum is +1. | Atari | [RE], [MAN] | H |
| Random variation: `prod = N + round(F × binomial())`, where binomial() is a symmetric [−6, 6) distribution. Amplitude by level: **Beginner 0, Standard 1 (F = 0.5), Tournament 2 (F = 1)** | Atari | [RE] "Number variation", [DIS] `$4CF9` (`calcBinomiale(prod, level)`) | H |
| Standard offsets: −2: 0.105%, −1: 16.063%, 0: 67.664%, +1: 16.063%, +2: 0.105% | Atari | [RE] | H |
| Tournament offsets: ±4: 0.013%, ±3: 0.562%, ±2: 6.248%, ±1: 24.303%, 0: 37.748% | Atari | [RE] | H |
| Clamp **0..8** per plot, then apply the energy penalty. Stock is capped at 255. | Atari | [RE] | H |
| Colony event effects are applied after production. Acid rain: +4 food / −2 energy in the hit row, +1 / −1 elsewhere. Sunspot: +3 energy. Quake: mining halved. All clamped to 0..8. | Atari | [RE] "Round event effect" | H |

## 4. Spoilage (order: usage → spoilage → production)

| Value | Platform | Source | Conf. |
|---|---|---|---|
| Food: after usage, **half of what is left spoils** (`floor(x/2)` lost) | Atari / C64 | [RE], [REF] | H |
| Energy: after usage, **a quarter of what is left spoils** (`floor(x/4)` lost) | Atari / C64 | [RE], [REF] | H |
| Smithore and Crystite: **everything above 50 is lost** | Atari / C64 | [RE], [REF] | H |
| Planet M.U.L.E. uses 1/3 for energy spoilage. **Not the original.** | PM | search result, unverified | L |

## 5. Store prices

| Value | Platform | Source | Conf. |
|---|---|---|---|
| Initial prices: **Food $30, Energy $25, Smithore $50, Crystite $100, M.U.L.E. $100** | Atari | [RE], [FN] | H |
| Initial store stock — **Standard and Tournament: Food 8, Energy 8, Smithore 8, Crystite 0, M.U.L.E.s 14**. Beginner: 16 / 16 / 0 / 0 / 25 (Beginner resets Smithore to 0 and M.U.L.E.s to 25 every round). | Atari | [RE], [DIS] `$4661` (Beginner doubles stock) | H |
| ⚠ [MAN] says the game starts with **16 M.U.L.E.s**. The code says 14 (25 in Beginner). | — | [MAN] p.10 | conflict; code wins |
| Supply/demand core: `P = P × (0.25 + 0.75 × ratio)`, with ratio = demand / supply in 3-bit fixed point, so it is quantised to 1/8. The ratio is clamped to [0.25, 3] **only for Smithore**. If supply is 0, the divisor is forced to 1. | Atari | [DIS] `calcGoodPriceSupplyDemand $31C1–$3246` | H |
| Food: supply = store stock + Σ over players of `max(0, own − req) / 2 + production`; demand = next-round requirement × 4. | Atari | [DIS] `calcFoodPriceFromWhen $313A` | H (formula) / M (exactly when it runs) |
| Energy: supply = store + Σ `max(0, own − need) × 3/4 + production`; demand = Σ needs + 4 | Atari | [DIS] `calcEnergyPriceFromWhen $3176` | H / M |
| ⚠ [FN] simplifies this to `store + Σ (own − need) / 2` and ignores production. **Don't copy [FN] here.** | — | [FN] store.go | — |
| Smithore: supply = store M.U.L.E.s + store Smithore / 2; demand = calcMuleReq = min(free plots, 4) + owned plots with no M.U.L.E., clamped to 0..8. Interim minimum is 50. Then **+7 × binomial(amp 2)** (−28..+28) at any level except Beginner, then minimum 20. | Atari | [DIS] `$3320–$3360`, `calcMuleReq $3379` | H |
| Crystite: **50 + rand(0..99)** each round | Atari | [DIS] `$3368–$3375` | H |
| Price floors (real): Food 30, Energy 25, Smithore 20 (50 before the random term). **Ceiling: 250** (`if price >= 250 then 250`). | Atari | [DIS] `limitGoodPrice $3249`, `goodsPriceLimit` | H |
| ⚠ [MAN] says max $265 and minimums $15 / $10 / $14. **Contradicts the code.** | — | [MAN] p.9 | L |
| Store **buys** at: Food / Energy P − 15; Smithore P; Crystite P rounded down to a multiple of 4. Store **sells** at buy + 35 steps, i.e. Food / Energy **P + 20**, Smithore P + 35, Crystite buy + 140. | Atari | [DIS] `setPriceStartEnd $327D`, [RE] | H |
| After each goods auction, P = **average price of the units actually traded** (only if at least 1 was traded). Crystite store stock is set to 0 after its auction. | Atari | [RE] "Trading" | H |
| In the Status Summary, goods are valued at the current P | Atari | [RE] score | H |

## 6. M.U.L.E. price and corral

| Value | Platform | Source | Conf. |
|---|---|---|---|
| The corral holds at most **14**. Each round after the auctions, the store builds `min(14 − mules, smithore_in_store / 2)`, at **2 Smithore per M.U.L.E.** | Atari | [DIS] `buildAndCalcPriceMule $339A` | H |
| M.U.L.E. price = `(P_smithore − P_smithore mod 5) × 2`, i.e. 2 × Smithore rounded down to a multiple of $10 (Smithore 49 → $90) | Atari | [DIS] `calcMulePrice $33C7` | H |
| Returning a M.U.L.E. to the corral refunds its purchase price, not the outfit | Atari | [MAN], [FN] | H |

## 7. Outfits, land and score

| Value | Platform | Source | Conf. |
|---|---|---|---|
| Outfit: **Food $25, Energy $50, Smithore $75, Crystite $100** | Atari | [RE], [MAN] | H |
| Score = money + land + goods. Each plot = **500**. A plot with a M.U.L.E. adds its outfit price (Food plot 525, Energy 550, Smithore 575, Crystite 600) **plus 35 per M.U.L.E.** Goods units are valued at the current P. | Atari | [RE] "Score computing", [FN] store.go | H |
| Land is always valued at $500, whatever was paid for it | Atari | [MAN] p.10 | H |

## 8. Pub

| Value | Platform | Source | Conf. |
|---|---|---|---|
| Payout = round bonus + `rand[0, 2 × PTU_left)`, **capped at $250**. Going to the pub ends the turn. | Atari | [RE] "Gambling" | H |
| Round bonus: R1–3 $50, R4–7 $100, R8–11 $150, R12 $200 (i.e. 50 × (round/4 + 1)) | Atari | [RE] | H |

## 9. Wampus

| Value | Platform | Source | Conf. |
|---|---|---|---|
| Reward = 100 × (round/4 + 1): R1–3 **$100**, R4–7 **$200**, R8–11 **$300**, R12 **$400** | Atari | [RE] | H |
| First appearance after Ta/4 PTU. Ta = BTU waited before pressing start, capped at 255 BTU; a player event subtracts 100 BTU. | Atari | [RE] | H |
| Visible for 1–4 PTU. Then hidden: 50% of the time it stays put for 4–7 PTU, 50% of the time it moves to a random mountain after exactly 2 PTU. If you stand on a mountain when it would appear, it hides again. Catchable once per turn, never while leading a M.U.L.E. | Atari | [RE], [MAN] | H |

## 10. Order, land grant, land auction

| Value | Platform | Source | Conf. |
|---|---|---|---|
| Development order is by rank, best first. **Reversed if the store has ≤ 7 M.U.L.E.s.** | Atari | [RE] "Turns order" | H |
| ⚠ [MAN] Beginner tips: "last place moves first if there are less than 7 M.U.L.E.s". The boundary at exactly 7 differs; the code-derived "≤ 7" wins. | — | [MAN] p.8 | M |
| Land-grant cursor: 1 plot per CTU. CTU = **Beginner 8, Standard 4, Tournament 3 BTU** (16 jiffies = 0.27 s in Standard). It skips owned plots and the store at no cost and pauses 4 CTU after a claim. One claim per player per round. | Atari | [DIS] `levelsCursorWait $4721 = 8,4,3`, [FN] measured Tournament 12 jiffies | H |
| Grant tie: the **lower-ranked** player wins | Atari | [RE], [MAN] | H |
| Colony land auctions per round: Beginner 0. **Standard Normal(1, amp 1) → 0: 16.2%, 1: 67.7%, 2: 16.1%, 3: 0.1%.** Tournament amp 2 → 0..5. Capped by the number of free plots. | Atari | [RE] | H |
| ⚠ [MAN] says "averages 1, can vary 0 to 6" | — | [MAN] p.10 | L |
| Order: player-listed plots first, then colony plots. 70 ATU per auction, $4 per step. | Atari | [RE] | H |
| Start price: first auction of the game $160. First auction of a later set = previous set's average − $60. Each later auction in the set = previous price − $60. No bid → recorded price = start/2 + 52, and the colony set ends. | Atari | [RE] | H |
| Bidding: the buyer must move above the start price. Highest bid wins at time-out; a tie goes to the lower rank. There is no maximum other than the bidder's cash. | Atari | [RE], [MAN] | H |
| Selling land (Standard and Tournament): mark it at the land office (the timer stops while you do). It is auctioned next round. If the seller changes the asking price, buyers' bids are rejected. | Atari | [MAN] p.10 | H |

## 11. Setup per species and level

| Value | Platform | Source | Conf. |
|---|---|---|---|
| Humans: **Flapper $1600, Humanoid $600, all others (Mechtron, Gollumer, Packer, Bonzoid, Spheroid, Leggite) $1000** | Atari | [DIS] `initGame $46CB–$46F9` | H |
| Computers: $1000 in Beginner and Standard, **$1200 in Tournament**. Computers are always Mechtrons ("race 0 = Computer"). | Atari | [DIS] `$46FC`, [MAN] "extra $200" | H |
| Species only change money and PTU: Flapper +2 BTU, Humanoid −2 BTU. Other species are cosmetic. | Atari | [DIS] | H |
| Start goods: **Standard / Tournament 4 Food, 2 Energy**. Beginner 8 / 4. | Atari | [RE], [DIS] `$466C` | H |
| Rounds: **Beginner 6, Standard 12, Tournament 12** | Atari | [DIS] `$45DC`, `$465E` | H |
| Beginner extras: no land auctions; no production variation; fixed Smithore $50; ATU 50 BTU, doubled in round 1; sellers at or below the critical level are blocked; double stocks; PTU +2; M.U.L.E.s never run away (they beep). | Atari | [DIS], [RE], [MAN] | H |
| Crystite, assay and collusion are **Tournament only**. Standard pirates steal **Smithore** (store, players' stock and this round's production); Tournament pirates steal Crystite. | Atari | [MAN] p.11–12, [RE] events | H |

## 12. End conditions and rating

| Value | Platform | Source | Conf. |
|---|---|---|---|
| Early failure: no Food M.U.L.E. in the colony and total food (players + store) = 0 → "The Colony failed because of a total lack of Food!" The same rule applies to Energy. | Atari | [RE] "Colony difficulties" | H |
| Warnings: "The Colony has a shortage of [Food] [and] [Energy]!" and "The Store has a shortage of Smithore for mules!" (store M.U.L.E.s < calcMuleReq) | Atari | [RE] | H |
| Rating = round((total − 10000) / 20000), clamped to 0..6. Bands: <20k, 20–40k, 40–60k, 60–80k, 80–100k, 100–120k, ≥120k. | Atari | [RE], strings at [DIS] `$0600–$07E6` | H |
| Messages ("Overall, the Colony …"): 0 "FAILED... DISMALLY. THE FEDERATION DEBTORS' PRISON IS YOUR NEXT HOME". 1 "FAILED... THE FEDERATION WILL NO LONGER SEND TRADE SHIPS. YOU ARE ON YOUR OWN". 2 "SURVIVED... BARELY. YOU WILL BE LIVING IN TENTS. FEW TRADING SHIPS WILL COME YOUR WAY". 3 "WAS A SUCCESS. YOU HAVE MET THE MINIMUM STANDARDS SET BY THE FEDERATION, BUT YOUR LIFE WILL NOT BE EASY". 4 "SUCCEEDED. THE FEDERATION IS PLEASED BY YOUR EFFORTS. YOU WILL LIVE COMFORTABLY". 5 "SUCCEEDED... EXTREMELY WELL. YOU CAN NOW RETIRE IN ELEGANT ESTATES". 6 "DELIGHTED THE FEDERATION WITH YOUR EXCEPTIONAL ACHIEVEMENT. YOUR RETIREMENT WILL BE LUXURIOUS" | Atari | [DIS] string table (verbatim) | H |
| ⚠ [FN]'s rating texts are rewritten (its repo says "all of the text is new"). **Don't copy them.** | — | [FN] | — |
| **First Founder** is the rank-1 player, but the title is awarded only if the colony total is ≥ 60,000 (rating ≥ 3). [MAN] Standard: "at least $60,000, or you will all get sent home". | Atari | [RE], [MAN] p.10 | H |

## 13. Goods auctions

| Value | Platform | Source | Conf. |
|---|---|---|---|
| Order: **Smithore, (Crystite), Food, Energy** | Atari | [MAN], [FN] | H |
| ATU (one time-bar tick) = **Beginner 50, Standard 30, Tournament 25 jiffies** (`levelsAuctionTimeWait`). Units confirmed by measuring Tournament at 25 jiffies. While nobody pushes a stick, the tick is ATU / 4 (Standard 7 jiffies, Tournament 6). | Atari | [DIS] `$471E = 50,30,25`, [FN] measured | H (Standard value inferred from the measured Tournament unit) |
| Declare timer: **30 ticks** (always at the idle rate in practice, so 180 jiffies in Tournament). Trading: **70 ticks**. The clock stops while a buyer and seller are in contact. | Atari | [RE], [FN] measured | H |
| Status screen before each good: usage, spoilage, production, and the critical line. Shown 561 jiffies in Tournament. | Atari | [FN] measured | H |
| Price step per line step: $1 for Food, Energy and Smithore, $4 for Crystite. A line moves 1 step every 8 jiffies. The store buy and sell lines are 35 steps apart. Sellers start 1 step above the store sell line; buyers start 10 steps below the store buy line. | Atari | [FN] measured, [DIS] | H |
| Trade cadence while in contact: one unit per 12, 12, 10, 8, 6, 4, 2, 2… BTU (it speeds up). The cadence resets when contact breaks. Ties go to the lower rank. | Atari | [FN] (code `$912E`) | H |
| Auto-declare: Smithore → seller if you hold ≥ 1 unit. Food and Energy → seller if you have a surplus above the critical level. | Atari | [RE] "Declaring" | H |
| **Critical level, Standard:** reaching it shows "SELLER AT CRITICAL LEVEL!". In **Beginner** the seller is blocked; in Standard and Tournament **only computers are blocked, and humans may keep selling below it**. [MAN] Standard: "you can … sell products below your Critical Level". | Atari | [DIS] `$93DE–$93FF`, [MAN] p.11 | H (code + manual agree) |
| Store as trader: its sell line exists only while it has stock. With no stock, buyers can bid without limit (Standard). The store absorbs sellers at its buy price; I found no buy cap except the 255 stock cap. | Atari | [MAN] p.11, [FN] | M (store buy limit not verified in code) |
| A buyer can't go above the lowest seller's line (or the store sell price when the store has stock). A seller can't go below the highest buyer's line or the store buy price. | Atari | [FN] | M |

## 14. Development: movement and running away

| Value | Platform | Source | Conf. |
|---|---|---|---|
| Movement tick every 6 jiffies. Map step = 4 px × 2 scanlines. Diagonals move on both axes, so diagonal is fastest ([MAN]). | Atari | [FN] measured, [MAN] | H |
| Terrain speed (jiffies per step): **plain 6, river 14, mountain 21** | Atari | [FN] TIMING.md (measured) | H |
| Town step = 8 px horizontal / 4 scanlines. Switching between map and town takes 25 jiffies. The turn starts in the middle of town. | Atari | [FN] measured | H |
| Run-away (Standard and Tournament): the M.U.L.E. runs off if you press the button anywhere other than directly over the house of **your own** plot, or if the turn ends while you are leading it. In Beginner, a miss only beeps. | Atari | [MAN] p.10 and Q&A, [FN] | H |
| Installing on an occupied plot swaps the M.U.L.E.s (you then lead the old one) | Atari | [MAN] §17 | H |
| Player event at turn start: **27.5%** chance; 22 events, each once per game; no good events for rank 1, no bad events for the bottom 2; size m = 25 × (round/4 + 1). [MAN] says 25% and 21 events. | Atari | [RE] full table, [MAN] | H (code) |
| Colony events: lifetime limits Pest 3, Pirates 2, Acid 3, Quake 3, Sunspot 3, Meteor 2, Radiation 2, Fire 2. P = uses left / total uses left. Round 12 is always the ship's return. | Atari | [RE] | H |

## 15. Computer AI ([RE], Atari)

- **Land grant:** rate goods over 3 simulated rounds. In round 1, one good gets the max rating 32 (Food 50%, Energy 25%, Smithore 25%). Plot rating = best exploitation rating − distance/2. Row 4 gets −1 and row 5 gets −2. A strictly better plot replaces the current pick only with 25% probability. If two computers pick the same plot, the better-ranked one re-picks. (**H**)
- **Land-auction rating:** good weights Food 3, Energy 2, Smithore 6, Crystite 12.5 + round/2. Rating = (best exploitation rating + rand 0..7) × rounds left. **Bidding, declaring and trading AI are TODO in [RE]**. [FN] invents its own; that design is not original. (**M**)
- **Turn** ([DIS] `playerTurnAi $374B`, read directly): loop while ≥ 35 PTU are left. Rate the goods over 2 simulated rounds (`calcGoodsQuality $33DE`: mean simulated price / 8, 0..31). Scan own plots from id 44 down, each once per turn; gain = best exploitation (simulated) − current one (real; an empty plot is 0 and needs a corral M.U.L.E. and its price). Skip a plot whose best good is its current one; keep the biggest gain **≥ 2** (⚠ [RE] says 3; the code is `CMP #2`) whose outfit is affordable. Buy the M.U.L.E. (empty plot) and the outfit, or re-outfit in place. **No cash reserve.** Each action costs **25 + 4 × dist PTU** (`decreaseTimeFromAction $3936`: dist shifted left twice), dist = `calcPlotDistFromStore $36D1` = max(\|col − 4\|, 2 × \|row − 2\|), +1 on the river column (1..5). ⚠ [RE] writes "25 + distance × 2" with its table "× 2"; the code and [RE]'s own "4 to 20 PTU" install time agree on 4 × dist. At most ~3 per turn. Then assay (Tournament only), 10 + 4 × dist. Then the pub if ≥ 3 PTU are left. Computers never catch the Wampus. (**H**)
- **Exploitation rating** (`calcPlotQualityAi $35D5`, `calcPlotProdWithEcos $4D7A`): (quality + one bonus) × capacity (0..8), max 255. Simulated capacity counts the new M.U.L.E. in the learning curve (and, when it completes a group of 3, adds the bonus the other plots would gain) and +1 per own neighbour of the same good, capped at 2 in the turn AI; the land-grant mode adds 2 per own neighbour of any kind, cap 3. Real capacity: cap 1.
- **Land grant** (`calcPlayersPlotsQuality $350E`, `calcPlayerBestPlotAi $36FB`): rating = best exploitation (3 simulated rounds; in round 1 one good drawn per computer gets 32) − dist. The best plot from the start position wins (later plot wins ties; a 0 only with 1/4 chance). The row penalty starts at 0 and grows after plot 27 and after plot 36 (so it is only applied when the scan starts before them). ⚠ [RE]'s "25 % to replace a better plot" is the 1/4 chance for a 0 rating only.
- **Exploitation priority bonuses** (Food +10/11/14, Energy +11/12/15, depending on own and colony shortage): see [RE] "Computer exploitation rating AI". (**H**)
- Computers stop selling at the critical level, unlike humans. (**H**, [DIS])

## Remaining gaps / not verified
- Store buy-side capacity limit in goods auctions (only the 255 cap was seen).
- When exactly the Food and Energy prices are recomputed relative to the usage/spoilage step. The formula itself is confirmed in code.
- C64 timings (PAL vs NTSC). There is no C64 disassembly online.
- Collusion length (Tournament only; [FN] guesses 10 ATU).
