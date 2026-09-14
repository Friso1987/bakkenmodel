1. Wat het is

Een statische webtool die Excel-bestanden genereert: bakkenmodellen (waterbalansen) voor eerstejaars hbo-watermanagement. Elk gegenereerd bestand bevat precies één ingebouwde fout, of geen enkele. Studenten moeten de fout vinden en beargumenteren waarom het een fout is.

De docent kiest de context, de fouttypes, het aantal varianten en de mate van opmaakvariatie. De tool levert een zip met studentbestanden plus een docentensleutel.

Doel van de opmaakvariatie: voorkomen dat studenten fouten leren herkennen aan de vorm in plaats van aan de inhoud. Twee bestanden met dezelfde fout moeten er wezenlijk anders uitzien.

2. Harde eisen
Geen backend, geen server, geen LLM-aanroep. Draait volledig client-side.
Deploybaar op GitHub Pages (build naar /docs, of gh-pages branch).
Output is altijd .xlsx, gegenereerd in de browser.
Deterministisch: dezelfde seed plus dezelfde instellingen levert byte-identieke inhoud.
Exact één fout per variant, of nul. Nooit twee.
Alle student-facing tekst in het Nederlands. Code en identifiers in het Engels.
Geen macro's in de output.
3. Stack
Vite, vanilla TypeScript. Geen framework nodig, de UI is één pagina.
exceljs voor het schrijven van de werkmap. Bewust niet SheetJS: we hebben celopmaak, celopmerkingen en { formula, result } nodig, waarbij result bewust kan afwijken van wat de formule zou opleveren. Dat is een van de fouttypes.
jszip voor de bundel.
vitest voor de zelftests.
Seeded RNG (mulberry32 of vergelijkbaar), geen Math.random() ergens in de generatie.
4. Architectuur

De kernregel: fouten worden geïnjecteerd op modelniveau, niet op celniveau.

Een fout is een transformatie op het modelobject, voordat er ook maar iets gerenderd is. Zo werkt elke foutcode automatisch in elke layout en elke opmaakvariant. Cellen achteraf aanpassen breekt zodra de layout verandert, en maakt de sleutel onbetrouwbaar.

Pijplijn:

context  ->  buildModel()  ->  injectError()  ->  pickLayout() + pickStyle()  ->  render()  ->  xlsx
                   |                 |
                solve()           solve()      ->  impact = verschil tussen beide uitkomsten

Mappen:

src/
  catalog/contexts/      stad-wijk.ts, polder.ts, stroomgebied.ts
  core/model.ts          WaterBalanceModel
  core/solve.ts          pure rekenfunctie
  core/rng.ts            seeded RNG
  errors/                één bestand per foutcode
  errors/index.ts        registry
  layout/                diagram.ts, table.ts, hybrid.ts
  style/                 de opmaak-assen
  render/workbook.ts     ExcelJS
  render/diagram.ts      SVG bouwen, naar PNG
  key.ts                 docentensleutel
  ui/
Het model
ts
type WaterBalanceModel = {
  id: string
  context: 'stad-wijk' | 'polder' | 'stroomgebied'
  area: { id: string; label: string; value: number; unit: 'ha' | 'm2' }
  buckets: Bucket[]          // id, label, beginberging, max, eenheid
  fluxes: Flux[]             // id, label, van bucket|extern, naar bucket|extern, symbool, eenheid
  timeseries: { step: 'dag' | 'maand'; labels: string[]; values: Record<fluxId, number[]> }
  assumptions: Assumption[]  // id, tekst, waarde, eenheid
  sources: Source[]          // id, verwijst naar parameter- of fluxId, bron, jaartal
}

Elk element heeft een stabiele id. De renderer houdt een idToCell map bij, zodat de sleutel de exacte celverwijzing kan noemen waar de fout terechtkwam.

Een foutmodule
ts
export const STR_01: ErrorDef = {
  code: 'STR-01',
  layer: 2,
  label: 'Ontbrekende term in de balans',
  applies: (m) => m.context === 'polder',
  apply: (m, rng) => { /* verwijdert de kwelflux, geeft de aangeraakte ids terug */ },
  explain: (m, touched) => ({
    wat: '...',
    waarom: '...',
    gevolg: '...',
    ankers: ['...', '...', '...'],   // drie acceptabele studentantwoorden voor het nakijken
  }),
}

