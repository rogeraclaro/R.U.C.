# R.U.C.

Reinterpretació de **M.U.L.E.** (Dani Bunten, 1983): un jugador contra tres rivals IA (Bran, Vela i Nox), 12 torns,
subhasta contínua en temps real. Fase A ajustada a les regles del M.U.L.E. original de Commodore 64 (joc «Standard» sense
crystite ni subhastes de terra). HTML, CSS i JavaScript vanilla amb Canvas 2D; cap dependència.

## Com obrir-lo

**No hi ha cap pas de compilació.** Tria una de les dues opcions:

- Obre `index.html` directament al navegador (`file://`), o
- serveix la carpeta amb qualsevol servidor estàtic, per exemple `python3 -m http.server` i visita `http://localhost:8000`.

Funciona sense connexió. No hi ha CDN, npm, bundler ni IA en temps d'execució.

## El torn

1. **Adjudicació de terra**: cursa en temps real, una sola passada.
2. **Desenvolupament**, un colon rere l'altre per ordre de patrimoni (del líder a l'últim; al revés si al corral queden 7 RUCs o menys).
   El temps de cada colon depèn del menjar que té a l'inici del seu torn (vegeu més avall).
   Abans del torn de cada colon (humà o IA) hi ha un 27,5 % (22/80) d'**esdeveniment personal**, un dels 22 de l'original; la targeta
   surt abans de l'avís d'inici del torn. El teu torn és **a peu**: vegeu més avall.
3. **Esdeveniment planetari**: un per torn als torns 1–11, tret d'una bossa sense reposició; al torn 12, «La nau ha tornat!». Taques solars,
   pluja àcida, terratrèmol, meteorit i radiació actuen abans de la producció; plaga, pirates i incendi, després de mostrar-la.
4. **Producció i estat**: consum, malbaratament de la reserva i collita nova (pantalla «Estat del torn»).
5. **Subhastes**: smithore → menjar → energia. Cadascuna té una **declaració** cronometrada (comprador / venedor / fora) i després el rol queda fix.
6. **Informe del torn**: la botiga recalcula els preus per oferta i demanda i fabrica RUCs amb el smithore que té (2 per RUC, fins a
   14 al corral, disponibles el torn següent).

