# Bakkenmodellen met één fout

Een statische webtool die Excel-waterbalansen genereert voor eerstejaars hbo-watermanagement.
Elk gegenereerd bestand bevat **precies één ingebouwde fout, of geen enkele**. Studenten zoeken
de fout en beargumenteren waarom het er een is. De docent krijgt een zip met de studentbestanden,
een sleutel en de foutloze moedermodellen.

De tool draait volledig in de browser. Geen server, geen account, geen AI-aanroep.

## Gebruiken

1. Open de pagina.
2. Kies de context (stad en wijk, polder, stroomgebied), vink de fouttypes aan, zet het aantal
   varianten en het aandeel foutloze bestanden.
3. Klik op **Toon één variant** om te controleren of het klopt.
4. Klik op **Genereer bestanden** en download de zip.

De seed wordt na afloop getoond. Dezelfde seed met dezelfde instellingen levert exact dezelfde
bestanden op, tot op de byte. Zet de seed in `generatie.json` terug in het invoerveld om een
partij te herhalen.

### Wat er in de zip zit

```
WAMTEK_bakkenmodellen_<seed>.zip
  studenten/            de bestanden voor de studenten, zonder enige hint over de fout
  docent/sleutel.md     leesbare sleutel, één hoofdstuk per variant
  docent/sleutel.xlsx   dezelfde inhoud als filterbare tabel
  docent/correcte-modellen/   het foutloze moedermodel per variant
  generatie.json        alle instellingen plus seed, voor exacte reproductie
```

De sleutel noemt per variant de bestandsnaam, de context, de layout, de foutcode en laag, de
celverwijzing waar de fout terechtkwam, wat er fout is, waarom dat fout is, het gevolg voor het
advies, de impactklasse en drie ankerantwoorden om op na te kijken.

## De foutcatalogus

| Laag | Waar het over gaat | Codes |
| --- | --- | --- |
| 0 | geen fout | NUL-00 |
| 1 | eenheden | EEN-01 t/m EEN-04 |
| 2 | structuur van de balans | STR-01 t/m STR-05 |
| 3 | schematisatie | SCH-01 t/m SCH-06 |
| 4 | navolgbaarheid | NAV-01 t/m NAV-06 |
| 5 | interpretatie | INT-01 t/m INT-04 |

Niet elke fout past in elke context: een fout met een debiet in l/s heeft een gemaal nodig, een
tijdstapfout een reeks met dagen. De pagina waarschuwt daar meteen voor, en de sleutel meldt wat
er is overgeslagen.

### Impactklasse

Na injectie wordt de balans twee keer doorgerekend: één keer op het moedermodel en één keer op het
foutmodel. De relatieve afwijking in de hoofduitkomst bepaalt de klasse: klein (< 5%), middel
(5 tot 50%), groot (> 50%), of geen als de uitkomst niet verandert. Een grove fout met een klein
gevolg en een kleine fout met een enorm gevolg zijn allebei didactisch waardevol, dus op die
klasse valt te selecteren.

## Hoe het in elkaar zit

De kernregel: **fouten worden geïnjecteerd op modelniveau, niet op celniveau.** Een fout is een
transformatie op het modelobject, voordat er iets gerenderd is. Daardoor werkt elke foutcode
automatisch in elke layout en in elke opmaakvariant, en blijft de sleutel kloppen.

```
context ─▶ buildModel() ─▶ injectError() ─▶ pickLayout() + pickStyle() ─▶ render() ─▶ xlsx
              │                 │
           solve()           solve()   ─▶ impact = verschil tussen beide uitkomsten
```

```
src/
  catalog/contexts/   stad-wijk, polder, stroomgebied
  core/model.ts       het modelobject
  core/solve.ts       pure rekenfunctie
  core/expr.ts        formules als boom, zodat de renderer er Excel-formules van kan maken
  core/rng.ts         seeded RNG; Math.random komt in de generatie niet voor
  errors/             één bestand per foutcode, plus de registratie
  layout/             diagram (A), tabellen (B), hybride (C)
  style/              de opmaak-assen en de assert die ze in toom houdt
  render/             ExcelJS-werkmap, formules, diagram, canvas
  planning.ts         welke variant krijgt welke fout
  generate.ts         van plan naar bestand
  key.ts              de docentensleutel
  bundle.ts           de zip
  ui/                 de pagina
```

### Opmaakvariatie

Twee bestanden met dezelfde fout moeten er wezenlijk anders uitzien, anders leren studenten de
fout herkennen aan de vorm in plaats van aan de inhoud. Acht assen worden onafhankelijk uit de
seed geloot: waar de bronvermelding staat, waar de eenheden staan, of er formules in staan, hoeveel
tabbladen er zijn, of de maanden in rijen of in kolommen staan, hoe de labels heten, de
kolomvolgorde en het thema.

Harde regel: **een opmaakkeuze is nooit op zichzelf een fout.** Eenheden als tekst achter de waarde
is lelijk, maar niet fout. Alleen een gekozen NAV-code haalt echt iets weg. `src/style/assert.ts`
dwingt dat bij elke variant af en laat de generatie klappen als het misgaat.

## Ontwikkelen

```bash
npm install
npm run dev        # ontwikkelserver
npm test           # de zelftests
npm run build      # typecheck plus build naar docs/
```

Handig op de opdrachtregel:

```bash
npm run demo    -- --context polder --seed p1     # model en uitkomst op de console
npm run xlsx    -- --seed wam-1 --layout C        # één werkmap naar out/
npm run errors  -- stroomgebied                   # alle foutcodes met hun impact
npm run batch   -- --total 12 --layouts gemengd   # hele partij met sleutel naar out/batch/
npm run diagram -- polder p1                      # het diagram als svg naar out/
```

### Zelftests

`npm test` draait onder meer:

- `solve()` op elk foutloos model: de balans sluit binnen 0,1 procent, geen bak raakt negatief of
  loopt over, en er komt geen enkele vlag uit;
- elk foutmodel wijkt op precies de gemelde punten af van het moedermodel, niet meer en niet minder;
- elke foutcode rendert in elke toegestane layout en in elke opmaakvariant zonder te klappen;
- de opmaak-assen veranderen nooit een getal in het bestand;
- dezelfde seed levert twee keer dezelfde werkmap en dezelfde zip, tot op de byte, ook als er
  meerdere bestanden tegelijk gemaakt worden;
- elke foutcode heeft een uitleg met minstens drie ankerantwoorden;
- de studentbestanden noemen nergens een foutcode.

### Reproduceerbaarheid

ExcelJS en JSZip zetten allebei zonder ingrijpen de klok van dat moment in hun zip-headers. Twee
identieke werkmappen die een seconde na elkaar geschreven worden, verschillen dan in bytes. Daarom
wordt elk bestand na het schrijven opnieuw ingepakt met een vaste datum
(`src/render/zip.ts`), en worden er geen losse mapingangen aangemaakt.

## Publiceren op GitHub Pages

`npm run build` zet de site in `docs/`. Zet in de repository-instellingen onder Pages de bron op
**branch `main`, map `/docs`**, commit `docs/` mee, en de tool staat online.

## Buiten scope

Automatisch nakijken van studentantwoorden, inlog of opslag, een backend van welke aard dan ook,
en het schrijven van de opgavetekst zelf. Dat laatste doet de docent.
