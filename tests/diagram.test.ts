import { describe, expect, it } from 'vitest'
import { buildModel, contextIds } from '../src/catalog/contexts/index'
import { solve } from '../src/core/solve'
import { errorsForContext, buildVariant } from '../src/errors/index'
import { buildDiagram, verdeelOverRegels } from '../src/render/diagram'
import { toSvg } from '../src/render/shapes'
import { defaultStyle, THEMES } from '../src/style/index'

type Vak = { x: number; y: number; w: number; h: number }

function blokjes(diagram: ReturnType<typeof buildDiagram>): Vak[] {
  return diagram.shapes
    .filter((s) => s.kind === 'rect' && s.strokeWidth > 0)
    .map((s) => (s.kind === 'rect' ? { x: s.x, y: s.y, w: s.w, h: s.h } : null))
    .filter((v): v is Vak => v !== null)
}

function overlapt(a: Vak, b: Vak): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

describe('het bakkendiagram', () => {
  it.each(contextIds())('zet de blokjes zonder overlap neer (%s)', (context) => {
    const model = buildModel(context, 'diagram')
    const diagram = buildDiagram(model, solve(model), defaultStyle())
    const vakken = blokjes(diagram)

    expect(vakken.length).toBe(model.buckets.length + externeKnopen(model))
    for (let i = 0; i < vakken.length; i++) {
      for (let j = i + 1; j < vakken.length; j++) {
        expect(overlapt(vakken[i]!, vakken[j]!), `blokje ${i} en ${j} overlappen`).toBe(false)
      }
    }
  })

  it.each(contextIds())('houdt alles binnen het doek (%s)', (context) => {
    const model = buildModel(context, 'diagram')
    const diagram = buildDiagram(model, solve(model), defaultStyle())
    for (const shape of diagram.shapes) {
      if (shape.kind === 'rect') {
        expect(shape.x).toBeGreaterThanOrEqual(-1)
        expect(shape.x + shape.w).toBeLessThanOrEqual(diagram.width + 1)
        expect(shape.y + shape.h).toBeLessThanOrEqual(diagram.height + 1)
      }
      if (shape.kind === 'text') {
        expect(shape.x).toBeGreaterThanOrEqual(0)
        expect(shape.x).toBeLessThanOrEqual(diagram.width)
        expect(shape.y).toBeGreaterThanOrEqual(0)
        expect(shape.y).toBeLessThanOrEqual(diagram.height)
      }
    }
  })

  it.each(contextIds())('tekent voor elke post een pijl met een punt (%s)', (context) => {
    const model = buildModel(context, 'diagram')
    const diagram = buildDiagram(model, solve(model), defaultStyle())
    const lijnen = diagram.shapes.filter((s) => s.kind === 'polyline').length
    const punten = diagram.shapes.filter((s) => s.kind === 'polygon').length
    expect(lijnen).toBe(model.fluxes.length)
    expect(punten).toBe(model.fluxes.length)
  })

  it.each(
    contextIds().flatMap((context) =>
      errorsForContext(context)
        .filter((def) => (def.layouts ?? ['A', 'B', 'C']).includes('A'))
        .flatMap((def) =>
          (['volluit', 'symbool', 'beide'] as const).flatMap((labels) =>
            // Het thema bepaalt het lettertype en dus de breedte van elk label;
            // Verdana is fors breder dan Times New Roman.
            (Object.keys(THEMES) as Array<keyof typeof THEMES>).map(
              (thema) => [context, def.code, labels, thema] as const,
            ),
          ),
        ),
    ),
  )('zet in %s bij %s met labels=%s en thema %s geen enkel label over een ander heen', (context, code, labels, thema) => {
    const variant = buildVariant(context, `overlap-${code}`, code)
    const diagram = buildDiagram(variant.model, variant.result, { ...defaultStyle(), labels, thema })

    const blokjes: Vak[] = []
    const labelvakken: Vak[] = []
    for (const shape of diagram.shapes) {
      if (shape.kind !== 'rect') continue
      const vak = { x: shape.x, y: shape.y, w: shape.w, h: shape.h }
      // Een labelvlak heeft geen rand; een blokje wel.
      if (shape.strokeWidth > 0) blokjes.push(vak)
      else labelvakken.push(vak)
    }

    for (let i = 0; i < labelvakken.length; i++) {
      for (let j = i + 1; j < labelvakken.length; j++) {
        expect(overlapt(labelvakken[i]!, labelvakken[j]!), `label ${i} en ${j} overlappen`).toBe(false)
      }
      for (const blok of blokjes) {
        expect(overlapt(labelvakken[i]!, blok), `label ${i} valt over een blokje`).toBe(false)
      }
      const vak = labelvakken[i]!
      expect(vak.x).toBeGreaterThanOrEqual(0)
      expect(vak.y).toBeGreaterThanOrEqual(0)
      expect(vak.x + vak.w).toBeLessThanOrEqual(diagram.width)
      expect(vak.y + vak.h).toBeLessThanOrEqual(diagram.height)
    }
  })

  it('zet een lange naam over twee regels in plaats van hem af te kappen', () => {
    expect(verdeelOverRegels('kwel')).toEqual(['kwel'])
    expect(verdeelOverRegels('neerslag op het stroomgebied (P)')).toEqual([
      'neerslag op het',
      'stroomgebied (P)',
    ])
    // Elke pijl houdt zijn hele naam; er wordt niets weggelaten.
    const model = buildModel('stroomgebied', 'namen')
    const diagram = buildDiagram(model, solve(model), { ...defaultStyle(), labels: 'beide' })
    const teksten = diagram.shapes.filter((s) => s.kind === 'text').map((s) => (s.kind === 'text' ? s.text : ''))
    for (const flux of model.fluxes) {
      const heel = `${flux.label} (${flux.symbol})`
      const samen = teksten.join(' ')
      for (const woord of heel.split(' ')) expect(samen).toContain(woord)
    }
    expect(teksten.some((t) => t.includes('…'))).toBe(false)
  })

  it('noemt elke bak en elke post bij naam', () => {
    const model = buildModel('polder', 'namen')
    const diagram = buildDiagram(model, solve(model), defaultStyle())
    const teksten = diagram.shapes.filter((s) => s.kind === 'text').map((s) => (s.kind === 'text' ? s.text : ''))
    for (const bak of model.buckets) expect(teksten).toContain(bak.label)
    for (const flux of model.fluxes) expect(teksten.some((t) => t.startsWith(flux.label.slice(0, 12)))).toBe(true)
  })

  it('laat de eenheden weg zodra NAV-02 gekozen is', () => {
    const zonder = buildVariant('stad-wijk', 'zonder-eenheden', 'NAV-02')
    const met = buildVariant('stad-wijk', 'zonder-eenheden', 'NUL-00')
    const teksten = (variant: typeof zonder) =>
      buildDiagram(variant.model, variant.result, defaultStyle())
        .shapes.filter((s) => s.kind === 'text')
        .map((s) => (s.kind === 'text' ? s.text : ''))

    // Een eenheid staat altijd achter een getal; "verhard" bevat ook "ha".
    const metEenheid = /[\d.,]\s(m³|ha|m|mm)$/
    expect(teksten(met).some((t) => metEenheid.test(t))).toBe(true)
    expect(teksten(zonder).filter((t) => metEenheid.test(t))).toEqual([])
  })

  it('levert geldige svg op in elk thema', () => {
    const model = buildModel('stroomgebied', 'themas')
    const result = solve(model)
    for (const thema of Object.keys(THEMES)) {
      const diagram = buildDiagram(model, result, { ...defaultStyle(), thema: thema as never })
      expect(diagram.svg.startsWith('<svg')).toBe(true)
      expect(diagram.svg.endsWith('</svg>')).toBe(true)
      expect((diagram.svg.match(/</g) ?? []).length).toBe((diagram.svg.match(/>/g) ?? []).length)
      expect(toSvg(diagram)).toBe(diagram.svg)
    }
  })

  it('ontsnapt tekens die de svg zouden breken', () => {
    const model = buildModel('stad-wijk', 'ontsnappen')
    model.title = 'Wijk <A & B>'
    const diagram = buildDiagram(model, solve(model), defaultStyle())
    expect(diagram.svg).toContain('&amp;')
    expect(diagram.svg).not.toContain('<A')
  })

  it.each(
    contextIds().flatMap((context) =>
      errorsForContext(context)
        .filter((def) => (def.layouts ?? ['A', 'B', 'C']).includes('A'))
        .map((def) => [context, def.code] as const),
    ),
  )('tekent %s met fout %s zonder te klappen', (context, code) => {
    const variant = buildVariant(context, `diagram-${code}`, code)
    const diagram = buildDiagram(variant.model, variant.result, defaultStyle())
    expect(diagram.width).toBeGreaterThan(300)
    expect(diagram.shapes.length).toBeGreaterThan(10)
  })
})

function externeKnopen(model: ReturnType<typeof buildModel>): number {
  const ids = new Set<string>()
  for (const flux of model.fluxes) {
    for (const node of [flux.from, flux.to]) if (node.kind === 'extern') ids.add(node.id)
  }
  return ids.size
}
