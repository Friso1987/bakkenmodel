/**
 * Tekenprimitieven voor het diagram. Eén beschrijving, twee uitgangen: een SVG
 * voor de preview in de browser, en dezelfde vormen op een canvas voor de PNG
 * die in de werkmap komt. ExcelJS kan geen Excel-vormen schrijven, dus een
 * afbeelding is de route.
 */

export type Shape =
  | {
      kind: 'rect'
      x: number
      y: number
      w: number
      h: number
      fill: string
      stroke: string
      strokeWidth: number
      radius: number
    }
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number; stroke: string; strokeWidth: number; dashed?: boolean }
  | { kind: 'polyline'; points: Array<[number, number]>; stroke: string; strokeWidth: number }
  | { kind: 'polygon'; points: Array<[number, number]>; fill: string }
  | {
      kind: 'text'
      x: number
      y: number
      text: string
      size: number
      bold: boolean
      anchor: 'start' | 'middle' | 'end'
      fill: string
      font: string
    }

export type Drawing = {
  width: number
  height: number
  background: string
  shapes: Shape[]
}

export function toSvg(drawing: Drawing): string {
  const delen: string[] = []
  delen.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${drawing.width}" height="${drawing.height}" ` +
      `viewBox="0 0 ${drawing.width} ${drawing.height}">`,
  )
  delen.push(`<rect x="0" y="0" width="${drawing.width}" height="${drawing.height}" fill="${drawing.background}"/>`)

  for (const shape of drawing.shapes) {
    switch (shape.kind) {
      case 'rect':
        delen.push(
          `<rect x="${round(shape.x)}" y="${round(shape.y)}" width="${round(shape.w)}" height="${round(shape.h)}" ` +
            `rx="${shape.radius}" fill="${shape.fill}" stroke="${shape.stroke}" stroke-width="${shape.strokeWidth}"/>`,
        )
        break
      case 'line':
        delen.push(
          `<line x1="${round(shape.x1)}" y1="${round(shape.y1)}" x2="${round(shape.x2)}" y2="${round(shape.y2)}" ` +
            `stroke="${shape.stroke}" stroke-width="${shape.strokeWidth}"` +
            (shape.dashed ? ' stroke-dasharray="5 4"' : '') +
            '/>',
        )
        break
      case 'polyline':
        delen.push(
          `<polyline points="${shape.points.map(([x, y]) => `${round(x)},${round(y)}`).join(' ')}" ` +
            `fill="none" stroke="${shape.stroke}" stroke-width="${shape.strokeWidth}" ` +
            'stroke-linejoin="round" stroke-linecap="round"/>',
        )
        break
      case 'polygon':
        delen.push(
          `<polygon points="${shape.points.map(([x, y]) => `${round(x)},${round(y)}`).join(' ')}" fill="${shape.fill}"/>`,
        )
        break
      case 'text':
        delen.push(
          `<text x="${round(shape.x)}" y="${round(shape.y)}" font-family="${escapeXml(shape.font)}" ` +
            `font-size="${shape.size}" font-weight="${shape.bold ? 'bold' : 'normal'}" ` +
            `text-anchor="${shape.anchor}" fill="${shape.fill}">${escapeXml(shape.text)}</text>`,
        )
        break
    }
  }

  delen.push('</svg>')
  return delen.join('')
}

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * Gemiddelde tekenbreedte per lettertype, als deel van de tekengrootte.
 *
 * De plaatsing van de labels wordt hier berekend en niet in de browser: de
 * generator moet op elke machine hetzelfde bestand opleveren, en een canvas
 * meet per geïnstalleerd lettertype anders. Daarom een tabel, en bewust aan de
 * ruime kant. Een schatting die te klein is, laat twee labels over elkaar heen
 * vallen; een schatting die te ruim is, kost alleen wat witruimte.
 *
 * Verdana is fors breder dan Calibri; met één getal voor alles zou dat mis gaan.
 */
const TEKENBREEDTE: Array<[RegExp, number]> = [
  [/verdana/i, 0.66],
  [/consolas|mono/i, 0.58],
  [/times|serif/i, 0.53],
  [/calibri/i, 0.55],
]
const TEKENBREEDTE_STANDAARD = 0.62

/** Schatting van de tekstbreedte, ruim genoeg om labels te laten passen. */
export function textWidth(text: string, size: number, font = '', bold = false): number {
  const factor = TEKENBREEDTE.find(([patroon]) => patroon.test(font))?.[1] ?? TEKENBREEDTE_STANDAARD
  return text.length * size * factor * (bold ? 1.06 : 1)
}

/** Kort een label af zodat het binnen een breedte past. */
export function fitText(text: string, size: number, maxWidth: number): string {
  if (textWidth(text, size) <= maxWidth) return text
  const tekens = Math.max(3, Math.floor(maxWidth / (size * 0.55)) - 1)
  return `${text.slice(0, tekens)}…`
}
