import { describe, expect, it } from 'vitest'
import { buildModel, contextIds } from '../src/catalog/contexts/index'
import { cloneModel, modelToJson, type ContextId } from '../src/core/model'
import { createRng } from '../src/core/rng'
import { solve } from '../src/core/solve'
import {
  buildVariant,
  diffModels,
  ERRORS,
  errorsForContext,
  getError,
  impactClass,
  injectError,
  relativeDeviation,
} from '../src/errors/index'

const SEEDS = ['fout-01', 'fout-02', 'fout-03', 'fout-04', 'fout-05']
const CONTEXTS = contextIds()

/** Elke combinatie van context, foutcode en seed die iets oplevert. */
function combinaties(): Array<[ContextId, string, string]> {
  const uit: Array<[ContextId, string, string]> = []
  for (const context of CONTEXTS) {
    const passend = errorsForContext(context).map((e) => e.code)
    for (const code of passend) {
      for (const seed of SEEDS) uit.push([context, code, seed])
    }
  }
  return uit
}

describe('de foutcatalogus', () => {
  it('heeft unieke codes', () => {
    const codes = ERRORS.map((e) => e.code)
    expect(new Set(codes).size).toBe(codes.length)
  })

  it('geeft elke foutcode minstens drie ankerantwoorden', () => {
    for (const [context, code, seed] of combinaties()) {
      const variant = buildVariant(context, seed, code)
      const uitleg = getError(code).explain(variant.model, variant.applied)
      expect(uitleg.ankers.length, `${code} in ${context}`).toBeGreaterThanOrEqual(3)
      for (const anker of uitleg.ankers) expect(anker.length).toBeGreaterThan(20)
      expect(uitleg.wat.length).toBeGreaterThan(20)
      expect(uitleg.waarom.length).toBeGreaterThan(20)
      expect(uitleg.gevolg.length).toBeGreaterThan(20)
    }
  })

  it('laat elke code weten of hij in een context past', () => {
    for (const context of CONTEXTS) {
      const passend = errorsForContext(context)
      expect(passend.some((e) => e.code === 'NUL-00')).toBe(true)
      expect(passend.length).toBeGreaterThan(1)
    }
  })

  it('weigert een fout die niet in de context past', () => {
    const model = buildModel('stad-wijk', 'weigeren')
    const nietPassend = ERRORS.find((e) => !e.applies(model))
    if (!nietPassend) return
    expect(() => injectError(model, nietPassend, createRng('x'))).toThrow()
  })
})

