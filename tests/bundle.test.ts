import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { buildBundleBytes, generationJson } from '../src/bundle'
import { defaultSettings, generateAll, type GenerateSettings } from '../src/generate'
import { keyMarkdown, keyRows } from '../src/key'

async function partij(overrides: Partial<GenerateSettings> = {}) {
  const settings: GenerateSettings = {
    ...defaultSettings('bundel-01'),
    total: 6,
    nulShare: 0.34,
    layouts: 'gemengd',
    ...overrides,
  }
  const { variants, warnings } = await generateAll(settings)
  return { settings, variants, warnings }
}

describe('de zip', () => {
  it('heeft de mappenstructuur uit de specificatie', async () => {
    const { settings, variants, warnings } = await partij()
    const bytes = await buildBundleBytes(variants, settings, warnings)
    const zip = await JSZip.loadAsync(bytes)
    const namen = Object.keys(zip.files).filter((naam) => !zip.files[naam]!.dir)

    expect(namen).toContain('docent/sleutel.md')
    expect(namen).toContain('docent/sleutel.xlsx')
    expect(namen).toContain('generatie.json')
    expect(namen.filter((n) => n.startsWith('studenten/')).length).toBe(variants.length)
    expect(namen.filter((n) => n.startsWith('docent/correcte-modellen/')).length).toBe(variants.length)

    for (const variant of variants) {
      expect(namen).toContain(`studenten/${variant.fileName}`)
    }
  })

  it('verraadt in de studentenmap niets over de fout', async () => {
    const { settings, variants, warnings } = await partij()
    const bytes = await buildBundleBytes(variants, settings, warnings)
    const zip = await JSZip.loadAsync(bytes)

    for (const variant of variants) {
      expect(variant.fileName).not.toContain(variant.injected.code)
      const bestand = await zip.file(`studenten/${variant.fileName}`)!.async('string')
      for (const code of ['EEN-0', 'STR-0', 'NAV-0', 'SCH-0', 'INT-0', 'NUL-00']) {
        expect(bestand.includes(code), `${variant.fileName} noemt ${code}`).toBe(false)
      }
      expect(bestand.toLowerCase()).not.toContain('foutcode')
      expect(bestand.toLowerCase()).not.toContain('sleutel')
    }
  })

  it('levert bij dezelfde seed exact dezelfde zip, ook bij gelijktijdig werk', async () => {
    // Zowel ExcelJS als JSZip zetten zonder ingrijpen de klok in hun headers.
    // Twee partijen die een seconde uit elkaar lopen, moeten toch gelijk zijn.
    const een = await partij()
    const a = await buildBundleBytes(een.variants, een.settings, een.warnings)

    const tegelijk = await Promise.all([partij(), partij(), partij()])
    for (const twee of tegelijk) {
      const b = await buildBundleBytes(twee.variants, twee.settings, twee.warnings)
      expect(Buffer.from(b).equals(Buffer.from(a))).toBe(true)
    }
  })

  it('maakt een sleutel.xlsx die te filteren is', async () => {
    const { settings, variants, warnings } = await partij()
    const bytes = await buildBundleBytes(variants, settings, warnings)
    const zip = await JSZip.loadAsync(bytes)
    const sleutel = await zip.file('docent/sleutel.xlsx')!.async('uint8array')

    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(sleutel as unknown as ArrayBuffer)
    const sheet = workbook.getWorksheet('Sleutel')!
    expect(sheet.autoFilter).toBeTruthy()
    expect(sheet.getCell(2, 1).value).toBe('#')
    expect(sheet.actualRowCount).toBe(variants.length + 2)
  })

  it('legt in generatie.json alles vast om het te herhalen', async () => {
    const { settings, variants, warnings } = await partij()
    const json = JSON.parse(generationJson(variants, settings, warnings))
    expect(json.settings.seed).toBe(settings.seed)
    expect(json.settings.total).toBe(settings.total)
    expect(json.varianten).toHaveLength(variants.length)
    expect(json.varianten[0].bestand).toBe(variants[0]!.fileName)
  })
})

describe('de sleutel', () => {
  it('noemt per variant alles wat de docent nodig heeft', async () => {
    const { variants } = await partij()
    for (const rij of keyRows(variants)) {
      expect(rij.bestand).toMatch(/^WAMTEK_.*\.xlsx$/)
      expect(rij.seed.length).toBeGreaterThan(3)
      expect(rij.context.length).toBeGreaterThan(3)
      expect(rij.layout).toMatch(/^[ABC] \(/)
      expect(rij.code).toMatch(/^[A-Z]{3}-\d{2}$/)
      expect(rij.cel.length).toBeGreaterThan(3)
      expect(rij.wat.length).toBeGreaterThan(20)
      expect(rij.waarom.length).toBeGreaterThan(20)
      expect(rij.gevolg.length).toBeGreaterThan(20)
      expect(rij.impact.length).toBeGreaterThan(3)
      expect(rij.ankers.length).toBeGreaterThanOrEqual(3)
    }
  })

  it('begint elke zin met een hoofdletter', async () => {
    const { variants } = await partij()
    for (const rij of keyRows(variants)) {
      for (const tekst of [rij.wat, rij.waarom, rij.gevolg, ...rij.ankers]) {
        expect(tekst[0]).toBe(tekst[0]!.toUpperCase())
      }
    }
  })

  it('schrijft markdown met een regel per variant', async () => {
    const { settings, variants, warnings } = await partij()
    const markdown = keyMarkdown(variants, settings, warnings)
    expect(markdown).toContain('# Docentensleutel bakkenmodellen')
    expect(markdown).toContain(settings.seed)
    for (const variant of variants) expect(markdown).toContain(variant.fileName)
    expect(markdown.split('### ').length).toBe(variants.length + 1)
  })
})
