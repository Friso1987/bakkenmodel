import type { Rng } from '../../core/rng'
import type { ContextId, WaterBalanceModel } from '../../core/model'

export type ContextDefinition = {
  id: ContextId
  label: string
  /** Eén zin voor in de UI. */
  description: string
  /** Bouwt een foutloos moedermodel. Alle variatie komt uit de rng. */
  build(seed: string, rng: Rng): WaterBalanceModel
}
