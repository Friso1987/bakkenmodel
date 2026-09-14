import { resolveConclusion, type ContextId, type WaterBalanceModel } from '../../core/model'
import { solve } from '../../core/solve'
import { createRng, type Rng } from '../../core/rng'
import { polder } from './polder'
import { stadWijk } from './stad-wijk'
import { stroomgebied } from './stroomgebied'
import type { ContextDefinition } from './types'

export type { ContextDefinition } from './types'

export const CONTEXTS: ContextDefinition[] = [stadWijk, polder, stroomgebied]

export function getContext(id: ContextId): ContextDefinition {
  const context = CONTEXTS.find((c) => c.id === id)
  if (!context) throw new Error(`Onbekende context: ${id}`)
  return context
}

export function contextIds(): ContextId[] {
  return CONTEXTS.map((c) => c.id)
}

/**
 * Bouwt een foutloos moedermodel. De rng wordt afgeleid van de seed plus de
 * context, zodat dezelfde seed in een andere context een ander gebied oplevert
 * maar wel reproduceerbaar blijft.
 */
export function buildModel(contextId: ContextId, seed: string, rng?: Rng): WaterBalanceModel {
  const context = getContext(contextId)
  const model = context.build(seed, rng ?? createRng(`${seed}:${contextId}`))
  // De conclusie hoort bij de uitkomst, dus die wordt hier pas ingevuld.
  model.conclusion.text = resolveConclusion(model, solve(model).main.value)
  return model
}
