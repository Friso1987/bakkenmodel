/**
 * Pure rekenfunctie. Geen willekeur, geen opmaak, geen zijeffecten: solve()
 * krijgt een model en geeft getallen terug. De impactklasse van een fout is
 * het verschil tussen solve(moedermodel) en solve(foutmodel).
 *
 * Werkwijze per tijdstap:
 *   1. bereken de fluxen in afhankelijkheidsvolgorde, met de berging aan het
 *      begin van de stap;
 *   2. werk daarna de bergingen bij: S_eind = S_begin + in - uit.
 *
 * De bergingen worden niet afgekapt. Een bak die leegloopt of overloopt is een
 * signaal over het model, geen reden om stiekem te corrigeren; dat komt terug
 * als vlag.
 */
import { dependencies, evalExpr, type EvalContext } from './expr'
import {
  type Bucket,
  type Flux,
  type WaterBalanceModel,
  inflows,
  outflows,
} from './model'
import type { Unit } from './units'

/** Relatieve tolerantie waarbinnen een balans geacht wordt te sluiten. */
export const BALANCE_TOLERANCE = 0.001

export type SolveFlagCode =
  | 'negatieve-berging'
  | 'berging-boven-max'
  | 'bak-zonder-uitgang'
  | 'bak-zonder-ingang'
  | 'flux-buiten-de-bakken'
  | 'niet-eindige-waarde'
  | 'balans-sluit-niet'
  | 'getoonde-waarde-wijkt-af'
  | 'oppervlakken-inconsistent'

export type SolveFlag = {
  code: SolveFlagCode
  /** Id van de bak of flux waar het over gaat. */
  subject: string
  message: string
}

export type BucketBalance = {
  inflow: number
  outflow: number
  deltaStorage: number
  /** in - uit - delta; hoort nul te zijn. */
  residual: number
  relResidual: number
  minStorage: number
  maxStorage: number
}

export type SolveResult = {
  step: 'dag' | 'maand'
  labels: string[]
  /** Volgorde waarin de fluxen berekend zijn. */
  order: string[]
  /** Berekende waarde per tijdstap, per flux. */
  computed: Record<string, number[]>
  /** Waarde zoals die in het bestand komt: gelijk aan computed, tenzij NAV-06. */
  stated: Record<string, number[]>
  totals: Record<string, number>
  /** Berging aan het begin van elke tijdstap. */
  storageStart: Record<string, number[]>
  /** Berging aan het eind van elke tijdstap. */
  storageEnd: Record<string, number[]>
  balances: Record<string, BucketBalance>
  /** Beginberging en maximum zoals berekend uit de parameters. */
  initial: Record<string, number>
  capacity: Record<string, number | null>
  system: {
    inflow: number
    outflow: number
    deltaStorage: number
    residual: number
    relResidual: number
    closes: boolean
  }
  main: { id: string; label: string; unit: Unit; value: number; decimals: number }
  /** Grootste relatieve afwijking tussen getoonde en berekende waarde. */
  consistency: { maxRelDiff: number; fluxId: string | null }
  flags: SolveFlag[]
}

export class SolveError extends Error {}

