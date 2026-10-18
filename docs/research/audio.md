# M.U.L.E. (Ozark Softscape / EA, 1983) — sound usage research

## Sources consulted
- HVSC STIL.txt (High Voltage SID Collection, mirror hafnium.prg.dtu.dk) — entry `/GAMES/M-R/M_U_L_E.sid`.
- HVSC Songlengths.md5 — sub-tune lengths for the same file.
- C64-Wiki, article "M.U.L.E." (https://www.c64-wiki.com/wiki/M.U.L.E.).
- Wikipedia, "M.U.L.E." (https://en.wikipedia.org/wiki/M.U.L.E.).
- Kroah's reverse-engineering page (http://bringerp.free.fr/RE/Mule/reverseEngineering.php5): HTTPS refused; fetched over
  plain HTTP. It documents game rules, formulas and event texts (pirates, planetquake, pest, sunspot, meteorite,
  radiation, fire, acid rain, personal events), but has essentially **nothing about sound**.
- Longplay video descriptions: not reachable for detailed sound mapping (searches did not return sound-specific pages).

## Facts found (verified)
- Composer of the title music: **Roy Glover** (Ozark Softscape's "hardware guru"; C64-Wiki photo caption, HVSC remakes
  credit "M.U.L.E., Tune #1 — Roy Glover").
- HVSC rip `/GAMES/M-R/M_U_L_E.sid` holds **3 sub-tunes**: #1 = 1:09 (the main theme), #2 = 0:41
  (STIL: "Almost identical to tune #1" — a shortened version), #3 = 0:03 (a short jingle/stinger).
- C64-Wiki: "groovy intro music with the typical **stomping beat** and the jolly **fanfare**"; the intro music also
  **appears in-game in the status/overview screen after each round**.
- C64-Wiki: "**short jingles and fanfares** during the game" — named as quotes of "Charge!" (the bugle call) and the
  "Song of the Volga Boatmen" — **highlight positive or negative events and the end of each player's turn**.
- C64-Wiki: "a variety of strange SFX like the **sizzling of acid clouds, earthquakes or comet (meteor) impacts**".
- Wikipedia: random events include runaway M.U.L.E.s, sunspot activity, theft by space pirates and meteorites; the
  theme was so memorable Will Wright reused it as an Easter egg in Spore; Leo Laporte called it the "most captivating
  musical come-on I've ever heard".

## From memory of the game (not source-verified, treat as approximate)
- Title: full theme loops over the title/options screen, with the ship and the walking M.U.L.E. animation.
- Land grant: no music; a ticking/blip sound as the selection cursor steps across plots, a confirming tone when a
  player claims a plot.
- Development: no background music; footstep-like ticks while walking, a bray when the M.U.L.E. is bought/outfitted,
  sounds at the store corrals, a confirmation when installing, a "runaway" sound when the M.U.L.E. bolts; a warning
  as the turn timer runs low; pub = gambling payout jingle ending the turn.
- Production/events: short stingers for good vs bad events (the "Charge!" / "Volga Boatmen" style quotes) and
  dedicated SFX for planetquake, acid rain, meteor, fire, pirates, radiation, pest, sunspot.
- Auctions: no melody; a rhythmic tick as the clock bar runs, blips for each unit traded, a closing sound when
  "the auction is over". Declaring buyer/seller uses a short tone.
- Colony ship: landing/leaving sweep at the start and the end (round 12 = ship returns), then the end-game rating.

## Copyright decision for R.U.C.
The theme (Roy Glover) and the jingle quotes are copyrighted (or, for Charge!/Volga Boatmen, public-domain tunes that
we still avoid to keep a distinct identity). R.U.C. ships **original compositions** only: new melodies, new chord
progressions, written from scratch in the same *style* (C64 3-voice: pulse lead with PWM, pulse arpeggios,
triangle bass, noise drums; bluegrass-meets-space-western stomp). No transcription, no .sid data, no samples.
Sound effects imitate only generic effect types (blips, warbles, noise bursts, sweeps).

## Mapping used in the module
| Game moment | R.U.C. sound |
|---|---|
| Title / options | music('title') — stomping D-major theme, banjo-roll arpeggios |
| Land grant | music('land') sparse, plus play('cursor_tick') / play('claim') |
| Development | music('development') very quiet bed (original had none; keep it unobtrusive) |
| Walking / RUC | walk_step, ruc_bray, ruc_flee, enter_shop, outfit, install |
| Pub | pub_win |
| Turn timer | time_warning, countdown, time_up, turn_start |
| Production events | event_good, event_bad, pirates, quake, fire, meteor, radiation, pest, acid_rain, sunspot |
| Auctions | music('auction'), auction_tick, auction_trade_unit, declare, auction_over |
| Status between rounds | music('status') (the original reused the theme here) |
| Ship / end | ship_land, ship_leave, music('end_success' / 'end_failure') |
