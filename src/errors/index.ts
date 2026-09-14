/**
 * De foutenregistratie. Hier komen de losse foutmodules samen, en hier wordt
 * een fout in een model geïnjecteerd.
 *
 * Na injectie wordt solve() twee keer gedraaid: op het moedermodel en op het
 * foutmodel. Het verschil in de hoofduitkomst bepaalt de impactklasse. Een
 * grove fout met klein gevolg en een kleine fout met enorm gevolg zijn allebei
 * didactisch waardevol, dus de docent moet daarop kunnen selecteren.
 */
import { buildModel } from '../catalog/contexts/index'
import { cloneModel, resolveConclusion, type ContextId, type WaterBalanceModel } from '../core/model'
import { createRng, type Rng } from '../core/rng'
import { solve, type SolveResult } from '../core/solve'
import type { LayoutId } from '../layout/index'
import { diffModels } from './diff'
import { EEN_01 } from './een-01'
import { EEN_02 } from './een-02'
import { EEN_03 } from './een-03'
import { EEN_04 } from './een-04'
import { SCH_01 } from './sch-01'
import { SCH_02 } from './sch-02'
import { SCH_03 } from './sch-03'
import { SCH_04 } from './sch-04'
import { SCH_05 } from './sch-05'
import { SCH_06 } from './sch-06'
import { NAV_01 } from './nav-01'
import { NAV_02 } from './nav-02'
import { NAV_03 } from './nav-03'
import { NAV_04 } from './nav-04'
import { NAV_05 } from './nav-05'
import { NAV_06 } from './nav-06'
import { INT_01 } from './int-01'
import { INT_02 } from './int-02'
import { INT_03 } from './int-03'
import { INT_04 } from './int-04'
import { NUL_00 } from './nul-00'
import { STR_01 } from './str-01'
import { STR_02 } from './str-02'
import { STR_03 } from './str-03'
import { STR_04 } from './str-04'
import { STR_05 } from './str-05'
import type { ApplyResult, ErrorDef, ErrorLayer, ImpactClass } from './types'

export * from './types'
export { diffModels } from './diff'

export const ERRORS: ErrorDef[] = [
  NUL_00,
  EEN_01,
  EEN_02,
  EEN_03,
  EEN_04,
  STR_01,
  STR_02,
  STR_03,
  STR_04,
  STR_05,
  SCH_01,
  SCH_02,
  SCH_03,
  SCH_04,
  SCH_05,
  SCH_06,
  NAV_01,
  NAV_02,
  NAV_03,
  NAV_04,
  NAV_05,
  NAV_06,
  INT_01,
  INT_02,
  INT_03,
  INT_04,
]

export function getError(code: string): ErrorDef {
  const def = ERRORS.find((e) => e.code === code)
  if (!def) throw new Error(`Onbekende foutcode: ${code}`)
  return def
}

export function errorsByLayer(layer: ErrorLayer): ErrorDef[] {
  return ERRORS.filter((e) => e.layer === layer)
}

export function layersInUse(): ErrorLayer[] {
  return [...new Set(ERRORS.map((e) => e.layer))].sort((a, b) => a - b)
}

/**
 * Welke foutcodes passen in deze context? De UI waarschuwt hiermee meteen bij
 * een combinatie die niets oplevert, in plaats van pas na het klikken.
 */
export function errorsForContext(context: ContextId, seed = 'catalogus'): ErrorDef[] {
  const probe = buildModel(context, seed)
  return ERRORS.filter((def) => def.applies(probe))
}

export function appliesTo(code: string, context: ContextId, seed = 'catalogus'): boolean {
  return errorsForContext(context, seed).some((e) => e.code === code)
}

export type InjectedVariant = {
  code: string
  layer: ErrorLayer
  label: string
  /** Het model met de fout erin. */
  model: WaterBalanceModel
  result: SolveResult
  /** Het foutloze moedermodel, voor de map correcte-modellen. */
  mother: WaterBalanceModel
  motherResult: SolveResult
  applied: ApplyResult
  impact: ImpactClass
  /** Relatieve afwijking in de hoofduitkomst. */
  deviation: number
  changedIds: string[]
  layouts: LayoutId[] | null
}

export function injectError(mother: WaterBalanceModel, def: ErrorDef, rng: Rng): InjectedVariant {
  if (!def.applies(mother)) {
    throw new Error(`${def.code} past niet in de context ${mother.context}`)
  }

  const model = cloneModel(mother)
  const applied = def.apply(model, rng)

  // De conclusie beweegt mee met de nieuwe uitkomst, behalve als de fout hem
  // juist vastzet. Anders zou elke fout eruitzien als een interpretatiefout.
  const result = solve(model)
  model.conclusion.text = resolveConclusion(model, result.main.value)

  const motherResult = solve(mother)
  const deviation = relativeDeviation(motherResult.main.value, result.main.value)

  return {
    code: def.code,
    layer: def.layer,
    label: def.label,
    model,
    result,
    mother,
    motherResult,
    applied,
    impact: impactClass(deviation),
    deviation,
    changedIds: diffModels(mother, model).changedIds,
    layouts: def.layouts ?? null,
  }
}

/** Een variant zonder fout; dezelfde vorm, zodat de rest van de pijplijn niets merkt. */
export function noError(mother: WaterBalanceModel): InjectedVariant {
  const result = solve(mother)
  return {
    code: NUL_00.code,
    layer: 0,
    label: NUL_00.label,
    model: mother,
    result,
    mother,
    motherResult: result,
    applied: { primary: '', touched: [], detail: 'Het model is ongewijzigd gebleven.' },
    impact: 'geen',
    deviation: 0,
    changedIds: [],
    layouts: null,
  }
}

export function relativeDeviation(voor: number, na: number): number {
  if (!Number.isFinite(voor) || !Number.isFinite(na)) return Number.POSITIVE_INFINITY
  const schaal = Math.max(Math.abs(voor), 1e-9)
  return Math.abs(na - voor) / schaal
}

export function impactClass(deviation: number): ImpactClass {
  if (!Number.isFinite(deviation)) return 'groot'
  if (deviation < 1e-9) return 'geen'
  if (deviation < 0.05) return 'klein'
  if (deviation <= 0.5) return 'middel'
  return 'groot'
}

export const IMPACT_LABEL: Record<ImpactClass, string> = {
  geen: 'geen gevolg voor de uitkomst',
  klein: 'klein gevolg (minder dan 5%)',
  middel: 'middelgroot gevolg (5 tot 50%)',
  groot: 'groot gevolg (meer dan 50%)',
}

/** Handige ingang voor tests en voor de UI-preview. */
export function buildVariant(
  context: ContextId,
  seed: string,
  code: string,
): InjectedVariant {
  const mother = buildModel(context, seed)
  if (code === 'NUL-00') return noError(mother)
  return injectError(mother, getError(code), createRng(`${seed}:${code}`))
}
