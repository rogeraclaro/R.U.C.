# M.U.L.E. (Ozark/EA 1983): random events, as the original code implements them

## Sources and confidence

| Tag | Source | What it is | Trust |
|---|---|---|---|
| **[A8-ASM]** | http://bringerp.free.fr/RE/Mule/downloads.php5 → "MULE - Disassembled Memory.zip" (P. Bringer, 2006) | IDA disassembly of an Atari 8-bit memory snapshot of the 1983 EA disk, with French annotations. The strings and tables quoted below were decoded from the raw ATASCII bytes. The logic below was read from the raw 6502 instructions, not only from the comments. | **Highest. This is the primary source.** |
| [C64-IDX] | https://github.com/puzzud/mule-analytics (src/graph_mule_game.py) | Python tool that parses game-history files from a C64-based client. It holds the turn-event text table indexed by event id. | High for the C64 text and order |
| [C64-WIKI] | https://www.c64-wiki.com/wiki/M.U.L.E. | Event list, colony-event probabilities, rating texts | Medium (secondary; mostly agrees with [A8-ASM]) |
| [MANUAL] | https://project64.c64.org/Games/MULE10.TXT (C64 manual text) and https://www.mocagh.org/ea/mule-manual.pdf | Official manual | High for design intent, but simplified |
| [FUJI] | https://github.com/FujiNetWIFI/fujinet-manuals (mule/players-manual/content/events.yaml and wiki/MULE-Players-Guide-Atari-8-bit.md) | Modern Go remake (FujiNet Multiplayer Edition) | Medium. Its amounts match [A8-ASM]. Its texts and some rules do **not** match the 1983 strings. |
| [MU3] | https://github.com/crankywilson/mu3 (server/Game.cs) | Fan remake | Low (its formulas are invented). Use it only as corroboration. |

Rule used in this report: when sources disagree, **[A8-ASM] wins**. The C64 and Atari versions share the same event table (see §A.6), so the Atari logic is very likely identical on the C64. That is unverified at the code level: mark C64 as *probable*.

---

## A) Personal ("turn") events

### A.1 When and how often (A8-ASM, `playerEvent` @ $8131, called @ $66CB)

- The check runs **at the start of each player's development turn**, right after "PRESS YOUR STICK BUTTON TO START". It runs for human and computer players alike, in every round 1–12.
- The roll is `A = random[0..79]`. If `A >= 22`, there is no event. So the per-turn trigger chance is **22/80 = 27.5%**. The manual says "25% chance … 21 different events", which is a rounded or simplified figure.
- The candidate is `X = A` (0..21). The code then searches downward with wrap-around (21 → 0 → 21 …) for at most **20 tries**. A candidate is rejected and the search moves on (X−−, try counter −1) if any of these hold:
  - `turnEventsHappened[X] != 0`, meaning the event already happened. **Each event can occur only once per game, to anyone.** Exceptions are below.
  - The event is **bad** (quality < 0) and the current player is **last or second-to-last** (`ordersPlayer[3]` / `[2]`).
  - The event is **good** (quality > 0) and the current player is **first** (`ordersPlayer[0]`).
  - The event's precondition fails (see the table).
  - If all 20 tries fail, there is no event this turn.
- Ranking comes from the last Status Summary sort by total score. Ties are broken randomly.
- **Starving override:** once an event X ≠ 0 has been chosen, the code checks whether the player is **not first** and has **0 Food**. If so, the event is replaced by **#00 (package: +3 Food, +2 Energy)**. This replacement ignores whether #00 already happened, so #00 can repeat. This is the "one exception" that C64-WIKI mentions.
- **Can't afford it means nothing happens:** for a money penalty, if `cash − amount < 0` the routine aborts silently (`PLA/PLA/RTS` @ $8261). There is no message, no charge, and the event is not marked as used. Cash never goes negative.
- The used-flag is set (`INC turnEventsHappened,X`) only when the message is shown.
- Bug noted by the disassembler: `turnEventsHappened` has only 21 bytes reserved for 22 events. The flag for #21 overlaps `outfitsPriceH[0]` ($B35F). As a result, #21 ("extra plot") may not behave as once-per-game. The side effect is unverified, so **do not replicate it**.

### A.2 Money formula (A8-ASM, `calcCashQualityPlayerEvent` @ $8285)

