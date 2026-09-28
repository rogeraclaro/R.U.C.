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
2. **Desenvolupament**, un colon rere l'altre per ordre de patrimoni (del líder a l'últim; al revés si al corral queden menys de 7 RUCs).
   Abans del torn de cada colon hi ha un 25 % d'esdeveniment individual. El teu torn és **a peu**: vegeu més avall.
3. **Esdeveniment planetari** (abans de la producció).
4. **Producció i estat**: consum, malbaratament de la reserva i collita nova (pantalla «Estat del torn»).
5. **Subhastes**: smithore → menjar → energia. Cadascuna té una **declaració** cronometrada (comprador / venedor / fora) i després el rol queda fix.
6. **Informe del torn**: la botiga fabrica RUCs amb el smithore que ha comprat (2 per RUC, disponibles el torn següent).

Al final, la colònia ha de sumar **60.000 cr** de patrimoni; si no hi arriba, ha fracassat i no hi ha *First Founder* (la classificació es mostra igualment).

## Desenvolupament a peu

El colon apareix al poble (casella central del mapa). Amb les fletxes (o el control tàctil de la dreta del panell) camina en temps real;
el rellotge corre sempre, també mentre camines o estàs parat.

- **Corral**: hi entres caminant i compres un RUC. Si hi entres portant-ne un, el retornes: recuperes el **preu sencer del robot**, mai l'equip.
- **Tallers** de menjar, energia i smithore: hi entres amb el RUC i pagues l'equip (25 / 50 / 75 cr). Cal entrar-hi del tot i tornar a sortir:
  empènyer contra la porta no torna a cobrar.
