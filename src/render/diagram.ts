/**
 * Het bakkendiagram: blokjes en pijlen. Vaste posities, geen layout-engine.
 *
 * De bakken staan naast elkaar in een rij. Wat het gebied in of uit gaat,
 * krijgt een blokje erboven of eronder. Elke pijl krijgt een eigen aanhechting
 * op de rand van het blokje, zodat er geen lijnen over elkaar heen vallen.
 */
import { formatNumber, unitLabel } from '../core/units'
import type { WaterBalanceModel } from '../core/model'
import type { SolveResult } from '../core/solve'
import { nameOf } from '../layout/common'
import { themeOf, type StyleChoices } from '../style/index'
import { fitText, toSvg, type Drawing, type Shape } from './shapes'

const BOX_W = 180
const BOX_H = 96
const GAP_X = 56
/** Vrije band tussen twee rijen; daar komen de pijllabels te staan. */
const BAND = 74
const EXTERN_H = 46
const MARGIN = 28
const TITLE_H = 34

type Node = { id: string; label: string; x: number; y: number; w: number; h: number; soort: 'bak' | 'extern' }

export type Diagram = Drawing & { svg: string; nodes: Node[] }

export function buildDiagram(
  model: WaterBalanceModel,
  result: SolveResult,
  style: StyleChoices,
  options: { showValues?: boolean } = {},
): Diagram {
  const theme = themeOf(style)
  const toonWaarden = options.showValues ?? true
  const shapes: Shape[] = []
  // NAV-02 haalt de eenheden overal weg, ook uit het diagram.
  const eenheid = (label: string): string => (model.presentation.hideUnits ? '' : ` ${label}`)

  const bakken = model.buckets
  const breedte = Math.max(
    bakken.length * BOX_W + (bakken.length - 1) * GAP_X + 2 * MARGIN,
    620,
  )

  const { boven: externBoven, onder: externOnder } = externalNodes(model, result)

  const rijBoven = TITLE_H + MARGIN
  const rijBakken = rijBoven + (externBoven.length > 0 ? EXTERN_H + BAND : 0)
  // De gang onder de bakken, waar pijlen van bak naar bak doorheen lopen.
  const gang = rijBakken + BOX_H + 30
  const rijOnder = rijBakken + BOX_H + BAND
  const hoogte = (externOnder.length > 0 ? rijOnder + EXTERN_H : gang + 32) + MARGIN

  const nodes: Node[] = []
  bakken.forEach((bak, i) => {
    nodes.push({
      id: bak.id,
      label: bak.label,
      x: MARGIN + i * (BOX_W + GAP_X),
      y: rijBakken,
      w: BOX_W,
      h: BOX_H,
      soort: 'bak',
    })
  })
  plaatsExtern(externBoven, rijBoven, breedte, nodes)
  plaatsExtern(externOnder, rijOnder, breedte, nodes)

  const nodeById = new Map(nodes.map((n) => [n.id, n]))

  // Titel.
  shapes.push({
    kind: 'text',
    x: MARGIN,
    y: 22,
    text: fitText(model.title, 15, breedte - 2 * MARGIN),
    size: 15,
    bold: true,
    anchor: 'start',
    fill: kleur(theme.titleText),
    font: theme.headingFont,
  })

  // Blokjes.
  for (const node of nodes) {
    const isBak = node.soort === 'bak'
    shapes.push({
      kind: 'rect',
      x: node.x,
      y: node.y,
      w: node.w,
      h: node.h,
      fill: isBak ? kleur(theme.accent) : '#ffffff',
      stroke: kleur(theme.headerFill),
      strokeWidth: isBak ? 2 : 1,
      radius: isBak ? 6 : 14,
    })
    shapes.push({
      kind: 'text',
      x: node.x + node.w / 2,
      y: node.y + 22,
      text: fitText(node.label, 12, node.w - 16),
      size: 12,
      bold: true,
      anchor: 'middle',
      fill: '#111111',
      font: theme.font,
    })

    if (isBak && toonWaarden) {
      const bak = model.buckets.find((b) => b.id === node.id)!
      const begin = result.storageStart[node.id]?.[0] ?? 0
      const eind = result.storageEnd[node.id]?.[result.labels.length - 1] ?? 0
      const capaciteit = result.capacity[node.id] ?? null
      const oppervlak = bak.areaParam ? model.assumptions.find((a) => a.id === bak.areaParam) : undefined

      let dy = 38
      if (oppervlak) {
        shapes.push(
          tekst(node, dy, `${formatNumber(oppervlak.value, oppervlak.decimals ?? 1)}${eenheid(unitLabel(oppervlak.unit))}`, theme.font),
        )
        dy += 15
      }
      shapes.push(tekst(node, dy, `begin ${formatNumber(begin, 0)}${eenheid('m³')}`, theme.font))
      shapes.push(tekst(node, dy + 15, `eind ${formatNumber(eind, 0)}${eenheid('m³')}`, theme.font))
      if (capaciteit !== null && dy + 30 <= BOX_H - 6) {
        shapes.push(tekst(node, dy + 30, `max ${formatNumber(capaciteit, 0)}${eenheid('m³')}`, theme.font))
      }
    }
  }

  // Pijlen, met een eigen aanhechtingspunt per zijde.
  const bakId = new Set(bakken.map((b) => b.id))
  const slots = new Map<string, { gebruikt: number; totaal: number }>()
  for (const flux of model.fluxes) {
    for (const kant of [zijde(flux.from, flux.to, nodeById, bakId), zijde(flux.to, flux.from, nodeById, bakId)]) {
      if (!kant) continue
      const sleutel = `${kant.node.id}:${kant.zijde}`
      const huidig = slots.get(sleutel) ?? { gebruikt: 0, totaal: 0 }
      slots.set(sleutel, { ...huidig, totaal: huidig.totaal + 1 })
    }
  }

  model.fluxes.forEach((flux, index) => {
    const vanKant = zijde(flux.from, flux.to, nodeById, bakId)
    const naarKant = zijde(flux.to, flux.from, nodeById, bakId)
    if (!vanKant || !naarKant) return

    const start = ankerpunt(vanKant, slots)
    const eind = ankerpunt(naarKant, slots)

    // Twee bakken staan naast elkaar; een rechte lijn zou dwars door de bak
    // ertussen lopen. Die pijlen gaan daarom onder de rij langs.
    const tussenBakken = vanKant.node.soort === 'bak' && naarKant.node.soort === 'bak'
    const punten: Array<[number, number]> = tussenBakken
      ? [
          [start.x, start.y],
          [start.x, gang + (index % 3) * 8],
          [eind.x, gang + (index % 3) * 8],
          [eind.x, eind.y],
        ]
      : [
          [start.x, start.y],
          [eind.x, eind.y],
        ]

    shapes.push({
      kind: 'polyline',
      points: punten,
      stroke: kleur(theme.headerFill),
      strokeWidth: 1.6,
    })
    const voorlaatste = punten[punten.length - 2]!
    const laatste = punten[punten.length - 1]!
    shapes.push(pijlpunt({ x: voorlaatste[0], y: voorlaatste[1] }, { x: laatste[0], y: laatste[1] }, kleur(theme.headerFill)))

    const label = nameOf(style, flux.label, flux.symbol)
    const waarde = toonWaarden
      ? `${formatNumber(result.totals[flux.id] ?? 0, 0)}${eenheid(unitLabel(totaalEenheid()))}`
      : ''

    const positie = tussenBakken
      ? { x: (start.x + eind.x) / 2, y: gang + (index % 3) * 8 - 14 }
      : labelOpLijn(start, eind, index)

    const breedteLabel = Math.max(label.length, waarde.length) * 6.2 + 10
    shapes.push({
      kind: 'rect',
      x: positie.x - breedteLabel / 2,
      y: positie.y - (waarde ? 20 : 11),
      w: breedteLabel,
      h: waarde ? 30 : 17,
      fill: '#ffffffdd',
      stroke: '#ffffff00',
      strokeWidth: 0,
      radius: 3,
    })
    shapes.push({
      kind: 'text',
      x: positie.x,
      y: positie.y - (waarde ? 8 : 0),
      text: fitText(label, 10, 200),
      size: 10,
      bold: false,
      anchor: 'middle',
      fill: '#333333',
      font: theme.font,
    })
    if (waarde) {
      shapes.push({
        kind: 'text',
        x: positie.x,
        y: positie.y + 5,
        text: waarde,
        size: 10,
        bold: true,
        anchor: 'middle',
        fill: '#111111',
        font: theme.font,
      })
    }
  })

  const drawing: Drawing = { width: breedte, height: hoogte, background: '#ffffff', shapes }
  return { ...drawing, svg: toSvg(drawing), nodes }
}

