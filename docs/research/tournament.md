# M.U.L.E. (1983): Tournament level and multiple human players

Companion to `mechanics.md`, `events.md` and `emulator-c64.md`. Facts already stated there are only cross-referenced here.

## Sources

| Tag | Source | Notes |
|---|---|---|
| **[DIS]** | Kroah's commented Atari 800 disassembly (`MULE - Disassembled Memory.asm`, from http://bringerp.free.fr/RE/Files/MULE%20-%20Disassembled%20Memory.zip) | Primary source. Addresses are quoted as `$xxxx`. Every row below that cites [DIS] was read in the 6502 code itself, not only in the French comments. |
| **[RE]** | http://bringerp.free.fr/RE/Mule/reverseEngineering.php5 | Kroah's write-up, made from [DIS] |
| **[C64M]** | https://project64.c64.org/Games/MULE10.TXT | C64 manual, command summary and Project 64 notes |
| [AMAN] | Atari 8-bit manual (OCR) | Same text as [C64M] for the Tournament chapter |
| [FN] | FujiNet multiplayer M.U.L.E. (`docs/RULES.md`, `docs/TIMING.md`, `tools/extract/capture/tournament.txt`) | A simplified re-implementation. It is wrong on several Tournament points, which are marked below. |
| [EMU] | `emulator-c64.md` (VICE, our own observation) | C64 title-screen keys |

Confidence: **H** = read in the code, or code and manual agree. **M** = code read, but the meaning was inferred (uncommented code or flags), or only one non-code source. **L** = manual only, or the sources conflict.
Platform: **A8** = Atari 8-bit (code), **C64** = C64 manual. The two versions are believed to share the logic (see `events.md` §A.6).

---

## 1. Crystite

### 1.1 Deposit generation (at boot, `$4330` and `expandCrystite $48C9`)

| Value | Platform | Source | Conf. |
|---|---|---|---|
| **3** seeds of level 3 (HIGH) go on 3 distinct random plots out of 0..44. The seed loop is `LDY #3 … DEY/BNE`, so it runs 3 times. A seed can land on a river plot or the store. | A8 | [DIS] `$4330–$4343` | H |
| ⚠ [RE] and [FN] say **4** deposits. The code places 3, and [C64M] says "there are always 3 plots which each have base production of 3 units". **Use 3.** | — | [RE], [FN] vs [DIS], [C64M] | contradiction; code wins |
| Each seed spreads in a diamond: level = 3 − Manhattan distance, which gives 3 at the centre, 2 at distance 1 and 1 at distance 2. Where diamonds overlap, the higher value wins (`max`). The result is clipped to the 9×5 map. | A8 | [DIS] `expandCrystite` | H |
| Every other plot is 0 (NONE). Levels: 0 NONE, 1 LOW, 2 MEDIUM, 3 HIGH, 4 "very high" (meteorite only). | A8 | [DIS], [RE] | H |
| At new-game init, the 4 river plots and the store (indices 4, 13, 22, 31, 40) are set to crystite **−1**, which means "no mining". The diamonds of seeds placed there still spread to the neighbouring plots. | A8 | [DIS] `$44CD–$44EF` | H |
| The crystite map is generated in every level, but only Tournament uses it. | A8 | [DIS] | H |
| Meteorite: a random non-town, non-river plot with crystite < 3 is set to **4**. There is no spread. The plot is marked as known to the computers, and any M.U.L.E. on it is destroyed. The subtext "METEOR MAKES NEW CRYSTITE DEPOSIT." appears only in Tournament. | A8 | [DIS] `$7CA7`, `$7DB3`; `events.md` B.3 | H |

### 1.2 Production, energy, spoilage

| Value | Platform | Source | Conf. |
|---|---|---|---|
| Base production (EBPC) = the deposit level, 0..4 | A8 | [DIS] `calcPlotProdWithEcos $4D7A`, [RE] | H |
| **The learning-curve bonus (+1 per 3 crystite plots) and the adjacency bonus (+1) apply** to crystite, as for any good. The same routine runs for every type. [C64M] tips recommend grouping crystite plots for this reason. | A8 / C64 | [DIS] `$4DA0–$4DE2`, [C64M] | H |
| Then the Tournament variation is applied: amplitude 2, which gives **±4**: 0 → 37.7%, ±1 → 24.3%, ±2 → 6.2%, ±3 → 0.56%, ±4 → 0.013%. The result is clamped to 0..8. | A8 | [DIS] `$4CF9` (`calcBinomial(prod, level)`) | H |
| Consequence: a crystite M.U.L.E. on a NONE plot can still produce (bonuses + variation). | A8 | [DIS] (generic formula) | H |
| A crystite M.U.L.E. needs 1 Energy. A shortage zeroes one random exploitation per missing unit. | A8 | [RE] | H |
| Spoilage: everything **above 50** units is lost. There is no usage. | A8 / C64 | [RE], [C64M] | H |
| Not allowed on the river: "NO MINING IN THE RIVER VALLEY." | A8 | [DIS] `$6BD6` | H |

