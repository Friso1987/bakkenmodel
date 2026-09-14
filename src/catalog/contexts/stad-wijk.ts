/**
 * Context stad-wijk: een stedelijke waterbalans met drie bakken.
 *
 *   atmosfeer ──P──▶ verhard oppervlak ──Q_verhard──▶ oppervlaktewater ──Q_uit──▶ boezem
 *   atmosfeer ──P──▶ wortelzone        ──Q_onverhard─▶      │      ▲
 *                                                           └─E_water, Q_in
 *
 * De bakken verhard en wortelzone hebben een echte berging met een maximum;
 * wat er niet in past stroomt af. Het oppervlaktewater is peilbeheerd: alles
 * wat binnenkomt gaat eruit via het gemaal, en in droge maanden wordt er
 * ingelaten. De hoofduitkomst is de jaarlijkse uitmaling.
 *
 * Alle getallen zijn realistisch maar fictief; de reeksen zijn afgeronde
 * langjarige gemiddelden.
 */
import {
  add,
  con,
  div,
  flx,
  fnMax,
  fnMin,
  mul,
  par,
  ser,
  stor,
  sub,
  type Expr,
} from '../../core/expr'
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

const MONTHS = [
  'januari',
  'februari',
  'maart',
  'april',
  'mei',
  'juni',
  'juli',
  'augustus',
  'september',
  'oktober',
  'november',
  'december',
]

/** Afgerond langjarig gemiddelde neerslag De Bilt, mm/maand. */
const P_NORMAAL = [76, 62, 56, 42, 62, 73, 85, 92, 80, 90, 86, 88]
/** Afgeronde referentiegewasverdamping volgens Makkink, De Bilt, mm/maand. */
const E_NORMAAL = [9, 17, 38, 61, 86, 92, 93, 78, 49, 25, 10, 6]

const WIJKEN = [
  'Zuiderveld',
  'De Bongerd',
  'Kruidenbuurt',
  'Stadsveld',
  'Nieuwland',
  'Het Zandpad',
  'De Hoven',
  'Waterlanden',
  'Molenvliet',
  'Binnenhaven',
]

const GEMEENTEN = ['Oostervaart', 'Nieuwdam', 'Rietveen', 'Dijkerhout', 'Zandpoort']

type Jaartype = { label: string; neerslag: number; verdamping: number }

const JAARTYPEN: Jaartype[] = [
  { label: 'een droog jaar', neerslag: 0.8, verdamping: 1.08 },
  { label: 'een gemiddeld jaar', neerslag: 1.0, verdamping: 1.0 },
  { label: 'een nat jaar', neerslag: 1.18, verdamping: 0.95 },
]

/** mm over een oppervlak in ha, omgerekend naar m3. De factoren staan expliciet. */
function mmOverArea(mm: Expr, areaId: string): Expr {
  return mul(
    div(mm, con(1000, '1000 mm/m')),
    mul(par(areaId), con(10000, '10.000 m²/ha')),
  )
}

/** Maximale berging van een bak, uitgedrukt in mm over het eigen oppervlak. */
function capacity(mmParamId: string, areaId: string): Expr {
  return mmOverArea(par(mmParamId), areaId)
}

