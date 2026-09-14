/**
 * Context stroomgebied: een beekdal met bodem, grondwater en de beek zelf.
 *
 *   atmosfeer ──P──▶ wortelzone ──percolatie──▶ grondwater ──basisafvoer──▶ beek ──▶ meetpunt
 *                         └────snelle afvoer────────────────────────────────┘
 *
 * Wat deze context toevoegt: een grondwaterbak als lineair reservoir, en een
 * gebied dat uit drie landgebruiken bestaat met elk een eigen gewasfactor.
 * Daar hangen de schematisatiefouten aan.
 */
import { add, con, div, flx, fnMax, fnMin, mul, par, ser, stor, sub, sum, type Expr } from '../../core/expr'
import {
  bucketRef,
  defaultPresentation,
  externRef,
  type Assumption,
  type Bucket,
  type Flux,
  type InputSeries,
  type Source,
} from '../../core/model'
import { roundTo } from '../../core/rng'
import type { ContextDefinition } from './types'

const MAANDEN = [
  'januari', 'februari', 'maart', 'april', 'mei', 'juni',
  'juli', 'augustus', 'september', 'oktober', 'november', 'december',
]

const P_NORMAAL = [76, 62, 56, 42, 62, 73, 85, 92, 80, 90, 86, 88]
const E_NORMAAL = [9, 17, 38, 61, 86, 92, 93, 78, 49, 25, 10, 6]

const BEKEN = ['de Grote Aa', 'de Zwarte Beek', 'de Reest', 'de Hunsel', 'de Dommelbeek', 'de Veldbeek', 'de Rietbeek']
const MEETPUNTEN = ['Molenbrug', 'Stuw Zuid', 'Meetpunt Kerkeind', 'Brug Heideweg', 'Stuw De Wielen']

function mmOverArea(mm: Expr, areaId: string): Expr {
  return mul(div(mm, con(1000, '1000 mm/m')), mul(par(areaId), con(10000, '10.000 m²/ha')))
}