export function solve(model: WaterBalanceModel): SolveResult {
  const steps = model.timeseries.labels.length
  if (steps === 0) throw new SolveError('Het model heeft geen tijdstappen')

  const order = evaluationOrder(model)
  const flags: SolveFlag[] = []

  const computed: Record<string, number[]> = {}
  for (const flux of model.fluxes) computed[flux.id] = new Array<number>(steps).fill(0)

  const storageStart: Record<string, number[]> = {}
  const storageEnd: Record<string, number[]> = {}
  for (const bucket of model.buckets) {
    storageStart[bucket.id] = new Array<number>(steps).fill(0)
    storageEnd[bucket.id] = new Array<number>(steps).fill(0)
  }

  const initial: Record<string, number> = {}
  const capacity: Record<string, number | null> = {}
  for (const bucket of model.buckets) {
    initial[bucket.id] = bucket.initialExpr
      ? evalExpr(bucket.initialExpr, staticContext(model, bucket.id))
      : bucket.initialStorage
    capacity[bucket.id] = bucket.maxExpr
      ? evalExpr(bucket.maxExpr, staticContext(model, bucket.id))
      : bucket.maxStorage
  }

  const current: Record<string, number> = {}
  const storageNow: Record<string, number> = {}
  for (const bucket of model.buckets) storageNow[bucket.id] = initial[bucket.id]!

  for (let t = 0; t < steps; t++) {
    for (const bucket of model.buckets) storageStart[bucket.id]![t] = storageNow[bucket.id]!

    const ctx: EvalContext = {
      param: (id) => {
        const assumption = model.assumptions.find((a) => a.id === id)
        if (assumption) return assumption.value
        if (model.area.id === id) return model.area.value
        throw new SolveError(`Formule verwijst naar een onbekende parameter: ${id}`)
      },
      series: (id, at) => {
        const values = model.timeseries.values[id]
        if (!values) throw new SolveError(`Formule verwijst naar een onbekende reeks: ${id}`)
        return values[at ?? t] ?? 0
      },
      flux: (id, at) => {
        // Een verwijzing naar een vaste tijdstap mag alleen achteruit kijken;
        // dat is precies wat een verkeerde celverwijzing doet.
        if (at !== undefined) return computed[id]?.[at] ?? 0
        if (!(id in current)) {
          throw new SolveError(`Flux ${id} wordt gebruikt voordat hij berekend is`)
        }
        return current[id]!
      },
      storage: (id) => {
        if (!(id in storageNow)) throw new SolveError(`Formule verwijst naar een onbekende bak: ${id}`)
        return storageNow[id]!
      },
    }

    for (const id of Object.keys(current)) delete current[id]

    for (const fluxId of order) {
      const flux = model.fluxes.find((f) => f.id === fluxId)!
      const value = evaluateFlux(model, flux, t, ctx)
      if (!Number.isFinite(value)) {
        flags.push({
          code: 'niet-eindige-waarde',
          subject: flux.id,
          message: `${flux.label} levert in stap ${model.timeseries.labels[t]} geen eindig getal op`,
        })
      }
      const safe = Number.isFinite(value) ? value : 0
      current[fluxId] = safe
      computed[fluxId]![t] = safe
    }

    for (const bucket of model.buckets) {
      let delta = 0
      for (const flux of inflows(model, bucket.id)) delta += current[flux.id] ?? 0
      for (const flux of outflows(model, bucket.id)) delta -= current[flux.id] ?? 0
      const next = storageStart[bucket.id]![t]! + delta
      storageNow[bucket.id] = next
      storageEnd[bucket.id]![t] = next
    }
  }

  const stated: Record<string, number[]> = {}
  let maxRelDiff = 0
  let worstFlux: string | null = null
  for (const flux of model.fluxes) {
    const values = computed[flux.id]!
    if (flux.statedOverride && flux.statedOverride.length === steps) {
      stated[flux.id] = flux.statedOverride.slice()
      flags.push({
        code: 'getoonde-waarde-wijkt-af',
        subject: flux.id,
        message: `${flux.label}: de getoonde waarde komt niet uit de formule`,
      })
      const scale = Math.max(...values.map(Math.abs), 1e-9)
      for (let t = 0; t < steps; t++) {
        const diff = Math.abs(flux.statedOverride[t]! - values[t]!) / scale
        if (diff > maxRelDiff) {
          maxRelDiff = diff
          worstFlux = flux.id
        }
      }
    } else {
      stated[flux.id] = values.slice()
    }
  }

  const totals: Record<string, number> = {}
  for (const flux of model.fluxes) totals[flux.id] = sumOf(stated[flux.id]!)

  const balances: Record<string, BucketBalance> = {}
  for (const bucket of model.buckets) {
    balances[bucket.id] = bucketBalance(model, bucket, computed, storageStart, storageEnd, steps)
    flags.push(...bucketFlags(model, bucket, balances[bucket.id]!, capacity[bucket.id]!))
  }

  flags.push(...areaFlags(model))

  const system = systemBalance(model, computed, balances)
  if (!system.closes) {
    flags.push({
      code: 'balans-sluit-niet',
      subject: 'systeem',
      message: `De systeembalans sluit niet: restpost ${system.residual.toFixed(1)} m³`,
    })
  }

  return {
    step: model.timeseries.step,
    labels: model.timeseries.labels.slice(),
    order,
    computed,
    stated,
    totals,
    storageStart,
    storageEnd,
    balances,
    initial,
    capacity,
    system,
    main: mainOutcome(model, stated, storageStart, storageEnd),
    consistency: { maxRelDiff, fluxId: worstFlux },
    flags,
  }
}

