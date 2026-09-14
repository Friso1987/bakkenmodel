/**
 * Een fout is een transformatie op het modelobject, voordat er iets gerenderd
 * is. Daardoor werkt elke foutcode automatisch in elke layout en elke
 * opmaakvariant, en blijft de sleutel kloppen.
 */
import type { WaterBalanceModel } from '../core/model'
import type { Rng } from '../core/rng'
import type { LayoutId } from '../layout/index'

export type ErrorLayer = 0 | 1 | 2 | 3 | 4 | 5

export const LAYER_LABEL: Record<ErrorLayer, string> = {
  0: 'geen fout',
  1: 'eenheden',
  2: 'structuur van de balans',
  3: 'schematisatie',
  4: 'navolgbaarheid',
  5: 'interpretatie',
}

export type ImpactClass = 'geen' | 'klein' | 'middel' | 'groot'

export type ErrorExplanation = {
  wat: string
  waarom: string
  gevolg: string
  /** Drie of meer antwoorden die als goed gerekend mogen worden. */
  ankers: string[]
}

export type ApplyResult = {
  /** Het element waar de sleutel naar verwijst. */
  primary: string
  /** Alles wat door de ingreep veranderd is, inclusief meeveranderde formules. */
  touched: string[]
  /** Eén zin over wat er precies gedaan is, voor de sleutel. */
  detail: string
}

export type ErrorDef = {
  code: string
  layer: ErrorLayer
  label: string
  /** Eén zin voor in de UI. */
  description: string
  /** Past deze fout in dit model? Een kwelfout in een straatprofiel is onzin. */
  applies(model: WaterBalanceModel): boolean
  /** Verandert het model. Krijgt altijd een kopie binnen. */
  apply(model: WaterBalanceModel, rng: Rng): ApplyResult
  explain(model: WaterBalanceModel, applied: ApplyResult): ErrorExplanation
  /** Layouts waarin de fout zichtbaar is. Leeg betekent alle. */
  layouts?: LayoutId[]
}
