/**
 * Genereert een hele partij naar schijf, met sleutel. Zelfde pijplijn als de
 * knop in de browser; handig om met de hand in Excel te controleren.
 *
 *   npm run batch -- --seed wam-1234 --total 6 --layouts B
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { contextIds } from '../catalog/contexts/index'
import { ERRORS } from '../errors/index'
import { defaultSettings, generateAll, type GenerateSettings, type LayoutMix } from '../generate'
import { buildBundleBytes, bundleName } from '../bundle'
import { keyMarkdown } from '../key'
import type { StyleVariation } from '../style/index'

function arg(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? (process.argv[index + 1] ?? fallback) : fallback
}

const seed = arg('seed', 'wam-batch01')
const dir = arg('out', 'out/batch')

const settings: GenerateSettings = {
  ...defaultSettings(seed),
  contexts: contextIds(),
  codes: arg('codes', ERRORS.filter((e) => e.code !== 'NUL-00').map((e) => e.code).join(',')).split(','),
  total: Number(arg('total', '8')),
  nulShare: Number(arg('nul', '0.25')),
  layouts: arg('layouts', 'B') as LayoutMix,
  variation: arg('variatie', 'hoog') as StyleVariation,
}

const { variants, warnings } = await generateAll(settings)

rmSync(dir, { recursive: true, force: true })
mkdirSync(`${dir}/studenten`, { recursive: true })
mkdirSync(`${dir}/docent/correcte-modellen`, { recursive: true })

for (const variant of variants) {
  writeFileSync(`${dir}/studenten/${variant.fileName}`, variant.rendered.buffer)
  writeFileSync(`${dir}/docent/correcte-modellen/${variant.motherFileName}`, variant.motherRendered.buffer)
}
writeFileSync(`${dir}/docent/sleutel.md`, keyMarkdown(variants, settings, warnings))
writeFileSync(
  `${dir}/generatie.json`,
  JSON.stringify({ versie: 1, gegenereerd: 'deterministisch uit de seed', settings }, null, 2),
)

if (process.argv.includes('--zip')) {
  const bytes = await buildBundleBytes(variants, settings, warnings)
  writeFileSync(`${dir}/${bundleName(seed)}`, bytes)
  console.log(`zip: ${dir}/${bundleName(seed)} (${(bytes.length / 1024).toFixed(0)} kB)`)
}

console.log(`${variants.length} varianten geschreven naar ${dir}`)
for (const warning of warnings) console.log(`  let op: ${warning}`)
console.log('')
for (const variant of variants) {
  console.log(
    `  ${variant.fileName.padEnd(40)} ${variant.injected.code.padEnd(7)} layout ${variant.layout}  ` +
      `${variant.injected.impact.padEnd(7)} ${variant.cellRef}`,
  )
}