describe('foutinjectie', () => {
  it.each(combinaties())('laat het moedermodel met rust (%s, %s, %s)', (context, code, seed) => {
    const mother = buildModel(context, seed)
    const voor = modelToJson(mother)
    buildVariant(context, seed, code)
    injectErrorSafe(mother, code, seed)
    expect(modelToJson(mother)).toBe(voor)
  })

  it.each(combinaties())('verandert precies wat het aangeeft (%s, %s, %s)', (context, code, seed) => {
    const variant = buildVariant(context, seed, code)
    const verschil = diffModels(variant.mother, variant.model)

    if (code === 'NUL-00') {
      expect(verschil.changedIds).toEqual([])
      return
    }

    // De conclusie beweegt altijd mee met de uitkomst; dat is geen tweede fout.
    // Tenzij de foutmodule hem zelf noemt: dan ís de conclusie de fout.
    const conclusieIsDeFout = variant.applied.touched.includes('conclusie')
    const echteVeranderingen = verschil.changedIds.filter((id) => id !== 'conclusie' || conclusieIsDeFout)
    expect(echteVeranderingen.length, `${code}: ${verschil.changes.join(' | ')}`).toBeGreaterThan(0)

    // Alles wat veranderd is, staat ook in de touched-lijst van de foutmodule.
    for (const id of echteVeranderingen) {
      expect(variant.applied.touched, `${code} veranderde ${id} zonder het te melden`).toContain(id)
    }
    // En andersom: wat gemeld is, is ook echt veranderd.
    for (const id of variant.applied.touched) {
      expect(verschil.changedIds, `${code} meldde ${id} maar veranderde niets`).toContain(id)
    }
  })

  it.each(combinaties())('blijft doorrekenbaar (%s, %s, %s)', (context, code, seed) => {
    const variant = buildVariant(context, seed, code)
    expect(() => solve(variant.model)).not.toThrow()
    expect(Number.isFinite(variant.result.main.value)).toBe(true)
  })

  it.each(combinaties())('is reproduceerbaar (%s, %s, %s)', (context, code, seed) => {
    const een = buildVariant(context, seed, code)
    const twee = buildVariant(context, seed, code)
    expect(modelToJson(twee.model)).toBe(modelToJson(een.model))
    expect(twee.impact).toBe(een.impact)
  })

  it('laat het foutloze model de balans sluiten en het foutmodel niet per se', () => {
    for (const [context, code, seed] of combinaties()) {
      const variant = buildVariant(context, seed, code)
      expect(variant.motherResult.system.closes).toBe(true)
      if (code === 'NUL-00') {
        expect(variant.result.flags).toEqual([])
        expect(variant.impact).toBe('geen')
      }
    }
  })

  it('geeft elke fout behalve NUL-00 een zichtbaar spoor in het model', () => {
    for (const [context, code, seed] of combinaties()) {
      if (code === 'NUL-00') continue
      const variant = buildVariant(context, seed, code)
      expect(variant.applied.primary.length, code).toBeGreaterThan(0)
      expect(variant.applied.detail.length, code).toBeGreaterThan(10)
    }
  })
})

describe('impactklasse', () => {
  it('volgt de grenzen uit de specificatie', () => {
    expect(impactClass(0)).toBe('geen')
    expect(impactClass(0.049)).toBe('klein')
    expect(impactClass(0.05)).toBe('middel')
    expect(impactClass(0.5)).toBe('middel')
    expect(impactClass(0.51)).toBe('groot')
    expect(impactClass(Number.POSITIVE_INFINITY)).toBe('groot')
  })

  it('rekent de relatieve afwijking op de hoofduitkomst', () => {
    expect(relativeDeviation(100, 150)).toBeCloseTo(0.5, 9)
    expect(relativeDeviation(100, 100)).toBe(0)
    expect(relativeDeviation(0, 0)).toBe(0)
  })

  it('kent aan elke variant een klasse toe die bij de afwijking hoort', () => {
    for (const [context, code, seed] of combinaties()) {
      const variant = buildVariant(context, seed, code)
      expect(variant.impact).toBe(impactClass(variant.deviation))
    }
  })
})

describe('modelverschil', () => {
  it('ziet een gewijzigde waarde', () => {
    const a = buildModel('stad-wijk', 'diff')
    const b = cloneModel(a)
    b.assumptions[0]!.value += 1
    expect(diffModels(a, b).changedIds).toEqual([a.assumptions[0]!.id])
  })

  it('ziet een verdwenen en een toegevoegde flux', () => {
    const a = buildModel('stad-wijk', 'diff')
    const b = cloneModel(a)
    const weg = b.fluxes.pop()!
    expect(diffModels(a, b).changedIds).toEqual([weg.id])
    expect(diffModels(b, a).changedIds).toEqual([weg.id])
  })

  it('ziet geen verschil tussen twee identieke modellen', () => {
    const a = buildModel('stad-wijk', 'diff')
    expect(diffModels(a, cloneModel(a)).changedIds).toEqual([])
  })
})

function injectErrorSafe(model: Parameters<typeof injectError>[0], code: string, seed: string) {
  const def = getError(code)
  if (!def.applies(model)) return
  injectError(model, def, createRng(`${seed}:${code}`))
}
