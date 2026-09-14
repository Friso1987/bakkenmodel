/**
 * Schrijft één werkmap naar schijf, om met de hand in Excel, LibreOffice en
 * Google Sheets te openen.
 *
 *   npm run xlsx -- --seed wam-1234 --layout B
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { buildModel } from '../catalog/contexts/index'
import type { ContextId } from '../core/model'
import { solve } from '../core/solve'
import { buildPlan, type LayoutId } from '../layout/index'
import { renderWorkbook } from '../render/workbook'
import { defaultStyle } from '../style/index'

function arg(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? (process.argv[index + 1] ?? fallback) : fallback
}

const seed = arg('seed', 'wam-demo01')
const context = arg('context', 'stad-wijk') as ContextId
const layout = arg('layout', 'B') as LayoutId
const dir = arg('out', 'out')

const model = buildModel(context, seed)
const result = solve(model)
const style = defaultStyle()
const plan = buildPlan(layout, model, result, style)
const rendered = await renderWorkbook(plan, model, result, style)

mkdirSync(dir, { recursive: true })
const path = `${dir}/WAMTEK_${context}_${seed}_${layout}.xlsx`
writeFileSync(path, rendered.buffer)

console.log(`geschreven: ${path} (${(rendered.buffer.length / 1024).toFixed(1)} kB)`)
console.log(`tabbladen:  ${plan.sheets.map((s) => s.name).join(', ')}`)
console.log('celverwijzingen:')
for (const [id, cell] of Object.entries(rendered.idToCell).slice(0, 12)) {
  console.log(`  ${id.padEnd(18)} ${cell}`)
}