```
amount = |quality| * 25 * (round / 4 + 1)        // integer division, round = 1..12
```
- Multiplier m = 25 × (round/4 + 1): **$25 in rounds 1–3, $50 in rounds 4–7, $75 in rounds 8–11, $100 in round 12**.
- Per-unit events show "$X EACH", where X = |q|·m. The total is X × count.
- `quality` table @ $8334 (sign: + is good, − is bad): `1, 1, -1, 2, -3, 4, -2, -1, 2, 4, 8, 2, 3, 6, 4, 2, -6, -4, -4, -4, -1, 1`

### A.3 The 22 events: exact 1983 text (decoded from Atari RAM @ $834A…), index = internal id

`$` is followed by the computed number. Two spaces after a period are in the original. Display is uppercase.

| # | G/B | Exact text (Atari 8-bit) | Effect | Precondition (else the search moves on) | Amount r1-3 / 4-7 / 8-11 / 12 |
|---|---|---|---|---|---|
| 00 | Good | `YOU JUST RECEIVED A PACKAGE FROM YOUR HOME-WORLD RELATIVES CONTAINING 3 FOOD AND 2 ENERGY UNITS.` | +3 Food, +2 Energy | none (also forced by the starving override) | – |
| 01 | Good | `A WANDERING SPACE TRAVELER REPAID YOUR HOSPITALITY BY LEAVING TWO BARS OF SMITHORE.` | +2 Smithore | none | – |
| 02 | Bad | `MISCHIEVOUS GLAC-ELVES BROKE INTO YOUR STORAGE SHED AND STOLE HALF YOUR FOOD.` | Food = Food / 2 (LSR, floor) | none | – |
| 03 | Good | `YOUR MULE WAS JUDGED "BEST BUILT" AT THE COLONY FAIR.  YOU WON $` + n + `.` | +2·m | owns ≥1 installed MULE (`playersNbExps≠0`) | 50/100/150/200 |
| 04 | Bad | `ONE OF YOUR MULES LOST A BOLT.  REPAIRS COST YOU $` n `.` | −3·m | owns ≥1 installed MULE | 75/150/225/300 |
| 05 | Good | `YOUR MULE WON THE COLONY TAP-DANCING CONTEST.  YOU COLLECTED $` n `.` | +4·m | owns ≥1 installed MULE | 100/200/300/400 |
| 06 | Bad | `YOUR MINING MULES HAVE DETERIORATED FROM HEAVY USE AND COST $` x ` EACH TO REPAIR.  THE TOTAL COST IS $` t `.` | −2·m per Smithore+Crystite MULE | ≥1 mining MULE | 50/100/150/200 each |
| 07 | Bad | `THE SOLAR COLLECTORS ON YOUR ENERGY MULES ARE DIRTY.  CLEANING COST YOU $` x ` EACH FOR A TOTAL OF $` t `.` | −1·m per Energy MULE | ≥1 energy MULE | 25/50/75/100 each |
| 08 | Good | `THE COLONY COUNCIL FOR AGRICULTURE AWARDED YOU $` x ` FOR EACH FOOD PLOT YOU HAVE DEVELOPED.  THE TOTAL GRANT IS $` t `.` | +2·m per Food MULE | ≥1 food MULE | 50/100/150/200 each |
| 09 | Good | `THE COLONY AWARDED YOU $` n ` FOR STOPPING THE WART WORM INFESTATION.` | +4·m | – | 100/200/300/400 |
| 10 | Good | `THE MUSEUM BOUGHT YOUR ANTIQUE PERSONAL COMPUTER FOR $` n `.` | +8·m | – | 200/400/600/800 |
| 11 | Good | `YOU WON THE COLONY SWAMP EEL EATING CONTEST AND COLLECTED $` n `. (YUCK!)` | +2·m | – | 50/100/150/200 |
| 12 | Good | `A CHARITY FROM YOUR HOME-WORLD TOOK PITY ON YOU AND SENT $` n `.` | +3·m | – | 75/150/225/300 |
| 13 | Good | `YOUR OFFWORLD INVESTMENTS IN ARTIFICIAL DUMBNESS PAID $` n ` IN DIVIDENDS.` | +6·m | – | 150/300/450/600 |
| 14 | Good | `A DISTANT RELATIVE DIED AND LEFT YOU A VAST FORTUNE.  BUT AFTER TAXES YOU ONLY GOT $` n `.` | +4·m | – | 100/200/300/400 |
| 15 | Good | `YOU FOUND A DEAD MOOSE RAT AND SOLD THE HIDE FOR $` n `.` | +2·m | – | 50/100/150/200 |
| 16 | Bad | `YOUR SPACE GYPSY INLAWS MADE A MESS OF THE TOWN.  IT COST YOU $` n ` TO CLEAN IT UP.` | −6·m | cash ≥ amount | 150/300/450/600 |
| 17 | Bad | `FLYING CAT-BUGS ATE THE ROOF OFF YOUR HOUSE.  REPAIRS COST $` n `.` | −4·m | cash ≥ amount | 100/200/300/400 |
| 18 | Bad | `YOU LOST $` n ` BETTING ON THE TWO-LEGGED KAZINGA RACES.` | −4·m | cash ≥ amount | 100/200/300/400 |
| 19 | Bad | `YOUR CHILD WAS BITTEN BY A BAT LIZARD AND THE HOSPITAL BILL COST YOU $` n `.` | −4·m | cash ≥ amount | 100/200/300/400 |
| 20 | Bad | `YOU LOST A PLOT OF LAND BECAUSE THE CLAIM WAS NOT RECORDED.` | Loses the owned plot with the **highest map index**: scan from 44 down to 0, row-major 9×5, so the plot nearest the bottom-right. Any MULE on it is lost too (owner = none, exp = 0). | player has ≥1 installed MULE (`playersNbExps≠0`) | – |
| 21 | Good | `YOU RECEIVED AN EXTRA PLOT OF LAND TO ENCOURAGE COLONY DEVELOPMENT.` | A random free plot becomes the player's | ≥1 free plot | – |

