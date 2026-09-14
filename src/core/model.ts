/**
 * Het modelobject. Alles wat in een gegenereerd bestand terechtkomt staat hier
 * in, en alleen hier. Fouten zijn transformaties op dit object, nooit op cellen:
 * zo werkt elke foutcode automatisch in elke layout en elke opmaakvariant, en
 * blijft de sleutel kloppen.
 *
 * Elk element heeft een stabiele id. De renderer houdt een idToCell-map bij,
 * zodat de sleutel de exacte celverwijzing kan noemen.
 */
import type { Expr } from './expr'
import { formatNumber, type Unit } from './units'

export type ContextId = 'stad-wijk' | 'polder' | 'stroomgebied'

export type TimeStep = 'dag' | 'maand'

/** Een knooppunt aan het eind van een flux: een bak in het model, of de buitenwereld. */
export type NodeRef =
  | { kind: 'bucket'; id: string }
  | { kind: 'extern'; id: string; label: string }

export const bucketRef = (id: string): NodeRef => ({ kind: 'bucket', id })
export const externRef = (id: string, label: string): NodeRef => ({ kind: 'extern', id, label })

export type Bucket = {
  id: string
  label: string
  /** Berging aan het begin van de eerste tijdstap, in `unit`. */
  initialStorage: number
  /** Maximale berging, of null als de bak niet begrensd is. */
  maxStorage: number | null
  unit: Unit
  /**
   * Beginberging en maximum als formule, zodat ze meebewegen wanneer een fout
   * een oppervlak of een parameter verandert. De getallen hierboven zijn de
   * uitkomst daarvan en dienen als terugval.
   */
  initialExpr?: Expr
  maxExpr?: Expr
  /**
   * Parameters waar de beginberging en de bergingscapaciteit uit volgen. De
   * structuurfouten uit laag 2 hebben ze nodig om de berging uit het model te
   * halen zonder de rest aan te tasten.
   */
  initialParam?: string
  capacityParam?: string
  /** Het deeloppervlak waar deze bak op ligt; het diagram zet het in het blokje. */
  areaParam?: string
  /** Toelichting voor in de werkmap, bijvoorbeeld "peilbeheerd, berging constant". */
  note?: string
}

/**
 * Hoe de waarden van een flux tot stand komen.
 * - `input`: gegeven meetreeks, de waarden staan in model.timeseries.values.
 * - `expr`:  berekend uit parameters, invoerreeksen, andere fluxen en bergingen.
 */
export type FluxDefinition = { kind: 'input' } | { kind: 'expr'; expr: Expr }

export type Flux = {
  id: string
  label: string
  /** Symbool zoals in de vakliteratuur, bijvoorbeeld "P" of "Q_uit". */
  symbol: string
  from: NodeRef
  to: NodeRef
  unit: Unit
  definition: FluxDefinition
  /**
   * Alleen voor NAV-06: de waarde die in het bestand getoond wordt wijkt
   * bewust af van wat de formule oplevert. Overal elders leeg.
   */
  statedOverride?: number[]
  /** Aantal decimalen in de werkmap. */
  decimals?: number
  note?: string
}

/** Een aanname of parameter. Ook de deeloppervlakken staan hier. */
export type Assumption = {
  id: string
  label: string
  /** Zin waarmee de docent de aanname herkent, in het Nederlands. */
  text: string
  value: number
  unit: Unit
  decimals?: number
  /**
   * `deeloppervlak` betekent dat deze waarde meetelt in de controle
   * "som van de deelgebieden is gelijk aan het totaal". Daar hangt SCH-02 aan.
   */
  role?: 'deeloppervlak' | 'parameter'
  /**
   * Het bereik waarbinnen deze parameter fysisch te verdedigen is. SCH-04 zet
   * de waarde er bewust buiten; de docent kan zo laten zien waar de grens ligt.
   */
  range?: [number, number]
  /** Verwijst naar een id in model.sources. */
  sourceId?: string
}

export type Source = {
  id: string
  /** Id van de parameter, aanname of flux waar deze bron bij hoort. */
  target: string
  reference: string
  year: number
  note?: string
}

/**
 * Een gegeven meetreeks in de eenheid waarin hij gemeten is, bijvoorbeeld
 * neerslag in mm/maand. Fluxen staan in m3; de omrekening zit expliciet in de
 * fluxformule, want daar hangen de eenheidsfouten uit laag 1 aan.
 */
export type InputSeries = {
  id: string
  label: string
  symbol: string
  unit: Unit
  decimals?: number
  sourceId?: string
  note?: string
}

export type Timeseries = {
  step: TimeStep
  labels: string[]
  /** Alleen invoerreeksen: fluxen met definition.kind === 'input'. */
  values: Record<string, number[]>
}

/** De hoofduitkomst waar de impactklasse van een fout op gemeten wordt. */
export type MainOutcome = {
  id: string
  label: string
  unit: Unit
  decimals: number
} & (
  | { kind: 'fluxTotal'; fluxId: string }
  | { kind: 'fluxMax'; fluxId: string }
  | { kind: 'peakStorage'; bucketId: string }
)