function evaluateFlux(model: WaterBalanceModel, flux: Flux, t: number, ctx: EvalContext): number {
  if (flux.definition.kind === 'input') {
    const values = model.timeseries.values[flux.id]
    if (!values) throw new SolveError(`Invoerflux ${flux.id} heeft geen tijdreeks`)
    return values[t] ?? 0
  }
  return evalExpr(flux.definition.expr, ctx)
}

/**
 * Fluxen die naar andere fluxen verwijzen moeten later berekend worden.
 * Een kringverwijzing is een modelfout en stopt de berekening: die hoort niet
 * stilletjes op nul uit te komen.
 */
export function evaluationOrder(model: WaterBalanceModel): string[] {
  const pending = new Map<string, string[]>()
  for (const flux of model.fluxes) {
    const deps =
      flux.definition.kind === 'expr'
        ? dependencies(flux.definition.expr).fluxes.filter((id) => model.fluxes.some((f) => f.id === id))
        : []
    pending.set(flux.id, deps)
  }

  const order: string[] = []
  const done = new Set<string>()
  let progressed = true
  while (progressed && order.length < model.fluxes.length) {
    progressed = false
    for (const flux of model.fluxes) {
      if (done.has(flux.id)) continue
      const deps = pending.get(flux.id)!
      if (deps.every((id) => done.has(id))) {
        order.push(flux.id)
        done.add(flux.id)
        progressed = true
      }
    }
  }
  if (order.length < model.fluxes.length) {
    const stuck = model.fluxes.filter((f) => !done.has(f.id)).map((f) => f.id)
    throw new SolveError(`Kringverwijzing tussen fluxen: ${stuck.join(', ')}`)
  }
  return order
}

function bucketBalance(
  model: WaterBalanceModel,
  bucket: Bucket,
  computed: Record<string, number[]>,
  storageStart: Record<string, number[]>,
  storageEnd: Record<string, number[]>,
  steps: number,
): BucketBalance {
  let inflow = 0
  let outflow = 0
  for (const flux of inflows(model, bucket.id)) inflow += sumOf(computed[flux.id]!)
  for (const flux of outflows(model, bucket.id)) outflow += sumOf(computed[flux.id]!)

  const start = storageStart[bucket.id]![0]!
  const end = storageEnd[bucket.id]![steps - 1]!
  const deltaStorage = end - start
  const residual = inflow - outflow - deltaStorage
  const scale = Math.max(Math.abs(inflow), Math.abs(outflow), 1e-9)

  const series = storageEnd[bucket.id]!
  return {
    inflow,
    outflow,
    deltaStorage,
    residual,
    relResidual: Math.abs(residual) / scale,
    minStorage: Math.min(start, ...series),
    maxStorage: Math.max(start, ...series),
  }
}

/** Context voor formules die niet van de tijd afhangen, zoals een beginberging. */
function staticContext(model: WaterBalanceModel, subject: string): EvalContext {
  return {
    param: (id) => {
      const assumption = model.assumptions.find((a) => a.id === id)
      if (assumption) return assumption.value
      if (model.area.id === id) return model.area.value
      throw new SolveError(`Formule verwijst naar een onbekende parameter: ${id}`)
    },
    series: () => {
      throw new SolveError(`De beginwaarde van ${subject} mag niet van een tijdreeks afhangen`)
    },
    flux: () => {
      throw new SolveError(`De beginwaarde van ${subject} mag niet van een flux afhangen`)
    },
    storage: () => {
      throw new SolveError(`De beginwaarde van ${subject} mag niet van een berging afhangen`)
    },
  }
}