export const stadWijk: ContextDefinition = {
  id: 'stad-wijk',
  label: 'Stad en wijk',
  description: 'Stedelijke waterbalans met verhard oppervlak, groen en peilbeheerd oppervlaktewater.',

  build(seed, rng) {
    const wijk = rng.pick(WIJKEN)
    const gemeente = rng.pick(GEMEENTEN)
    const jaartype = rng.pick(JAARTYPEN)
    const bronjaar = rng.int(2019, 2024)

    // Oppervlakken: eerst de delen, daarna het totaal. Het totaal is per
    // definitie de som, zodat het moedermodel altijd consistent is.
    const areaTotalRaw = rng.float(22, 58)
    const fVerhard = rng.float(0.45, 0.68)
    const fWater = rng.float(0.02, 0.07)
    const aVerhard = roundTo(areaTotalRaw * fVerhard, 1)
    const aWater = roundTo(areaTotalRaw * fWater, 1)
    const aOnverhard = roundTo(areaTotalRaw - aVerhard - aWater, 1)
    const areaTotal = roundTo(aVerhard + aOnverhard + aWater, 1)

    const cIntVerhard = rng.round(0.8, 2.2, 1)
    const fVerdVerhard = rng.round(0.4, 0.7, 2)
    const fGewas = rng.round(0.85, 1.1, 2)
    const sBodemMax = rng.int(70, 130)
    const sBodemStart = Math.round(sBodemMax * rng.float(0.5, 0.75))
    const fOpen = rng.round(1.1, 1.3, 2)
    const dWater = rng.round(0.9, 1.6, 1)

    const neerslag = P_NORMAAL.map((mm) => Math.round(mm * jaartype.neerslag * rng.float(0.88, 1.12)))
    const verdamping = E_NORMAAL.map((mm) =>
      Math.max(2, Math.round(mm * jaartype.verdamping * rng.float(0.94, 1.06))),
    )

    const sources: Source[] = [
      {
        id: 'bron-knmi-neerslag',
        target: 'P',
        reference: 'KNMI, maandsommen neerslag station De Bilt (afgerond)',
        year: bronjaar,
      },
      {
        id: 'bron-knmi-verdamping',
        target: 'E_ref',
        reference: 'KNMI, referentiegewasverdamping volgens Makkink, station De Bilt (afgerond)',
        year: bronjaar,
      },
      {
        id: 'bron-bgt',
        target: 'A_tot',
        reference: `BGT-oppervlakteanalyse gemeente ${gemeente}`,
        year: bronjaar,
      },
      {
        id: 'bron-riolering',
        target: 'c_int_verhard',
        reference: 'Leidraad Riolering, vuistregel berging op verhard oppervlak',
        year: 2020,
      },
      {
        id: 'bron-gewasfactor',
        target: 'f_gewas',
        reference: 'STOWA, gewasfactoren bij de Makkink-referentieverdamping',
        year: 2018,
      },
      {
        id: 'bron-peilbesluit',
        target: 'd_water',
        reference: `Peilbesluit stedelijk gebied ${gemeente}`,
        year: bronjaar - 1,
      },
    ]

    const assumptions: Assumption[] = [
      {
        id: 'A_verhard',
        label: 'verhard oppervlak',
        text: `Dak, straat en overig verhard oppervlak in ${wijk}, afwaterend op het hemelwaterriool.`,
        value: aVerhard,
        unit: 'ha',
        decimals: 1,
        role: 'deeloppervlak',
        sourceId: 'bron-bgt',
      },
      {
        id: 'A_onverhard',
        label: 'onverhard oppervlak',
        text: 'Tuinen, plantsoenen en bermen; hier infiltreert de neerslag in de wortelzone.',
        value: aOnverhard,
        unit: 'ha',
        decimals: 1,
        role: 'deeloppervlak',
        sourceId: 'bron-bgt',
      },
      {
        id: 'A_water',
        label: 'open water',
        text: 'Watergangen en vijvers in de wijk, op streefpeil gehouden.',
        value: aWater,
        unit: 'ha',
        decimals: 1,
        role: 'deeloppervlak',
        sourceId: 'bron-bgt',
      },
      {
        id: 'c_int_verhard',
        label: 'berging op verhard oppervlak',
        text: 'Neerslag die op straat en dak blijft liggen en daar verdampt, voordat er afvoer op gang komt.',
        value: cIntVerhard,
        unit: 'mm',
        decimals: 1,
        role: 'parameter',
        range: [0.5, 3],
        sourceId: 'bron-riolering',
      },
      {
        id: 'f_verd_verhard',
        label: 'verdampingsfactor verhard',
        text: 'Deel van de referentieverdamping dat op verhard oppervlak optreedt.',
        value: fVerdVerhard,
        unit: '-',
        decimals: 2,
        role: 'parameter',
        range: [0.2, 0.9],
        sourceId: 'bron-gewasfactor',
      },
      {
        id: 'f_gewas',
        label: 'gewasfactor groen',
        text: 'Gras en beplanting verdampen iets anders dan het referentiegewas.',
        value: fGewas,
        unit: '-',
        decimals: 2,
        role: 'parameter',
        range: [0.7, 1.3],
        sourceId: 'bron-gewasfactor',
      },
      {
        id: 'S_bodem_max',
        label: 'bergingscapaciteit wortelzone',
        text: 'Hoeveel water de wortelzone maximaal vasthoudt voordat het doorslaat naar de drainage.',
        value: sBodemMax,
        unit: 'mm',
        decimals: 0,
        role: 'parameter',
        range: [50, 200],
      },
      {
        id: 'S_bodem_start',
        label: 'beginberging wortelzone',
        text: 'Vochtvoorraad in de wortelzone op 1 januari.',
        value: sBodemStart,
        unit: 'mm',
        decimals: 0,
        role: 'parameter',
      },
      {
        id: 'f_open',
        label: 'verdampingsfactor open water',
        text: 'Open water verdampt meer dan het referentiegewas.',
        value: fOpen,
        unit: '-',
        decimals: 2,
        role: 'parameter',
        range: [1.0, 1.4],
        sourceId: 'bron-gewasfactor',
      },
      {
        id: 'd_water',
        label: 'gemiddelde waterdiepte',
        text: 'Gemiddelde diepte van de watergangen bij streefpeil.',
        value: dWater,
        unit: 'm',
        decimals: 1,
        role: 'parameter',
        range: [0.5, 3],
        sourceId: 'bron-peilbesluit',
      },
    ]

    const inputs: InputSeries[] = [
      {
        id: 'P',
        label: 'neerslag',
        symbol: 'P',
        unit: 'mm/maand',
        decimals: 0,
        sourceId: 'bron-knmi-neerslag',
      },
      {
        id: 'E_ref',
        label: 'referentieverdamping',
        symbol: 'E_ref',
        unit: 'mm/maand',
        decimals: 0,
        sourceId: 'bron-knmi-verdamping',
      },
    ]

    const atmosfeer = externRef('atmosfeer', 'atmosfeer')
    const boezem = externRef('boezem', 'boezem')

    const buckets: Bucket[] = [
      {
        id: 'verhard',
        label: 'verhard oppervlak',
        initialStorage: 0,
        maxStorage: roundTo((cIntVerhard / 1000) * aVerhard * 10000, 3),
        maxExpr: capacity('c_int_verhard', 'A_verhard'),
        capacityParam: 'c_int_verhard',
        areaParam: 'A_verhard',
        unit: 'm3',
        note: 'Berging op straat en dak; wat er niet in past stroomt af naar het hemelwaterriool.',
      },
      {
        id: 'wortelzone',
        label: 'wortelzone',
        initialStorage: roundTo((sBodemStart / 1000) * aOnverhard * 10000, 3),
        initialExpr: capacity('S_bodem_start', 'A_onverhard'),
        maxStorage: roundTo((sBodemMax / 1000) * aOnverhard * 10000, 3),
        maxExpr: capacity('S_bodem_max', 'A_onverhard'),
        initialParam: 'S_bodem_start',
        capacityParam: 'S_bodem_max',
        areaParam: 'A_onverhard',
        unit: 'm3',
        note: 'Vochtvoorraad in de bodem onder het onverharde oppervlak.',
      },
      {
        id: 'oppervlaktewater',
        label: 'oppervlaktewater',
        initialStorage: roundTo(dWater * aWater * 10000, 3),
        initialExpr: mul(par('d_water'), mul(par('A_water'), con(10000, '10.000 m²/ha'))),
        areaParam: 'A_water',
        maxStorage: null,
        unit: 'm3',
        note: 'Peilbeheerd: het gemaal maalt uit, in droge maanden wordt er ingelaten.',
      },
    ]

    const naarWater = add(add(flx('P_water'), flx('Q_verhard')), flx('Q_onverhard'))

    const fluxes: Flux[] = [
      {
        id: 'P_verhard',
        label: 'neerslag op verhard oppervlak',
        symbol: 'P_v',
        from: atmosfeer,
        to: bucketRef('verhard'),
        unit: 'm3/maand',
        definition: { kind: 'expr', expr: mmOverArea(ser('P'), 'A_verhard') },
        decimals: 0,
      },
      {
        id: 'P_onverhard',
        label: 'neerslag op onverhard oppervlak',
        symbol: 'P_o',
        from: atmosfeer,
        to: bucketRef('wortelzone'),
        unit: 'm3/maand',
        definition: { kind: 'expr', expr: mmOverArea(ser('P'), 'A_onverhard') },
        decimals: 0,
      },
      {
        id: 'P_water',
        label: 'neerslag op open water',
        symbol: 'P_w',
        from: atmosfeer,
        to: bucketRef('oppervlaktewater'),
        unit: 'm3/maand',
        definition: { kind: 'expr', expr: mmOverArea(ser('P'), 'A_water') },
        decimals: 0,
      },
      {
        id: 'E_verhard',
        label: 'verdamping van verhard oppervlak',
        symbol: 'E_v',
        from: bucketRef('verhard'),
        to: atmosfeer,
        unit: 'm3/maand',
        definition: {
          kind: 'expr',
          expr: fnMin(
            mul(mmOverArea(ser('E_ref'), 'A_verhard'), par('f_verd_verhard')),
            add(stor('verhard'), flx('P_verhard')),
          ),
        },
        decimals: 0,
        note: 'Nooit meer dan er op het oppervlak ligt.',
      },
      {
        id: 'Q_verhard',
        label: 'afstroming van verhard oppervlak',
        symbol: 'Q_v',
        from: bucketRef('verhard'),
        to: bucketRef('oppervlaktewater'),
        unit: 'm3/maand',
        definition: {
          kind: 'expr',
          expr: fnMax(
            con(0),
            sub(
              sub(add(stor('verhard'), flx('P_verhard')), flx('E_verhard')),
              capacity('c_int_verhard', 'A_verhard'),
            ),
          ),
        },
        decimals: 0,
        note: 'Wat niet in de berging op straat past, gaat via het hemelwaterriool naar het oppervlaktewater.',
      },
      {
        id: 'E_onverhard',
        label: 'verdamping van groen',
        symbol: 'E_o',
        from: bucketRef('wortelzone'),
        to: atmosfeer,
        unit: 'm3/maand',
        definition: {
          kind: 'expr',
          expr: fnMin(
            mul(mmOverArea(ser('E_ref'), 'A_onverhard'), par('f_gewas')),
            add(stor('wortelzone'), flx('P_onverhard')),
          ),
        },
        decimals: 0,
        note: 'Nooit meer dan de wortelzone aan vocht bevat.',
      },
      {
        id: 'Q_onverhard',
        label: 'drainage vanuit de wortelzone',
        symbol: 'Q_o',
        from: bucketRef('wortelzone'),
        to: bucketRef('oppervlaktewater'),
        unit: 'm3/maand',
        definition: {
          kind: 'expr',
          expr: fnMax(
            con(0),
            sub(
              sub(add(stor('wortelzone'), flx('P_onverhard')), flx('E_onverhard')),
              capacity('S_bodem_max', 'A_onverhard'),
            ),
          ),
        },
        decimals: 0,
        note: 'Overschot boven de bergingscapaciteit van de wortelzone.',
      },
      {
        id: 'E_water',
        label: 'verdamping van open water',
        symbol: 'E_w',
        from: bucketRef('oppervlaktewater'),
        to: atmosfeer,
        unit: 'm3/maand',
        definition: {
          kind: 'expr',
          expr: mul(mmOverArea(ser('E_ref'), 'A_water'), par('f_open')),
        },
        decimals: 0,
      },
      {
        id: 'Q_uit',
        label: 'uitmaling naar de boezem',
        symbol: 'Q_uit',
        from: bucketRef('oppervlaktewater'),
        to: boezem,
        unit: 'm3/maand',
        definition: {
          kind: 'expr',
          expr: fnMax(con(0), sub(naarWater, flx('E_water'))),
        },
        decimals: 0,
        note: 'Het peil blijft gelijk, dus alles wat er netto bij komt wordt uitgemalen.',
      },
      {
        id: 'Q_in',
        label: 'inlaat vanuit de boezem',
        symbol: 'Q_in',
        from: boezem,
        to: bucketRef('oppervlaktewater'),
        unit: 'm3/maand',
        definition: {
          kind: 'expr',
          expr: fnMax(con(0), sub(flx('E_water'), naarWater)),
        },
        decimals: 0,
        note: 'In droge maanden is verdamping groter dan de aanvoer; dan wordt er ingelaten om het peil te houden.',
      },
    ]

    return {
      id: `stad-wijk-${seed}`,
      context: 'stad-wijk',
      seed,
      title: `Waterbalans wijk ${wijk}, gemeente ${gemeente}`,
      intro:
        `Maandbalans van ${wijk} over ${jaartype.label}. De wijk watert af op de boezem via één gemaal. ` +
        'De getallen zijn realistisch maar fictief.',
      area: { id: 'A_tot', label: 'totaal gebiedsoppervlak', value: areaTotal, unit: 'ha' },
      buckets,
      inputs,
      fluxes,
      timeseries: {
        step: 'maand',
        labels: MONTHS,
        values: { P: neerslag, E_ref: verdamping },
      },
      assumptions,
      sources,
      mainOutcome: {
        id: 'jaarafvoer',
        label: 'jaarlijkse uitmaling naar de boezem',
        unit: 'm3/jaar',
        decimals: 0,
        kind: 'fluxTotal',
        fluxId: 'Q_uit',
      },
      presentation: defaultPresentation(),
      conclusion: {
        question: `Hoeveel water moet het gemaal jaarlijks uit ${wijk} afvoeren, en in welke maanden is de belasting het grootst?`,
        template:
          `Het gemaal voert jaarlijks ongeveer {waarde} m³ af uit ${wijk}. ` +
          'De belasting is het grootst in de winterhalfjaarmaanden, wanneer de verdamping klein is en vrijwel alle neerslag tot afvoer komt.',
        text: '',
      },
    }
  },
}