- **Instal·lar**: surt del poble per una vora oberta, camina fins a la **casa** (quadre al centre d'una parcel·la teva) i prem **Acció**.
  Si a la parcel·la ja hi havia un RUC, ara et segueix aquell.
- **Retirar / reequipar**: Acció sobre la casa d'una parcel·la teva sense portar res; el RUC et segueix. Per canviar-ne la producció l'has de dur
  a un taller, pagar l'equip nou i tornar a peu a instal·lar-lo. No hi ha cap botó de panell per comprar, equipar ni instal·lar a distància.
- **Fugides** ([manual], joc Standard): si prems Acció fora de la casa d'una parcel·la teva portant un RUC, **fuig**; si s'acaba el temps (o
  acabes el torn) portant-ne un, **fuig**. Un RUC que fuig es perd: no torna al corral i no es retorna res.
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

Desat automàtic a `localStorage` (clau `ruc-save-v1`, esquema **2**) a cada frontera de fase, entre colon i colon del desenvolupament i a cada torn.
**Continuar** al títol reprèn a la fase desada.

«Desa i surt al títol» (menú de pausa) escriu un desat exacte a les fases **represables**: cursa de terra, desenvolupament (posició, RUC que
portes, rellotge, ordre i esdeveniments ja sortejats) i subhastes (declaració o negociació, marcadors, IA). A la resta de fases es manté
l'últim desat de frontera, perquè tornar-hi a mitja fase podria aplicar-ne els efectes dues vegades. La liquidació del torn queda desada
a l'estat (`settlement`) i no es torna a executar mai.

**Desats antics:** un desat de l'esquema 1 (regles anteriors: sense poble, amb deute de fam, etc.) **no es migra**: el joc avisa al títol que
és d'una versió anterior amb unes altres regles i l'esborra. Un desat malmès també s'avisa. Cap desat incompatible s'accepta en silenci.

## Paràmetres d'URL (proves i depuració)

- `?test=1` executa `runSelfTests()` i mostra PASS/FAIL sense iniciar cap partida (detall i resum de la partida completa a la `console`).
- `?debug=1` barra inferior amb fase, llavor, FPS, estocs, decisions IA i els botons **Següent fase**, **+1000 cr** i **Força esdeveniment**
  (aplica només aquell esdeveniment; els individuals, al jugador).
- `?autoplay=1` el jugador humà el controla la mateixa IA (desenvolupament instantani, com les IA de l'original).

## Estructura

```text
ruc/
├── index.html        tot el joc (seccions JS en l'ordre de l'especificació)
├── README.md
└── assets/           22 PNG estàtics (sense canvis)
```

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
| Botiga inicial 16 menjar / 16 energia / 0 smithore; 16 RUCs al corral | manual | `CONFIG.STORE_START`, `RUC_START` |
| 2 smithore venuts a la botiga = 1 RUC, disponible després d'un torn sencer; sense reposició gratuïta | manual | `StoreSystem.betweenTurns` |
| Equip: menjar 25, energia 50, smithore 75 | manual | `CONFIG.MODULE_COST` |
| Preus de botiga: mínims 15 / 10 / 14, sostre 265 | manual (text) | `RESOURCE_DEFS` |
| Sense estoc a la botiga, el preu entre colons no té sostre | manual (Standard) | `AuctionEngine.playerMax` |
| Retorn al corral: preu sencer del robot, mai l'equip; temps esgotat portant-lo o Acció fora de la casa: fuig | manual | `DevWalk`, `StoreSystem.refundRuc` |
| Corral → taller → casa de la parcel·la, a peu, amb el rellotge corrent; «cal entrar-hi del tot i sortir» | manual | `DevWalk`, `TOWN` |
| Una sola passada a la cursa de terra; empat per menys patrimoni | manual | `LandRace.endSweep` |
| Desenvolupament del líder a l'últim; al revés si al corral hi ha menys de 7 RUCs | manual | `DevOrder` |
| Subhastes smithore → (crystite) → menjar → energia, amb declaració cronometrada; després el rol és fix | manual | `auctionResources`, `AuctionEngine.stage` |
| Empat a igual preu: guanya el colon amb menys patrimoni; la botiga, després dels colons | manual | `AuctionEngine._order` |
| Preu de l'operació on es troben les línies (el marcador que ja hi era) | manual | `AuctionEngine._tradePrice` |
| Esdeveniment individual: 25 % per colon i torn; el líder mai rep bona sort, l'últim mai mala | manual | `EventSystem.rollIndividual` |
| Pirates (Standard): roben tot el smithore dels colons (no crystite) | manual | `EventSystem.build` |
| Parcel·la = 500; objectiu de colònia 60.000 sense mínim per colon; sense First Founder si fracassa | manual | `ScoringSystem`, `Game.finish` |

### Valors provisionals i proves pendents

| Regla | Font | Implementació actual (provisional) | Confiança | Prova pendent |
|---|---|---|---|---|
| Fórmula de preus de botiga | manual: «oferta, demanda i últims preus», sense fórmula | `base × clamp(objectiu/estoc, 0,55, 2,2)`, marge ±10 %, tancament de marge després de 5 s | baixa | Registrar preus de compra/venda de la botiga per estoc en emulador (VICE) torn a torn |
| Preu del RUC | manual: depèn dels RUCs disponibles i de parcel·les sense desenvolupar; exemple de 100 $ | 100 amb corral ple, +10 per RUC que falta, màx. 200; no té en compte les parcel·les buides | baixa | Anotar el preu del corral amb 16…0 RUCs i diferents parcel·les buides |
| Límit de compra de la botiga (24 u) i màxim del corral (16) | no consten | `storeBuyCap` 24, `RUC_MAX` 16 | baixa | Vendre smithore/menjar a la botiga fins que deixi de comprar; comptar el corral després de molts torns de smithore |
| Consum de menjar per torn | no consta | 2 (torns 1-4), 3 (5-8), 4 (9-12) | baixa | Llegir la «línia crítica» de menjar a l'estat de subhasta cada torn |
| Segons de desenvolupament i penalització de fam | manual: el menjar determina el temps; Flapper/Humanoid més/menys temps | 90/60/45 s segons dificultat; −25 % per unitat que falta; mínim 15 s | baixa | Cronometrar la barra de temps amb 0, 1, 2… unitats de menjar en emulador |
| Durada de la declaració | manual: hi ha comptador, sense segons | 5 s | baixa | Cronometrar el *Declare Timer* |
| Atzar de la producció | manual: la base és una mitjana i varia de 0 a 8 | mitjana + (a + b), a,b ∈ {−1,0,+1} sembrats; retallat a 0..8 | baixa | Registrar moltes collites d'una mateixa parcel·la (o desassemblar la rutina) |
| Ordre dels modificadors | no consta | mitjana → variació → retall 0..8 → % d'esdeveniment (enter, arrodonit avall un cop) → parcel·les anul·lades; un esdeveniment pot superar 8 | baixa | Comparar collites amb pluja àcida / terratrèmol |
| Quins RUCs s'aturen si falta energia | no consta (Planet diu aleatori) | prioritat fixa: menjar abans que smithore, després per número de parcel·la | baixa | Provocar escassetat amb diversos RUCs i mirar quins s'aturen |
| Arrodoniment del malbaratament amb quantitats senars | no consta | a la baixa (3 menjar → en perd 1; 3 energia → 0) | mitjana | Guardar 3 i 5 unitats i llegir l'estat |
| Valoració dels RUCs al patrimoni | exemple del manual: 1 parcel·la + 1 M.U.L.E. = LANDS 525 / 575 | robot 0 + cost de l'equip (25/50/75) | mitjana | Resum de patrimoni amb RUCs de cada tipus |
| Retorn d'un RUC retirat d'una parcel·la | manual: «retorna'l al corral per 100 $» | es retorna el preu que es va pagar per aquell robot | mitjana | Retornar al corral un RUC comprat a un altre preu |
| RUC sense equipar premut sobre la casa | no consta | no s'instal·la i no fuig (avís) | baixa | Provar-ho en emulador |
| Exactament 7 RUCs al corral | manual: «<7» l'últim primer, «>7» l'últim al final | 7 → ordre normal | mitjana | Fer coincidir 7 RUCs i observar l'ordre |
| Empat de patrimoni en l'ordre de desenvolupament i a la subhasta | no consta | ordre de jugador estable; a la subhasta, temps d'espera i clau sembrada | baixa | — |
| Probabilitat i repetició d'esdeveniments planetaris; torns 1 i 12 | no consta | 45 % per torn, un com a màxim; cap negatiu als torns 1 i 12 (regla pròpia) | baixa | Estadística de moltes partides en emulador |
| Magnituds dels planetaris | manual: només el sentit (pluja àcida: menjar ↑ energia ↓; terratrèmol: mines ↓) | pluja +35 % / −30 %, activitat solar +30 %, terratrèmol −25 % smithore (xifres heretades dels antics esdeveniments; la targeta ho indica) | baixa | Comparar collites abans/després de cada esdeveniment |
| Plaga, radiació, incendi | secundària | plaga: una parcel·la de menjar no produeix; radiació: fuig un RUC instal·lat; incendi: la botiga perd tot l'estoc | mitjana | Confirmar-ne l'efecte exacte en emulador |
| Velocitats de caminar, alentiment de riu/muntanya, radi de la casa, geometria del poble | manual: riu i muntanya alenteixen, la diagonal és més ràpida | 0,12 px/ms al mapa (50 % a riu/muntanya), 0,2 px/ms al poble (retocat a 2/3 de l'anterior després de jugar-hi), casa ±16 px; poble amb carrer i passatge | baixa | Cronometrar recorreguts en emulador |
| Instal·lació i fugida animades (pujada/afegit/baixada del RUC; espurneig i sortida corrents) | no és una regla del C64, és una decisió de disseny pròpia | 1800 ms d'instal·lació, 400+900 ms de fugida (`CONFIG.WALK.installMs/fleeShuffleMs/fleeRunMs`) | — (no aplica: no és una afirmació de fidelitat) | — |
| Separació de marcadors després de cada unitat | l'original manté la unitat a unitat mentre les línies es toquen | R.U.C. separa 2 passos després de cada unitat i cal tornar a creuar 0,5 s | — | Decidir si es canvia (ajornat, vegeu sota) |
| Preu mínim del smithore | manual contradictori: 14 $ (text) i 25–250 $ (contraportada) | 14 (com demana l'encàrrec) | mitjana | Veure el preu mínim real de la botiga en emulador |

### Pendents de Fase A (no implementats, sense evidència suficient)

- **21 esdeveniments individuals del manual**: el manual només en dona el nombre. Mentre no se'n tingui el text i l'efecte exacte, el sorteig
  (25 %, líder/últim) fa servir **4 esdeveniments propis de R.U.C.** (veta rica, avaria, ferralla, factura mèdica) marcats a la targeta com
  «propi de R.U.C. (no C64)». Prova: capturar-los en emulador o extreure les cadenes del binari.
- **Meteorit** (8è planetari): el manual no descriu el seu efecte al joc Standard; no s'implementa per no inventar-lo.
- **Pub**: el manual confirma que acaba el torn i paga més com més temps queda, però no la fórmula. No s'ha implementat; «Acabar» no paga res.
- **Espècies i hàndicaps**: Flapper (més diners i temps) i Humanoid (menys) consten al manual sense xifres (les de +600/−400 són d'una font
  comunitària); les altres sis espècies no tenen atributs documentats. Pendent. També la divisió en unitats dels 300 $ inicials de menjar i energia
  (ara 6 + 6).

### Ajornat (fora d'aquest encàrrec)

- Transferència contínua unitat a unitat mentre les línies es toquen (vegeu la taula).
- Fase B: subhastes de terra, crystite, assay, collusion, wampus (`FEATURES.*` a `false`; el preu del crystite no s'ha tocat).

## Fase B (preparada, no visible)

`FEATURES.crystite`, `FEATURES.wampus` i `FEATURES.landAuctions` són `false` i no es mostra cap control. Els punts d'extensió existeixen:
`RESOURCE.CRYSTITE` a `RESOURCE_DEFS` amb `enabled:false` (producció, malbaratament i subhasta recorren el registre; `AUCTION_ORDER` ja
reserva el lloc del crystite entre smithore i menjar); `hiddenDeposit` a cada parcel·la; `TurnSystem.insertAfter/insertBefore` i el hook
`afterDevelopment`; `InputManager` amb contexts independents; `AuctionEngine` rep una `marketDefinition` i lots genèrics
(`{ id, kind, quantity, sellerId, transferable, getValue(), transfer() }`). Els self-tests demostren un 4t recurs i un lot únic de terra.
