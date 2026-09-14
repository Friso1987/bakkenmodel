import { describe, expect, it } from 'vitest'
import { buildModel, contextIds } from '../src/catalog/contexts/index'
import { solve } from '../src/core/solve'
import { createRng } from '../src/core/rng'
import { buildVariant, errorsForContext } from '../src/errors/index'
import { buildPlan, LAYOUTS } from '../src/layout/index'
import { allCells, allTables, planText, type WorkbookPlan } from '../src/layout/plan'
import { renderWorkbook } from '../src/render/workbook'
import { assertErrorVisible, StyleAssertionError } from '../src/style/assert'
import {
  constrainStyle,
  defaultStyle,
  describeStyle,
  pickStyle,
  THEMES,
  type StyleChoices,
} from '../src/style/index'

const ASSEN = {
  bronvermelding: ['apart-tabblad', 'kolom', 'celopmerking', 'voetnoot', 'geen'],
  eenheden: ['in-kop', 'eigen-kolom', 'achter-waarde'],
  formules: ['formules', 'waarden', 'mix'],
  tabbladen: ['een-tabblad', 'gescheiden'],
  tijdreeks: ['maanden-in-rijen', 'maanden-in-kolommen'],
  labels: ['volluit', 'symbool', 'beide'],
  kolomvolgorde: ['standaard', 'eenheid-voor-waarde', 'bron-eerst'],
  thema: Object.keys(THEMES),
} as const

/** Elke as één keer los gevarieerd, met de andere assen op de standaard. */
function styleVarianten(): StyleChoices[] {
  const uit: StyleChoices[] = [defaultStyle()]
  for (const [as, opties] of Object.entries(ASSEN)) {
    for (const optie of opties) {
      uit.push({ ...defaultStyle(), [as]: optie } as StyleChoices)
    }
  }
  return uit
}

const model = buildModel('stad-wijk', 'opmaak')
const result = solve(model)

describe('de opmaak-assen', () => {
  it.each(styleVarianten().map((s) => [describeStyle(s), s] as const))(
    'bouwt een plan zonder te klappen (%s)',
    (_naam, style) => {
      const plan = buildPlan('B', model, result, style)
      expect(plan.sheets.length).toBeGreaterThan(0)
      expect(planText(plan).length).toBeGreaterThan(200)
    },
  )

  it('verandert nooit een getal in het bestand', () => {
    const referentie = getallen(buildPlan('B', model, result, defaultStyle()))
    for (const style of styleVarianten()) {
      expect(getallen(buildPlan('B', model, result, style)), describeStyle(style)).toEqual(referentie)
    }
  })

  it('verandert nooit de uitkomst van solve', () => {
    const referentie = solve(model)
    for (const style of styleVarianten()) {
      buildPlan('B', model, result, style)
      expect(solve(model).main.value).toBe(referentie.main.value)
    }
  })

  it('laat de eenheden altijd ergens staan, tenzij NAV-02 gekozen is', () => {
    for (const style of styleVarianten()) {
      const plan = buildPlan('B', model, result, style)
      expect(plan.meta.hasUnits, describeStyle(style)).toBe(true)
      expect(() => assertErrorVisible(plan, 'STR-01', 'B')).not.toThrow()
    }
  })

  it('laat de aannames altijd staan en houdt de secties gescheiden', () => {
    for (const style of styleVarianten()) {
      const plan = buildPlan('B', model, result, style)
      expect(plan.meta.hasAssumptions, describeStyle(style)).toBe(true)
      expect(plan.meta.sectionsLabelled, describeStyle(style)).toBe(true)
    }
  })

  it('zet de bronnen daar neer waar de as dat zegt', () => {
    const metTabblad = buildPlan('B', model, result, { ...defaultStyle(), bronvermelding: 'apart-tabblad' })
    expect(metTabblad.sheets.map((s) => s.name)).toContain('Bronnen')

    const metVoetnoot = buildPlan('B', model, result, { ...defaultStyle(), bronvermelding: 'voetnoot' })
    expect(planText(metVoetnoot)).toContain('Bronnen —')

    const metOpmerking = buildPlan('B', model, result, { ...defaultStyle(), bronvermelding: 'celopmerking' })
    expect(allCells(metOpmerking).some((c) => c.comment?.startsWith('Bron:'))).toBe(true)

    const zonder = buildPlan('B', model, result, { ...defaultStyle(), bronvermelding: 'geen' })
    expect(zonder.meta.hasSources).toBe(false)
    expect(zonder.sheets.map((s) => s.name)).not.toContain('Bronnen')
  })

  it('zet de maanden in rijen of in kolommen', () => {
    const rijen = buildPlan('B', model, result, { ...defaultStyle(), tijdreeks: 'maanden-in-rijen' })
    const kolommen = buildPlan('B', model, result, { ...defaultStyle(), tijdreeks: 'maanden-in-kolommen' })
    const tabelRijen = rijen.sheets[0]!.blocks.find((b) => b.kind === 'table' && b.id === 'fluxen')
    const tabelKolommen = kolommen.sheets[0]!.blocks.find((b) => b.kind === 'table' && b.id === 'fluxen')
    if (tabelRijen?.kind !== 'table' || tabelKolommen?.kind !== 'table') throw new Error('tabel ontbreekt')
    expect(tabelRijen.rows.length).toBeGreaterThan(tabelKolommen.rows.length)
    expect(tabelKolommen.header!.length).toBeGreaterThan(tabelRijen.header!.length)
  })

  it('gebruikt symbolen of volle namen volgens de as', () => {
    const symbool = buildPlan('B', model, result, { ...defaultStyle(), labels: 'symbool' })
    const volluit = buildPlan('B', model, result, { ...defaultStyle(), labels: 'volluit' })
    expect(planText(volluit)).toContain('uitmaling naar de boezem')
    expect(planText(symbool)).toContain('Q_uit')
  })

  it('laat formules weg als de as dat zegt', () => {
    const zonder = buildPlan('B', model, result, { ...defaultStyle(), formules: 'waarden' })
    const metFormules = buildPlan('B', model, result, { ...defaultStyle(), formules: 'formules' })
    expect(allCells(zonder).some((c) => c.formula)).toBe(false)
    expect(allCells(metFormules).some((c) => c.formula)).toBe(true)
    expect(zonder.meta.hasFormulas).toBe(false)
  })

  it('geeft twee seeds een wezenlijk andere opmaak bij hoge variatie', () => {
    const een = pickStyle(createRng('seed-een'), 'hoog')
    const twee = pickStyle(createRng('seed-twee'), 'hoog')
    const verschillen = Object.keys(een).filter(
      (as) => een[as as keyof StyleChoices] !== twee[as as keyof StyleChoices],
    )
    expect(verschillen.length).toBeGreaterThan(1)
  })

  it('houdt lage variatie rustig', () => {
    for (const seed of ['a', 'b', 'c', 'd']) {
      const style = pickStyle(createRng(seed), 'laag')
      expect(style.thema).toBe('zakelijk')
      expect(style.tijdreeks).toBe('maanden-in-rijen')
      expect(style.bronvermelding).toBe('kolom')
    }
  })

  it('loot reproduceerbaar', () => {
    expect(pickStyle(createRng('zelfde'), 'hoog')).toEqual(pickStyle(createRng('zelfde'), 'hoog'))
  })
})

