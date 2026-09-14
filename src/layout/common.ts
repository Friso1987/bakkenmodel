/**
 * Gereedschap dat alle layouts delen: hoe een label eruitziet, waar de eenheid
 * terechtkomt en waar de bron blijft. De opmaak-assen komen hier samen.
 */
import {
  findInput,
  getBucket,
  type Assumption,
  type Flux,
  type WaterBalanceModel,
} from '../core/model'
import type { SolveResult } from '../core/solve'
import { unitLabel, type Unit } from '../core/units'
import type { StyleChoices } from '../style/index'
import type { PlanCell } from './plan'

export type LayoutInput = {
  model: WaterBalanceModel
  result: SolveResult
  style: StyleChoices
}

/** Label volgens de as `labels`. */
export function nameOf(style: StyleChoices, label: string, symbol?: string): string {
  if (!symbol) return label
  if (style.labels === 'symbool') return symbol
  if (style.labels === 'beide') return `${label} (${symbol})`
  return label
}

export function fluxName(style: StyleChoices, flux: Flux): string {
  return nameOf(style, flux.label, flux.symbol)
}

/** Eenheid achter een kolomkop, als de as daarom vraagt. */
export function headerUnit(model: WaterBalanceModel, style: StyleChoices, unit: Unit): string {
  if (model.presentation.hideUnits) return ''
  if (style.eenheden !== 'in-kop') return ''
  return ` (${unitLabel(unit)})`
}

/**
 * Zet de eenheid op de juiste plek. In de kop en in een eigen kolom regelt de
 * tabel zelf; hier gaat het om de waarde-cel.
 */
export function withUnit(cell: PlanCell, model: WaterBalanceModel, style: StyleChoices, unit: Unit): PlanCell {
  if (model.presentation.hideUnits) return cell
  if (style.eenheden === 'achter-waarde') return { ...cell, unit, unitSuffix: unitLabel(unit) }
  return { ...cell, unit }
}

export function showUnitColumn(model: WaterBalanceModel, style: StyleChoices): boolean {
  return !model.presentation.hideUnits && style.eenheden === 'eigen-kolom'
}

/** Eenheidskolom voor tabellen waarin elke rij een andere eenheid heeft. */
export function showUnitColumnMixed(model: WaterBalanceModel, style: StyleChoices): boolean {
  // "In de kolomkop" kan niet als de rijen verschillende eenheden hebben; dan
  // valt de as terug op een eigen kolom. Dat is lelijker, niet fout.
  return !model.presentation.hideUnits && style.eenheden !== 'achter-waarde'
}

export function sourceText(model: WaterBalanceModel, targetId: string): string | undefined {
  const source =
    model.sources.find((s) => s.target === targetId) ??
    model.sources.find((s) => s.id === findSourceId(model, targetId))
  return source ? `${source.reference}, ${source.year}` : undefined
}

function findSourceId(model: WaterBalanceModel, targetId: string): string | undefined {
  return (
    model.assumptions.find((a) => a.id === targetId)?.sourceId ??
    findInput(model, targetId)?.sourceId
  )
}

export function showSourceColumn(style: StyleChoices): boolean {
  return style.bronvermelding === 'kolom'
}

/** Bron als celopmerking, als de as daarom vraagt. */
export function withSourceComment(
  cell: PlanCell,
  model: WaterBalanceModel,
  style: StyleChoices,
  targetId: string,
): PlanCell {
  if (style.bronvermelding !== 'celopmerking') return cell
  const text = sourceText(model, targetId)
  return text ? { ...cell, comment: `Bron: ${text}` } : cell
}

/** Voetnoot onder een tabel, als de as daarom vraagt. */
export function footnoteFor(
  model: WaterBalanceModel,
  style: StyleChoices,
  targetIds: string[],
): string | undefined {
  if (style.bronvermelding !== 'voetnoot') return undefined
  const lines = targetIds
    .map((id) => {
      const text = sourceText(model, id)
      return text ? `${labelForTarget(model, id)}: ${text}` : undefined
    })
    .filter((line): line is string => line !== undefined)
  return lines.length > 0 ? `Bronnen — ${lines.join('; ')}` : undefined
}

function labelForTarget(model: WaterBalanceModel, id: string): string {
  return (
    model.assumptions.find((a) => a.id === id)?.label ??
    findInput(model, id)?.label ??
    (model.area.id === id ? model.area.label : id)
  )
}

/** Bepaalt of een cel een echte formule krijgt, volgens de as `formules`. */
export function formulaGate(model: WaterBalanceModel, style: StyleChoices): (id: string) => boolean {
  if (style.formules === 'waarden') return () => false
  if (style.formules === 'formules') return () => true
  // Bij 'mix' krijgt om en om een post een formule. Dat moet reproduceerbaar
  // zijn, dus het hangt aan de volgorde in het model en niet aan toeval.
  const index = new Map(model.fluxes.map((flux, i) => [flux.id, i]))
  return (id) => (index.get(id) ?? 0) % 2 === 0
}

export function assumptionDecimals(assumption: Assumption): number {
  return assumption.decimals ?? 1
}

/** Bakken in de volgorde waarin ze in het model staan, met hun in- en uitgaande posten. */
export function bucketFluxes(model: WaterBalanceModel, bucketId: string): { in: Flux[]; out: Flux[] } {
  getBucket(model, bucketId)
  return {
    in: model.fluxes.filter((f) => f.to.kind === 'bucket' && f.to.id === bucketId),
    out: model.fluxes.filter((f) => f.from.kind === 'bucket' && f.from.id === bucketId),
  }
}

/** Kolomvolgorde van de maandtabel; drie volgordes die allemaal verdedigbaar zijn. */
export function fluxOrder(model: WaterBalanceModel, result: SolveResult, style: StyleChoices): Flux[] {
  const byId = new Map(model.fluxes.map((f) => [f.id, f]))
  const inEvaluationOrder = result.order.map((id) => byId.get(id)!).filter(Boolean)

  if (style.kolomvolgorde === 'eenheid-voor-waarde') {
    // Gegroepeerd per bak: eerst alles wat bij de eerste bak hoort, enzovoort.
    const seen = new Set<string>()
    const out: Flux[] = []
    for (const bucket of model.buckets) {
      for (const flux of inEvaluationOrder) {
        const raakt =
          (flux.from.kind === 'bucket' && flux.from.id === bucket.id) ||
          (flux.to.kind === 'bucket' && flux.to.id === bucket.id)
        if (raakt && !seen.has(flux.id)) {
          seen.add(flux.id)
          out.push(flux)
        }
      }
    }
    for (const flux of inEvaluationOrder) if (!seen.has(flux.id)) out.push(flux)
    return out
  }

  if (style.kolomvolgorde === 'bron-eerst') {
    // Eerst alles wat het gebied in komt, daarna alles wat eruit gaat.
    const ingaand = inEvaluationOrder.filter((f) => f.from.kind === 'extern')
    const intern = inEvaluationOrder.filter((f) => f.from.kind === 'bucket' && f.to.kind === 'bucket')
    const uitgaand = inEvaluationOrder.filter((f) => f.from.kind === 'bucket' && f.to.kind === 'extern')
    return [...ingaand, ...intern, ...uitgaand]
  }

  return inEvaluationOrder
}