export const stroomgebied: ContextDefinition = {
  id: 'stroomgebied',
  label: 'Stroomgebied',
  description: 'Beekdal met wortelzone, grondwater als lineair reservoir en afvoer bij een meetpunt.',

  build(seed, rng) {
    const beek = rng.pick(BEKEN)
    const meetpunt = rng.pick(MEETPUNTEN)
    const bronjaar = rng.int(2019, 2024)

    const totaalRuw = rng.float(1200, 4200)
    const fBos = rng.float(0.15, 0.4)
    const fBebouwd = rng.float(0.04, 0.12)
    const aBos = roundTo(totaalRuw * fBos, 0)
    const aBebouwd = roundTo(totaalRuw * fBebouwd, 0)
    const aLandbouw = roundTo(totaalRuw - aBos - aBebouwd, 0)
    const areaTotal = roundTo(aBos + aLandbouw + aBebouwd, 0)

    const kBos = rng.round(1.05, 1.25, 2)
    const kLandbouw = rng.round(0.9, 1.05, 2)
    const kBebouwd = rng.round(0.3, 0.55, 2)
    const sBodemMax = rng.int(90, 160)
    const sBodemStart = Math.round(sBodemMax * rng.float(0.6, 0.85))
    const cAfvoer = rng.round(0.55, 0.85, 2)
    const reactietijd = rng.round(2.5, 7, 1)
    const gwStart = rng.int(60, 140)

    const neerslag = P_NORMAAL.map((mm) => Math.round(mm * rng.float(0.9, 1.15)))
    const verdamping = E_NORMAAL.map((mm) => Math.max(2, Math.round(mm * rng.float(0.94, 1.06))))

    const sources: Source[] = [
      { id: 'bron-p', target: 'P', reference: `KNMI, maandsommen neerslag station ${meetpunt.split(' ').pop()} (afgerond)`, year: bronjaar },
      { id: 'bron-e', target: 'E_ref', reference: 'KNMI, referentiegewasverdamping volgens Makkink (afgerond)', year: bronjaar },
      { id: 'bron-lgn', target: 'A_tot', reference: 'Landelijk Grondgebruiksbestand Nederland (LGN)', year: bronjaar - 1 },
      { id: 'bron-gewas', target: 'k_bos', reference: 'STOWA, gewasfactoren per landgebruik', year: 2018 },
      { id: 'bron-bodem', target: 'S_bodem_max', reference: 'BOFEK-bodemfysische eenhedenkaart', year: 2020 },
      { id: 'bron-reservoir', target: 'reactietijd', reference: `Afvoeranalyse ${beek}, recessieconstante uit de laagwaterperiode`, year: bronjaar },
    ]

    const assumptions: Assumption[] = [
      { id: 'A_bos', label: 'bos en natuur', text: 'Bos, heide en natuurgrasland in het stroomgebied.', value: aBos, unit: 'ha', decimals: 0, role: 'deeloppervlak', sourceId: 'bron-lgn' },
      { id: 'A_landbouw', label: 'landbouw', text: 'Akkerbouw en grasland.', value: aLandbouw, unit: 'ha', decimals: 0, role: 'deeloppervlak', sourceId: 'bron-lgn' },
      { id: 'A_bebouwd', label: 'bebouwd gebied', text: 'Dorpskernen en wegen; hier stroomt de neerslag snel af.', value: aBebouwd, unit: 'ha', decimals: 0, role: 'deeloppervlak', sourceId: 'bron-lgn' },
      { id: 'k_bos', label: 'gewasfactor bos', text: 'Bos onderschept en verdampt meer dan het referentiegewas.', value: kBos, unit: '-', decimals: 2, role: 'parameter', range: [0.8, 1.4], sourceId: 'bron-gewas' },
      { id: 'k_landbouw', label: 'gewasfactor landbouw', text: 'Gras en akkerbouw, gemiddeld over het seizoen.', value: kLandbouw, unit: '-', decimals: 2, role: 'parameter', range: [0.7, 1.2], sourceId: 'bron-gewas' },
      { id: 'k_bebouwd', label: 'gewasfactor bebouwd', text: 'Op verhard oppervlak verdampt weinig.', value: kBebouwd, unit: '-', decimals: 2, role: 'parameter', range: [0.1, 0.7], sourceId: 'bron-gewas' },
      { id: 'S_bodem_max', label: 'bergingscapaciteit wortelzone', text: 'Hoeveel vocht de wortelzone maximaal vasthoudt.', value: sBodemMax, unit: 'mm', decimals: 0, role: 'parameter', range: [50, 200], sourceId: 'bron-bodem' },
      { id: 'S_bodem_start', label: 'beginberging wortelzone', text: 'Vochtvoorraad in de wortelzone op 1 januari.', value: sBodemStart, unit: 'mm', decimals: 0, role: 'parameter' },
      { id: 'S_gw_start', label: 'beginvoorraad grondwater', text: 'Grondwatervoorraad boven het drainageniveau op 1 januari.', value: gwStart, unit: 'mm', decimals: 0, role: 'parameter' },
      { id: 'c_afvoer', label: 'afvoercoëfficiënt bebouwd', text: 'Deel van de neerslag op bebouwd gebied dat direct de beek bereikt.', value: cAfvoer, unit: '-', decimals: 2, role: 'parameter', range: [0.3, 0.95] },
      { id: 'reactietijd', label: 'reactietijd grondwater', text: 'Hoe traag het grondwater leegloopt naar de beek; een groter getal betekent een tragere beek.', value: reactietijd, unit: 'dag', decimals: 1, role: 'parameter', range: [1, 12], sourceId: 'bron-reservoir' },
    ]

    const inputs: InputSeries[] = [
      { id: 'P', label: 'neerslag', symbol: 'P', unit: 'mm/maand', decimals: 0, sourceId: 'bron-p' },
      { id: 'E_ref', label: 'referentieverdamping', symbol: 'E_ref', unit: 'mm/maand', decimals: 0, sourceId: 'bron-e' },
    ]

    const atmosfeer = externRef('atmosfeer', 'atmosfeer')
    const benedenstrooms = externRef('benedenstrooms', `meetpunt ${meetpunt}`)

    const buckets: Bucket[] = [
      {
        id: 'wortelzone', label: 'wortelzone',
        initialStorage: roundTo((sBodemStart / 1000) * areaTotal * 10000, 3),
        initialExpr: mmOverArea(par('S_bodem_start'), 'A_tot'),
        initialParam: 'S_bodem_start',
        maxStorage: roundTo((sBodemMax / 1000) * areaTotal * 10000, 3),
        maxExpr: mmOverArea(par('S_bodem_max'), 'A_tot'),
        capacityParam: 'S_bodem_max',
        unit: 'm3',
        note: 'Vochtvoorraad in de bodem over het hele stroomgebied.',
      },
      {
        id: 'grondwater', label: 'grondwater',
        initialStorage: roundTo((gwStart / 1000) * areaTotal * 10000, 3),
        initialExpr: mmOverArea(par('S_gw_start'), 'A_tot'),
        initialParam: 'S_gw_start',
        maxStorage: null,
        unit: 'm3',
        note: 'Lineair reservoir: hoe voller, hoe meer basisafvoer.',
      },
      {
        id: 'beek', label: 'de beek',
        initialStorage: 0,
        maxStorage: null,
        unit: 'm3',
        note: 'De beek houdt niets vast op maandbasis; wat erin komt gaat het meetpunt voorbij.',
      },
    ]

    const fluxes: Flux[] = [
      {
        id: 'P_gebied', label: 'neerslag op het stroomgebied', symbol: 'P',
        from: atmosfeer, to: bucketRef('wortelzone'), unit: 'm3/maand',
        definition: { kind: 'expr', expr: mmOverArea(ser('P'), 'A_tot') }, decimals: 0,
      },
      {
        id: 'E_gebied', label: 'verdamping uit het gebied', symbol: 'E',
        from: bucketRef('wortelzone'), to: atmosfeer, unit: 'm3/maand',
        definition: {
          kind: 'expr',
          // Elk landgebruik verdampt anders; de posten worden bij elkaar opgeteld.
          expr: fnMin(
            sum([
              mul(mmOverArea(ser('E_ref'), 'A_bos'), par('k_bos')),
              mul(mmOverArea(ser('E_ref'), 'A_landbouw'), par('k_landbouw')),
              mul(mmOverArea(ser('E_ref'), 'A_bebouwd'), par('k_bebouwd')),
            ]),
            add(stor('wortelzone'), flx('P_gebied')),
          ),
        },
        decimals: 0,
        note: 'Per landgebruik een eigen gewasfactor, nooit meer dan er aan vocht is.',
      },
      {
        id: 'Q_snel', label: 'snelle afvoer van bebouwd gebied', symbol: 'Q_s',
        from: bucketRef('wortelzone'), to: bucketRef('beek'), unit: 'm3/maand',
        definition: {
          kind: 'expr',
          expr: fnMin(
            mul(mmOverArea(ser('P'), 'A_bebouwd'), par('c_afvoer')),
            fnMax(con(0), sub(add(stor('wortelzone'), flx('P_gebied')), flx('E_gebied'))),
          ),
        },
        decimals: 0,
        note: 'Neerslag op verhard oppervlak bereikt de beek binnen dezelfde maand.',
      },
      {
        id: 'Perc', label: 'percolatie naar het grondwater', symbol: 'R',
        from: bucketRef('wortelzone'), to: bucketRef('grondwater'), unit: 'm3/maand',
        definition: {
          kind: 'expr',
          expr: fnMax(
            con(0),
            sub(sub(sub(add(stor('wortelzone'), flx('P_gebied')), flx('E_gebied')), flx('Q_snel')), mmOverArea(par('S_bodem_max'), 'A_tot')),
          ),
        },
        decimals: 0,
        note: 'Wat de wortelzone niet meer kan vasthouden, zakt door naar het grondwater.',
      },
      {
        id: 'Q_basis', label: 'basisafvoer uit het grondwater', symbol: 'Q_b',
        from: bucketRef('grondwater'), to: bucketRef('beek'), unit: 'm3/maand',
        definition: {
          kind: 'expr',
          // Lineair reservoir: een vast deel van de voorraad stroomt per maand uit.
          expr: fnMin(
            div(add(stor('grondwater'), flx('Perc')), par('reactietijd')),
            add(stor('grondwater'), flx('Perc')),
          ),
        },
        decimals: 0,
        note: 'Hoe voller het grondwater, hoe hoger de basisafvoer.',
      },
      {
        id: 'Q_meetpunt', label: 'afvoer bij het meetpunt', symbol: 'Q',
        from: bucketRef('beek'), to: benedenstrooms, unit: 'm3/maand',
        definition: { kind: 'expr', expr: add(add(stor('beek'), flx('Q_snel')), flx('Q_basis')) },
        decimals: 0,
        note: 'Alles wat de beek in komt, passeert in dezelfde maand het meetpunt.',
      },
    ]

    return {
      id: `stroomgebied-${seed}`,
      context: 'stroomgebied',
      seed,
      title: `Waterbalans stroomgebied ${beek}, meetpunt ${meetpunt}`,
      intro:
        `Maandbalans van het stroomgebied van ${beek}. Alle afvoer passeert ${meetpunt}. ` +
        'De getallen zijn realistisch maar fictief.',
      area: { id: 'A_tot', label: 'totaal stroomgebied', value: areaTotal, unit: 'ha' },
      buckets,
      inputs,
      fluxes,
      timeseries: { step: 'maand', labels: MAANDEN, values: { P: neerslag, E_ref: verdamping } },
      assumptions,
      sources,
      mainOutcome: {
        id: 'jaarafvoer',
        label: `jaarafvoer bij ${meetpunt}`,
        unit: 'm3/jaar',
        decimals: 0,
        kind: 'fluxTotal',
        fluxId: 'Q_meetpunt',
      },
      presentation: defaultPresentation(),
      conclusion: {
        question: `Hoeveel water voert ${beek} in een jaar af bij ${meetpunt}, en welk deel daarvan is basisafvoer?`,
        template:
          `${beek[0]!.toUpperCase()}${beek.slice(1)} voert bij ${meetpunt} jaarlijks ongeveer {waarde} m³ af. ` +
          'Het grootste deel daarvan is basisafvoer uit het grondwater; de snelle afvoer van bebouwd gebied is een kleine post.',
        text: '',
      },
    }
  },
}