describe('de assert op opmaak en fout', () => {
  it('dwingt formules af voor fouten die in een formule zitten', () => {
    for (const code of ['NAV-01', 'NAV-04', 'NAV-06']) {
      expect(constrainStyle({ ...defaultStyle(), formules: 'waarden' }, code).formules).toBe('formules')
    }
  })

  it('slaat aan als de eenheden ontbreken zonder dat NAV-02 gekozen is', () => {
    const plan = buildPlan('B', model, result, defaultStyle())
    const kapot: WorkbookPlan = { ...plan, meta: { ...plan.meta, hasUnits: false } }
    expect(() => assertErrorVisible(kapot, 'STR-01', 'B')).toThrow(StyleAssertionError)
  })

  it('slaat aan als NAV-02 gekozen is maar de eenheden er nog staan', () => {
    const plan = buildPlan('B', model, result, defaultStyle())
    expect(() => assertErrorVisible(plan, 'NAV-02', 'B')).toThrow(StyleAssertionError)
  })

  it('laat een gewone variant door', () => {
    const plan = buildPlan('B', model, result, defaultStyle())
    expect(() => assertErrorVisible(plan, 'EEN-02', 'B')).not.toThrow()
  })
})

describe('opmaak en fout samen', () => {
  const codes = errorsForContext('stad-wijk').map((e) => e.code)

  it.each(codes)('rendert %s in elke opmaakvariant zonder te klappen', async (code) => {
    const variant = buildVariant('stad-wijk', 'opmaak-fout', code)
    for (const style of styleVarianten().slice(0, 8)) {
      const plan = buildPlan('B', variant.model, variant.result, constrainStyle(style, code))
      expect(() => assertErrorVisible(plan, code, 'B')).not.toThrow()
      const rendered = await renderWorkbook(plan, variant.model, variant.result, style)
      expect(rendered.buffer.length).toBeGreaterThan(4000)
    }
  })
})

/** Alle getallen die uit het model komen; de jaartallen bij de bronnen niet. */
function getallen(plan: WorkbookPlan): number[] {
  return allTables(plan)
    .filter((table) => table.id !== 'bronnen')
    .flatMap((table) => [...(table.header ?? []), ...table.rows.flat()])
    .map((cell) => cell.shownValue ?? cell.value)
    .filter((value): value is number => typeof value === 'number')
    .map((value) => Math.round(value * 1000) / 1000)
    .sort((a, b) => a - b)
}

describe('elke foutcode in elke toegestane layout', () => {
  const contexten = contextIds()

  it.each(
    contexten.flatMap((context) =>
      errorsForContext(context).flatMap((def) =>
        (def.layouts ?? LAYOUTS).map((layout) => [context, def.code, layout] as const),
      ),
    ),
  )('%s / %s / layout %s rendert zonder te klappen', async (context, code, layout) => {
    const variant = buildVariant(context, `layout-${code}`, code)
    const style = constrainStyle(pickStyle(createRng(`${code}:${layout}`), 'hoog', code), code)
    const plan = buildPlan(layout, variant.model, variant.result, style)

    expect(() => assertErrorVisible(plan, code, layout)).not.toThrow()

    const rendered = await renderWorkbook(plan, variant.model, variant.result, style)
    expect(rendered.buffer.length).toBeGreaterThan(4000)
    expect([rendered.buffer[0], rendered.buffer[1]]).toEqual([0x50, 0x4b])
  })
})
