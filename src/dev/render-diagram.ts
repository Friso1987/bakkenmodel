/**
 * Rendert diagrammen als png, om ze met het oog te kunnen bekijken. De tests
 * meten of labels elkaar overlappen, maar of het er ook goed uitziet moet je
 * zien.
 *
 * Vraagt om een rasterizer die niet in de afhankelijkheden zit, omdat de tool
 * zelf hem niet nodig heeft; in de browser doet een canvas dit werk:
 *
 *   npm install --no-save sharp
 *   npx tsx src/dev/render-diagram.ts
 */
import { mkdirSync } from 'node:fs'
import { contextIds } from '../catalog/contexts/index'
import type { ContextId } from '../core/model'
import { buildVariant } from '../errors/index'
import { buildDiagram } from '../render/diagram'
import { defaultStyle, type LabelStyle } from '../style/index'

type Rasterizer = (svg: string, pad: string) => Promise<void>

async function laadRasterizer(): Promise<Rasterizer> {
  try {
    const sharp = (await import('sharp')).default as (
      input: Buffer,
      opties: { density: number },
    ) => { png(): { toFile(pad: string): Promise<unknown> } }
    return async (svg, pad) => {
      await sharp(Buffer.from(svg), { density: 144 }).png().toFile(pad)
    }
  } catch {
    console.error('Geen rasterizer gevonden. Draai eerst: npm install --no-save sharp')
    process.exit(1)
  }
}

const context = (process.argv[2] ?? 'stad-wijk') as ContextId
const code = process.argv[3] ?? 'NUL-00'
const labels = (process.argv[4] ?? 'volluit') as LabelStyle

if (!contextIds().includes(context)) {
  console.error(`Onbekende context: ${context}. Beschikbaar: ${contextIds().join(', ')}`)
  process.exit(1)
}

const rasteren = await laadRasterizer()
const variant = buildVariant(context, `kijk-${code}`, code)
const diagram = buildDiagram(variant.model, variant.result, { ...defaultStyle(), labels })

mkdirSync('out/kijk', { recursive: true })
const pad = `out/kijk/${context}_${code}_${labels}.png`
await rasteren(diagram.svg, pad)
console.log(`${pad}  ${diagram.width}x${diagram.height}`)
