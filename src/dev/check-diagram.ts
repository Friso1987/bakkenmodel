/** Telt hoeveel labels in het diagram over elkaar of over een blokje vallen. */
import { contextIds } from '../catalog/contexts/index'
import { buildVariant, errorsForContext } from '../errors/index'
import { buildDiagram } from '../render/diagram'
import { defaultStyle, THEMES, type LabelStyle, type ThemeId } from '../style/index'

type Vak = { x: number; y: number; w: number; h: number }

const overlap = (a: Vak, b: Vak): number => {
  const dx = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  const dy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  return dx > 0 && dy > 0 ? dx * dy : 0
}

let totaal = 0
let mis = 0

for (const context of contextIds()) {
  const codes = errorsForContext(context)
    .filter((def) => (def.layouts ?? ['A', 'B', 'C']).includes('A'))
    .map((def) => def.code)

  for (const thema of Object.keys(THEMES) as ThemeId[]) {
  for (const labels of ['volluit', 'symbool', 'beide'] as LabelStyle[]) {
    for (const code of codes) {
      for (const voorvoegsel of ['diagram', 'overlap', 'kijk', 'a', 'b']) {
      const seed = `${voorvoegsel}-${code}`
      const variant = buildVariant(context, seed, code)
      const diagram = buildDiagram(variant.model, variant.result, { ...defaultStyle(), labels, thema })

      const blokjes: Vak[] = []
      const labelvakken: Vak[] = []
      for (const shape of diagram.shapes) {
        if (shape.kind !== 'rect') continue
        const vak = { x: shape.x, y: shape.y, w: shape.w, h: shape.h }
        if (shape.strokeWidth > 0) blokjes.push(vak)
        else labelvakken.push(vak)
      }

      let opElkaar = 0
      let opBlokje = 0
      for (let i = 0; i < labelvakken.length; i++) {
        for (let j = i + 1; j < labelvakken.length; j++) if (overlap(labelvakken[i]!, labelvakken[j]!) > 0) opElkaar++
        for (const blok of blokjes) if (overlap(labelvakken[i]!, blok) > 0) opBlokje++
      }
      const buiten = labelvakken.filter((v) => v.x < 0 || v.y < 0 || v.x + v.w > diagram.width || v.y + v.h > diagram.height).length

      totaal += 1
      if (opElkaar + opBlokje + buiten > 0) {
        mis += 1
        console.log(
          `PROBLEEM ${context.padEnd(13)} ${code.padEnd(7)} thema=${thema.padEnd(10)} labels=${labels.padEnd(8)} ${diagram.width}x${diagram.height}  ` +
            `labels=${String(labelvakken.length).padStart(2)}  op elkaar=${opElkaar}  op blokje=${opBlokje}  buiten=${buiten}`,
        )
      }
      }
    }
  }
  }
}

console.log(`${totaal} diagrammen gecontroleerd, ${mis} met overlappende labels`)