/** Label ergens op een rechte pijl, met een beetje spreiding zodat ze niet stapelen. */
function labelOpLijn(
  start: { x: number; y: number },
  eind: { x: number; y: number },
  index: number,
): { x: number; y: number } {
  const fractie = 0.36 + (index % 3) * 0.13
  return { x: start.x + (eind.x - start.x) * fractie, y: start.y + (eind.y - start.y) * fractie }
}

function tekst(node: Node, dy: number, text: string, font: string): Shape {
  return {
    kind: 'text',
    x: node.x + node.w / 2,
    y: node.y + dy,
    text,
    size: 10,
    bold: false,
    anchor: 'middle',
    fill: '#333333',
    font,
  }
}

/**
 * De grootste leverancier komt bovenaan te staan, want dat is de bron waar het
 * water vandaan komt. Al het andere komt eronder: kwel van onderen, een boezem
 * waar op geloosd wordt. Zo kruisen de pijlen elkaar niet.
 */
function externalNodes(
  model: WaterBalanceModel,
  result: SolveResult,
): { boven: Array<{ id: string; label: string }>; onder: Array<{ id: string; label: string }> } {
  const gezien = new Map<string, { id: string; label: string; aanvoer: number }>()
  for (const flux of model.fluxes) {
    for (const node of [flux.from, flux.to]) {
      if (node.kind !== 'extern') continue
      const bestaand = gezien.get(node.id) ?? { id: node.id, label: node.label, aanvoer: 0 }
      const levert = flux.from.kind === 'extern' && flux.from.id === node.id
      gezien.set(node.id, {
        ...bestaand,
        aanvoer: bestaand.aanvoer + (levert ? Math.abs(result.totals[flux.id] ?? 0) : 0),
      })
    }
  }
  const alles = [...gezien.values()]
  const grootste = alles.reduce<(typeof alles)[number] | null>(
    (beste, node) => (node.aanvoer > (beste?.aanvoer ?? 0) ? node : beste),
    null,
  )
  return {
    boven: alles.filter((n) => n.id === grootste?.id).map(({ id, label }) => ({ id, label })),
    onder: alles.filter((n) => n.id !== grootste?.id).map(({ id, label }) => ({ id, label })),
  }
}