Every money penalty (04, 06, 07, 16–19) is also cancelled if the player can't pay (§A.1).

Totals: 13 good (00, 01, 03, 05, 08–15, 21) and 9 bad (02, 04, 06, 07, 16–20).

### A.4 Who gets what (A8-ASM, confirmed)
- **First place never gets a good event.**
- **The last two players (3rd and 4th) never get a bad event.** The manual says only "the losing player will never receive a bad luck event", which understates the rule.
- So 2nd place can get either kind, 1st only bad, and 3rd/4th only good.

### A.5 Where other sources disagree with the 1983 code
- [FUJI] changed texts ("M.U.L.E.", "(Yecch!)", "must be repaired. the cost is $…", "in-laws", single-total messages). Use the uppercase 1983 strings above for a faithful remake.
- [FUJI] says the lost plot is "the plot you got most recently". The 1983 code picks the highest map index.
- [FUJI] says "money never drops below zero". The 1983 code cancels the event instead.
- [MU3] uses random or month-based amounts and a "glac-elves needs food" rule. These are not original.
- [C64-WIKI] and [MANUAL] give 25%. The code gives 27.5%.

### A.6 C64 parity
[C64-IDX] lists the same 22 texts in the **same index order** (00 package … 20 lost plot, 21 extra plot), with the same good/bad split. The C64 texts are identical, with tiny transcription differences such as "(YUCK!)." Logic and amounts are *probably* identical (confidence medium-high, not code-verified).

---

## B) Planetary / colony ("round") events (A8-ASM, `roundEvent` @ $7B28)

### B.1 When
- Main loop (@ $478A): land grant → land auction → player turns (personal events happen here) → `calcPlotsProdWithMissingEnergyMalus` (production computed) → **if round < last: `roundEvent`; else "THE SHIP IS BACK!" plus ship landing animation**. Then the Status Summary and the goods auctions follow.
- So there is **no colony event in the last round (12)**. Rounds 1–11 always draw one.
- Events that **change production before the production animation is shown** ("before production" to the player): **Planetquake, Sunspot, Acid Rain, Meteorite, Radiation**.
- Events that show the production first and then strike ("after production"): **Pest Attack, Pirate Ship, Fire in Store**.

### B.2 Probability (a bag without replacement)
- Initial ticket counts (`roundEventsProbInit` @ $7B7D, copied at game start, **the same for Beginner, Standard and Tournament**):

| id | Event | Tickets = max per game | Initial p |
|---|---|---|---|
| 0 | Pest Attack | 3 | 3/20 = 15% |
| 1 | Pirate Ship | 2 | 10% |
| 2 | Acid Rain Storm | 3 | 15% |
| 3 | Planetquake | 3 | 15% |
| 4 | Sunspot Activity | 3 | 15% |
| 5 | Meteorite Strike | 2 | 10% |
| 6 | Radiation | 2 | 10% |
| 7 | Fire in Store | 2 | 10% |

