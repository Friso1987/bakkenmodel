// Controleert elk gegenereerd bestand: geldige zip, leesbare werkmap, en elk
// blad-xml goed gevormd. Draai eerst `npm run batch`.
import { readdirSync, readFileSync } from 'node:fs'
import ExcelJS from 'exceljs'
import JSZip from 'jszip'

const dir = process.argv[2] ?? 'out/batch'
let bestanden = 0
let formules = 0
let problemen = 0

for (const map of ['studenten', 'docent/correcte-modellen']) {
  for (const naam of readdirSync(`${dir}/${map}`)) {
    if (!naam.endsWith('.xlsx')) continue
    const bytes = readFileSync(`${dir}/${map}/${naam}`)
    bestanden++

    const zip = await JSZip.loadAsync(bytes)
    const nodig = ['[Content_Types].xml', 'xl/workbook.xml', '_rels/.rels']
    for (const deel of nodig) {
      if (!zip.file(deel)) { console.log(`  ONTBREEKT ${deel} in ${naam}`); problemen++ }
    }
    for (const pad of Object.keys(zip.files)) {
      if (!pad.endsWith('.xml') && !pad.endsWith('.rels')) continue
      const tekst = await zip.file(pad).async('string')
      if (!tekst.startsWith('<?xml')) { console.log(`  GEEN XML-KOP ${pad} in ${naam}`); problemen++ }
      const open = (tekst.match(/</g) ?? []).length
      const dicht = (tekst.match(/>/g) ?? []).length
      if (open !== dicht) { console.log(`  SCHEVE TAGS ${pad} in ${naam}`); problemen++ }
    }

    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(bytes)
    if (wb.worksheets.length === 0) { console.log(`  GEEN BLADEN in ${naam}`); problemen++ }
    for (const ws of wb.worksheets) {
      ws.eachRow((row) => {
        row.eachCell((cell) => {
          const v = cell.value
          if (v && typeof v === 'object' && 'formula' in v) {
            formules++
            const f = String(v.formula)
            if (f.includes('undefined') || f.includes('NaN') || f.includes('#REF')) {
              console.log(`  KAPOTTE FORMULE ${naam} ${ws.name}!${cell.address}: ${f}`)
              problemen++
            }
          }
        })
      })
    }
  }
}

console.log(`${bestanden} bestanden gecontroleerd, ${formules} formules, ${problemen} problemen`)
process.exit(problemen === 0 ? 0 : 1)