function plaatsExtern(
  items: Array<{ id: string; label: string }>,
  y: number,
  breedte: number,
  nodes: Node[],
): void {
  if (items.length === 0) return
  const vak = (breedte - 2 * MARGIN) / items.length
  items.forEach((item, i) => {
    const w = Math.min(BOX_W, vak - 20)
    nodes.push({
      id: item.id,
      label: item.label,
      x: MARGIN + i * vak + (vak - w) / 2,
      y,
      w,
      h: EXTERN_H,
      soort: 'extern',
    })
  })
}

type Kant = { node: Node; zijde: 'boven' | 'onder' | 'links' | 'rechts' }

function zijde(
  eigen: WaterBalanceModel['fluxes'][number]['from'],
  ander: WaterBalanceModel['fluxes'][number]['to'],
  nodes: Map<string, Node>,
  bakId: Set<string>,
): Kant | null {
  const node = nodes.get(eigen.id)
  const tegenover = nodes.get(ander.id)
  if (!node || !tegenover) return null

  // Van bak naar bak loopt de pijl onder de rij langs, dus die hecht onderaan aan.
  if (bakId.has(node.id) && bakId.has(tegenover.id)) return { node, zijde: 'onder' }

  const dy = tegenover.y + tegenover.h / 2 - (node.y + node.h / 2)
  return { node, zijde: dy > 0 ? 'onder' : 'boven' }
}

function ankerpunt(kant: Kant, slots: Map<string, { gebruikt: number; totaal: number }>): { x: number; y: number } {
  const sleutel = `${kant.node.id}:${kant.zijde}`
  const slot = slots.get(sleutel) ?? { gebruikt: 0, totaal: 1 }
  const positie = (slot.gebruikt + 1) / (slot.totaal + 1)
  slots.set(sleutel, { ...slot, gebruikt: slot.gebruikt + 1 })

  const { x, y, w, h } = kant.node
  switch (kant.zijde) {
    case 'boven':
      return { x: x + w * positie, y }
    case 'onder':
      return { x: x + w * positie, y: y + h }
    case 'links':
      return { x, y: y + h * positie }
    case 'rechts':
      return { x: x + w, y: y + h * positie }
  }
}

function pijlpunt(start: { x: number; y: number }, eind: { x: number; y: number }, kleurcode: string): Shape {
  const dx = eind.x - start.x
  const dy = eind.y - start.y
  const lengte = Math.hypot(dx, dy) || 1
  const ux = dx / lengte
  const uy = dy / lengte
  const grootte = 9
  const basisX = eind.x - ux * grootte
  const basisY = eind.y - uy * grootte
  return {
    kind: 'polygon',
    points: [
      [eind.x, eind.y],
      [basisX - uy * grootte * 0.45, basisY + ux * grootte * 0.45],
      [basisX + uy * grootte * 0.45, basisY - ux * grootte * 0.45],
    ],
    fill: kleurcode,
  }
}

/** Over de hele periode opgeteld is een maandvolume gewoon een volume. */
function totaalEenheid(): 'm3' {
  return 'm3'
}

/** ARGB van ExcelJS naar een kleur die SVG begrijpt. */
export function kleur(argb: string): string {
  const hex = argb.length === 8 ? argb.slice(2) : argb
  return `#${hex.toLowerCase()}`
}