/** Korte conclusietekst in het bestand. Nodig voor de INT-fouten uit laag 5. */
export type Conclusion = {
  /** De vraag die dit model heet te beantwoorden. */
  question: string
  /** De conclusie zoals die in het bestand staat. */
  text: string
  /** Sjabloon met {waarde}, zodat de conclusie meebeweegt met de uitkomst. */
  template?: string
  /**
   * Alleen voor INT-01: de conclusie staat vast en beweegt niet meer mee met
   * de uitkomst. Overal elders wordt de tekst uit het sjabloon afgeleid, want
   * anders zou elke fout er als een INT-fout uitzien.
   */
  pinned?: boolean
}

/**
 * Eigenschappen van de presentatie die op modelniveau vastliggen, omdat de
 * NAV-fouten uit laag 4 er precies over gaan. Ze gelden in elke layout en in
 * elke opmaakvariant; de opmaak-assen komen er nooit aan.
 */
export type PresentationFlags = {
  /** NAV-02: nergens eenheden. */
  hideUnits: boolean
  /** NAV-03: de aannames staan niet in het bestand. */
  hideAssumptions: boolean
  /** NAV-05: invoer, berekening en uitvoer door elkaar, zonder kopjes. */
  interleave: boolean
}

export function defaultPresentation(): PresentationFlags {
  return { hideUnits: false, hideAssumptions: false, interleave: false }
}

export type WaterBalanceModel = {
  id: string
  context: ContextId
  /** Seed van deze variant, puur ter herleiding. */
  seed: string
  title: string
  /** Korte omschrijving van het gebied, voor bovenaan het tabblad. */
  intro: string
  area: { id: string; label: string; value: number; unit: 'ha' | 'm2' }
  buckets: Bucket[]
  /** Gegeven reeksen in hun eigen eenheid; de waarden staan in timeseries.values. */
  inputs: InputSeries[]
  fluxes: Flux[]
  timeseries: Timeseries
  assumptions: Assumption[]
  sources: Source[]
  mainOutcome: MainOutcome
  conclusion: Conclusion
  presentation: PresentationFlags
}

// --- opzoeken ---------------------------------------------------------------

export function getBucket(model: WaterBalanceModel, id: string): Bucket {
  const bucket = model.buckets.find((b) => b.id === id)
  if (!bucket) throw new Error(`Onbekende bak: ${id}`)
  return bucket
}

export function getFlux(model: WaterBalanceModel, id: string): Flux {
  const flux = model.fluxes.find((f) => f.id === id)
  if (!flux) throw new Error(`Onbekende flux: ${id}`)
  return flux
}

export function findFlux(model: WaterBalanceModel, id: string): Flux | undefined {
  return model.fluxes.find((f) => f.id === id)
}

export function getAssumption(model: WaterBalanceModel, id: string): Assumption {
  const assumption = model.assumptions.find((a) => a.id === id)
  if (!assumption) throw new Error(`Onbekende aanname: ${id}`)
  return assumption
}

export function findAssumption(model: WaterBalanceModel, id: string): Assumption | undefined {
  return model.assumptions.find((a) => a.id === id)
}

/**
 * De conclusietekst zoals die in het bestand komt. Zonder pin beweegt hij mee
 * met de berekende hoofduitkomst.
 */
export function resolveConclusion(model: WaterBalanceModel, mainValue: number): string {
  const { conclusion, mainOutcome } = model
  if (conclusion.pinned || !conclusion.template) return conclusion.text
  return conclusion.template.replace('{waarde}', formatNumber(mainValue, mainOutcome.decimals))
}

export function findInput(model: WaterBalanceModel, id: string): InputSeries | undefined {
  return model.inputs.find((i) => i.id === id)
}

/** Label van een willekeurig element, voor sleutel en foutmeldingen. */
export function labelOf(model: WaterBalanceModel, id: string): string {
  return (
    model.fluxes.find((f) => f.id === id)?.label ??
    model.inputs.find((i) => i.id === id)?.label ??
    model.buckets.find((b) => b.id === id)?.label ??
    model.assumptions.find((a) => a.id === id)?.label ??
    (model.area.id === id ? model.area.label : undefined) ??
    id
  )
}

/** Fluxen die een bak in gaan, respectievelijk uit. */
export function inflows(model: WaterBalanceModel, bucketId: string): Flux[] {
  return model.fluxes.filter((f) => f.to.kind === 'bucket' && f.to.id === bucketId)
}

export function outflows(model: WaterBalanceModel, bucketId: string): Flux[] {
  return model.fluxes.filter((f) => f.from.kind === 'bucket' && f.from.id === bucketId)
}

/**
 * Diepe kopie. Foutmodules krijgen altijd een kopie, zodat het moedermodel
 * intact blijft en de sleutel de twee kan vergelijken.
 */
export function cloneModel(model: WaterBalanceModel): WaterBalanceModel {
  return structuredClone(model)
}

/** Stabiele JSON, voor determinisme-tests en voor generatie.json. */
export function modelToJson(model: WaterBalanceModel): string {
  return JSON.stringify(model, sortedReplacer, 2)
}

function sortedReplacer(_key: string, value: unknown): unknown {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>
    const sorted: Record<string, unknown> = {}
    for (const key of Object.keys(record).sort()) sorted[key] = record[key]
    return sorted
  }
  return value
}
