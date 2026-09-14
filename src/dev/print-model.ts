/**
 * Fase 1: het model en de uitkomst op de console, zodat er iets te controleren
 * valt voordat er een werkmap bestaat.
 *
 *   npm run demo -- --seed wam-1234 --context stad-wijk
 */
import { buildModel, contextIds } from '../catalog/contexts/index'
import { exprToText } from '../core/expr'
import {
  findInput,
  labelOf,
  modelToJson,
  type ContextId,
  type WaterBalanceModel,
} from '../core/model'
import { solve, type SolveResult } from '../core/solve'
import { formatNumber, unitLabel } from '../core/units'

function arg(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? (process.argv[index + 1] ?? fallback) : fallback
}

const seed = arg('seed', 'wam-demo01')
const context = arg('context', 'stad-wijk') as ContextId
if (!contextIds().includes(context)) {
  console.error(`Onbekende context: ${context}. Beschikbaar: ${contextIds().join(', ')}`)
  process.exit(1)
}

const model = buildModel(context, seed)
const result = solve(model)

printModel(model, result)
if (process.argv.includes('--json')) console.log(modelToJson(model))

function printModel(model: WaterBalanceModel, result: SolveResult): void {
  heading(model.title)
  console.log(model.intro)
  console.log(`seed: ${model.seed}   context: ${model.context}   tijdstap: ${result.step}`)

  heading('Vraag')
  console.log(model.conclusion.question)

  heading('Aannames en parameters')
  for (const a of model.assumptions) {
    const source = a.sourceId ? model.sources.find((s) => s.id === a.sourceId) : undefined
    console.log(
      `  ${pad(a.label, 32)} ${padLeft(formatNumber(a.value, a.decimals ?? 1), 10)} ${pad(unitLabel(a.unit), 8)}` +
        (source ? `  [${source.reference}, ${source.year}]` : ''),
    )
  }
  console.log(
    `  ${pad(model.area.label, 32)} ${padLeft(formatNumber(model.area.value, 1), 10)} ${unitLabel(model.area.unit)}`,
  )

  heading('Bakken')
  for (const bucket of model.buckets) {
    const balance = result.balances[bucket.id]!
    console.log(
      `  ${pad(bucket.label, 22)} begin ${padLeft(formatNumber(bucket.initialStorage, 0), 9)} m³` +
        `  max ${padLeft(bucket.maxStorage === null ? '-' : formatNumber(bucket.maxStorage, 0), 9)} m³` +
        `  in ${padLeft(formatNumber(balance.inflow, 0), 9)}  uit ${padLeft(formatNumber(balance.outflow, 0), 9)}` +
        `  Δberging ${padLeft(formatNumber(balance.deltaStorage, 0), 9)}  restpost ${balance.residual.toFixed(3)}`,
    )
  }

  heading('Fluxen')
  const labels = {
    param: (id: string) => labelOf(model, id),
    series: (id: string) => findInput(model, id)?.symbol ?? id,
    flux: (id: string) => labelOf(model, id),
    storage: (id: string) => `berging ${labelOf(model, id)}`,
  }
  for (const id of result.order) {
    const flux = model.fluxes.find((f) => f.id === id)!
    const from = flux.from.kind === 'bucket' ? labelOf(model, flux.from.id) : flux.from.label
    const to = flux.to.kind === 'bucket' ? labelOf(model, flux.to.id) : flux.to.label
    console.log(`  ${pad(flux.symbol, 7)} ${pad(`${from} → ${to}`, 46)} ${padLeft(formatNumber(result.totals[id]!, 0), 10)} m³/jaar`)
    if (flux.definition.kind === 'expr') {
      console.log(`          = ${exprToText(flux.definition.expr, labels)}`)
    }
  }

  heading('Maandbalans (m³)')
  const columns = ['maand', 'P mm', 'E mm', ...result.order.map((id) => model.fluxes.find((f) => f.id === id)!.symbol)]
  console.log('  ' + columns.map((c, i) => (i === 0 ? pad(c, 11) : padLeft(c, 9))).join(' '))
  result.labels.forEach((label, t) => {
    const cells = [
      pad(label, 11),
      padLeft(formatNumber(model.timeseries.values['P']![t]!, 0), 9),
      padLeft(formatNumber(model.timeseries.values['E_ref']![t]!, 0), 9),
      ...result.order.map((id) => padLeft(formatNumber(result.stated[id]![t]!, 0), 9)),
    ]
    console.log('  ' + cells.join(' '))
  })
  const totals = [
    pad('totaal', 11),
    padLeft(formatNumber(model.timeseries.values['P']!.reduce((a, b) => a + b, 0), 0), 9),
    padLeft(formatNumber(model.timeseries.values['E_ref']!.reduce((a, b) => a + b, 0), 0), 9),
    ...result.order.map((id) => padLeft(formatNumber(result.totals[id]!, 0), 9)),
  ]
  console.log('  ' + totals.join(' '))

  heading('Berging aan het eind van de maand (m³)')
  for (const bucket of model.buckets) {
    console.log(
      `  ${pad(bucket.label, 22)} ` +
        result.storageEnd[bucket.id]!.map((v) => padLeft(formatNumber(v, 0), 8)).join(' '),
    )
  }

  heading('Systeembalans')
  console.log(`  in            ${padLeft(formatNumber(result.system.inflow, 0), 12)} m³`)
  console.log(`  uit           ${padLeft(formatNumber(result.system.outflow, 0), 12)} m³`)
  console.log(`  Δberging      ${padLeft(formatNumber(result.system.deltaStorage, 0), 12)} m³`)
  console.log(`  restpost      ${padLeft(result.system.residual.toFixed(3), 12)} m³  (${(result.system.relResidual * 100).toFixed(4)} %)`)
  console.log(`  sluit         ${result.system.closes ? 'ja' : 'NEE'}`)

  heading('Hoofduitkomst')
  console.log(`  ${result.main.label}: ${formatNumber(result.main.value, result.main.decimals)} ${unitLabel(result.main.unit)}`)

  heading('Conclusie in het bestand')
  console.log('  ' + model.conclusion.text)

  heading('Vlaggen')
  if (result.flags.length === 0) console.log('  geen')
  for (const flag of result.flags) console.log(`  [${flag.code}] ${flag.message}`)
  console.log('')
}

function heading(text: string): void {
  console.log('\n' + text)
  console.log('-'.repeat(Math.max(text.length, 20)))
}

function pad(text: string, width: number): string {
  return text.length >= width ? text : text + ' '.repeat(width - text.length)
}

function padLeft(text: string, width: number): string {
  return text.length >= width ? text : ' '.repeat(width - text.length) + text
}
