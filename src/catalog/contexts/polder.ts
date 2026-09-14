/**
 * Context polder: een landbouwpolder met kwel, drainage en een gemaal.
 *
 *   atmosfeer ──P──▶ wortelzone ──drainage──▶ polderwater ──gemaal──▶ boezem
 *   diep grondwater ──kwel──────────────────▶     │    ▲
 *                                                 └────┴── verdamping, inlaat
 *
 * Wat deze context toevoegt ten opzichte van de stadswijk: een kwelpost in
 * mm/dag, een gemaalcapaciteit in l/s, en een reeks met het aantal dagen per
 * maand. Daar hangen de eenheidsfouten en de tijdstapfout aan.
 */
import { add, con, div, flx, fnMax, fnMin, mul, par, ser, stor, sub } from '../../core/expr'
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
const DAGEN = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

/** Afgerond langjarig gemiddelde neerslag, mm/maand. */
const P_NORMAAL = [76, 62, 56, 42, 62, 73, 85, 92, 80, 90, 86, 88]
/** Afgeronde referentiegewasverdamping volgens Makkink, mm/maand. */
const E_NORMAAL = [9, 17, 38, 61, 86, 92, 93, 78, 49, 25, 10, 6]

const POLDERS = [
  'Zuidplaspolder',
  'Polder De Vier Ambachten',
  'Oostwaardpolder',
  'Polder Het Grootslag',
  'Beemsterwaard',
  'Polder Nieuwland',
  'Rietveenpolder',
  'Polder De Hoge Boezem',
]
const WATERSCHAPPEN = ['Rijnmonden', 'Veen en Vaart', 'Noorderzijl', 'Maasdelta', 'Zuiderzeeland-West']

/** mm over een oppervlak in ha, omgerekend naar m3. */
function mmOverArea(mm: ReturnType<typeof par>, areaId: string) {
  return mul(div(mm, con(1000, '1000 mm/m')), mul(par(areaId), con(10000, '10.000 m²/ha')))
}