- Each round, one ticket is drawn uniformly from all remaining tickets and that event's count is decremented. The chance is therefore always remaining/total-remaining.
- The ticket is consumed even if the event then finds no valid target (Pest, Radiation). In that case the round is quiet: the production is shown and nothing else happens.
- There are 20 tickets and at most 11 draws, so the bag never empties. This matches "No more than 2 Pirate Ships" in the [MANUAL].

### B.3 Each event: exact 1983 on-screen text (title + subtext) and effect

`MAP_PROD` is the per-plot production for this round. Exp types: 1 = Food, 2 = Energy, 3 = Smithore, 4 = Crystite.

1. **PEST ATTACK** (title only, no subtext). *After production.*
   - Picks a random plot, then scans downward (wrapping) for the first plot that has a **Food MULE with production > 0** and whose **owner is 1st or 2nd place** (owners in 3rd or 4th are skipped).
   - That plot's food production is eaten down to **0**.
   - If no plot qualifies, nothing happens.
2. **PIRATE SHIP** / `PIRATES TAKE ALL ` + good name + `!`. *After production.*
   - **Standard and Beginner (level ≠ 2): SMITHORE.** All 4 players' smithore is set to 0, **the store's smithore is set to 0**, and smithore production on the map is zeroed.
   - **Tournament (level 2): CRYSTITE.** All players' crystite is set to 0 and crystite production is zeroed. The store's crystite is emptied every round anyway.
   - At most 2 per game.
3. **ACID RAIN STORM** / `FOOD OUTPUT UP,` `ENERGY REDUCED.` *Before production.*
   - A random map row (0–4) is the cloud row. On that row, Food gets +3 and Energy −1.
   - Then on **every** plot, the cloud row included, Food gets +1 and Energy −1.
   - Each plot is clamped to 0..8.
   - **Net effect: cloud row Food +4, Energy −2; all other plots Food +1, Energy −1.**
4. **PLANETQUAKE** / `MINING PRODUCTION` `HALF OF NORMAL.` *Before production.*
   - Production of every Smithore and Crystite plot is halved (`LSR`, floor).
   - Also, with **50% chance** (random byte sign), a random mountain slides one plot left or right. The source plot loses one mountain level (if it reaches 1 it becomes plain). The destination plot gains one (a plain becomes mountain).
   - **Any MULE on the source or destination plot is destroyed.**
5. **SUNSPOT ACTIVITY** / `ENERGY OUTPUT IS` `INCREASED`. *Before production.* Every Energy plot gets **+3**, capped at 8.
6. **METEORITE STRIKE** / `METEOR MAKES NEW` `CRYSTITE DEPOSIT.`
   - The subtext is printed **only in Tournament (level 2)**. The effect happens in every mode.
   - *Before production.*
   - A random plot that is not town or river and has crystite < 3 has its crystite set to **4**. On the internal scale, the assay names cover NO/LOW/MEDIUM/HIGH = 0..3, so 4 is above the normal maximum. The level is also marked as known.
   - **Any MULE on the plot is destroyed** and its production set to 0.
   - The plot may be owned or unowned.
7. **RADIATION** / `MULE GOES CRAZY!`. *Before production.*
   - Picks a random plot, then scans for the first plot with a **MULE owned by the 1st or 2nd place player**.
   - The MULE runs off and is lost (exp = 0).
   - If no plot qualifies, nothing happens.
   - [C64-WIKI] says "player ranked two or three". The code says 1st/2nd.
8. **FIRE IN STORE** / `ALL THE STOCK IN` `THE STORE IS LOST!`. *After production.*
   - The store's Food, Energy and Smithore are set to 0. Players' goods are untouched.
   - Prices then rise through normal supply and demand ([MANUAL]: "the price of products will increase, particularly Smithore if M.U.L.E.s are scarce").
   - New MULEs built at round end need 2 smithore each from store stock (`buildAndCalcPriceMule`), so the fire also stops MULE production unless players sell smithore.

