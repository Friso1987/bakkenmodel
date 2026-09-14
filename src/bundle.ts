/**
 * De zip die de docent downloadt.
 *
 *   WAMTEK_bakkenmodellen_<seed>.zip
 *     studenten/            de bestanden voor de studenten, zonder enige hint
 *     docent/sleutel.md     leesbare sleutel
 *     docent/sleutel.xlsx   dezelfde inhoud, filterbaar
 *     docent/correcte-modellen/
 *     generatie.json        alle instellingen plus seed, voor exacte reproductie
 */
import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import type { GeneratedVariant, GenerateSettings } from './generate'
import { keyMarkdown, keyTableRows } from './key'
import { normalizeZip, VASTE_DATUM } from './render/zip'
import { BUILD_ID } from './version'

/**
 * Vaste datum en geen losse mapingangen: JSZip zet in een impliciet aangemaakte
 * map de klok van dat moment, en dan is de zip niet meer reproduceerbaar.
 */
const ZIP_OPTIES = { date: VASTE_DATUM, createFolders: false } as const

export function bundleName(seed: string): string {
  return `WAMTEK_bakkenmodellen_${seed}.zip`
}

export async function buildBundle(
  variants: GeneratedVariant[],
  settings: GenerateSettings,
  warnings: string[] = [],
): Promise<Blob> {
  const zip = new JSZip()

  for (const variant of variants) {
    zip.file(`studenten/${variant.fileName}`, variant.rendered.buffer, ZIP_OPTIES)
    zip.file(`docent/correcte-modellen/${variant.motherFileName}`, variant.motherRendered.buffer, ZIP_OPTIES)
  }

  zip.file('docent/sleutel.md', keyMarkdown(variants, settings, warnings), ZIP_OPTIES)
  zip.file('docent/sleutel.xlsx', await keyWorkbook(variants, settings), ZIP_OPTIES)
  zip.file('generatie.json', generationJson(variants, settings, warnings), ZIP_OPTIES)

  return zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })
}

/** Dezelfde bundel als bytes, voor de tests en de opdrachtregel. */
export async function buildBundleBytes(
  variants: GeneratedVariant[],
  settings: GenerateSettings,
  warnings: string[] = [],
): Promise<Uint8Array> {
  const zip = new JSZip()
  for (const variant of variants) {
    zip.file(`studenten/${variant.fileName}`, variant.rendered.buffer, ZIP_OPTIES)
    zip.file(`docent/correcte-modellen/${variant.motherFileName}`, variant.motherRendered.buffer, ZIP_OPTIES)
  }
  zip.file('docent/sleutel.md', keyMarkdown(variants, settings, warnings), ZIP_OPTIES)
  zip.file('docent/sleutel.xlsx', await keyWorkbook(variants, settings), ZIP_OPTIES)
  zip.file('generatie.json', generationJson(variants, settings, warnings), ZIP_OPTIES)
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } })
}

export function generationJson(
  variants: GeneratedVariant[],
  settings: GenerateSettings,
  warnings: string[],
): string {
  return JSON.stringify(
    {
      versie: 1,
      generator: BUILD_ID,
      toelichting:
        'Met deze instellingen en deze seed levert de generator exact dezelfde bestanden op. ' +
        'Plak de seed terug in het invoerveld en zet de instellingen hieronder over.',
      settings,
      waarschuwingen: warnings,
      varianten: variants.map((variant) => ({
        bestand: variant.fileName,
        seed: variant.seed,
        context: variant.context,
        layout: variant.layout,
        foutcode: variant.injected.code,
        laag: variant.injected.layer,
        impact: variant.injected.impact,
        celverwijzing: variant.cellRef,
      })),
    },
    null,
    2,
  )
}

const KOLOMMEN: Array<{ sleutel: string; kop: string; breedte: number }> = [
  { sleutel: 'nummer', kop: '#', breedte: 5 },
  { sleutel: 'bestand', kop: 'bestand', breedte: 38 },
  { sleutel: 'context', kop: 'context', breedte: 14 },
  { sleutel: 'layout', kop: 'layout', breedte: 14 },
  { sleutel: 'foutcode', kop: 'foutcode', breedte: 10 },
  { sleutel: 'laag', kop: 'laag', breedte: 26 },
  { sleutel: 'celverwijzing', kop: 'celverwijzing', breedte: 22 },
  { sleutel: 'impact', kop: 'impact', breedte: 28 },
  { sleutel: 'afwijking', kop: 'afwijking', breedte: 34 },
  { sleutel: 'wat', kop: 'wat er fout is', breedte: 60 },
  { sleutel: 'waarom', kop: 'waarom dat een fout is', breedte: 60 },
  { sleutel: 'gevolg', kop: 'gevolg voor het advies', breedte: 60 },
  { sleutel: 'anker1', kop: 'ankerantwoord 1', breedte: 50 },
  { sleutel: 'anker2', kop: 'ankerantwoord 2', breedte: 50 },
  { sleutel: 'anker3', kop: 'ankerantwoord 3', breedte: 50 },
  { sleutel: 'seed', kop: 'seed', breedte: 16 },
  { sleutel: 'opmaak', kop: 'opmaak', breedte: 60 },
]

export async function keyWorkbook(
  variants: GeneratedVariant[],
  settings: GenerateSettings,
): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Bakkenmodel-generator'
  workbook.lastModifiedBy = workbook.creator
  workbook.created = VASTE_DATUM
  workbook.modified = VASTE_DATUM

  const sheet = workbook.addWorksheet('Sleutel', { views: [{ state: 'frozen', ySplit: 2 }] })

  sheet.getCell(1, 1).value = `Docentensleutel — seed ${settings.seed}, ${variants.length} varianten`
  sheet.getCell(1, 1).font = { bold: true, size: 13, color: { argb: 'FF1F4E79' } }

  KOLOMMEN.forEach((kolom, index) => {
    const cell = sheet.getCell(2, index + 1)
    cell.value = kolom.kop
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } }
    cell.alignment = { vertical: 'bottom', wrapText: true }
    sheet.getColumn(index + 1).width = kolom.breedte
  })

  keyTableRows(variants).forEach((rij, rijIndex) => {
    KOLOMMEN.forEach((kolom, kolomIndex) => {
      const cell = sheet.getCell(rijIndex + 3, kolomIndex + 1)
      cell.value = rij[kolom.sleutel] ?? ''
      cell.alignment = { vertical: 'top', wrapText: kolom.breedte > 30 }
    })
  })

  sheet.autoFilter = {
    from: { row: 2, column: 1 },
    to: { row: variants.length + 2, column: KOLOMMEN.length },
  }

  const buffer = await workbook.xlsx.writeBuffer()
  return normalizeZip(new Uint8Array(buffer as ArrayBuffer))
}