function bucketFlags(
  model: WaterBalanceModel,
  bucket: Bucket,
  balance: BucketBalance,
  maxStorage: number | null,
): SolveFlag[] {
  const flags: SolveFlag[] = []
  const scale = Math.max(Math.abs(balance.inflow), 1)

  if (balance.minStorage < -1e-6 * scale) {
    flags.push({
      code: 'negatieve-berging',
      subject: bucket.id,
      message: `${bucket.label} raakt leeg en gaat door tot ${balance.minStorage.toFixed(0)} m³`,
    })
  }
  if (maxStorage !== null && balance.maxStorage > maxStorage * (1 + 1e-6) + 1e-6) {
    flags.push({
      code: 'berging-boven-max',
      subject: bucket.id,
      message: `${bucket.label} komt boven de maximale berging uit (${balance.maxStorage.toFixed(0)} > ${maxStorage.toFixed(0)} m³)`,
    })
  }
  if (outflows(model, bucket.id).length === 0) {
    flags.push({
      code: 'bak-zonder-uitgang',
      subject: bucket.id,
      message: `${bucket.label} heeft geen uitgaande post`,
    })
  }
  if (inflows(model, bucket.id).length === 0) {
    flags.push({
      code: 'bak-zonder-ingang',
      subject: bucket.id,
      message: `${bucket.label} heeft geen ingaande post`,
    })
  }
  return flags
}

/**
 * De som van de deeloppervlakken hoort gelijk te zijn aan het totale
 * gebiedsoppervlak. Dat is de controle waar SCH-02 op stuk gaat.
 */
function areaFlags(model: WaterBalanceModel): SolveFlag[] {
  const parts = model.assumptions.filter((a) => a.role === 'deeloppervlak')
  if (parts.length === 0) return []
  if (parts.some((a) => a.unit !== model.area.unit)) {
    return [
      {
        code: 'oppervlakken-inconsistent',
        subject: model.area.id,
        message: `De deeloppervlakken staan niet in dezelfde eenheid als ${model.area.label}`,
      },
    ]
  }
  const total = parts.reduce((acc, a) => acc + a.value, 0)
  const diff = Math.abs(total - model.area.value)
  if (diff <= Math.max(Math.abs(model.area.value) * 1e-6, 1e-9)) return []
  return [
    {
      code: 'oppervlakken-inconsistent',
      subject: model.area.id,
      message: `De deeloppervlakken tellen op tot ${total.toFixed(2)} ${model.area.unit}, het totaal is ${model.area.value.toFixed(2)} ${model.area.unit}`,
    },
  ]
}

function systemBalance(
  model: WaterBalanceModel,
  computed: Record<string, number[]>,
  balances: Record<string, BucketBalance>,
): SolveResult['system'] {
  let inflow = 0
  let outflow = 0
  for (const flux of model.fluxes) {
    const total = sumOf(computed[flux.id]!)
    if (flux.from.kind === 'extern' && flux.to.kind === 'bucket') inflow += total
    if (flux.from.kind === 'bucket' && flux.to.kind === 'extern') outflow += total
  }
  let deltaStorage = 0
  for (const bucket of model.buckets) deltaStorage += balances[bucket.id]!.deltaStorage

  const residual = inflow - outflow - deltaStorage
  const relResidual = Math.abs(residual) / Math.max(Math.abs(inflow), 1e-9)
  return { inflow, outflow, deltaStorage, residual, relResidual, closes: relResidual <= BALANCE_TOLERANCE }
}

function mainOutcome(
  model: WaterBalanceModel,
  stated: Record<string, number[]>,
  storageStart: Record<string, number[]>,
  storageEnd: Record<string, number[]>,
): SolveResult['main'] {
  const outcome = model.mainOutcome
  const base = { id: outcome.id, label: outcome.label, unit: outcome.unit, decimals: outcome.decimals }

  if (outcome.kind === 'fluxTotal' || outcome.kind === 'fluxMax') {
    const values = stated[outcome.fluxId]
    if (!values) throw new SolveError(`De hoofduitkomst verwijst naar een onbekende flux: ${outcome.fluxId}`)
    return { ...base, value: outcome.kind === 'fluxTotal' ? sumOf(values) : Math.max(...values) }
  }

  const start = storageStart[outcome.bucketId]
  const end = storageEnd[outcome.bucketId]
  if (!start || !end) throw new SolveError(`De hoofduitkomst verwijst naar een onbekende bak: ${outcome.bucketId}`)
  return { ...base, value: Math.max(...end) - start[0]! }
}

export function sumOf(values: readonly number[]): number {
  let total = 0
  for (const value of values) total += value
  return total
}
