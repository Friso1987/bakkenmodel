/** Schrijft het diagram van één model als svg, om met het oog te bekijken. */
import { mkdirSync, writeFileSync } from 'node:fs'
import { buildModel } from '../catalog/contexts/index'
import type { ContextId } from '../core/model'
import { solve } from '../core/solve'
import { buildDiagram } from '../render/diagram'
import { defaultStyle } from '../style/index'

const seed = process.argv[3] ?? 'wam-demo01'
const context = (process.argv[2] ?? 'stad-wijk') as ContextId
const model = buildModel(context, seed)
const diagram = buildDiagram(model, solve(model), defaultStyle())

mkdirSync('out', { recursive: true })
const path = `out/diagram_${context}_${seed}.svg`
writeFileSync(path, diagram.svg)
console.log(`${path}  ${diagram.width}x${diagram.height}, ${diagram.shapes.length} vormen`)