### B.4 Standard vs Tournament
- The probabilities and counts are the same in every mode.
- Differences:
  - Pirates take **Smithore (and the store's smithore)** in Standard/Beginner and **Crystite** in Tournament.
  - The meteorite subtext is shown only in Tournament. Crystite itself only matters in Tournament.
- [FUJI] uses only the Tournament (crystite) behaviour and has invented sentence-style messages ("space pirates have raided the colony…"). Those are not the 1983 strings.
- **Confidence:** Atari is code-verified. C64 is probable (the [MANUAL] states the Standard = smithore / Tournament = crystite rule for the C64).

---

## C) Ship messages, failure messages and the end-game rating (A8-ASM)

### C.1 Ship and round messages (exact strings; `|` = line break)
- Game start (with landing animation): `YOU'RE LANDING ON| THE PLANET IRATA.` then `THE SHIP WILL BE| BACK IN ` + nbRounds + ` MONTHS.`
- Last round, in place of the colony event: `THE SHIP IS BACK!` (ship lands)
- Title strings in the table: `TRANSPORT SHIP`, `PIRATE SHIP`, `STATUS SUMMARY`, `LAND GRANT`, `LAND AUCTION`.
- Status Summary shortage lines: `THE COLONY HAS A SHORTAGE OF` + ` FOOD `/` ENERGY `/` SMITHORE `/` CRYSTITE `/` MULES `; and `THE STORE HAS A SHORTAGE OF SMITHORE FOR MULES!`
- Immediate game over: `THE COLONY FAILED BECAUSE OF A TOTAL LACK OF` + good + `!`
- Wampus: `YOU CAUGHT THE MOUNTAIN WAMPUS!` / `HE GAVE YOU HIS TREASURE CHEST ($n)` / `TO LET HIM GO FREE AGAIN.`
- Pub: `WON $n GAMBLING!`

### C.2 Colony rating (`calcAndDrawScore` @ $6E03, `addMessageSuccess` @ $8D43)

```
rating = FPI( (colonyTotal - 10000) / 20000 )   // Atari OS FP: FDIV $DB28, FPI $D9D2 (rounds to nearest)
if negative -> 0 ; if > 6 -> 6
```
Rounding makes the effective thresholds exact multiples of $20,000. The resulting string is `OVERALL, THE COLONY ` + text + `!`

| Rating | Colony total | Text (exact Atari) |
|---|---|---|
| 0 | < 20,000 | `FAILED... DISMALLY.  THE FEDERATION DEBTORS' PRISON IS YOUR NEXT HOME` |
| 1 | 20,000–39,999 | `FAILED... THE FEDERATION WILL NO LONGER SEND TRADE SHIPS.  YOU ARE ON YOUR OWN` |
| 2 | 40,000–59,999 | `SURVIVED... BARELY.  YOU WILL BE LIVING IN TENTS.  FEW TRADING SHIPS WILL COME YOUR WAY` |
| 3 | 60,000–79,999 | `WAS A SUCCESS.  YOU HAVE MET THE MINIMUM STANDARDS SET BY THE FEDERATION, BUT YOUR LIFE WILL NOT BE EASY` |
| 4 | 80,000–99,999 | `SUCCEEDED.  THE FEDERATION IS PLEASED BY YOUR EFFORTS.  YOU WILL LIVE COMFORTABLY` |
| 5 | 100,000–119,999 | `SUCCEEDED... EXTREMELY WELL.  YOU CAN NOW RETIRE IN ELEGANT ESTATES` |
| 6 | ≥ 120,000 | `DELIGHTED THE FEDERATION WITH YOUR EXCEPTIONAL ACHIEVEMENT.  YOUR RETIREMENT WILL BE LUXURIOUS` (the "S" is the last byte; in the dump it shows as "LUXURIOU" plus a terminator) |

- The 60,000 success line matches the [MANUAL] ("total worth of at least $60,000, or you will all get sent home") and the [C64-WIKI] table. C64-WIKI writes "NEW HOME"; Atari has "NEXT HOME".
- **FIRST FOUNDER** (`animFirstFounder` @ $7000): shown only in round 12 **and** when rating ≥ 3. It goes to the top scorer; ties are broken randomly.
- [FUJI]'s rating texts ("The colony failed. The federation will not be sending another ship…") do **not** match the 1983 game. Do not use them.

---

## Open questions / not verified
- C64 code-level parity: 27.5% trigger, the 20-try search, and the "last two" exclusion are confirmed on Atari only.
- The exact on-screen layout and line breaks of personal messages: the code builds them in a $B700 buffer framed by `  ***  `.
- The side effect of the #21 used-flag overflow bug.
- Whether Beginner mode (6 rounds) calls `roundEvent` the same way. The main loop does not branch on level, so probably yes.