Al final, la colònia ha de sumar **60.000 cr** de patrimoni; si no hi arriba, ha fracassat i no hi ha *First Founder* (la classificació es mostra igualment).
Si en acabar un torn no queda cap RUC de menjar (o d'energia) ni cap unitat de menjar (o d'energia) enlloc, la partida s'acaba a l'instant:
«La colònia ha fracassat per una manca total de menjar!» (o «d'energia»).

## Desenvolupament a peu

Abans que comenci el teu torn, un avís de **3 s** ("Comença el torn de...") et dona temps a reaccionar: el RUC i el seu rellotge de
desenvolupament no comencen fins que s'acaba.

El colon apareix al poble (casella central del mapa). Amb les fletxes (o el control tàctil de la dreta del panell) camina en temps real;
el rellotge corre sempre, també mentre camines o estàs parat.

**Temps** ([codi Atari], [C64]): `10 + floor(91 × min(1, menjar / necessitat))` unitats de 28 fotogrames PAL (50,125 Hz). Amb prou menjar,
101 unitats ≈ 56,4 s; sense menjar, 10 unitats ≈ 5,6 s. Es compta el menjar que tens quan comença el teu torn (es menja després, a la
producció). És igual a totes les dificultats; el factor d'espècie (Flapper 9/7, Humanoid 5/7) està preparat però val 1 mentre no hi hagi espècies.

- **Corral** i **tallers** de menjar, energia i smithore: el teu colon **es queda a la porta**; camina fins allà i empeny-hi uns
  instants (fregar-la de passada no compta) perquè el RUC entri sol fins al taulell interior (un anell el marca) i torni, una mica
  lent. Un cop compromesa, la visita es fa sencera; seguir empenyent després no torna a cobrar.
- **Corral**: al taulell compres un RUC. Si hi entres portant-ne un, el retornes: recuperes el **preu sencer del robot**, mai l'equip.
- **Tallers**: al taulell pagues l'equip (25 / 50 / 75 cr) per al RUC que portes.
- **Instal·lar**: surt del poble per una vora oberta, camina fins a la **casa** —ara tota la parcel·la teva, no només el centre— i
  prem **Acció**. No és instantani: el RUC puja, se li afegeix l'especialització i torna a baixar (uns 2 s) abans de quedar instal·lat;
  mentrestant no es pot caminar ni tornar a prémer Acció. Si a la parcel·la ja hi havia un RUC, ara et segueix aquell.
- **Retirar / reequipar**: Acció sobre la casa d'una parcel·la teva sense portar res; el RUC et segueix. Per canviar-ne la producció l'has de dur
  a un taller, pagar l'equip nou i tornar a peu a instal·lar-lo. No hi ha cap botó de panell per comprar, equipar ni instal·lar a distància.
- **Fugides** ([manual], joc Standard): si prems Acció fora de la casa d'una parcel·la teva portant un RUC, **fuig**; si s'acaba el temps (o
  acabes el torn) portant-ne un, **fuig**. Es perd a l'instant (no torna al corral, no es retorna res); l'espurneig i la sortida corrents
  que es veuen després només són l'animació.
- Clicar el mapa no instal·la mai res: durant el desenvolupament només mostra la informació de la parcel·la.

## Controls

| Acció | Ratolí / tacte | Teclat |
|---|---|---|
| Botons i camps | clic / toc | `Tab` / `Maj+Tab` canvia el focus, `Enter` o `Espai` activa |
| Adjudicació de terra (cursa) | clic o toc **a qualsevol lloc del mapa**, o el botó «Reclama» | `Enter` o `Espai` |
| Caminar (desenvolupament) | mantén premudes les fletxes en pantalla (panell inferior) | fletxes (en diagonal, dues alhora) |
| Acció (instal·lar / retirar) | botó «Acció» | `Enter` o `Espai` |
| Acabar el torn de desenvolupament | botó «Acabar» (avisa si el RUC fugirà) | `Tab` fins al botó i `Enter` |
| Subhasta: declaració | botons COMPRADOR / VENEDOR / FORA, o toc a la meitat esquerra / dreta del teu carril | `↑`/`→` venedor, `↓`/`←` comprador, `Espai` fora |
| Subhasta: preu (després de declarar) | arrossega al teu carril, control vertical o roda | `↑` / `↓` (mantén-ho premut; `Maj` = ×3) |
| Pausa | botó Pausa | `Esc` (atura tots els rellotges) |

Les opcions **So** i **Reduir moviment** són al menú de pausa (i So també al HUD).

## Llavor i determinisme

La configuració mostra una llavor editable (el botó **Nova** en genera una d'aleatòria). La mateixa llavor amb les mateixes
accions dona el mateix resultat: mapa, esdeveniments, variació de les collites, decisions de la IA i desempats surten d'un únic PRNG
sembrat (mulberry32) l'estat del qual es desa amb la partida. La cursa de terra i la caminada avancen en passos fixos de 10 ms del
rellotge del joc. A la pantalla final, **Repetir llavor** i **Nova llavor**. Amb `?seed=ABC123` a l'URL la configuració arrenca amb aquesta llavor.

## Desat

Desat automàtic a `localStorage` (clau `ruc-save-v1`, esquema **4**: inclou la bossa d'esdeveniments planetaris i els esdeveniments personals ja sortits) a cada frontera de fase, entre colon i colon del desenvolupament i a cada torn.
**Continuar** al títol reprèn a la fase desada.

«Desa i surt al títol» (menú de pausa) escriu un desat exacte a les fases **represables**: cursa de terra, desenvolupament (posició, RUC que
portes, rellotge, ordre i esdeveniments ja sortejats) i subhastes (declaració o negociació, marcadors, IA). A la resta de fases es manté
l'últim desat de frontera, perquè tornar-hi a mitja fase podria aplicar-ne els efectes dues vegades. La liquidació del torn queda desada
a l'estat (`settlement`) i no es torna a executar mai.

**Desats antics:** un desat dels esquemes 1 a 3 (regles anteriors: estocs inicials, preus, temps, patrimoni i esdeveniments) **no es migra**: el joc avisa al títol que
és d'una versió anterior amb unes altres regles i l'esborra. Un desat malmès també s'avisa. Cap desat incompatible s'accepta en silenci.

## Paràmetres d'URL (proves i depuració)

- `?test=1` executa `runSelfTests()` i mostra PASS/FAIL sense iniciar cap partida (detall i resum de la partida completa a la `console`).
- `?debug=1` barra inferior amb fase, llavor, FPS, estocs, decisions IA i els botons **Següent fase**, **+1000 cr** i **Força esdeveniment**
  (aplica només aquell esdeveniment; els individuals, al jugador).
- `?autoplay=1` el jugador humà el controla la mateixa IA (desenvolupament instantani, com les IA de l'original).

## Estructura

```text
ruc/
├── index.html        markup + full d'estil + <script> en ordre de càrrega
├── css/style.css
├── js/               scripts clàssics (no mòduls ES, perquè funcioni amb file://)
│   ├── core/         config.js (CONFIG, FEATURES, enums, RESOURCE_DEFS, EVENT_DEFS…), rng.js, assets.js
│   ├── state/        models de dades: Plot, PlayerState, StoreState, ResourceLedger + RucAudit, GameState
│   ├── systems/      lògica pura: torn, botiga, terra, producció, consum, liquidació, esdeveniments,
│   │                 puntuació, desat, subhasta, IA, ordre i caminada de desenvolupament (poble)
│   ├── ui/           hud.js (colors, formats, Hud), overlays.js, input.js, audio.js, renderer.js
│   ├── screens/      title, setup, map, production, report, auction, gameover
│   ├── tests.js      runSelfTests (?test=1)
│   └── game.js       Game + arrencada
├── README.md
└── assets/           22 PNG estàtics (sense canvis)
```

Els scripts comparteixen l'àmbit global (`const`/`class` de nivell superior), així que l'ordre dels `<script>` a
`index.html` importa: `core/config.js` primer, `tests.js` abans de `game.js` (l'arrencada crida `runSelfTests`).

## Substituir assets

Cada PNG de `assets/` es pot substituir per un altre amb **el mateix nom**. El joc **no depèn de la mida original**:
escala cada imatge a la mida lògica i deriva l'amplada dels fotogrames de les tires a partir de la imatge real
(`ruc_walk_strip`: 8 fotogrames, `colonists_strip`: 4, `event_cards_strip`: 8). Si un fitxer falta o falla,
`AssetLoader` dibuixa un substitut amb Canvas (color + patró + etiqueta) i la partida continua jugable.

Mides reals dels PNG actuals (l'especificació en demanava d'altres; res no depèn d'aquestes mides):

| Asset | Mida actual |
|---|---|
| `bg_irata_sky`, `auction_hall_bg` | 1376×768 |
| `map_ground_base` | 1392×768 |
| `colony_store`, `colony_habitat` | 1264×848 |
| `tile_*`, `resource_*`, `module_*`, `ruc_idle`, `ui_frame_9slice` | 1024×1024 |
| `colonists_strip` | 2064×512 (4 × 516) |
| `event_cards_strip`, `ruc_walk_strip` | 2928×352 (8 × 366) |

### Transparència pendent

Els PNG actuals són RGB **sense canal alfa**, i el fons opac (a més, alguns porten un tauler de quadres «pintat») es veu en els
**12 assets que segons l'especificació han de ser transparents**: `colony_store`, `colony_habitat`, `ruc_idle`, `ruc_walk_strip`,
`colonists_strip`, `resource_food`, `resource_energy`, `resource_smithore`, `module_food`, `module_energy`, `module_smithore` i
`ui_frame_9slice`. **No s'elimina el fons en temps d'execució**: quan es substitueixin per versions amb alfa real, el codi
funcionarà tal qual (no hi ha cap dependència de fons opacs). `ui_frame_9slice` només es dibuixa per les vores i les cantonades;
el centre s'omet perquè ha de ser transparent.

Nota: les 8 escenes d'`event_cards_strip` porten text pintat (p. ex. «tempesta solar»), i l'especificació les demana sense text.

Les imatges grans es redueixen una vegada per passos (amb suavitzat) a una memòria cau fora de pantalla i es dibuixen
després amb `imageSmoothingEnabled = false`, perquè el resultat sigui net i ràpid.

## Adjudicació de terra: cursa en temps real

Substitueix la secció 7 de l'especificació (ordre per torns + clic i confirmar). Funciona com al M.U.L.E. original:

- **Una sola passada** ([manual]): qui no prem a temps, aquest torn no té parcel·la (no hi ha segona passada). La casella
  central (poble) no es pot reclamar.
- Una selecció (marc gruixut animat, cantonades i etiqueta «RECLAMA») comença a la parcel·la de dalt a l'esquerra i recorre el mapa
  d'esquerra a dreta, fila per fila. Les parcel·les ja ocupades se salten a l'instant, sense espera.
- Qui prem mentre la selecció és sobre una parcel·la lliure se la queda. Humà: clic/toc (s'activa en **prémer**, no en deixar anar)
  a qualsevol lloc del mapa, `Enter` o `Espai`. IA: amb el seu propi temps de reacció.
- Cada colon reclama com a màxim **una** parcel·la per torn. Al panell lateral es veu «a la cursa», «✔ parcel·la #N» o
  «✕ sense parcel·la», i la parcel·la reclamada fa un flaix amb el color i la forma del colon.
- Velocitat per dificultat (`CONFIG.DIFFICULTY[*].landMsPerPlot`): **Relaxada 500 ms**, **Colònia 400 ms**, **Implacable 300 ms** per
  parcel·la lliure. «Reduir moviment» només treu la pulsació del marc; **no** altera la velocitat.
- **Pausa de reclamació** (`CONFIG.LAND.landClaimPauseMs` = **2000 ms**, igual per a totes les dificultats): després de cada reclamació
  el cursor **desapareix i queda aturat** 2 s. Ningú no pot reclamar durant la pausa (els premuts es perden i el botó queda desactivat),
  la parcel·la reclamada fa el flaix i el recorregut continua a la parcel·la **següent** a la reclamada, amb una espera completa.
  Si després d'una reclamació ja no queda cap colon que pugui reclamar (tots en tenen, o no queden parcel·les lliures), la fase s'acaba
  just després del flaix, sense esperar la pausa.
- **Origen dels valors:** ~0,5 s per parcel·la i ~2,1 s de pausa sorgeixen de mesurar fotograma a fotograma l'original de C64 (nivell
  Principiant). Aquí queden en 500/400/300 ms (Relaxada/Colònia/Implacable) i 2000 ms perquè les dificultats difereixin i els temps siguin
  múltiples exactes del pas de 10 ms del rellotge.
- Determinisme: el cursor avança amb el **rellotge del joc** en passos fixos de 10 ms (`CONFIG.LAND.stepMs`) i les accions de l'humà porten
  la marca de temps d'aquest rellotge. La mateixa llavor amb les mateixes accions amb marca de temps dona el mateix resultat, sigui quina
  sigui la taxa de fotogrames. La pausa del joc (Esc) congela el cursor, la pausa de reclamació i tots els temporitzadors de la IA; la pausa
  de reclamació i els temporitzadors de la IA es desen a `phaseData.land`, de manera que desar i recarregar a mig cursa (també a mitja pausa)
  reprèn exactament.
- IA: tria l'objectiu amb la valoració habitual (necessitats, terreny, riquesa, adjacència, ±error de valoració segons dificultat) només entre les
  parcel·les lliures **des del cursor endavant** (l'ordre de recorregut és públic) i prem a l'hora prevista d'arribada, desplaçada pel seu
  temps de reacció (Relaxada 700–1300 ms, Colònia 400–900, Implacable 180–500) extret del PRNG sembrat. Si l'objectiu li'l prenen o el cursor
  el sobrepassa, en tria un altre d'endavant. Un premut és **sempre** sobre la parcel·la que hi ha sota el cursor en aquell moment: si la IA
  s'avança o es retarda, es queda la veïna. Durant la pausa de reclamació els temporitzadors de la IA **no corren**: s'esborren i es tornen a
  planificar (amb un temps de reacció nou) quan el cursor torna, de manera que la IA no guanya cap premut anticipat.
- Reclamacions simultànies (mateix pas de 10 ms): guanya qui té **menys patrimoni net**; a igualtat, l'ordre del torn anterior rotat una posició
  (torn 1: p0, p1, p2, p3). Qui perd conserva el dret a reclamar.

## Fonts i criteri de confiança

- **[manual]** EA/Ozark *M.U.L.E. Player's Guide* (1983), https://www.mocagh.org/ea/mule-manual.pdf (transcripció C64: https://project64.c64.org/Games/MULE10.TXT).
- **[targeta]** *Commodore 64 Command Summary*, https://mocagh.org/ea/mule-refcard.pdf (malbaratament).
- **[codi Atari]** desassemblatge comentat de l'original d'Atari i l'anàlisi de Kroah (`docs/research/mechanics.md`; al codi, `[Atari code]`).
- **[C64]** observat en un C64 PAL emulat amb VICE (`docs/research/emulator-c64.md`). Té prioritat sobre totes les altres fonts.
- **[secundària]** C64-Wiki / Planet M.U.L.E. (recreació posterior): només per a descripcions qualitatives, mai com a constant del C64.
- **PENDENT DE VERIFICAR**: valor provisional vigent a R.U.C., no confirmat per al C64. Al codi porta l'etiqueta `[PROVISIONAL]`.

### Regles confirmades i implementades

| Regla | Font | Implementació |
|---|---|---|
| Malbaratament: 50 % del menjar i 25 % de l'energia que queden, després del consum i abans de la collita; mineral només per sobre de 50 | targeta | `SettlementSystem` |
| Mitjanes base: menjar 4/2/1, energia 2/3/1, smithore 0/1/1+cims (riu/plana/muntanya); smithore al riu sempre 0 | manual (contraportada) | `PRODUCTION_TABLE`, `ProductionSystem.canProduce` |
| Adjacència: +1 si hi ha almenys un veí ortogonal propi amb el mateix bé (mai més de +1) | manual | `adjacencyBonus` |
| Corba d'aprenentatge: +1 a cada parcel·la per cada grup complet de 3 parcel·les pròpies del mateix bé, encara que no es toquin | manual | `learningBonus` |
| Només els RUCs no energètics gasten 1 energia de la reserva; els d'energia s'autoalimenten; l'energia nova no alimenta res fins al torn següent | manual | `ProductionSystem.activation` |
| La fam no costa diners: només redueix el temps de desenvolupament | manual (el menjar determina el temps) | deute eliminat |
| Inventari inicial de cada colon: 4 menjar, 2 energia | codi Atari, C64 | `CONFIG.START_INV` |
| Botiga inicial 8 menjar / 8 energia / 8 smithore; 14 RUCs al corral (el manual en diu 16) | codi Atari, C64 | `CONFIG.STORE_START`, `RUC_START` |
| Entre torns la botiga fabrica min(14 − corral, smithore / 2) RUCs, 2 smithore cadascun; corral màxim 14; sense reposició gratuïta | codi Atari | `StoreSystem.betweenTurns`, `CONFIG.RUC_MAX` |
| Equip: menjar 25, energia 50, smithore 75 | manual, C64 | `CONFIG.MODULE_COST` |
| Menjar necessari per torn: 3 (torns 1-4), 4 (5-8), 5 (9-12) | codi Atari, C64 | `CONFIG.FOOD_NEED` |
| Temps de desenvolupament: 10 + floor(91 × min(1, menjar/necessitat)) unitats de 28 fotogrames PAL (≈ 56,4 s amb prou menjar) | codi Atari, C64 | `ConsumptionSystem.devUnits`, `humanTimeMs` |
| Escassetat d'energia: per cada unitat que falta, un RUC no energètic triat a l'atzar (PRNG sembrat) no produeix | codi Atari | `ProductionSystem.activation` |
| Variació de la collita (Standard): −1 / 0 / +1 al 16 / 68 / 16 % (±2 ≈ 0,1 %), retallada a 0..8 | codi Atari | `ProductionSystem.variation`, `binomialStep` |
| Preu de botiga P: inicial menjar 30, energia 25, smithore 50; després de cada subhasta amb operacions, P = preu mitjà operat | codi Atari, C64 | `state.storePrice`, `StoreSystem.afterAuction` |
| La botiga compra / ven: menjar i energia a P − 15 / P + 20, smithore a P / P + 35 (torn 1: smithore 50/85, menjar 15/50, energia 10/45) | codi Atari, C64 | `StoreSystem.bid/ask` |
| Oferta i demanda: P × (0,25 + 0,75 × demanda/oferta), quocient en vuitens; smithore amb quocient entre 0,25 i 3, mínim provisional 50 i pas aleatori de 7 × binomial (−28..+28); mínims 30 / 25 / 20, sostre 250 | codi Atari | `StoreSystem.updatePrices`, `supplyDemand`, `limit` |
| Preu del RUC: 2 × preu del smithore arrodonit avall a desenes (100 al començament) | codi Atari, C64 | `StoreSystem.rucPrice` |
| Sense estoc a la botiga, el preu entre colons no té sostre | manual (Standard) | `AuctionEngine.playerMax` |
| Retorn al corral: preu sencer del robot, mai l'equip; temps esgotat portant-lo o Acció fora de la casa: fuig | manual | `DevWalk`, `StoreSystem.refundRuc` |
| Corral → taller → casa de la parcel·la, a peu, amb el rellotge corrent; «cal entrar-hi del tot i sortir» | manual | `DevWalk`, `TOWN` |
| Una sola passada a la cursa de terra; empat per menys patrimoni | manual | `LandRace.endSweep` |
| Desenvolupament del líder a l'últim; al revés si al corral hi ha 7 RUCs o menys (el manual diu «menys de 7») | manual, codi Atari | `DevOrder` |
| Subhastes smithore → (crystite) → menjar → energia, amb declaració cronometrada; després el rol és fix | manual | `auctionResources`, `AuctionEngine.stage` |
| Empat a igual preu: guanya el colon amb menys patrimoni; la botiga, després dels colons | manual | `AuctionEngine._order` |
| Preu de l'operació on es troben les línies (el marcador que ja hi era) | manual | `AuctionEngine._tradePrice` |
| Esdeveniments personals: els 22 de l'original en el mateix ordre i amb els mateixos pesos; 27,5 % (22/80) a l'inici del torn de cada colon (humans i IA); cada un un cop per partida per a tothom; si el triat no val es prova el de sota (circular) fins a 20 cops | codi Atari, C64 (mateixos textos i ordre) | `EVENT_DEFS`, `EventSystem.rollIndividual`, `search` |
| El 1r mai rep un esdeveniment bo i els **dos últims** mai un de dolent (classificació de l'últim resum, empats a l'atzar) | codi Atari | `EventSystem.eligible`, `rankPlayers` |
| Import = \|pes\| × 25 × (floor(torn / 4) + 1); per RUC als de mineria, energia i menjar; els del RUC demanen tenir-ne algun d'instal·lat; una penalització que no es pot pagar s'anul·la en silenci | codi Atari | `EventSystem.amount`, `precondition`, `affordable` |
| Colon no líder amb 0 de menjar: rep el paquet (3 menjar, 2 energia) en lloc de l'esdeveniment triat | codi Atari | `EventSystem.rollIndividual` |
| Parcel·la perduda = la pròpia amb l'índex més alt (amb el seu RUC); parcel·la extra = una lliure a l'atzar | codi Atari | `EventSystem.build` |
| Planetaris: un per torn 1–11 d'una bossa sense reposició (plaga 3, pirates 2, pluja àcida 3, terratrèmol 3, taques solars 3, meteorit 2, radiació 2, incendi 2); el tiquet es gasta encara que no hi hagi objectiu; torn 12 «La nau ha tornat!» | codi Atari | `EventSystem.drawPlanet`, fases `PLANET_EVENT` / `PLANET_EVENT_AFTER` |
| Taques solars +3 d'energia per parcel·la (màx. 8); pluja àcida: fila del núvol menjar +4 / energia −2, la resta +1 / −1 (0..8); terratrèmol: mineria a la meitat | codi Atari | `ProductionSystem.applyEvents` |
| Meteorit: parcel·la que no sigui poble ni riu; en destrueix el RUC i hi deixa un dipòsit de crystite (`hiddenDeposit` = 4, per a la Fase B); el text del crystite només surt al Torneig | codi Atari | `EventSystem.build` |
| Radiació (abans de la producció): fuig un RUC del 1r o 2n; plaga (després): una parcel·la de menjar amb producció del 1r o 2n la perd tota | codi Atari | `EventSystem.build`, `scanPlots` |
| Pirates (Standard, després de la producció): tot el smithore dels colons **i de la botiga**, i la producció de smithore del torn; incendi: la botiga es queda sense menjar, energia ni smithore | codi Atari, manual | `EventSystem.build` |
| Parcel·la = 500; objectiu de colònia 60.000 sense mínim per colon; sense First Founder si fracassa | manual | `ScoringSystem`, `Game.finish` |
| Patrimoni: efectiu + béns al preu P de la botiga + 500 per parcel·la + per cada RUC instal·lat el cost de l'equip + 35 | codi Atari | `ScoringSystem.breakdown`, `CONFIG.RUC_WORTH` |
| Fracàs immediat si no hi ha cap RUC de menjar (o d'energia) i no en queda cap unitat enlloc (colons + botiga) | codi Atari | `ScoringSystem.colonyFailure`, fase `NEXT` |

### Valors provisionals i proves pendents

| Regla | Font | Implementació actual (provisional) | Confiança | Prova pendent |
|---|---|---|---|---|
| Moment de l'actualització de preus per oferta i demanda | codi Atari: la fórmula és segura, quan s'executa no | un cop al final de cada torn (després de les subhastes i abans de fabricar RUCs), de manera que el torn 1 obre als preus inicials com al C64; «producció» = collita d'aquell torn; necessitat d'energia = RUCs no energètics | mitjana | Registrar els preus de botiga torn a torn en emulador |
| Arrodoniment de P × (0,25 + 0,75 × quocient) | codi Atari: aritmètica entera, no transcrita | a la baixa | mitjana | Comparar preus de diversos torns en emulador |
| Mecanisme de la «binomial» (variació de collita i pas del smithore) | codi Atari: distribució simètrica a [−6, 6) amb els percentatges publicats | suma de 12 uniformes − 6, arrodonida lluny de zero; el pas del smithore limitat a ±4 (−28..+28) | mitjana (la distribució reprodueix els percentatges) | Transcriure la rutina `calcBinomiale` |
| Quins RUCs s'aturen si falta energia | codi Atari: «una explotació a l'atzar»; [FN] només entre les no energètiques | a l'atzar entre els RUCs no energètics, sense repetir | mitjana | Provocar escassetat amb diversos RUCs i mirar quins s'aturen |
| Béns al resum de patrimoni | codi Atari: al preu P; C64: el resum #0 mostra GOODS 150 per a 4 menjar + 2 energia (amb P 30/25 serien 170) | al preu P | mitjana (contradicció oberta) | Llegir el resum de patrimoni en emulador amb inventaris diferents |
| Moment de la comprovació del fracàs per manca total | codi Atari: la regla és segura, el moment no | al final de cada torn (fase `NEXT`) | mitjana | Provocar-ho en emulador |
| Tancament del marge de la botiga | no és de l'original | després de 5 s sense operacions, la línia de compra / venda s'acosta a P un pas cada 2 s | — | Revisar amb el lot de subhastes |
| Límit de compra de la botiga (24 u) | codi Atari: no se n'ha trobat cap (només el sostre de 255) | `storeBuyCap` 24 | baixa | Vendre a la botiga fins que deixi de comprar |
| Durada de la declaració | manual: hi ha comptador, sense segons | 5 s | baixa | Cronometrar el *Declare Timer* |
| Pluja àcida sobre un RUC de menjar sense energia | codi Atari: s'aplica a la producció de totes les parcel·les del tipus | també suma +1 de menjar (0 → 1) | mitjana | Provocar escassetat d'energia amb pluja àcida en emulador |
| Lliscament de muntanya del terratrèmol: casos límit | codi Atari: 50 %, muntanya a l'atzar, esquerra o dreta, −1 / +1 nivell, destrueix els RUCs | si el costat triat és fora del mapa, riu, poble o ja té 3 cims, es prova l'altre; si cap no val, no llisca | baixa | Observar terratrèmols en emulador |
| Moment del sorteig de la classificació dels esdeveniments | codi Atari: `ordersPlayer` del darrer resum, empats a l'atzar | sortejada un cop a l'inici de cada torn (PRNG sembrat) | mitjana | — |
| Arrodoniment del malbaratament amb quantitats senars | no consta | a la baixa (3 menjar → en perd 1; 3 energia → 0) | mitjana | Guardar 3 i 5 unitats i llegir l'estat |
| Retorn d'un RUC retirat d'una parcel·la | manual: «retorna'l al corral per 100 $» | es retorna el preu que es va pagar per aquell robot | mitjana | Retornar al corral un RUC comprat a un altre preu |
| RUC sense equipar premut sobre la casa | no consta | no s'instal·la i no fuig (avís) | baixa | Provar-ho en emulador |
| Empat de patrimoni en l'ordre de desenvolupament i a la subhasta | no consta | ordre de jugador estable; a la subhasta, temps d'espera i clau sembrada | baixa | — |
| Velocitats de caminar, alentiment de riu/muntanya, geometria del poble | manual: riu i muntanya alenteixen, la diagonal és més ràpida | 0,12 px/ms al mapa (50 % a riu/muntanya), 0,2 px/ms al poble (retocat a 2/3 de l'anterior després de jugar-hi); poble amb carrer i passatge | baixa | Cronometrar recorreguts en emulador |
| Instal·lació i fugida animades (pujada/afegit/baixada del RUC; espurneig i sortida corrents); casa = tota la parcel·la; avís de 3 s abans del torn humà | no són regles del C64, són decisions de disseny pròpies | 1800 ms d'instal·lació, 400+900 ms de fugida, avís 3000 ms (`CONFIG.WALK.installMs/fleeShuffleMs/fleeRunMs`, `CONFIG.DEV.countdownMs`) | — (no aplica: no és una afirmació de fidelitat) | — |
| Botiga/corral: el colon es queda a la porta i només el RUC camina fins al taulell i torna | no és una regla del C64, és una decisió de disseny pròpia | cal empènyer 350 ms a la porta perquè comprometi la visita; 2200 ms de viatge del RUC (`CONFIG.WALK.doorHoldMs/visitMs`) | — (no aplica) | — |
| Separació de marcadors després de cada unitat | l'original manté la unitat a unitat mentre les línies es toquen | R.U.C. separa 2 passos després de cada unitat i cal tornar a creuar 0,5 s | — | Decidir si es canvia (ajornat, vegeu sota) |

### Pendents de Fase A (no implementats, sense evidència suficient)

- **Pub**: el manual confirma que acaba el torn i paga més com més temps queda, però no la fórmula. No s'ha implementat; «Acabar» no paga res.
- **Espècies i hàndicaps**: Flapper (més diners i temps) i Humanoid (menys) consten al manual sense xifres (les de +600/−400 són d'una font
  comunitària); les altres sis espècies no tenen atributs documentats. Pendent (lot 3 del pla de fidelitat). El temps ja té el punt
  d'enganxament per al factor d'espècie.

### Ajornat (fora d'aquest encàrrec)

- Transferència contínua unitat a unitat mentre les línies es toquen (vegeu la taula).
- Fase B: subhastes de terra, crystite, assay, collusion, wampus (`FEATURES.*` a `false`; el preu del crystite no s'ha tocat).

## Fase B (preparada, no visible)

`FEATURES.crystite`, `FEATURES.wampus` i `FEATURES.landAuctions` són `false` i no es mostra cap control. Els punts d'extensió existeixen:
`RESOURCE.CRYSTITE` a `RESOURCE_DEFS` amb `enabled:false` (producció, malbaratament i subhasta recorren el registre; `AUCTION_ORDER` ja
reserva el lloc del crystite entre smithore i menjar); `hiddenDeposit` a cada parcel·la; `TurnSystem.insertAfter/insertBefore` i el hook
`afterDevelopment`; `InputManager` amb contexts independents; `AuctionEngine` rep una `marketDefinition` i lots genèrics
(`{ id, kind, quantity, sellerId, transferable, getValue(), transfer() }`). Els self-tests demostren un 4t recurs i un lot únic de terra.