export const polder: ContextDefinition = {
  id: 'polder',
  label: 'Polder',
  description: 'Landbouwpolder met kwel, drainage en een gemaal dat op de boezem uitslaat.',

  build(seed, rng) {
    const naam = rng.pick(POLDERS)
    const waterschap = rng.pick(WATERSCHAPPEN)
    const bronjaar = rng.int(2019, 2024)
    const nat = rng.chance(0.4)

    const totaalRuw = rng.float(280, 950)
    const fWater = rng.float(0.04, 0.09)
    const aWater = roundTo(totaalRuw * fWater, 1)
    const aLand = roundTo(totaalRuw - aWater, 1)
    const areaTotal = roundTo(aLand + aWater, 1)

    const fGewas = rng.round(0.95, 1.15, 2)
    const fOpen = rng.round(1.1, 1.3, 2)
    const sBodemMax = rng.int(80, 140)
    const sBodemStart = Math.round(sBodemMax * rng.float(0.55, 0.8))
    const qKwel = rng.round(0.3, 1.4, 2)
    const bergingMax = rng.int(15, 35)
    // Een gemaal van ongeveer 10 tot 16 mm/dag over de hele polder.
    const gemaalMmPerDag = rng.round(9, 16, 1)
    const qGemaal = Math.round((gemaalMmPerDag / 1000) * areaTotal * 10000 / 86.4)

    const neerslag = P_NORMAAL.map((mm) => Math.round(mm * (nat ? 1.15 : 0.95) * rng.float(0.88, 1.12)))
    const verdamping = E_NORMAAL.map((mm) => Math.max(2, Math.round(mm * rng.float(0.94, 1.06))))

    const sources: Source[] = [
      { id: 'bron-p', target: 'P', reference: `KNMI, maandsommen neerslag station ${naam.split(' ')[0]} (afgerond)`, year: bronjaar },
      { id: 'bron-e', target: 'E_ref', reference: 'KNMI, referentiegewasverdamping volgens Makkink (afgerond)', year: bronjaar },
      { id: 'bron-opp', target: 'A_tot', reference: `Legger oppervlaktewater waterschap ${waterschap}`, year: bronjaar },
      { id: 'bron-kwel', target: 'q_kwel', reference: `Grondwatermodel ${waterschap}, gemiddelde kwelintensiteit`, year: bronjaar - 2 },
      { id: 'bron-gemaal', target: 'q_gemaal', reference: `Gemaalgegevens waterschap ${waterschap}`, year: bronjaar - 1 },
      { id: 'bron-peil', target: 'berging_max', reference: `Peilbesluit ${naam}`, year: bronjaar - 1 },
      { id: 'bron-bodem', target: 'S_bodem_max', reference: 'BOFEK-bodemfysische eenhedenkaart', year: 2020 },
    ]

    const assumptions: Assumption[] = [
      { id: 'A_land', label: 'landbouwgrond', text: 'Grasland en akkerbouw, met buisdrainage op de sloten.', value: aLand, unit: 'ha', decimals: 1, role: 'deeloppervlak', sourceId: 'bron-opp' },
      { id: 'A_water', label: 'open water', text: 'Sloten, tochten en vaarten in de polder.', value: aWater, unit: 'ha', decimals: 1, role: 'deeloppervlak', sourceId: 'bron-opp' },
      { id: 'f_gewas', label: 'gewasfactor gras', text: 'Gras verdampt iets anders dan het referentiegewas.', value: fGewas, unit: '-', decimals: 2, role: 'parameter', range: [0.7, 1.3], sourceId: 'bron-bodem' },
      { id: 'f_open', label: 'verdampingsfactor open water', text: 'Open water verdampt meer dan het referentiegewas.', value: fOpen, unit: '-', decimals: 2, role: 'parameter', range: [1.0, 1.4] },
      { id: 'S_bodem_max', label: 'bergingscapaciteit wortelzone', text: 'Hoeveel vocht de wortelzone maximaal vasthoudt.', value: sBodemMax, unit: 'mm', decimals: 0, role: 'parameter', range: [50, 180], sourceId: 'bron-bodem' },
      { id: 'S_bodem_start', label: 'beginberging wortelzone', text: 'Vochtvoorraad in de wortelzone op 1 januari.', value: sBodemStart, unit: 'mm', decimals: 0, role: 'parameter' },
      { id: 'q_kwel', label: 'kwelintensiteit', text: 'Grondwater dat vanuit de diepe ondergrond de polder in stroomt.', value: qKwel, unit: 'mm/dag', decimals: 2, role: 'parameter', range: [0, 3], sourceId: 'bron-kwel' },
      { id: 'q_gemaal', label: 'gemaalcapaciteit', text: 'Wat het gemaal maximaal kan verpompen.', value: qGemaal, unit: 'l/s', decimals: 0, role: 'parameter', sourceId: 'bron-gemaal' },
      { id: 'berging_max', label: 'toelaatbare peilstijging', text: 'Hoeveel het polderpeil boven streefpeil mag stijgen voordat er schade optreedt.', value: bergingMax, unit: 'mm', decimals: 0, role: 'parameter', range: [10, 50], sourceId: 'bron-peil' },
    ]

    const inputs: InputSeries[] = [
      { id: 'P', label: 'neerslag', symbol: 'P', unit: 'mm/maand', decimals: 0, sourceId: 'bron-p' },
      { id: 'E_ref', label: 'referentieverdamping', symbol: 'E_ref', unit: 'mm/maand', decimals: 0, sourceId: 'bron-e' },
      { id: 'dagen', label: 'dagen in de maand', symbol: 'n', unit: 'dag', decimals: 0 },
    ]

    const atmosfeer = externRef('atmosfeer', 'atmosfeer')
    const boezem = externRef('boezem', 'boezem')
    const ondergrond = externRef('ondergrond', 'diepe ondergrond')

    const buckets: Bucket[] = [
      {
        id: 'wortelzone',
        label: 'wortelzone',
        initialStorage: roundTo((sBodemStart / 1000) * aLand * 10000, 3),
        initialExpr: mmOverArea(par('S_bodem_start'), 'A_land'),
        initialParam: 'S_bodem_start',
        maxStorage: roundTo((sBodemMax / 1000) * aLand * 10000, 3),
        maxExpr: mmOverArea(par('S_bodem_max'), 'A_land'),
        capacityParam: 'S_bodem_max',
        areaParam: 'A_land',
        unit: 'm3',
        note: 'Vochtvoorraad onder de landbouwgrond.',
      },
      {
        id: 'polderwater',
        label: 'polderwater',
        initialStorage: 0,
        maxStorage: roundTo((bergingMax / 1000) * areaTotal * 10000, 3),
        maxExpr: mul(div(par('berging_max'), con(1000, '1000 mm/m')), mul(par('A_tot'), con(10000, '10.000 m²/ha'))),
        capacityParam: 'berging_max',
        areaParam: 'A_water',
        unit: 'm3',
        note: 'Berging boven streefpeil. Blijft nul zolang het gemaal het bijhoudt.',
      },
    ]

    const naarPolderwater = add(add(flx('P_water'), flx('Q_drain')), flx('Kwel'))

    const fluxes: Flux[] = [
      {
        id: 'P_land', label: 'neerslag op landbouwgrond', symbol: 'P_l',
        from: atmosfeer, to: bucketRef('wortelzone'), unit: 'm3/maand',
        definition: { kind: 'expr', expr: mmOverArea(ser('P'), 'A_land') }, decimals: 0,
      },
      {
        id: 'P_water', label: 'neerslag op open water', symbol: 'P_w',
        from: atmosfeer, to: bucketRef('polderwater'), unit: 'm3/maand',
        definition: { kind: 'expr', expr: mmOverArea(ser('P'), 'A_water') }, decimals: 0,
      },
      {
        id: 'Kwel', label: 'kwel', symbol: 'K',
        from: ondergrond, to: bucketRef('polderwater'), unit: 'm3/maand',
        definition: {
          kind: 'expr',
          // mm/dag maal het aantal dagen in de maand geeft mm/maand.
          expr: mul(div(mul(par('q_kwel'), ser('dagen')), con(1000, '1000 mm/m')), mul(par('A_tot'), con(10000, '10.000 m²/ha'))),
        },
        decimals: 0,
        note: 'Kwel treedt op over de hele polder en komt via de sloten aan de oppervlakte.',
      },
      {
        id: 'E_land', label: 'verdamping van gewas', symbol: 'E_l',
        from: bucketRef('wortelzone'), to: atmosfeer, unit: 'm3/maand',
        definition: {
          kind: 'expr',
          expr: fnMin(mul(mmOverArea(ser('E_ref'), 'A_land'), par('f_gewas')), add(stor('wortelzone'), flx('P_land'))),
        },
        decimals: 0, note: 'Nooit meer dan de wortelzone aan vocht bevat.',
      },
      {
        id: 'Q_drain', label: 'drainage naar de sloten', symbol: 'Q_d',
        from: bucketRef('wortelzone'), to: bucketRef('polderwater'), unit: 'm3/maand',
        definition: {
          kind: 'expr',
          expr: fnMax(
            con(0),
            sub(sub(add(stor('wortelzone'), flx('P_land')), flx('E_land')), mmOverArea(par('S_bodem_max'), 'A_land')),
          ),
        },
        decimals: 0, note: 'Wat niet meer in de wortelzone past, stroomt via de drains naar de sloten.',
      },
      {
        id: 'E_water', label: 'verdamping van open water', symbol: 'E_w',
        from: bucketRef('polderwater'), to: atmosfeer, unit: 'm3/maand',
        definition: { kind: 'expr', expr: mul(mmOverArea(ser('E_ref'), 'A_water'), par('f_open')) }, decimals: 0,
      },
      {
        id: 'Q_gemaal', label: 'uitmaling door het gemaal', symbol: 'Q_g',
        from: bucketRef('polderwater'), to: boezem, unit: 'm3/maand',
        definition: {
          kind: 'expr',
          expr: fnMin(
            // l/s naar m3 per maand: maal het aantal seconden, gedeeld door 1000.
            div(mul(mul(par('q_gemaal'), con(86400, '86.400 s/dag')), ser('dagen')), con(1000, '1000 l/m³')),
            fnMax(con(0), sub(add(stor('polderwater'), naarPolderwater), flx('E_water'))),
          ),
        },
        decimals: 0,
        note: 'Het gemaal verpompt wat er weg moet, tot aan zijn capaciteit.',
      },
      {
        id: 'Q_inlaat', label: 'inlaat vanuit de boezem', symbol: 'Q_i',
        from: boezem, to: bucketRef('polderwater'), unit: 'm3/maand',
        definition: {
          kind: 'expr',
          expr: fnMax(con(0), sub(flx('E_water'), add(stor('polderwater'), naarPolderwater))),
        },
        decimals: 0,
        note: 'In droge maanden wordt er ingelaten om het peil te houden.',
      },
    ]

    return {
      id: `polder-${seed}`,
      context: 'polder',
      seed,
      title: `Waterbalans ${naam}, waterschap ${waterschap}`,
      intro:
        `Maandbalans van ${naam} over ${nat ? 'een nat jaar' : 'een gemiddeld jaar'}. De polder kent kwel vanuit ` +
        'de diepe ondergrond en slaat uit op de boezem. De getallen zijn realistisch maar fictief.',
      area: { id: 'A_tot', label: 'totaal polderoppervlak', value: areaTotal, unit: 'ha' },
      buckets,
      inputs,
      fluxes,
      timeseries: { step: 'maand', labels: MAANDEN, values: { P: neerslag, E_ref: verdamping, dagen: DAGEN.slice() } },
      assumptions,
      sources,
      mainOutcome: {
        id: 'jaarafvoer',
        label: 'jaarlijkse uitmaling door het gemaal',
        unit: 'm3/jaar',
        decimals: 0,
        kind: 'fluxTotal',
        fluxId: 'Q_gemaal',
      },
      presentation: defaultPresentation(),
      conclusion: {
        question: `Hoeveel water moet het gemaal van ${naam} jaarlijks uitslaan, en is de capaciteit daarvoor toereikend?`,
        template:
          `Het gemaal slaat jaarlijks ongeveer {waarde} m³ uit ${naam} uit. ` +
          'De capaciteit is toereikend: het polderpeil blijft in alle maanden op streefpeil.',
        text: '',
      },
    }
  },
}
