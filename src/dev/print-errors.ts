/** Overzicht van alle foutcodes in een context, met hun impact. */
import { contextIds } from '../catalog/contexts/index'
import { buildVariant, ERRORS, errorsForContext, IMPACT_LABEL } from '../errors/index'
import type { ContextId } from '../core/model'
import { getError } from '../errors/index'
import { formatNumber } from '../core/units'

const seed = process.argv[3] ?? 'wam-demo01'
const context = (process.argv[2] ?? 'stad-wijk') as ContextId
if (!contextIds().includes(context)) {
  console.error(`Onbekende context: ${context}`)
  process.exit(1)
}

const passend = new Set(errorsForContext(context, seed).map((e) => e.code))
console.log(`context ${context}, seed ${seed}\n`)
console.log(
  ['code', 'laag', 'past', 'afwijking', 'impact', 'wat er gebeurt'].map((h, i) =>
    i === 5 ? h : h.padEnd([8, 5, 5, 10, 8][i] ?? 8),
  ).join(''),
)
console.log('-'.repeat(110))

for (const def of ERRORS) {
  if (!passend.has(def.code)) {
    console.log(`${def.code.padEnd(8)}${String(def.layer).padEnd(5)}${'nee'.padEnd(5)}${'-'.padEnd(10)}${'-'.padEnd(8)}past niet in deze context`)
    continue
  }
  const variant = buildVariant(context, seed, def.code)
  const afwijking = `${(variant.deviation * 100).toFixed(1)}%`
  console.log(
    `${def.code.padEnd(8)}${String(def.layer).padEnd(5)}${'ja'.padEnd(5)}${afwijking.padEnd(10)}${variant.impact.padEnd(8)}${variant.applied.detail}`,
  )
  console.log(
    `        hoofduitkomst: ${formatNumber(variant.motherResult.main.value, 0)} -> ${formatNumber(variant.result.main.value, 0)} ${variant.result.main.unit}` +
      `   vlaggen: ${variant.result.flags.map((f) => f.code).join(', ') || 'geen'}`,
  )
  console.log(`        veranderd: ${variant.changedIds.join(', ') || 'niets'}`)
  const uitleg = getError(def.code).explain(variant.model, variant.applied)
  console.log(`        ankers: ${uitleg.ankers.length}   impact: ${IMPACT_LABEL[variant.impact]}`)
}