### 1.3 Store and auction

| Value | Platform | Source | Conf. |
|---|---|---|---|
| Price P = **50 + rand(0..99)**, i.e. 50..149, re-drawn every round before the auctions. Supply and demand do not affect it. [C64M] says "$50 to $150". | A8 / C64 | [DIS] `$3368–$3375`, [C64M] | H |
| The store buys at P rounded down to a multiple of 4 and sells at buy + **140**. The price step is $4 per line step (35 steps × $4). | A8 | [RE], [DIS] `setPriceStartEnd` | H |
| Store crystite stock: starts at 0 and is **set to 0 after every crystite auction** ("All crystite found is shipped off planet"). So the store never offers crystite for sale and only absorbs sellers. | A8 / C64 | [DIS] `$4823`, [C64M] | H |
| Auction order: **Smithore, Crystite, Food, Energy**. The crystite auction runs only if some player holds or produced crystite, or the store has some, so it never runs in Standard. | A8 | [DIS] `$4817–$482F`, `goodAuction $97CA` | H |
| Declare: auto-Seller if you hold ≥ 1 unit, otherwise Buyer. There is no critical level. | A8 | [RE] | H |
| After the auction, P = the average traded price, but it is overwritten by the random draw next round. Goods in the Status Summary are valued at the current P. | A8 | [RE], [DIS] | H |
| Score: a plot with a crystite M.U.L.E. = 500 + 100 (outfit) + 35. Crystite outfit costs $100. | A8 | [RE] | H |
| Pirates (Tournament): **all players' crystite and this round's crystite production → 0**. Store smithore is *not* touched in Tournament. Max 2 per game. | A8 | [DIS] `$7710`; `events.md` B.3 | H |
| Planetquake halves crystite production too. Mining-M.U.L.E. repair events count crystite M.U.L.E.s. | A8 | `events.md` | H |

## 2. Assay office (human)

