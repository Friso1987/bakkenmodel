import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CONTEXTS, buildModel, contextIds, getContext } from '../src/catalog/contexts/index'
import { cloneModel, modelToJson, resolveConclusion } from '../src/core/model'
import { solve } from '../src/core/solve'

const SEEDS = ['aap', 'noot', 'mies', 'wam-2026', 'zzz-999']

describe('determinisme', () => {
  it.each(SEEDS)('dezelfde seed levert hetzelfde model (%s)', (seed) => {
    expect(modelToJson(buildModel('stad-wijk', seed))).toBe(modelToJson(buildModel('stad-wijk', seed)))
  })

  it('een andere seed levert een ander model', () => {
    expect(modelToJson(buildModel('stad-wijk', 'aap'))).not.toBe(modelToJson(buildModel('stad-wijk', 'noot')))
  })

  it('cloneModel geeft een echte kopie', () => {
    const model = buildModel('stad-wijk', 'kopie')
    const copy = cloneModel(model)
    copy.assumptions[0]!.value = 999
    expect(model.assumptions[0]!.value).not.toBe(999)
    expect(modelToJson(buildModel('stad-wijk', 'kopie'))).toBe(modelToJson(model))
  })
})

describe('de catalogus', () => {
  it('kent elke context onder zijn eigen id', () => {
    for (const id of contextIds()) expect(getContext(id).id).toBe(id)
    expect(() => getContext('bestaat-niet' as never)).toThrow()
  })

  it.each(CONTEXTS.map((c) => c.id))('bouwt een compleet model (%s)', (id) => {
    const model = buildModel(id, 'compleet')
    expect(model.buckets.length).toBeGreaterThan(0)
    expect(model.fluxes.length).toBeGreaterThan(0)
    expect(model.timeseries.labels.length).toBeGreaterThan(0)
    expect(model.conclusion.question.length).toBeGreaterThan(10)
    expect(model.conclusion.text.length).toBeGreaterThan(10)

    const ids = [...model.buckets, ...model.fluxes, ...model.assumptions, ...model.inputs].map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)

    for (const flux of model.fluxes) {
      for (const node of [flux.from, flux.to]) {
        if (node.kind === 'bucket') expect(model.buckets.some((b) => b.id === node.id)).toBe(true)
      }
    }
    for (const input of model.inputs) expect(model.timeseries.values[input.id]).toHaveLength(model.timeseries.labels.length)
    for (const source of model.sources) {
      const targets = [...model.fluxes, ...model.assumptions, ...model.inputs].map((e) => e.id)
      expect([...targets, model.area.id]).toContain(source.target)
    }
    for (const assumption of model.assumptions) {
      if (assumption.sourceId) expect(model.sources.some((s) => s.id === assumption.sourceId)).toBe(true)
    }
  })
})

describe('stad-wijk', () => {
  it.each(SEEDS)('houdt de invoer binnen fysisch plausibele grenzen (%s)', (seed) => {
    const model = buildModel('stad-wijk', seed)
    const neerslag = model.timeseries.values['P']!.reduce((a, b) => a + b, 0)
    const verdamping = model.timeseries.values['E_ref']!.reduce((a, b) => a + b, 0)
    expect(neerslag).toBeGreaterThan(550)
    expect(neerslag).toBeLessThan(1300)
    expect(verdamping).toBeGreaterThan(400)
    expect(verdamping).toBeLessThan(750)
    expect(model.area.value).toBeGreaterThan(15)
    expect(model.area.value).toBeLessThan(70)
  })

  it.each(SEEDS)('de deeloppervlakken tellen op tot het totaal (%s)', (seed) => {
    const model = buildModel('stad-wijk', seed)
    const delen = model.assumptions.filter((a) => a.role === 'deeloppervlak')
    expect(delen.length).toBe(3)
    const som = delen.reduce((acc, a) => acc + a.value, 0)
    expect(Math.abs(som - model.area.value)).toBeLessThan(1e-9)
  })
})

describe('de conclusie', () => {
  it('beweegt mee met de hoofduitkomst', () => {
    const model = buildModel('stad-wijk', 'conclusie')
    const value = solve(model).main.value
    expect(model.conclusion.text).toContain(Math.round(value).toLocaleString('nl-NL'))
    expect(resolveConclusion(model, 12345)).toContain('12.345')
  })

  it('blijft staan zodra hij vastgezet is', () => {
    const model = buildModel('stad-wijk', 'conclusie')
    model.conclusion.text = 'De afvoer is verwaarloosbaar.'
    model.conclusion.pinned = true
    expect(resolveConclusion(model, 99999)).toBe('De afvoer is verwaarloosbaar.')
  })
})

describe('de generatiecode', () => {
  it('gebruikt nergens Math.random', () => {
    const overtreders: string[] = []
    for (const file of sourceFiles('src')) {
      if (file.includes('/ui/') || file.includes('/dev/')) continue
      if (readFileSync(file, 'utf8').includes('Math.random')) overtreders.push(file)
    }
    expect(overtreders).toEqual([])
  })
})

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path))
    else if (path.endsWith('.ts')) out.push(path)
  }
  return out
}
