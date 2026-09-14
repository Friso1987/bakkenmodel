import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import { buildModel } from '../src/catalog/contexts/index'
import { solve } from '../src/core/solve'
import { buildPlan } from '../src/layout/index'
import { allCells, planText, refKey } from '../src/layout/plan'
import { columnLetter, refsToFormula } from '../src/render/formula'
import { renderWorkbook } from '../src/render/workbook'
import { defaultStyle } from '../src/style/index'

async function render(seed = 'render-01') {
  const model = buildModel('stad-wijk', seed)
  const result = solve(model)
  const style = defaultStyle()
  const plan = buildPlan('B', model, result, style)
  const rendered = await renderWorkbook(plan, model, result, style)
  return { model, result, style, plan, rendered }
}

describe('de werkmap', () => {
  it('levert een geldig xlsx-bestand op', async () => {
    const { rendered } = await render()
    expect(rendered.buffer.length).toBeGreaterThan(5000)
    // PK-signatuur van een zip.
    expect([rendered.buffer[0], rendered.buffer[1]]).toEqual([0x50, 0x4b])

    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(rendered.buffer as unknown as ArrayBuffer)
    expect(workbook.worksheets.length).toBeGreaterThan(0)
  })

  it('geeft bij dezelfde seed twee keer exact hetzelfde bestand', async () => {
    const eerste = await render('zelfde-seed')
    const tweede = await render('zelfde-seed')
    expect(Buffer.from(tweede.rendered.buffer).equals(Buffer.from(eerste.rendered.buffer))).toBe(true)
  })

  it('blijft byte-identiek als er meerdere werkmappen door elkaar heen gemaakt worden', async () => {
    // ExcelJS zet zonder ingrijpen de klok in de zip-headers. Twee identieke
    // werkmappen die in een andere seconde geschreven worden, verschillen dan.
    const eerste = await render('gelijktijdig')
    const tegelijk = await Promise.all(Array.from({ length: 8 }, () => render('gelijktijdig')))
    for (const andere of tegelijk) {
      expect(Buffer.from(andere.rendered.buffer).equals(Buffer.from(eerste.rendered.buffer))).toBe(true)
    }
  })

  it('geeft bij een andere seed een ander bestand', async () => {
    const eerste = await render('seed-een')
    const tweede = await render('seed-twee')
    expect(Buffer.from(tweede.rendered.buffer).equals(Buffer.from(eerste.rendered.buffer))).toBe(false)
  })

  it('onthoudt waar elk modelelement terechtkwam', async () => {
    const { model, rendered } = await render()
    for (const assumption of model.assumptions) {
      expect(rendered.idToCell[assumption.id]).toMatch(/^[A-Za-z']/)
    }
    for (const flux of model.fluxes) {
      expect(rendered.idToCell[flux.id]).toBeDefined()
    }
    expect(rendered.addresses[refKey.main()]).toBeDefined()
  })

  it('schrijft echte formules die naar echte cellen verwijzen', async () => {
    const { rendered } = await render()
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(rendered.buffer as unknown as ArrayBuffer)
    const sheet = workbook.worksheets[0]!

    const formules: string[] = []
    sheet.eachRow((row) => {
      row.eachCell((cell) => {
        const value = cell.value
        if (value && typeof value === 'object' && 'formula' in value) formules.push(String(value.formula))
      })
    })
    expect(formules.length).toBeGreaterThan(50)
    // Elke verwijzing moet een cel zijn die ook echt bestaat.
    for (const formule of formules) {
      for (const ref of formule.match(/\b[A-Z]{1,2}[0-9]{1,4}\b/g) ?? []) {
        expect(sheet.getCell(ref).value).not.toBeNull()
      }
    }
  })

  it('laat de controleregel op nul uitkomen', async () => {
    const { result } = await render()
    expect(Math.abs(result.system.residual)).toBeLessThan(1)
  })

  it('zet de hoofduitkomst en de conclusie in het bestand', async () => {
    const { model, plan } = await render()
    const tekst = planText(plan)
    expect(tekst).toContain(model.conclusion.question)
    expect(tekst).toContain(model.mainOutcome.label)
  })

  it('geeft elke waardecel een eigen verwijzingssleutel', async () => {
    const { plan } = await render()
    const refs = allCells(plan)
      .map((cell) => cell.ref)
      .filter((ref): ref is string => ref !== undefined)
    expect(new Set(refs).size).toBe(refs.length)
  })
})

describe('formulehulp', () => {
  it('zet kolomnummers om naar letters', () => {
    expect(columnLetter(1)).toBe('A')
    expect(columnLetter(26)).toBe('Z')
    expect(columnLetter(27)).toBe('AA')
    expect(columnLetter(53)).toBe('BA')
  })

  it('maakt een SUM-bereik van drie of meer cellen onder elkaar', () => {
    const adressen: Record<string, { sheet: string; row: number; col: number }> = {
      a: { sheet: 'Blad', row: 1, col: 2 },
      b: { sheet: 'Blad', row: 2, col: 2 },
      c: { sheet: 'Blad', row: 3, col: 2 },
    }
    const formule = refsToFormula(
      [{ ref: 'a' }, { ref: 'b' }, { ref: 'c' }],
      (ref) => adressen[ref] ?? null,
      'Blad',
    )
    expect(formule).toBe('SUM(B1:B3)')
  })

  it('telt losse cellen gewoon op en trekt af waar dat moet', () => {
    const adressen: Record<string, { sheet: string; row: number; col: number }> = {
      a: { sheet: 'Blad', row: 1, col: 2 },
      b: { sheet: 'Ander', row: 9, col: 3 },
    }
    const formule = refsToFormula(
      [{ ref: 'a' }, { ref: 'b', sign: -1 }],
      (ref) => adressen[ref] ?? null,
      'Blad',
    )
    expect(formule).toBe('B1-Ander!C9')
  })

  it('geeft niets terug als een verwijzing niet bestaat', () => {
    expect(refsToFormula([{ ref: 'weg' }], () => null, 'Blad')).toBeNull()
  })
})
