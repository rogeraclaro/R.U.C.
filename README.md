# R.U.C.

Reinterpretació de **M.U.L.E.** (Dani Bunten, 1983): d'1 a 4 jugadors humans al mateix ordinador; els seients que queden són rivals IA
(Bran, Vela, Nox i Iris, tots Mechtrons), o bé una **demostració** amb quatre ordinadors,
12 torns (6 al nivell Principiant), subhasta contínua en temps real. Ajustada a les regles del M.U.L.E. original de Commodore 64: nivells
Principiant, Estàndard i Torneig (amb crystite, oficina d'assaig i col·lusió), amb subhastes de terra. HTML, CSS i JavaScript vanilla amb Canvas 2D; cap dependència.

## Com obrir-lo

**No hi ha cap pas de compilació.** Tria una de les dues opcions:

- Obre `index.html` directament al navegador (`file://`), o
- serveix la carpeta amb qualsevol servidor estàtic, per exemple `python3 -m http.server` i visita `http://localhost:8000`.

Funciona sense connexió. No hi ha CDN, npm, bundler ni IA en temps d'execució.

## Configuració

- **Jugadors** ([C64] F5 al títol: 4, 3, 2, 1 planeteers o COMPUTER DEMO): **1–4 humans** o **Demo (només ordinadors)**. Cada humà té
  una pestanya (J1–J4) amb el seu **nom**, **color** (únic: triar el color d'un altre jugador els intercanvia) i **espècie**, i els seus
  controls (vegeu [Diversos jugadors](#diversos-jugadors)). Els humans ocupen els primers seients (p0 = J1…); els ordinadors omplen la
  resta amb els noms Bran, Vela, Nox i Iris, per aquest ordre, sempre Mechtrons. Amb un sol humà la partida és exactament la d'abans.
- **Espècie** ([codi Atari], [C64]): Mechtron, Gollumer, Packer, Bonzoid, Spheroid, Flapper, Leggite o Humanoid. Només canvien els diners
  i el temps de torn: **Flapper 1600 cr** i temps ×9/7, **Humanoid 600 cr** i temps ×5/7, la resta 1000 cr i temps normal. Els rivals de
  l'ordinador són sempre Mechtrons amb 1000 cr. Els dibuixos de les espècies són propis (no hi ha asset); l'Humanoid fa servir el retrat
  `colonists_strip` del teu color.
- **Nivell**: **Estàndard** (per defecte, 12 mesos, regles completes), **Principiant** (6 mesos) o **Torneig** (12 mesos, crystite,
  assaig i col·lusió; vegeu [Torneig](#torneig)). La IA no té nivell de força (l'original no en té): reacció 400–900 ms, error de valoració ±8 %, reserva mínima 3 (`CONFIG.AI`,
  els antics valors «Colònia»).
- Principiant ([codi Atari]): 8 menjar i 4 energia per colon; botiga 16 menjar / 16 energia / 0 smithore i 25 RUCs, i cada torn torna a
  0 smithore i 25 RUCs; sense variació de collita; smithore fix a 50; unitat de temps +2 BTU (×9/7); cursor de terra a 32 fotogrames per
  parcel·la; un RUC no fuig mai per prémer al lloc equivocat (només avisa); no es pot vendre terra ni hi ha subhastes de terra; a les
  subhastes cada unitat de temps dura 5/3 de l'Estàndard (ATU 50 en lloc de 30; el doble al primer torn) i **cap** venedor (tampoc l'humà)
  no pot vendre per sota del seu nivell crític.

## El torn

0. **Inici** ([C64]): el primer torn obre amb «Aterreu al planeta Irata. La nau tornarà d'aquí a 12 mesos.» (6 al Principiant).
1. **Adjudicació de terra**: cursa en temps real, una sola passada.
   Després, **subhasta de terres** (Estàndard): les parcel·les marcades a l'oficina de terres i 0–3 parcel·les de la colònia (vegeu més avall).
2. **Desenvolupament**, un colon rere l'altre per ordre de patrimoni (del líder a l'últim; al revés si al corral queden 7 RUCs o menys).
   El temps de cada colon depèn del menjar que té a l'inici del seu torn (vegeu més avall).
   Abans del torn de cada colon (humà o IA) hi ha un 27,5 % (22/80) d'**esdeveniment personal**, un dels 22 de l'original; el text
   surt a sobre de «Prem el botó per començar». El teu torn és **a peu**: vegeu més avall. Les IA instal·len RUCs i després van al pub.
3. **Esdeveniment planetari**: un per torn als torns 1–11, tret d'una bossa sense reposició; al torn 12, «La nau ha tornat!». Taques solars,
   pluja àcida, terratrèmol, meteorit i radiació actuen abans de la producció; plaga, pirates i incendi, després de mostrar-la.
4. **Producció i estat**: consum, malbaratament de la reserva i collita nova (pantalla «Estat del torn»).
5. **Subhastes**: smithore → menjar → energia. Cadascuna té una **declaració** cronometrada (comprador / venedor / fora) i després el rol queda fix
   (vegeu «Subhastes» més avall).
6. **Informe del torn**: la botiga recalcula els preus per oferta i demanda i fabrica RUCs amb el smithore que té (2 per RUC, fins a
   14 al corral, disponibles el torn següent).

Al final («La nau ha tornat!») la colònia rep una **valoració** ([codi Atari]) = round((patrimoni total − 10.000) / 20.000), entre 0 i 6,
amb els 7 textos originals traduïts («En conjunt, la colònia ha fracassat... estrepitosament...» fins a «...ha encantat la Federació...»).
El líder és el ***First Founder*** només si la colònia arriba a **60.000 cr** (valoració ≥ 3) i només al final real de la partida; la
classificació es mostra sempre.
Si en acabar un torn no queda cap RUC de menjar (o d'energia) ni cap unitat de menjar (o d'energia) enlloc, la partida s'acaba a l'instant:
«La colònia ha fracassat per una manca total de menjar!» (o «d'energia»).

## Desenvolupament a peu

Com al C64, el teu torn no comença sol: surt «**Prem el botó per començar**» (amb l'esdeveniment personal a sobre, si n'hi ha) i el
rellotge no corre fins que prems Acció, `Enter`, `Espai` o hi fas clic.

El temps que queda és una **barra vertical** del teu color a la vora dreta del mapa (alçada = unitats que queden).

El colon apareix al poble (casella central del mapa). **Poble** ([C64]): a dalt, la botiga de crystite (tancada, sense porta, fora del
Torneig), i els tallers de smithore, energia i menjar; a baix, l'oficina d'assaig (tancada fora del Torneig), l'**oficina de terres**, el **pub** i el **corral**, amb el
rètol «RUCs 100 cr» (el preu actual). A sota del poble, «Els teus diners: N cr». Amb les fletxes (o el control tàctil de la dreta del panell) camina en temps real;
el rellotge corre sempre, també mentre camines o estàs parat.

**Temps** ([codi Atari], [C64]): `10 + floor(91 × min(1, menjar / necessitat))` unitats de 28 fotogrames PAL (50,125 Hz). Amb prou menjar,
101 unitats ≈ 56,4 s; sense menjar, 10 unitats ≈ 5,6 s. Es compta el menjar que tens quan comença el teu torn (es menja després, a la
producció). Flapper ×9/7 i Humanoid ×5/7 (±2 BTU per unitat); el Principiant hi afegeix 2 BTU.

**Caminar** ([C64]): al mapa 0,667 px/fotograma en horitzontal i 0,333 en vertical sobre una parcel·la de ~32 px del C64 (escalat ×3 a la
nostra: ~0,96 s per creuar-la en horitzontal, ~1,9 s en vertical); al poble 1,33 px/fotograma en horitzontal. Riu i muntanya
alenteixen ([codi Atari] 6 / 14 / 21 fotogrames per pas: plana / riu / muntanya). La diagonal és la manera més ràpida de moure's.

- **Corral** i **tallers** de menjar, energia i smithore: el teu colon **es queda a la porta**; camina fins allà i empeny-hi uns
  instants (fregar-la de passada no compta) perquè el RUC entri sol fins al taulell interior (un anell el marca) i torni, una mica
  lent. Un cop compromesa, la visita es fa sencera; seguir empenyent després no torna a cobrar.
- **Corral**: al taulell compres un RUC. Si hi entres portant-ne un, el retornes: recuperes el **preu sencer del robot**, mai l'equip.
- **Tallers**: al taulell pagues l'equip (25 / 50 / 75 cr) per al RUC que portes.
- **Pub** ([codi Atari], [C64]): hi entres i el torn **s'acaba**: guanyes bonificació del torn (50 torns 1–3, 100 torns 4–7, 150 torns 8–11,
  200 torn 12) + (aleatori 0..255 mod (2 × unitats que queden)); si la suma passa de 255, en cobres 250. «Has guanyat N cr jugant!».
  Amb un RUC no hi pots entrar: «No s'hi admeten RUCs.» (també a l'oficina de terres).
- **Oficina de terres** (Estàndard): «Marca la parcel·la per vendre i torna.»; prem Acció sobre una parcel·la teva i torna a l'oficina:
  queda marcada per vendre («EN VENDA») a la subhasta de terres del torn següent, on tu ets el venedor.
- **Instal·lar**: surt del poble per una vora oberta, camina fins a la **casa** —ara tota la parcel·la teva, no només el centre— i
  prem **Acció**. No és instantani: el RUC puja, se li afegeix l'especialització i torna a baixar (uns 2 s) abans de quedar instal·lat;
  mentrestant no es pot caminar ni tornar a prémer Acció. Si a la parcel·la ja hi havia un RUC, ara et segueix aquell.
- **Retirar / reequipar**: Acció sobre la casa d'una parcel·la teva sense portar res; el RUC et segueix. Per canviar-ne la producció l'has de dur
  a un taller, pagar l'equip nou i tornar a peu a instal·lar-lo. No hi ha cap botó de panell per comprar, equipar ni instal·lar a distància.
- **Fugides** ([manual], joc Standard): si prems Acció fora de la casa d'una parcel·la teva portant un RUC, **fuig** (al Principiant només
  avisa); si s'acaba el temps (o acabes el torn) portant-ne un, **fuig**. Es perd a l'instant (no torna al corral, no es retorna res); l'espurneig i la sortida corrents
  que es veuen després només són l'animació.
- Clicar el mapa no instal·la mai res: durant el desenvolupament només mostra la informació de la parcel·la.
- **Wampus de muntanya** ([codi Atari], [manual], [C64]; també al Principiant [PROVISIONAL]): viu a les coves de les muntanyes; quan obre
  la porta sona una campaneta i parpelleja un punt de llum en una muntanya (amb «Reduir moviment», una llum fixa). Fora del poble i
  sense cap RUC, posa't sobre la seva parcel·la i prem **Acció**: «Has caçat el Wampus de muntanya!! T'ha donat el seu cofre: N cr
  perquè el deixis lliure.» (100 cr torns 1–3, 200 torns 4–7, 300 torns 8–11, 400 torn 12). Un cop per torn; el torn **continua**.
  Si ets a la seva muntanya no obre la porta. Els ordinadors no el cacen mai.

## Controls

| Acció | Ratolí / tacte | Teclat |
|---|---|---|
| Botons i camps | clic / toc | `Tab` / `Maj+Tab` canvia el focus, `Enter` o `Espai` activa (sense cap focus, el botó principal de la pantalla: «A les subhastes», «Continuar», la targeta d'esdeveniment…) |
| Adjudicació de terra (cursa) | clic o toc **a qualsevol lloc del mapa**, o el botó «Reclama» | `Enter` o `Espai` |
| Començar el torn de desenvolupament | clic al mapa o botó «Començar» | `Enter` o `Espai` |
| Caminar (desenvolupament) | mantén premudes les fletxes en pantalla (panell inferior) | fletxes (en diagonal, dues alhora) |
| Pub / oficina de terres / corral / tallers | camina fins a la porta i empeny-hi uns instants | fletxes |
| Acció (instal·lar / retirar / marcar parcel·la per vendre / caçar el Wampus) | botó «Acció» | `Enter` o `Espai` |
| Acabar el torn de desenvolupament | botó «Acabar» (avisa si el RUC fugirà) | `Tab` fins al botó i `Enter` |
| Subhasta: declaració | botons COMPRADOR / VENEDOR / FORA, o toc a la meitat esquerra / dreta del teu carril | `↑`/`→` venedor, `↓`/`←` comprador, `Espai` fora |
| Subhasta: preu (després de declarar) | arrossega al teu carril, control vertical, roda o botons «Preu ▲/▼» | `↑` / `↓` (mantén-ho premut; `Maj` = ×3) |
| Subhasta de terres: oferta | arrossega al teu carril, roda o botons «Puja ▲ / Baixa ▼» (16 cr) | `↑` / `↓` (mantén-ho premut; `Maj` = ×3) |
| Subhasta de terres: tancar el resultat | botó «Continuar» | `Enter` o `Espai` |
| Pausa | botó Pausa | `Esc` (atura tots els rellotges) |

Les opcions **So** i **Reduir moviment** són al menú de pausa (i So també al HUD).

### Diversos jugadors

Cada humà té el seu «joystick» i el seu «botó» (les tecles es llegeixen per posició física, `KeyboardEvent.code`, i funcionen amb qualsevol
distribució de teclat):

| Jugador | Moure (↑ ↓ ← →) | Botó |
|---|---|---|
| J1 | fletxes (i ratolí / tacte) | `Enter` o `Espai` |
| J2 | `W` `S` `A` `D` | `Q` |
| J3 | `I` `K` `J` `L` | `U` |
| J4 | teclat numèric `8` `5` (o `2`) `4` `6` | `0` del teclat numèric |
| Comandament (Gamepad API) | creu direccional o palanca esquerra | `A` (botó 0) |

Un **comandament** s'assigna al següent jugador humà que encara no en té amb la **primera pulsació** del seu botó (aquesta pulsació no fa
res més); després funciona a més de les tecles d'aquell jugador.

- **Adjudicació de terra**: tots alhora; cadascú prem el seu botó quan el cursor és sobre la parcel·la que vol (una per jugador; en un
  empat guanya el colon amb menys patrimoni, [manual]).
- **Subhastes de béns i de terres**: tots alhora, cadascú mou el seu marcador. Declaració: amunt/dreta venedor, avall/esquerra comprador,
  botó = fora. Negociació: amunt/avall mouen el preu; al **Torneig** el botó és el de la **col·lusió** (dos humans, un comprador i un
  venedor, premen en menys de 10 jiffies, [codi Atari]). El ratolí, els botons de pantalla i el control lliscant són de J1.
- **Desenvolupament**: un per un, en l'ordre de patrimoni; cada humà comença («Prem el botó per començar») i camina amb els seus
  controls. El ratolí, el tacte i els botons de pantalla funcionen per a qui té el torn; les tecles de J1 només en el torn de J1.
- **Estat i informe del torn**: «Prem tots els botons dels jugadors per continuar» ([codi Atari] `waitPlayersButtons`): espera el botó
  de cada humà (es marca qui ja ha premut; el botó de pantalla és el de J1), **sense temps límit** (l'original avançava sol al cap de
  ~17 s; decisió de disseny). Amb un sol humà, com sempre: un clic o una tecla.
- **Sense avanç automàtic**: mentre juga algun humà, cap pantalla d'espera avança sola: targetes d'esdeveniment, producció, estat,
  informe del torn i resultats de les subhastes (de béns i de terres) esperen «Continuar» (botó, clic, `Enter`/`Espai` o el botó de
  cada jugador). Els temps de joc (torn de desenvolupament, rellotge de subhasta, cursor de terres) no canvien.
- **Demostració** ([C64] COMPUTER DEMO): quatre ordinadors; les pantalles d'espera avancen soles al cap de **~8,5 s**; al final comença
  una partida nova amb una llavor nova, indefinidament. Qualsevol tecla, clic o botó de comandament torna al títol. La demo no desa mai.

## So

Tot el so es sintetitza en temps real amb WebAudio a l'estil del xip SID (`js/ui/audio.js`): no hi ha cap fitxer d'àudio. **Totes les
músiques i efectes són composicions pròpies**; no s'ha copiat ni derivat res del tema original de M.U.L.E. (notes de recerca a
`docs/research/audio.md`). L'àudio s'activa amb el primer clic o tecla (norma dels navegadors) i mai atura el joc si falla.