applies is belangrijk: niet elke fout past in elke context. Een kwelfout in een stedelijk straatprofiel is onzin. De registry filtert daarop en waarschuwt in de UI als de docent een combinatie kiest die niets oplevert.

5. Foutcatalogus
Code	Laag	Omschrijving
EEN-01	1	mm bij m3 opgeteld
EEN-02	1	ha versus m2, factor 10.000 zoek
EEN-03	1	mm/dag niet omgerekend naar mm/maand
EEN-04	1	debiet en volume verwisseld (l/s als m3 behandeld)
STR-01	2	term ontbreekt, bijvoorbeeld kwel in de polder
STR-02	2	verkeerd teken, ingaande post als uitgaand opgevoerd
STR-03	2	berging weggelaten, stationair gerekend bij een dynamische vraag
STR-04	2	dubbeltelling, afvoer zit in twee posten
STR-05	2	bak zonder uitgang, berging loopt oneindig op
SCH-01	3	tijdstapmismatch, dagneerslag met maandgemiddelde verdamping
SCH-02	3	oppervlakken inconsistent, som deelgebieden ongelijk aan totaal
SCH-03	3	verhardingspercentage op de verkeerde bak toegepast
SCH-04	3	parameter buiten fysisch bereik (gewasfactor 3,5; klei met zandinfiltratie)
SCH-05	3	jaargemiddelde gebruikt voor een piekbuivraag
SCH-06	3	neerslagstation buiten het gebied, of interpolatie met één station
NAV-01	4	hardcoded getal midden in een formule
NAV-02	4	geen eenheden bij de kolomkoppen
NAV-03	4	aannames nergens vastgelegd
NAV-04	4	verkeerde celverwijzing die toevallig voor de eerste rij klopt
NAV-05	4	invoer, berekening en uitvoer door elkaar op één tabblad
NAV-06	4	formule aanwezig, maar de getoonde waarde komt er niet uit
INT-01	5	conclusie niet gedekt door de uitkomst
INT-02	5	model beantwoordt de gestelde vraag niet (jaarbalans bij wateroverlast)
INT-03	5	schijnnauwkeurigheid, drie decimalen op een geschatte flux
INT-04	5	maatregel doorgerekend in de verkeerde bak
NUL-00	0	geen fout

Voor INT-codes heeft het model een korte conclusietekst nodig, die dus onderdeel is van het modelobject en niet van de renderer.

Impact

Na injectie wordt solve() twee keer aangeroepen. De relatieve afwijking in de hoofduitkomst bepaalt de impactklasse: klein (< 5%), middel (5 tot 50%), groot (> 50%). Voor NAV- en INT-codes die de uitkomst niet veranderen is de klasse geen. Dat is expressief: een grove fout met klein gevolg en een kleine fout met enorm gevolg zijn allebei didactisch waardevol, en de docent wil daarop kunnen selecteren.

6. Layouts
A, diagram — bakken en pijlen, waarden in of naast de blokjes. Geen tabellen.
B, tabel — invoertabel, berekeningstabel, uitvoertabel.
C, hybride — diagram plus tabellen.

Diagram: bouw een SVG in de browser (eenvoudige boxes-and-arrows layout, vaste posities per context, dus geen graph layout engine), converteer naar PNG via canvas, en sluit in met worksheet.addImage. ExcelJS kan geen native Excel-vormen schrijven, dus dit is de route. De afbeelding is niet bewerkbaar door de student, wat voor een auditopdracht acceptabel is.

7. Opmaak-assen

Elke as wordt onafhankelijk geloot uit de seed. Dit is de bron van de visuele variatie.