| Value | Platform | Source | Conf. |
|---|---|---|---|
| Procedure: enter the assay building, which shows **"GET SOIL SAMPLE THEN COME BACK."** Walk to **any** plot (owned, unowned, or someone else's; ownership is not checked for assay) and press the button at the plot centre. That shows **"SAMPLE READY TO RETURN TO OFFICE"**. Re-enter the assay office to see the result. | A8 / C64 | [DIS] `$690A–$691D`, `$6B6F–$6BA3`; [C64M] | H |
| Entering the assay office without a sample (after the request) shows **"NEED SOIL SAMPLE"**. Trying a second plot on the same trip shows **"1 PLOT PER TRIP"**. | A8 | [DIS] `$68FF`, `$6B8A` | H |
| Result message: `"    NO" / "   LOW" / "  MEDIUM" / "   HIGH"` + `" CRYSTITE|   FOUND IN PLOT."`. A level-4 (meteorite) plot is displayed as **HIGH** (`if A>=3 → 3`), while its true value 4 is kept internally. | A8 | [DIS] `crystiteFound $69A7`, strings `$3D53–$3D72` | H |
| ⚠ [FN] says assay reports 4 for a meteorite plot. The code displays HIGH. | — | [FN] vs [DIS] | contradiction |
| ⚠ A sample taken on a **river** plot reads −1, and the clamp (an unsigned compare) shows **HIGH**. This is probably an original bug and is not verified in an emulator. **Recommended: report NO.** | A8 | [DIS] inference | M |
| No map marker: the result is only the text message. The map shows crystite only through the production dots of an installed crystite M.U.L.E. ("EBPC shown with points"). | A8 | [DIS] (the known map is used only by the AI), [RE] | M |
| No "AT NEXT AUCTION" text for assay. That string belongs to the land office: "LAND WILL BE SOLD AT NEXT AUCTION". | A8 | [DIS] `$3D8D` | H |
| Time: the turn timer keeps running during an assay. Only the land office stops it. [RE] estimates **~5 PTU** for the assay action itself plus walking time, ~9–27 PTU in total. | A8 | [DIS] (only the land office sets `C4=$FA`), [RE] | M |
| Computer assay: Tournament only. It is skipped once **≥ 3 HIGH** plots are known. It scans its own plots first, then free plots. It skips river plots, known plots, and 7/8 of candidates (takes one with 1/8 chance), and prefers the highest deduced value. Cost: **10 + 2 × distance PTU**. It stops when fewer than 22 PTU are left. After each assay it deduces the diamonds around a 2 or 3 (`expandKnownCrystite`). For humans, no deduction is made. Computers also learn the real level from installed crystite M.U.L.E.s and from meteorites. | A8 | [DIS] `$3868–$38E1`, `$3665`; [RE] | H |

## 3. Collusion

### 3.1 Goods auctions (`sub_9926`, `sub_91EA`, `sub_92B9`, `animAuctionOrCollusionOver2 $952D`)

| Value | Platform | Source | Conf. |
|---|---|---|---|
| **Tournament only**: `sub_9926` returns immediately unless `level == 2`. | A8 | [DIS] `$9926` | H |
| Detection runs **every jiffy** during trading (VBI handler `v04 $9BE6`) while no collusion is active. | A8 | [DIS] | H |
| Trigger: the stick buttons of **≥ 2 players** are pressed (a release → press edge) **within a 10-jiffy window** (`byte_96 = 10`, decremented per jiffy). The players who pressed must include **at least one Buyer and at least one Seller**. Each press then has a 100-jiffy cooldown (`$E8,X = −100`). | A8 | [DIS] `$992E–$9990` | M (uncommented code, flags inferred) |
| Computers can never collude: their button state is hard-wired to "not pressed". | A8 | [DIS] `$5C29–$5C2D` | H |
| [C64M]: "two or more players push their joystick buttons at exactly the same time … you may even have one person push BOTH buttons". Keyboard players press both of their keys. | C64 | [C64M] | H |
| ⚠ [FN]: "press within the same ATU, then trade for 10 ATU". **Both values are wrong** against the code: the window is 10 jiffies and the length is 50 ATU. | — | [FN] vs [DIS] | contradiction |
| Start: the message **"COLLUSION"** flashes 3 times (20 jiffies on + 20 off, about 120 jiffies). The background changes colour (`COLOR4 = $48`; "pink" in [C64M]). Players who did not press are frozen (`B309 = 1`) and dimmed. **The store is removed** (store lines hidden, treated as having no stock). | A8 / C64 | [DIS] `$91F1–$92A6`, [C64M] | H (message, colour) / M (store flag meaning) |
| Length: a separate **collusion timer = 50 ATU** (`D3 = $32`). The remaining main timer is saved first. At the Tournament ATU (25 jiffies, 6 when nobody pushes) that is 1250 jiffies ≈ 20.8 s, or as little as ≈ 5 s if everyone is idle. | A8 | [DIS] `$9230`, `$929A` | H (50) / M (seconds) |
| Only the colluders trade, with each other. Trading itself works as in a normal auction. | A8 / C64 | [C64M], [DIS] | H |
| End: when the collusion timer runs out, **"COLLUSION IS OVER"** shows, followed by a 50-jiffy wait. Frozen flags, store and colours are restored, the main timer resumes from its saved value, and the regular auction continues. Another collusion can start later in the same auction. | A8 | [DIS] `$A284–$A291`, `$952D–$954B`, `$92B9` | H |

### 3.2 Land auctions

| Value | Platform | Source | Conf. |
|---|---|---|---|
| [C64M]/[AMAN]: the **Seller** presses the button to start the collusion timer. The leftmost Buyer is highlighted and the others fade. Each further press cycles to the next Buyer on the right. The Seller moves the asking price and the chosen Buyer moves the bid. **As soon as the Buyer meets the price, he gets the land.** When the timer expires, the normal auction resumes. | C64 / A8 manual | [C64M] | L (I did not locate this path in the code: colony land auctions make every player a Buyer, so `sub_9926` cannot fire) |

## 4. Tournament vs Standard: everything else

| Item | Tournament | Standard | Source | Conf. |
|---|---|---|---|---|
| Rounds | 12 | 12 | [DIS] `$45DC` | H |
| Land-grant cursor (CTU) | **3 BTU** | 4 BTU | [DIS] `levelsCursorWait $4721` | H |
| ATU (auction tick) | **25** (idle ÷4 → 6) | 30 (7) | [DIS] `$471E`, [FN] measured 25 jiffies | H |
| PTU (development) | 7 BTU (species ±2) | same | [DIS] `$45CC–$46F9` | H |
| ⚠ [C64M] "You also get less time during the Development phase" | — | — | [C64M] vs [DIS] | contradiction: the code has no level modifier, so less time can only come from a food shortage |
| Human start money | species (Flapper 1600 / Humanoid 600 / others 1000) | same | [DIS] | H |
| Computer start money | **$1200** | $1000 | [DIS] `$46FC–$470E`, [C64M] "extra $200" | H |
| Player start goods | 4 Food, 2 Energy, 0 Smithore/Crystite | same | [DIS] `$4552–$456B` | H |
| Store start stock | 8 Food, 8 Energy, 8 Smithore, **0 Crystite**, 14 M.U.L.E.s | same | [DIS] `$458A–$4597` | H |
| Start prices | Food 30, Energy 25, Smithore 50, Crystite 100, M.U.L.E. 100 | same (Crystite unused) | [RE] | H |
| Production variation | amplitude 2, **±4** | amplitude 1, ±2 | [DIS] `$4CF9` | H |
| Smithore price noise | +7 × binomial(amp 2), ±28 | same (Standard is bumped to amp 2) | [DIS] `$3331` | H |
| Colony land auctions per round | Normal(1, amp 2): 0 → 31.1%, 1 → 37.7%, 2 → 24.3%, 3 → 6.2%, 4 → 0.56%, 5 → 0.01% (capped by free plots) | 0/1/2/3 = 16.2/67.7/16.1/0.1% | [DIS] `$47B8`, [RE] | H |
| Player land sales and their auction | yes | yes | [DIS] `landsAuctionByPlayers` | H |
| Critical level | only computers are blocked | same | [DIS] `$93EF` | H |
| Crystite, assay office, collusion | **yes** | no. The two extra town buildings are drawn blank. | [DIS] `$4644–$46BF`, `$35AD`, `$3868`, [EMU] | H |
| Colony events | same bag and odds. Pirates take Crystite (not Smithore or the store's Smithore). The meteorite subtext is shown. | Pirates take Smithore | `events.md`, [DIS] `$7710`, `$7CA7` | H |
| Player events | same | same | `events.md` | H |
| Wampus | colour depends on level (`levelsWampusColor`) | — | [DIS] `$8BA9` | H (values not decoded) |

### 4.1 Computer AI: Tournament-only differences

| Behaviour | Source | Conf. |
|---|---|---|
| Considers Crystite exploitations (on known values only) in grant, auction and turn ratings. Land-auction crystite weight = 12.5 + round/2. | [DIS] `$35AB`, `$4D8C`; [RE] | H |
| Assay phase (§2) | [DIS] `$3868` | H |
| **Buy the store out** (AI8): in a Food/Energy auction with only Buyers, not in the last round, and store stock ≤ 20, a computer whose need is smaller than the store stock raises its order to the whole store stock, if price × stock < its investable cash. | [DIS] `auctionBuySellAi8 $AF00`, called at `$9FAA` only in Tournament | H |
| **Hold back small surpluses**: a computer Seller with a Food surplus < 6 or Energy surplus < 9, when the start price is ≤ 80 and it has enough cash, sells only `rand(0..surplus)`. | [DIS] `$AA62–$AA9A` | H |
| Crystite trading: holding crystite with the price below 100, it sells only the excess over 50 or what it needs to reach $1000 cash. Holding none, it buys only when the price is < 86 and its investable cash is ≥ 1100: (cash − 800) / price units, max 25. (`minPriceSellSmithoreCrystite` 50/100, `minPriceBuy…` 46/86.) | [DIS] `$AAA4–$AB59`, `$AB75` | M |
| "Computers are smarter" ([C64M] "hard pressed to beat him"): in code this means only the $200 bonus plus the rows above. No other level-dependent AI branch exists (all `level` checks enumerated). | [DIS] grep of all `level` reads | H |

## 5. Multiple human players

| Value | Platform | Source | Conf. |
|---|---|---|---|
| 1–4 humans. The remaining seats are computers, which are always Mechtrons. | A8 / C64 | [C64M], [DIS] | H |
| **C64 title screen**: **F3** cycles Beginner/Standard/Tournament. **F5** cycles the number of humans (4, 3, 2, 1, then **COMPUTER DEMO** = 0 humans; [EMU] order). **F7** starts. **F1** pauses or resumes (during the cartoon or species selection it restarts the cartoon). Any joystick button skips the intro cartoon. | C64 | [C64M], [EMU] | H |
| **Atari**: the level and player count are chosen with the console keys (START begins). On restart, OPTION cycles the level ([DIS] `$2F62`). [FN]'s boot script presses OPTION ×2 and SELECT ×3 to reach "Tournament + 1 planeteer". The exact key-to-function mapping on the first title is not verified. | A8 | [DIS] `sub_2F30`, [FN] capture | M |
| Joining and the mix: the game cycles the 4 colours, and **whoever presses his button first** takes that colour, then picks a species with the stick and button. Once all humans have chosen, "the computer will cycle through the remaining colors for the other players" (computers fill the rest). So humans take the first colours in press order. | A8 / C64 | [C64M], [AMAN] | H |
| Each seat is bound to a controller: `playersAi[i]` = −1 for a computer, 0..7 for a paddle (Atari paddles supported: "PLEASE CENTER YOUR PADDLE"), 8..11 for joystick ports 1–4. | A8 | [DIS] `playersAi $0900`, input handler `$5C26` | H |
| **C64 controls**: at least one joystick. With ≥ 2 players, **up to two players can use the keyboard** in the action phases. Left player: **Q** = up, **C=** = down. Right player: **↑ (up-arrow)** = up, **=** = down. **Both keys together = button.** In species selection, up and down rotate and both keys select. In development, a keyboard player **uses any free joystick**. | C64 | [C64M] | H |
| Land grant: **all players at once**. The cursor sweeps plot by plot and every player presses **his own button** to claim the plot under it (one claim each). On a tie the lower-ranked player wins. Keyboard players use either key. | A8 / C64 | [C64M], `mechanics.md` §10 | H |
| Land and goods auctions: **all players at once**, each moving his own character with his own stick (up and down). | A8 / C64 | [C64M], [DIS] | H |
| Development: **one player at a time**, in rank order (reversed when the store has ≤ 7 M.U.L.E.s). The turn starts with the player's map plot flashing and **"PRESS YOUR STICK BUTTON TO START"**. The personal event text scrolls before that. | A8 / C64 | [DIS] strings, [EMU] | H |
| A computer's turn shows "THE COMPUTER IS TAKING HIS TURN". On C64, a joystick button speeds up the computer players. | A8 / C64 | [DIS] strings, [C64M] | H (string) / M (when shown) |
| Shared hand-over screens: **"PRESS ALL PLAYER BUTTONS TO GO ON."** after status screens, summaries and events. Only humans must press, and each one is recorded as he presses. The wait ends when every human has pressed, **or after a timeout of 255 × 4 = 1020 jiffies (~17 s)** (`byte_C3` counts down in the VBI). | A8 | [DIS] `waitPlayersButtons $308A`, `$5C8F` | M |
| ⚠ [FN]: "the original has no timeouts on its button waits". The code shows a 1020-jiffy countdown on this wait. | — | [FN] vs [DIS] | contradiction, unverified on the emulator |
| Land auction: the plot blinks and the auction starts when every human has pressed, or after 255 BTU. | A8 | [FN] TIMING (measured) | H |
| **COMPUTER DEMO** (0 humans): all 4 seats are computers. Button waits auto-advance after 2 × 255 jiffies (~8.5 s). At game end the program jumps back to `start` and loops forever. | A8 / C64 | [DIS] `$308E–$309D`, `$484F–$4855`; [C64M] | H |
| Restart: OPTION + START during a "press all buttons" wait restarts the game ("* PRESS OPTION & START TO RESTART *"). | A8 | [DIS] `$30D2–$30DE` | H |

## Open points

- Land-auction collusion: the code path was not found. Only the manual describes it.
- River-plot assay showing HIGH: probably a bug. Confirm in an emulator before deciding.
- The 17 s timeout on "PRESS ALL PLAYER BUTTONS": confirm in an emulator. Does the C64 port keep it?
- The exact Atari title-screen key mapping.
- Collusion length in real seconds on the C64 (PAL at 50 Hz, about 20% slower).