- **Música, només on l'original en tenia**: tema principal al títol i a la configuració; melodia d'estat a la producció, l'estat i
  l'informe del torn; final d'èxit o de fracàs a la pantalla final. **Sense música** a l'adjudicació de terra, el desenvolupament i les
  subhastes (els temes `land`, `development` i `auction` existeixen però no es fan servir). La pausa deixa la música en suspens i
  «So: no» la talla a l'instant.
- **Efectes**: tic del cursor de terra i reclamació; passes, bram en comprar un RUC, fugida, porta dels edificis, equipament,
  instal·lació i premi del pub; campaneta del Wampus quan obre la porta i cofre quan el caces; inici de torn, avís quan queda ~10 % del temps i fi del temps; declaració, tic de subhasta, cada unitat
  negociada i tancament (també a la subhasta de terres); un efecte per a cada esdeveniment planetari i un de bo o dolent per als
  personals; la nau aterra a l'inici i s'envola al final.

## Llavor i determinisme

La configuració mostra una llavor editable (el botó **Nova** en genera una d'aleatòria). La mateixa llavor amb les mateixes
accions dona el mateix resultat: mapa, esdeveniments, variació de les collites, decisions de la IA i desempats surten d'un únic PRNG
sembrat (mulberry32) l'estat del qual es desa amb la partida. La cursa de terra i la caminada avancen en passos fixos de 10 ms del
rellotge del joc. A la pantalla final, **Repetir llavor** i **Nova llavor**. Amb `?seed=ABC123` a l'URL la configuració arrenca amb aquesta llavor.

## Desat

Desat automàtic a `localStorage` (clau `ruc-save-v1`, esquema **9**: seients humans i ordinadors amb el nom, color, espècie i controls de cada jugador, nivell, dipòsits de crystite, mapa conegut de la IA i assaigs del Torneig, espècie, parcel·les en venda, preu de l'última subhasta de terres, bossa d'esdeveniments planetaris i esdeveniments personals ja sortits) a cada frontera de fase, entre colon i colon del desenvolupament i a cada torn.
**Continuar** al títol reprèn a la fase desada.

«Desa i surt al títol» (menú de pausa) escriu un desat exacte a les fases **represables**: cursa de terra, desenvolupament (posició, RUC que
portes, rellotge, Wampus, ordre i esdeveniments ja sortejats), subhastes de terres (parcel·la, ofertes, temps, IA) i subhastes de béns (declaració o negociació, marcadors, contacte, IA). A la resta de fases es manté
l'últim desat de frontera, perquè tornar-hi a mitja fase podria aplicar-ne els efectes dues vegades. La liquidació del torn queda desada
a l'estat (`settlement`) i no es torna a executar mai.

**Desats antics:** un desat dels esquemes 1 a 8 (regles anteriors o un sol seient humà: estocs inicials, preus, temps, patrimoni, esdeveniments, dificultats, subhastes) **no es migra**: el joc avisa al títol que
és d'una versió anterior amb unes altres regles i l'esborra. Un desat malmès també s'avisa. Cap desat incompatible s'accepta en silenci.

## Paràmetres d'URL (proves i depuració)

- `?test=1` executa `runSelfTests()` i mostra PASS/FAIL sense iniciar cap partida (detall i resum de la partida completa a la `console`).
- `?debug=1` barra inferior amb fase, llavor, FPS, estocs, decisions IA i els botons **Següent fase**, **+1000 cr** i **Força esdeveniment**
  (aplica només aquell esdeveniment; els individuals, al jugador).
- `?autoplay=1` el jugador humà (J1) el controla la mateixa IA (desenvolupament instantani, com les IA de l'original); `&level=beginner` per al Principiant.

## Estructura

```text
ruc/
├── index.html        markup + full d'estil + <script> en ordre de càrrega
├── css/style.css
├── js/               scripts clàssics (no mòduls ES, perquè funcioni amb file://)
│   ├── core/         config.js (CONFIG, FEATURES, enums, RESOURCE_DEFS, EVENT_DEFS…), rng.js, assets.js
│   ├── state/        models de dades: Plot, PlayerState, StoreState, ResourceLedger + RucAudit, GameState
│   ├── systems/      lògica pura: torn, botiga, terra (i oficina de terres), producció, consum, liquidació, esdeveniments,
│   │                 puntuació, pub, Wampus, desat, subhasta, subhasta de terres, IA, ordre i caminada de desenvolupament (poble)
│   ├── ui/           hud.js (colors, formats, Hud), species-art.js, map-art.js (mapa procedural), overlays.js, input.js, controls.js (tecles per jugador i comandaments), audio.js, renderer.js
│   ├── screens/      title, setup, map, production, report, auction, land-auction, gameover
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

**El mapa no fa servir cap PNG.** El terra continu, la franja del riu, els cims de les muntanyes (1-3 per parcel·la: el nombre de cims
és la riquesa en smithore), el poble i la quadrícula es dibuixen amb Canvas (`js/ui/map-art.js`) en una capa fora de pantalla que només
es refà quan canvia el terreny (p. ex. un lliscament del terratrèmol planetari). Els detalls (còdols, mates, cràters, meandres) surten
d'un hash de la llavor de la partida i de les coordenades de la parcel·la, **no** del generador aleatori del joc: cada partida es veu
diferent, però sempre igual en tornar-la a carregar.

Mides reals dels PNG actuals (l'especificació en demanava d'altres; res no depèn d'aquestes mides):

| Asset | Mida actual |
|---|---|
| `bg_irata_sky`, `auction_hall_bg` | 1376×768 |
| `colony_store`, `colony_habitat` | 1264×848 |
| `resource_*`, `module_*`, `ruc_idle`, `ui_frame_9slice` | 1024×1024 |
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
- Velocitat ([C64] Estàndard: 16 fotogrames PAL per parcel·la lliure = **320 ms**; [codi Atari] Principiant: 32 fotogrames = **640 ms**;
  `CONFIG.LEVELS[*].cursorFrames`). «Reduir moviment» només treu la pulsació del marc; **no** altera la velocitat.
- **Pausa de reclamació** ([codi Atari] 4 passos del cursor: Estàndard 64 fotogrames = **1280 ms**, com els ~1,28 s mesurats al C64;
  Principiant **2550 ms**): després de cada reclamació el cursor **desapareix i queda aturat**. Ningú no pot reclamar durant la pausa (els premuts es perden i el botó queda desactivat),
  la parcel·la reclamada fa el flaix i el recorregut continua a la parcel·la **següent** a la reclamada, amb una espera completa.
  Si després d'una reclamació ja no queda cap colon que pugui reclamar (tots en tenen, o no queden parcel·les lliures), la fase s'acaba
  just després del flaix, sense esperar la pausa.
- Els temps es passen de fotogrames PAL a ms i s'arrodoneixen al pas de 10 ms del rellotge.
- Determinisme: el cursor avança amb el **rellotge del joc** en passos fixos de 10 ms (`CONFIG.LAND.stepMs`) i les accions de l'humà porten
  la marca de temps d'aquest rellotge. La mateixa llavor amb les mateixes accions amb marca de temps dona el mateix resultat, sigui quina
  sigui la taxa de fotogrames. La pausa del joc (Esc) congela el cursor, la pausa de reclamació i tots els temporitzadors de la IA; la pausa
  de reclamació i els temporitzadors de la IA es desen a `phaseData.land`, de manera que desar i recarregar a mig cursa (també a mitja pausa)
  reprèn exactament.
- IA: tria l'objectiu amb el seu mapa de valoració ([codi Atari], vegeu la taula de regles: millor explotació − distància a la botiga) només entre les
  parcel·les lliures **des del cursor endavant** (l'ordre de recorregut és públic) i prem a l'hora prevista d'arribada, desplaçada pel seu
  temps de reacció (400–900 ms) extret del PRNG sembrat. Si l'objectiu li'l prenen o el cursor
  el sobrepassa, en tria un altre d'endavant. Un premut és **sempre** sobre la parcel·la que hi ha sota el cursor en aquell moment: si la IA
  s'avança o es retarda, es queda la veïna. Durant la pausa de reclamació els temporitzadors de la IA **no corren**: s'esborren i es tornen a
  planificar (amb un temps de reacció nou) quan el cursor torna, de manera que la IA no guanya cap premut anticipat.
- Reclamacions simultànies (mateix pas de 10 ms): guanya qui té **menys patrimoni net**; a igualtat, l'ordre del torn anterior rotat una posició
  (torn 1: p0, p1, p2, p3). Qui perd conserva el dret a reclamar.

## Subhastes

**Temps** ([C64], PAL 50,125 Hz; [codi Atari]): la barra de temps compta unitats. Declaració: **31 unitats de 7 fotogrames** (≈ 4,3 s,
«Declareu-vos compradors o venedors»; al C64 «PUSH STICK TO DECLARE AS BUYER OR SELLER»), amb «La botiga té N unitats». Negociació:
**72 unitats** de **8 fotogrames** (≈ 11,5 s) si ningú no negocia; **60 fotogrames** per unitat mentre un comprador i un venedor es toquen
(el temps passa més a poc a poc, mesurat al C64; el codi Atari atura el rellotge); **30 fotogrames** (l'ATU sencera del codi Atari) mentre
l'humà mou el marcador. Al Principiant cada unitat dura 5/3 (ATU 50), el doble al primer torn. Quan s'acaba: «La subhasta s'ha acabat».

**Línies** ([codi Atari], [FN]): tots els marcadors (humà i IA) es mouen 1 cr cada 8 fotogrames. Els venedors comencen 1 pas per sobre del
preu de venda de la botiga i els compradors 10 per sota del de compra. Un comprador no pot passar de la línia de venedor més baixa (la de la
botiga, mentre tingui estoc) i un venedor no pot baixar de la línia de comprador més alta (o del preu de compra de la botiga).

**Negociació contínua** ([codi Atari]): mentre una línia de comprador toca una de venedor, passa **una unitat** al preu on es toquen cada
12, 12, 10, 8, 6, 4, 2, 2… BTU (de 4 fotogrames): cada cop més de pressa; si el contacte es trenca, torna a començar. Es mostra «N unitats
negociades». La botiga ven al seu preu mentre tingui estoc («La botiga s'ha quedat sense estoc!»; aleshores el preu entre colons no té
sostre) i compra al seu preu fins a 255 unitats. Un comprador sense prou diners no compra («El comprador no té diners»).

**Nivell crític** (línia negra sobre la barra d'estoc de cada carril, com al C64): menjar = necessitat del torn següent (0 al darrer
torn), energia = RUCs no energètics + 1, smithore cap. A l'Estàndard l'ordinador s'atura en arribar-hi («Venedor al nivell crític!») i
l'humà pot vendre per sota; al Principiant s'hi atura tothom.

## Subhasta de terres

Només a l'Estàndard, just després de l'adjudicació ([codi Atari], [C64]):

- Primer les parcel·les que els colons han marcat a l'oficina de terres (ven el propietari i cobra ell), després **0–3 parcel·les de la
  colònia** (1 + variació: 0 el 16,2 %, 1 el 67,7 %, 2 el 16,1 %, 3 el 0,1 %; mai més que parcel·les lliures; cobra la botiga).
- Preu inicial: **160 cr** a la primera subhasta de la partida; cada parcel·la següent, 60 cr menys que el preu de l'anterior; la primera
  d'un torn nou, 60 cr menys que la mitjana del torn anterior. Si una parcel·la de la colònia no rep cap oferta, compta com
  inicial / 2 + 52 i ja no se'n subhasten més aquell torn.
- Els marcadors dels postors pugen de 4 en 4 cr des de sota la línia «Les ofertes comencen a N cr»; ningú no pot oferir més del que té.
  Quan s'acaba el temps (72 unitats, com la negociació) guanya l'oferta més alta («Oferta més alta: N cr»); en empat, el colon amb menys
  patrimoni. Resultat: «Parcel·la venuda! Preu de venda: N cr» o «Sense ofertes / La parcel·la no s'ha venut!». La marca d'«EN VENDA»
  s'esborra sempre; una parcel·la no venuda es queda el propietari, amb el seu RUC si en tenia (el RUC també passa al comprador).
- IA: puja mentre no és l'oferta més alta i el preu següent no passa de la seva valoració (`AISystem.landValue`).

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
| Inventari inicial de cada colon: 4 menjar, 2 energia (Principiant 8 / 4) | codi Atari, C64 | `CONFIG.START_INV`, `CONFIG.LEVELS` |
| Botiga inicial 8 menjar / 8 energia / 8 smithore; 14 RUCs al corral (el manual en diu 16); Principiant 16 / 16 / 0 i 25 RUCs, restablerts cada torn | codi Atari, C64 | `CONFIG.STORE_START`, `RUC_START`, `levelRules`, `StoreSystem.betweenTurns` |
| Nivells: Principiant 6 torns, Estàndard 12, Torneig 12 | codi Atari, C64 | `CONFIG.LEVELS`, `lastRound` |
| Espècies: Flapper 1600 cr i +2 BTU per unitat, Humanoid 600 cr i −2 BTU, la resta 1000 cr; ordinadors = Mechtrons amb 1000 cr | codi Atari, C64 | `CONFIG.SPECIES`, `ConsumptionSystem.unitFrames` |
| Pub: bonificació 50/100/150/200 + (aleatori 0..255 mod 2 × unitats que queden), 250 si la suma passa de 255; acaba el torn | codi Atari, C64 | `PubSystem`, `DevWalk.enter` |
| Wampus: recompensa 100 × (torn / 4 enter + 1); primera aparició després de Ta/4 unitats (Ta = BTU esperats abans de prémer el botó, màx. 255; −100 si hi ha hagut esdeveniment personal); visible 1–4 unitats, després amagat: 50 % es queda 4–7 unitats, 50 % canvia a una muntanya a l'atzar al cap de 2 unitats; no surt si ets a la seva muntanya; un cop per torn, mai portant un RUC, els ordinadors mai; caçar-lo no acaba el torn | codi Atari, manual, C64 | `WampusSystem`, `DevWalk.act`, `MapScreen.drawWampus` |
| IA (`playerTurnAi`): mentre li queden ≥ 35 unitats valora els béns amb 2 torns simulats (preu simulat mitjà / 8, 0..31) i, per a cada parcel·la seva (de l'última a la primera, cadascuna un cop per torn), calcula el guany = millor explotació simulada − l'actual (0 si és buida; cal un RUC al corral i diners per pagar-lo); fa el guany més gran ≥ 2 que pugui pagar: compra RUC i equip, o **reequipa al lloc** un RUC que ja té (només paga l'equip). Sense reserva d'efectiu ni límit per perfil: el temps limita a ~3. Cada acció costa 25 + 4 × distància a la botiga (max(\|col − 4\|, 2 × \|fila − 2\|), +1 al riu: 1..5); després va al pub si en queden ≥ 3 | codi Atari | `AISystem.turn`, `develop`, `goodsQuality`, `bestExploitation`, `storeDist` |
| Valoració d'una explotació per la IA: (qualitat del bé + una bonificació de situació) × capacitat simulada (0..8). Bonificació (no al torn 1 ni a les subhastes de terres): menjar 11 sense cap RUC de menjar, 10 si en va curt (14 si la botiga no en té); energia 12 si no en va curt i té menys d'1/4 de RUCs d'energia, 11 si en va curt o en té just 1/4 (15 si la botiga no en té). Capacitat simulada: compta el RUC nou a la corba d'aprenentatge (i el bonus que guanyarien les altres quan completa un grup de 3) i +1 per veí propi del mateix bé (màx. 2; a la concessió +2 per cada veí propi, màx. 3) | codi Atari | `AISystem.exploitationRating`, `capacity` |
| Concessió de terres de la IA: mapa de valoració = millor explotació (3 torns simulats; al torn 1 un bé a l'atzar val 32: menjar 50 %, energia 25 %, smithore 25 %) − distància a la botiga; tria la millor des del cursor (a igualtat, la posterior; un 0 només 1/4), amb −1 després de la parcel·la 27 i −2 després de la 36 (només si l'escombrat ha començat abans, com al codi) | codi Atari | `AISystem.grantQuality`, `landRating`, `bestPlot`, `LandRace.plan` |
| IA a les subhastes: un ordinador que es quedaria sense menjar (o energia) per al torn següent compra fins al preu de la botiga, sigui quin sigui el seu perfil; el menjar que produiran els seus RUCs no compta (es menja abans de produir) | R.U.C. (la IA de subhasta no consta) | `AISystem.reserve`, `decide` |
| «Prem el botó per començar» i barra de temps vertical del color del jugador a la dreta del mapa | C64 | `Game.devStart`, `MapScreen.timeBar` |
| Poble: crystite (tancat fora del Torneig) · smithore · energia · menjar / assaig (tancat fora del Torneig) · oficina de terres · pub · corral «RUCs 100 cr»; «Els teus diners» a sota | C64 | `TOWN`, `MapScreen.drawTown` |
| Cursor de terra 16 fotogrames per parcel·la (Principiant 32) i pausa de 4 passos després d'una reclamació | C64, codi Atari | `LandRace.create` |
| Caminar: mapa 0,667 / 0,333 px per fotograma (h / v) sobre parcel·les de 32 px, poble 1,33 px per fotograma (h); terreny 6 / 14 / 21 fotogrames per pas | C64, codi Atari | `CONFIG.WALK`, `DevWalk.speed` |
| Valoració de la colònia round((total − 10.000) / 20.000) a 0..6 amb els 7 textos; First Founder només si ≥ 3 i al final | codi Atari | `ScoringSystem.rating`, `COLONY_RATINGS`, `Game.finish` |
| Entre torns la botiga fabrica min(14 − corral, smithore / 2) RUCs, 2 smithore cadascun; corral màxim 14; sense reposició gratuïta | codi Atari | `StoreSystem.betweenTurns`, `CONFIG.RUC_MAX` |
| Equip: menjar 25, energia 50, smithore 75, crystite 100 (Torneig) | manual, C64, codi Atari | `CONFIG.MODULE_COST` |
| Menjar necessari per torn: 3 (torns 1-4), 4 (5-8), 5 (9-12) | codi Atari, C64 | `CONFIG.FOOD_NEED` |
| Temps de desenvolupament: 10 + floor(91 × min(1, menjar/necessitat)) unitats de 28 fotogrames PAL (≈ 56,4 s amb prou menjar) | codi Atari, C64 | `ConsumptionSystem.devUnits`, `humanTimeMs` |
| Escassetat d'energia: per cada unitat que falta, un RUC no energètic triat a l'atzar (PRNG sembrat) no produeix | codi Atari | `ProductionSystem.activation` |
| Variació de la collita (Standard): −1 / 0 / +1 al 16 / 68 / 16 % (±2 ≈ 0,1 %), retallada a 0..8 | codi Atari | `ProductionSystem.variation`, `binomialStep` |
| Preu de botiga P: inicial menjar 30, energia 25, smithore 50; després de cada subhasta amb operacions, P = preu mitjà operat | codi Atari, C64 | `state.storePrice`, `StoreSystem.afterAuction` |
| La botiga compra / ven: menjar i energia a P − 15 / P + 20, smithore a P / P + 35 (torn 1: smithore 50/85, menjar 15/50, energia 10/45) | codi Atari, C64 | `StoreSystem.bid/ask` |
| Oferta i demanda: P × (0,25 + 0,75 × demanda/oferta), quocient en vuitens; smithore amb quocient entre 0,25 i 3, mínim provisional 50 i pas aleatori de 7 × binomial (−28..+28); mínims 30 / 25 / 20, sostre 250 | codi Atari | `StoreSystem.updatePrices`, `supplyDemand`, `limit` |
| Preu del RUC: 2 × preu del smithore arrodonit avall a desenes (100 al començament) | codi Atari, C64 | `StoreSystem.rucPrice` |
| Sense estoc a la botiga, el preu entre colons no té sostre | manual (Standard) | `AuctionEngine.playerMax` |
| Temps de subhasta: declaració 31 × 7 fotogrames, negociació 72 × 8 (60 per unitat en contacte); Principiant ATU 50 (×5/3), el doble al torn 1 | C64, codi Atari | `CONFIG.AUCTION`, `AuctionEngine.timing` |
| Línies 1 pas cada 8 fotogrames ($1 per pas a menjar, energia i smithore); transferència unitat a unitat cada 12, 12, 10, 8, 6, 4, 2… BTU mentre es toquen | codi Atari | `AuctionEngine.update`, `cadenceMs` |
| Nivell crític: menjar del torn següent, energia = RUCs no energètics + 1; a l'Estàndard només s'aturen els ordinadors, al Principiant tothom | codi Atari, manual | `ConsumptionSystem.criticalLevel`, `AuctionEngine.atCritical` |
| Subhasta de terres (Estàndard): 0–3 parcel·les de colònia, 160 cr la primera, −60 cr, sense ofertes = inicial / 2 + 52 i s'acaba el lot, 4 cr per pas, guanya la més alta (empat: menys patrimoni); primer les marcades a l'oficina | codi Atari, C64 | `LandAuction` |
| Retorn al corral: preu sencer del robot, mai l'equip; temps esgotat portant-lo o Acció fora de la casa: fuig | manual | `DevWalk`, `StoreSystem.refundRuc` |
| Corral → taller → casa de la parcel·la, a peu, amb el rellotge corrent; «cal entrar-hi del tot i sortir» | manual | `DevWalk`, `TOWN` |
| Una sola passada a la cursa de terra; empat per menys patrimoni | manual | `LandRace.endSweep` |
| Desenvolupament del líder a l'últim; al revés si al corral hi ha 7 RUCs o menys (el manual diu «menys de 7») | manual, codi Atari | `DevOrder` |
| Subhastes smithore → (crystite) → menjar → energia, amb declaració cronometrada; després el rol és fix | manual | `auctionResources`, `AuctionEngine.stage` |
| Empat a igual preu: guanya el colon amb menys patrimoni; la botiga, després dels colons | manual | `AuctionEngine._order` |
| Preu de l'operació on es toquen les línies (la del venedor) | manual | `AuctionEngine.tryTrade` |
| Esdeveniments personals: els 22 de l'original en el mateix ordre i amb els mateixos pesos; 27,5 % (22/80) a l'inici del torn de cada colon (humans i IA); cada un un cop per partida per a tothom; si el triat no val es prova el de sota (circular) fins a 20 cops | codi Atari, C64 (mateixos textos i ordre) | `EVENT_DEFS`, `EventSystem.rollIndividual`, `search` |
| El 1r mai rep un esdeveniment bo i els **dos últims** mai un de dolent (classificació de l'últim resum, empats a l'atzar) | codi Atari | `EventSystem.eligible`, `rankPlayers` |
| Import = \|pes\| × 25 × (floor(torn / 4) + 1); per RUC als de mineria, energia i menjar; els del RUC demanen tenir-ne algun d'instal·lat; una penalització que no es pot pagar s'anul·la en silenci | codi Atari | `EventSystem.amount`, `precondition`, `affordable` |
| Colon no líder amb 0 de menjar: rep el paquet (3 menjar, 2 energia) en lloc de l'esdeveniment triat | codi Atari | `EventSystem.rollIndividual` |
| Parcel·la perduda = la pròpia amb l'índex més alt (amb el seu RUC); parcel·la extra = una lliure a l'atzar | codi Atari | `EventSystem.build` |
| Planetaris: un per torn 1–11 d'una bossa sense reposició (plaga 3, pirates 2, pluja àcida 3, terratrèmol 3, taques solars 3, meteorit 2, radiació 2, incendi 2); el tiquet es gasta encara que no hi hagi objectiu; torn 12 «La nau ha tornat!» | codi Atari | `EventSystem.drawPlanet`, fases `PLANET_EVENT` / `PLANET_EVENT_AFTER` |
| Taques solars +3 d'energia per parcel·la (màx. 8); pluja àcida: fila del núvol menjar +4 / energia −2, la resta +1 / −1 (0..8); terratrèmol: mineria a la meitat | codi Atari | `ProductionSystem.applyEvents` |
| Meteorit: parcel·la que no sigui poble ni riu; en destrueix el RUC i hi deixa un dipòsit de crystite (`hiddenDeposit` = 4, sense difusió; la IA el coneix); «El meteorit crea un nou jaciment de crystite.» només al Torneig | codi Atari | `EventSystem.build` |
| Radiació (abans de la producció): fuig un RUC del 1r o 2n; plaga (després): una parcel·la de menjar amb producció del 1r o 2n la perd tota | codi Atari | `EventSystem.build`, `scanPlots` |
| Pirates (després de la producció): Estàndard i Principiant, tot el smithore dels colons **i de la botiga** i la producció de smithore del torn; Torneig, tot el crystite dels colons i la producció de crystite del torn (el smithore no es toca); incendi: la botiga es queda sense menjar, energia ni smithore | codi Atari, manual | `EventSystem.build` |
| Parcel·la = 500; objectiu de colònia 60.000 (valoració ≥ 3) sense mínim per colon | manual, codi Atari | `ScoringSystem`, `Game.finish` |
| Patrimoni: efectiu + béns al preu P de la botiga + 500 per parcel·la + per cada RUC instal·lat el cost de l'equip + 35 | codi Atari | `ScoringSystem.breakdown`, `CONFIG.RUC_WORTH` |
| Fracàs immediat si no hi ha cap RUC de menjar (o d'energia) i no en queda cap unitat enlloc (colons + botiga) | codi Atari | `ScoringSystem.colonyFailure`, fase `NEXT` |
| Torneig: cursor de terra 3 BTU (12 fotogrames), ATU 25, ordinadors amb 1200 cr (humans segons l'espècie), variació d'amplitud 2 (±4: 0 al 37,7 %, ±1 24,3 %, ±2 6,2 %), 0–5 parcel·les de colònia per torn (31,1 / 37,7 / 24,3 / 6,2 / 0,6 %) | codi Atari | `CONFIG.LEVELS.tournament`, `levelRules`, `LandAuction.colonyCount` |
| Dipòsits de crystite: 3 llavors HIGH en parcel·les diferents a l'atzar (riu i poble inclosos), diamant 3 − distància (guanya el més alt); riu i poble a −1 (no s'hi mina) però la difusió hi passa | codi Atari | `CrystiteSystem.create` |
| Producció de crystite: nivell del dipòsit + veí + corba d'aprenentatge + variació; necessita 1 energia; res al riu; es perd per sobre de 50 | codi Atari | `ProductionSystem.baseYield`, `SettlementSystem` |
| Preu del crystite 50 + aleatori(0..99) cada torn; la botiga compra a P arrodonit avall a múltiple de 4 i ven a aquest + 140; $4 per pas; l'estoc de la botiga torna a 0 després de cada subhasta de crystite; la subhasta només es fa si algú en té; compta al patrimoni al preu P | codi Atari, manual | `CrystiteSystem.drawPrice`, `StoreSystem.bid/ask`, `CrystiteSystem.shipOff` |
| Oficina d'assaig: «Agafa una mostra del sòl i torna» → Acció sobre qualsevol parcel·la («Mostra a punt: torna a l'oficina»; una segona: «Una parcel·la per viatge») → tornar-hi: «Gens de / Poc / Mitjà / Molt crystite a la parcel·la #n»; sense mostra: «Cal una mostra»; el meteorit (4) surt com a Molt; el rellotge continua | codi Atari | `DevWalk.assayOffice`, `takeSample` |
| Assaig de la IA: després d'instal·lar i abans del pub; 10 + 4 × distància a la botiga unitats, no amb menys de 22, cap si ja coneix 3 HIGH; primer les seves parcel·les i després les lliures, mai riu ni conegudes, 1/8 de probabilitat per candidata, preferència pel valor deduït (diamant al voltant d'un 2 o 3); també aprèn dels RUCs de crystite i dels meteorits | codi Atari | `CrystiteSystem.aiAssay`, `deduced` |
| IA del Torneig: compra tot l'estoc de la botiga (menjar/energia, només compradors, estoc ≤ 20); ven només aleatori(0..excedent) si l'excedent és petit (menjar < 6, energia < 9, preu ≤ 80); crystite: amb P < 100 només ven l'excés sobre 50 o el que li cal per arribar a 1000 cr, sense crystite en compra si P < 86 i té ≥ 1100 cr ((efectiu − 800) / P, màx. 25) | codi Atari | `AISystem.decide`, `decideCrystite`, `CONFIG.AI_TOURNAMENT` |
| Col·lusió (subhastes de béns del Torneig): ≥ 2 humans premen el botó en 10 jiffies, amb almenys un comprador i un venedor; «COL·LUSIÓ» parpelleja 3 cops (fons rosa), la resta i la botiga queden fora, temporitzador propi de 50 unitats, el principal es desa i es reprèn; «La col·lusió s'ha acabat»; es pot repetir; 100 jiffies entre premudes; els ordinadors mai | codi Atari, manual | `AuctionEngine.collusionPress`, `Game.auctionButton` |

### Valors provisionals i proves pendents

| Regla | Font | Implementació actual (provisional) | Confiança | Prova pendent |
|---|---|---|---|---|
| Moment de l'actualització de preus per oferta i demanda | codi Atari: la fórmula és segura, quan s'executa no | un cop al final de cada torn (després de les subhastes i abans de fabricar RUCs), de manera que el torn 1 obre als preus inicials com al C64; «producció» = collita d'aquell torn; necessitat d'energia = RUCs no energètics | mitjana | Registrar els preus de botiga torn a torn en emulador |
| Arrodoniment de P × (0,25 + 0,75 × quocient) | codi Atari: aritmètica entera, no transcrita | a la baixa | mitjana | Comparar preus de diversos torns en emulador |
| Mecanisme de la «binomial» (variació de collita i pas del smithore) | codi Atari: distribució simètrica a [−6, 6) amb els percentatges publicats | suma de 12 uniformes − 6, arrodonida lluny de zero; el pas del smithore limitat a ±4 (−28..+28) | mitjana (la distribució reprodueix els percentatges) | Transcriure la rutina `calcBinomiale` |
| Quins RUCs s'aturen si falta energia | codi Atari: «una explotació a l'atzar»; [FN] només entre les no energètiques | a l'atzar entre els RUCs no energètics, sense repetir | mitjana | Provocar escassetat amb diversos RUCs i mirar quins s'aturen |
| Béns al resum de patrimoni | codi Atari: al preu P; C64: el resum #0 mostra GOODS 150 per a 4 menjar + 2 energia (amb P 30/25 serien 170) | al preu P | mitjana (contradicció oberta) | Llegir el resum de patrimoni en emulador amb inventaris diferents |
| Moment de la comprovació del fracàs per manca total | codi Atari: la regla és segura, el moment no | al final de cada torn (fase `NEXT`) | mitjana | Provocar-ho en emulador |
| Límit de compra de la botiga | codi Atari: només s'ha vist el sostre de 255 | `storeBuyCap` 255 | mitjana | Vendre a la botiga fins que deixi de comprar |
| Temps de negociació | C64: 72–75 unitats mesurades; codi Atari: 70 | 72 (el mínim mesurat) | mitjana | Cronometrar diverses subhastes en emulador |
| Unitat de temps amb el joystick premut | codi Atari: ATU sencera (30 fotogrames) mentre es prem; C64 no mesurat | 30 fotogrames, només per a l'humà (els ordinadors no tenen joystick) | baixa | Cronometrar al C64 amb el joystick premut |
| Temps al Principiant | codi Atari: ATU 50, doblada al torn 1 | totes les unitats ×5/3 (×10/3 al torn 1), escalant les mesures del C64 | baixa | Cronometrar una subhasta del Principiant |
| Final anticipat de la subhasta | no consta | s'acaba si tots els colons estan fora 3 s o si cap operació és possible 5 s | baixa | Comprovar-ho en emulador |
| Subhasta de terres: quina parcel·la ofereix la colònia, el temps (72 unitats), les cartes d'inici (2 s) i resultat (2,5 s), preu inicial mínim 4 cr, marcadors 10 passos sota la línia | codi Atari: no consta | parcel·la lliure a l'atzar; resta com a la negociació | baixa | Observar subhastes de terres en emulador |
| Subhasta de terres: el venedor canvia el preu demanat | manual: si el venedor canvia el preu, es rebutgen les ofertes | no implementat: el venedor humà només mira | baixa | — |
| Valoració de la terra de la IA | codi Atari: (millor explotació amb qualitats fixes menjar 3 / energia 2 / smithore 6 / crystite 12,5 + torn/2, sense bonificació, + 0..7) × torns que queden; l'escala en diners no consta | aquesta valoració × 3 cr, mai més que l'efectiu − 200 (≈ 500–600 cr al torn 1; el C64 va vendre a 536) | baixa | — |
| Pluja àcida sobre un RUC de menjar sense energia | codi Atari: s'aplica a la producció de totes les parcel·les del tipus | també suma +1 de menjar (0 → 1) | mitjana | Provocar escassetat d'energia amb pluja àcida en emulador |
| Lliscament de muntanya del terratrèmol: casos límit | codi Atari: 50 %, muntanya a l'atzar, esquerra o dreta, −1 / +1 nivell, destrueix els RUCs | si el costat triat és fora del mapa, riu, poble o ja té 3 cims, es prova l'altre; si cap no val, no llisca | baixa | Observar terratrèmols en emulador |
| Moment del sorteig de la classificació dels esdeveniments | codi Atari: `ordersPlayer` del darrer resum, empats a l'atzar | sortejada un cop a l'inici de cada torn (PRNG sembrat) | mitjana | — |
| Arrodoniment del malbaratament amb quantitats senars | no consta | a la baixa (3 menjar → en perd 1; 3 energia → 0) | mitjana | Guardar 3 i 5 unitats i llegir l'estat |
| Retorn d'un RUC retirat d'una parcel·la | manual: «retorna'l al corral per 100 $» | es retorna el preu que es va pagar per aquell robot | mitjana | Retornar al corral un RUC comprat a un altre preu |
| RUC sense equipar premut sobre la casa | no consta | no s'instal·la i no fuig (avís) | baixa | Provar-ho en emulador |
| Empat de patrimoni en l'ordre de desenvolupament i a la subhasta | no consta | ordre de jugador estable; a la subhasta, temps d'espera i clau sembrada | baixa | — |
| Velocitat vertical al poble i geometria del poble | C64: només s'ha mesurat l'horitzontal (1,33 px/fotograma) | 0,667 px/fotograma en vertical (la meitat, com al mapa); carrer i passatge propis amb l'ordre d'edificis del C64 | baixa | Cronometrar recorreguts verticals al poble en emulador |
| «No s'hi admeten RUCs» al pub i a les oficines de terres i d'assaig | C64: la cadena «NO MULES ALLOWED» existeix, però no se sap a quins edificis surt | no s'hi pot entrar amb un RUC (no fuig) | baixa | Entrar al pub amb un RUC en emulador |
| Wampus: ordre entre el sostre de 255 BTU i el −100 de l'esdeveniment, arrodoniment a unitats senceres, punt exacte de la llum dins la parcel·la, caçar-lo amb Acció sobre la parcel·la, i el Principiant | codi Atari: les regles; manual: «salta-hi a sobre» i «si prems el botó el fas fora» (no es reprodueix) | sostre i després −100 (mínim 0), unitats senceres a la baixa, cantonada superior dreta, Acció en qualsevol punt de la parcel·la; també al Principiant | baixa | Caçar el Wampus en emulador (Estàndard i Principiant) |
| Rellotge a l'oficina de terres | manual: el temps s'atura mentre marques la parcel·la | el rellotge continua corrent | baixa | Comprovar-ho en emulador |
| Fi del torn portant un RUC al Principiant | codi Atari: només documenta que un premut equivocat «només avisa» | fuig igual que a l'Estàndard | baixa | Esgotar el temps amb un RUC al Principiant |
| Valors de la IA (reacció 400–900 ms, error ±8 %, reserva 3) i comportament a la subhasta | l'original no té nivells de IA i no se n'ha transcrit el comportament de subhasta | antics valors «Colònia» (`CONFIG.AI`); a la subhasta de béns deixa de comprar / vendre en arribar al seu límit | — | Transcriure la IA de subhasta del desassemblatge |
| Mostra d'assaig al riu | codi Atari: llegeix −1 i la comparació sense signe ho mostra com a HIGH (probablement un error) | «No crystite» (correcció de R.U.C.) | mitjana | Fer un assaig al riu en emulador |
| Assaig de la IA: final de la passada sense triar cap candidata | codi Atari: no llegit | la passada torna a començar fins que en tria una | baixa | — |
| IA del Torneig: «prou efectiu» per retenir l'excedent, i quan instal·la crystite | codi Atari: no quantificat / no transcrit | ≥ 300 cr; instal·la crystite en una parcel·la pròpia lliure amb un 2 o 3 conegut; la valoració de terra suma 1,5 × nivell conegut (≥ 2) | baixa | — |
| Col·lusió: durada en segons al C64 i què passa durant el parpelleig | codi Atari: 50 ATU (25 fotogrames, 6 sense joystick) | 50 unitats al ritme normal de la subhasta (ATU 25); durant el parpelleig i el missatge final no hi ha operacions ni rellotge | mitjana | Cronometrar una col·lusió en emulador |
| Llista d'assaigs al panell lateral | no és del C64 (l'original només mostra el missatge; res al mapa) | els teus resultats (fins a 6) al panell de la botiga | — (comoditat de R.U.C.) | — |
| Instal·lació i fugida animades (pujada/afegit/baixada del RUC; espurneig i sortida corrents); casa = tota la parcel·la | no són regles del C64, són decisions de disseny pròpies | 1800 ms d'instal·lació, 400+900 ms de fugida (`CONFIG.WALK.installMs/fleeShuffleMs/fleeRunMs`) | — (no aplica: no és una afirmació de fidelitat) | — |
| Botiga/corral: el colon es queda a la porta i només el RUC camina fins al taulell i torna | no és una regla del C64, és una decisió de disseny pròpia | cal empènyer 350 ms a la porta perquè comprometi la visita; 2200 ms de viatge del RUC (`CONFIG.WALK.doorHoldMs/visitMs`) | — (no aplica) | — |

### Ajornat (fora d'aquest encàrrec)

- Diversos jugadors humans (lot 9): la col·lusió ja funciona al motor, però amb un sol humà no es pot produir mai.
- Col·lusió a les subhastes de terres: només la descriu el manual; no se n'ha trobat el codi.

## Torneig

Implementat segons `docs/research/tournament.md` (§1–4). El crystite és un 4t recurs del registre (`RESOURCE_DEFS.crystite`) que només
s'activa al Torneig (`levelRules(state).crystite`; `enabledResources(state)`), de manera que l'Estàndard i el Principiant no canvien gens
(ni el flux del PRNG). Els dipòsits es generen en crear la partida i són ocults (`plot.hiddenDeposit`); `state.crystite` guarda les
llavors, el mapa conegut de la IA i els teus assaigs. Al poble s'obren la **botiga de crystite** (equip 100 cr) i l'**oficina d'assaig**.
La subhasta de crystite va entre la de smithore i la de menjar i només es fa si algú en té. A les subhastes, **Enter** és el botó del
joystick: amb dos humans (lot 9) dispara la **col·lusió** (`Game.auctionButton(pid)` → `AuctionEngine.collusionPress`); amb un sol humà
no passa res. Icones del crystite (cristall violeta) i del seu mòdul dibuixades amb codi (`PROCEDURAL_ART`), sense asset.