As	Opties
bronvermelding	apart tabblad / kolom naast de waarde / celopmerking / voetnoot onder de tabel / helemaal afwezig
eenheden	in de kolomkop / eigen kolom / als tekst achter de waarde
formules	echte formules / alleen waarden / mix
tabbladen	alles op één tabblad / invoer-berekening-uitvoer gescheiden
tijdreeks	maanden in rijen / maanden in kolommen
labels	volluit ("neerslag") / symbool ("P") / beide ("neerslag (P)")
thema	4 vaste combinaties van kleur, lettertype en randen. Niet volledig random, dat wordt lelijk
kolomvolgorde	2 of 3 zinnige varianten

Belangrijke regel: een opmaakkeuze mag op zichzelf nooit een fout zijn, behalve wanneer die expliciet als NAV-code is gekozen. "Eenheden als tekst achter de waarde" is lelijk maar niet fout. Als de docent NAV-02 kiest, dan verdwijnen de eenheden echt. De student moet kunnen weten wat telt. Bouw een assert die dit afdwingt.

8. UI

Eén pagina, geen router, geen inlog. De gebruiker is een docent die dit twee keer per jaar gebruikt en geen handleiding leest.

Controls:

context: multiselect
fouttypes: boomstructuur per laag, aanvinkbaar, met "hele laag" aan/uit
aantal varianten totaal, plus optioneel per foutcode een aantal
aandeel NUL-00, default 25%
layoutmix: alleen A / alleen B / alleen C / gemengd
opmaakvariatie: laag (één thema, weinig assen) / hoog (alles geloot)
seed: leeg laten voor willekeurig, wordt na generatie getoond
preview: render één variant als HTML-tabel in de pagina voordat er iets gedownload wordt, zodat de docent kan controleren of het klopt
knop "Genereer bestanden"

Toon bij een onmogelijke combinatie (bijvoorbeeld alleen kwelfouten plus alleen stedelijke context) meteen een melding met wat er wel kan, niet pas na het klikken.

Vormgeving: functioneel en rustig, dit is gereedschap en geen product. Eén heldere kolom, sentence case, knoppen die zeggen wat er gebeurt. Geen dashboardkaarten, geen gradienten.

9. Output
WAMTEK_bakkenmodellen_<seed>.zip
  studenten/
    WAMTEK_<context>_<seed>_01.xlsx     ... geen enkele hint over de fout
  docent/
    sleutel.md                          ... leesbare sleutel
    sleutel.xlsx                        ... zelfde inhoud, filterbaar
    correcte-modellen/                  ... het foutloze moedermodel per variant
  generatie.json                        ... alle instellingen plus seed, voor exacte reproductie

Per variant in de sleutel: bestandsnaam, seed, context, layout, foutcode, laag, celverwijzing of "in het diagram", wat er fout is, waarom, gevolg voor het advies, impactklasse, en de drie ankerantwoorden.

10. Zelftests

Niet optioneel. Bouw ze mee vanaf fase 1.

solve() op elk foutloos model: balans sluit binnen 0,1%
elk foutmodel: precies één afwijking ten opzichte van het moedermodel, niet meer
elke foutcode rendert in alle toegestane layouts zonder crash
opmaak-assen veranderen nooit een uitkomst van solve()
dezelfde seed levert twee keer dezelfde werkmap (vergelijk op de gegenereerde buffer)
elke foutcode heeft een explain() met minstens drie ankerantwoorden

Handmatig te controleren bij de eerste build: openen de bestanden zonder reparatiemelding in Excel, LibreOffice en Google Sheets.

11. Bouwvolgorde

Stop na elke fase en laat het resultaat zien.

model.ts, solve.ts, context stad-wijk. Output naar de console. Tests groen.
render/workbook.ts met layout B, geen fouten, geen opmaakvariatie. Eén xlsx op schijf.
Foutinjectie, lagen 1 en 2. Sleutel als markdown.
Opmaak-assen plus layout C.
UI plus zip-download.
Layout A, dus het diagram.
Resterende fouten (lagen 3 tot 5) en de overige twee contexten.
Deploy naar GitHub Pages.
12. Buiten scope
automatisch nakijken van studentantwoorden
inlog, opslag, accounts
een backend van welke aard dan ook
het genereren van de opgavetekst zelf, die schrijft de docent
