/**
 * Het bakkendiagram: blokjes en pijlen. Vaste posities per rij, geen
 * layout-engine.
 *
 * De bakken staan naast elkaar in een rij. Wat het gebied in of uit gaat,
 * krijgt een blokje erboven of eronder. Pijlen van bak naar bak lopen onder de
 * rij langs, elk over een eigen baan, zodat ze niet door een blokje heen gaan.
 *
 * Het lastigste is niet het tekenen maar het plaatsen van de labels: in een
 * stedelijke balans lopen er zes pijlen door dezelfde band. Elk label krijgt
 * daarom een reeks mogelijke plekken langs zijn eigen pijl, en er wordt de
 * eerste gekozen die nergens overheen valt. Alle lijnen worden bovendien
 * getekend voordat het eerste label erbij komt, zodat er nooit een pijl dwars
 * door een getal loopt.
 */
import { formatNumber, unitLabel } from '../core/units'
import type { WaterBalanceModel } from '../core/model'
import type { SolveResult } from '../core/solve'
import { nameOf } from '../layout/common'
import { themeOf, type StyleChoices } from '../style/index'
import { textWidth, toSvg, type Drawing, type Shape } from './shapes'

const BOX_W = 180
const BOX_H = 96
const GAP_X_MIN = 56
/** Streefbreedte van het doek; de bakken worden daarover verdeeld. */
const DOEK_W = 880
/** Vrije band tussen twee rijen; daar komen de pijllabels te staan. */
const BAND = 126
const EXTERN_H = 46
const MARGIN = 28
const TITLE_H = 34
/** Afstand tussen twee banen in de gang onder de bakken. */
const BAAN = 26
const REGEL = 13
const LABEL_SIZE = 10
/** Breedte waarboven een naam over twee regels wordt gezet. */
const LABEL_MAX_W = 132

type Node = { id: string; label: string; x: number; y: number; w: number; h: number; soort: 'bak' | 'extern' }
type Punt = { x: number; y: number }
type Vak = { x: number; y: number; w: number; h: number }

export type Diagram = Drawing & { svg: string; nodes: Node[] }

export function buildDiagram(
  model: WaterBalanceModel,
  result: SolveResult,
  style: StyleChoices,
  options: { showValues?: boolean } = {},
): Diagram {
  const theme = themeOf(style)
  const toonWaarden = options.showValues ?? true
  // NAV-02 haalt de eenheden overal weg, ook uit het diagram.
  const eenheid = (label: string): string => (model.presentation.hideUnits ? '' : ` ${label}`)

  const bakken = model.buckets
  const { boven: externBoven, onder: externOnder } = externalNodes(model, result)

  // Pijlen die onder de rij langs moeten: van bak naar bak, en van of naar een
  // blokje in de onderste rij. Diagonalen door de gang lezen slecht; haakse
  // lijnen over een eigen baan lezen als een schema.
  const gangPaden = model.fluxes.filter(
    (f) =>
      (f.from.kind === 'bucket' && f.to.kind === 'bucket') ||
      (f.from.kind === 'bucket' && f.to.kind === 'extern' && externOnder.some((n) => n.id === f.to.id)) ||
      (f.to.kind === 'bucket' && f.from.kind === 'extern' && externOnder.some((n) => n.id === f.from.id)),
  )

  const breedte = Math.max(bakken.length * (BOX_W + GAP_X_MIN) - GAP_X_MIN + 2 * MARGIN, DOEK_W)
  // De bakken staan gelijkmatig over de breedte; hoe meer ruimte ertussen, hoe
  // meer plek er is voor de labels van de pijlen.
  const gapX =
    bakken.length > 1 ? (breedte - 2 * MARGIN - bakken.length * BOX_W) / (bakken.length - 1) : 0
  const rijBoven = TITLE_H + MARGIN
  const rijBakken = rijBoven + (externBoven.length > 0 ? EXTERN_H + BAND : 0)
  // De gang onder de bakken, met een eigen baan per pijl van bak naar bak.
  const gang = rijBakken + BOX_H + 46
  const gangHoogte = Math.max(0, gangPaden.length - 1) * BAAN
  const rijOnder = gang + gangHoogte + 52
  const hoogte = (externOnder.length > 0 ? rijOnder + EXTERN_H : rijOnder) + MARGIN

  const nodes: Node[] = []
  bakken.forEach((bak, i) => {
    nodes.push({
      id: bak.id,
      label: bak.label,
      x: MARGIN + i * (BOX_W + gapX),
      y: rijBakken,
      w: BOX_W,
      h: BOX_H,
      soort: 'bak',
    })
  })
  plaatsExtern(externBoven, rijBoven, breedte, nodes)
  plaatsExtern(externOnder, rijOnder, breedte, nodes)

  const nodeById = new Map(nodes.map((n) => [n.id, n]))
  const bakId = new Set(bakken.map((b) => b.id))

  // --- blokjes --------------------------------------------------------------

  const blokken: Shape[] = []
  blokken.push({
    kind: 'text',
    x: MARGIN,
    y: 22,
    text: model.title,
    size: 15,
    bold: true,
    anchor: 'start',
    fill: kleur(theme.titleText),
    font: theme.headingFont,
  })

  for (const node of nodes) {
    const isBak = node.soort === 'bak'
    blokken.push({
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
    blokken.push(bokstekst(node, 22, node.label, theme.font, 12, true))

    if (isBak && toonWaarden) {
      const bak = model.buckets.find((b) => b.id === node.id)!
      const begin = result.storageStart[node.id]?.[0] ?? 0
      const eind = result.storageEnd[node.id]?.[result.labels.length - 1] ?? 0
      const capaciteit = result.capacity[node.id] ?? null
      const oppervlak = bak.areaParam ? model.assumptions.find((a) => a.id === bak.areaParam) : undefined

      const regels: string[] = []
      if (oppervlak) {
        regels.push(`${formatNumber(oppervlak.value, oppervlak.decimals ?? 1)}${eenheid(unitLabel(oppervlak.unit))}`)
      }
      regels.push(`begin ${formatNumber(begin, 0)}${eenheid('m³')}`)
      regels.push(`eind ${formatNumber(eind, 0)}${eenheid('m³')}`)
      if (capaciteit !== null) regels.push(`max ${formatNumber(capaciteit, 0)}${eenheid('m³')}`)

      regels.forEach((regel, i) => {
        const dy = 40 + i * 15
        if (dy <= BOX_H - 6) blokken.push(bokstekst(node, dy, regel, theme.font, 10, false))
      })
    }
  }

  // --- pijlen ---------------------------------------------------------------

  // Volgorde van de aanhechtingen op elke rand: van links naar rechts, op de
  // plek van het blokje aan de andere kant van de pijl. Zo kruisen twee pijlen
  // die naar dezelfde bak lopen elkaar niet.
  const slots = new Map<string, string[]>()
  for (const flux of model.fluxes) {
    const kanten = [
      { kant: zijde(flux.from, flux.to, nodeById, bakId), tegenover: nodeById.get(flux.to.id) },
      { kant: zijde(flux.to, flux.from, nodeById, bakId), tegenover: nodeById.get(flux.from.id) },
    ]
    for (const { kant, tegenover } of kanten) {
      if (!kant || !tegenover) continue
      const sleutel = `${kant.node.id}:${kant.zijde}`
      const lijst = slots.get(sleutel) ?? []
      lijst.push(flux.id)
      slots.set(sleutel, lijst)
    }
  }
  const middenX = (id: string): number => {
    const node = nodeById.get(id)
    return node ? node.x + node.w / 2 : 0
  }
  for (const [sleutel, lijst] of slots) {
    const eigenId = sleutel.split(':')[0]!
    lijst.sort((a, b) => {
      const fluxA = model.fluxes.find((f) => f.id === a)!
      const fluxB = model.fluxes.find((f) => f.id === b)!
      const doel = (flux: typeof fluxA) => middenX(flux.from.id === eigenId ? flux.to.id : flux.from.id)
      return doel(fluxA) - doel(fluxB)
    })
  }

  const lijnen: Shape[] = []
  const teplaatsen: Array<{ tekst: string[]; waarde: string; route: Punt[]; baanY: number | null }> = []
  let baan = 0

  for (const flux of model.fluxes) {
    const vanKant = zijde(flux.from, flux.to, nodeById, bakId)
    const naarKant = zijde(flux.to, flux.from, nodeById, bakId)
    if (!vanKant || !naarKant) continue

    const start = ankerpunt(vanKant, flux.id, slots)
    const eind = ankerpunt(naarKant, flux.id, slots)

    const viaGang = gangPaden.some((f) => f.id === flux.id)
    const baanY = viaGang ? gang + baan * BAAN : null
    if (viaGang) baan += 1
    const punten: Punt[] =
      baanY === null
        ? [start, eind]
        : [start, { x: start.x, y: baanY }, { x: eind.x, y: baanY }, eind]

    lijnen.push({
      kind: 'polyline',
      points: punten.map((p) => [p.x, p.y] as [number, number]),
      stroke: kleur(theme.headerFill),
      strokeWidth: 1.6,
    })
    lijnen.push(pijlpunt(punten[punten.length - 2]!, punten[punten.length - 1]!, kleur(theme.headerFill)))

    teplaatsen.push({
      tekst: verdeelOverRegels(nameOf(style, flux.label, flux.symbol)),
      waarde: toonWaarden ? `${formatNumber(result.totals[flux.id] ?? 0, 0)}${eenheid('m³')}` : '',
      route: [start, eind],
      baanY,
    })
  }

  // --- labels ---------------------------------------------------------------

  const bezet: Vak[] = nodes.map((n) => ({ x: n.x, y: n.y, w: n.w, h: n.h }))
  // De titel staat er ook; daar mag geen label overheen.
  bezet.push({ x: MARGIN, y: 6, w: textWidth(model.title, 15), h: 22 })
  const labels: Shape[] = []

  for (const item of teplaatsen) {
    const regels = item.waarde ? [...item.tekst, item.waarde] : item.tekst
    const w = Math.max(...regels.map((r, i) => textWidth(r, LABEL_SIZE) * (i === regels.length - 1 && item.waarde ? 1.08 : 1))) + 10
    const h = regels.length * REGEL + 6
    const plek = kiesPlek(kandidatenVoor(item.route, item.baanY, w, h), w, h, bezet, breedte, hoogte)
    const vak: Vak = { x: plek.x - w / 2, y: plek.y - h / 2, w, h }
    bezet.push(vak)

    labels.push({
      kind: 'rect',
      x: vak.x,
      y: vak.y,
      w: vak.w,
      h: vak.h,
      fill: '#ffffffe6',
      stroke: '#ffffff00',
      strokeWidth: 0,
      radius: 3,
    })
    regels.forEach((regel, i) => {
      const isWaarde = item.waarde !== '' && i === regels.length - 1
      labels.push({
        kind: 'text',
        x: plek.x,
        y: vak.y + REGEL * (i + 1) - 1,
        text: regel,
        size: LABEL_SIZE,
        bold: isWaarde,
        anchor: 'middle',
        fill: isWaarde ? '#111111' : '#333333',
        font: theme.font,
      })
    })
  }

  const shapes = [...blokken, ...lijnen, ...labels]
  const drawing: Drawing = { width: breedte, height: hoogte, background: '#ffffff', shapes }
  return { ...drawing, svg: toSvg(drawing), nodes }
}

/**
 * Mogelijke plekken voor een label: eerst midden op de pijl, dan verder naar
 * de uiteinden, en van elke plek ook een variant links en rechts náást de lijn.
 * Twee pijlen die vlak langs elkaar lopen, zoals neerslag en verdamping bij
 * dezelfde bak, kunnen zo elk een eigen kant kiezen.
 */
function kandidatenVoor(route: Punt[], baanY: number | null, w: number, h: number): Punt[] {
  const [start, eind] = route as [Punt, Punt]
  const fracties = [0.5, 0.4, 0.6, 0.32, 0.68, 0.25, 0.75, 0.18, 0.82, 0.12, 0.88]

  if (baanY !== null) {
    // Langs de eigen baan in de gang: eerst erboven, dan eronder, en bij drukte
    // steeds een regel verder van de baan af.
    const stappen = Array.from({ length: 7 }, (_, i) => i * (h + 4))
    return stappen.flatMap((stap) =>
      fracties.flatMap((f) => {
        const x = start.x + (eind.x - start.x) * f
        return [
          { x, y: baanY - h / 2 - 4 - stap },
          { x, y: baanY + h / 2 + 4 + stap },
        ]
      }),
    )
  }

  const dx = eind.x - start.x
  const dy = eind.y - start.y
  const lengte = Math.hypot(dx, dy) || 1
  // Loodrecht op de pijl, zodat het label naast de lijn komt en niet erop.
  const nx = -dy / lengte
  const ny = dx / lengte
  // Eerst elke plek midden op de pijl, en pas als dat nergens past een plek
  // ernaast, in stappen verder van de lijn af. De eerste die vrij is wint, dus
  // een label komt nooit verder van zijn pijl te liggen dan nodig.
  const afstanden = [0, ...Array.from({ length: 10 }, (_, i) => w / 2 + 8 + i * (h + 4))]

  return afstanden.flatMap((opzij) =>
    fracties.flatMap((f) => {
      const x = start.x + dx * f
      const y = start.y + dy * f
      if (opzij === 0) return [{ x, y }]
      return [
        { x: x + nx * opzij, y: y + ny * opzij },
        { x: x - nx * opzij, y: y - ny * opzij },
      ]
    }),
  )
}

/**
 * De eerste plek waar het label nergens overheen valt. Lukt dat nergens, dan
 * die met de minste overlap; een label dat een stukje over een lijn valt is
 * nog altijd beter dan twee getallen bovenop elkaar.
 */
function kiesPlek(
  kandidaten: Punt[],
  w: number,
  h: number,
  bezet: Vak[],
  doekBreedte: number,
  doekHoogte: number,
): Punt {
  let beste = kandidaten[0]!
  let besteStraf = Number.POSITIVE_INFINITY

  for (const kandidaat of kandidaten) {
    const vak: Vak = { x: kandidaat.x - w / 2, y: kandidaat.y - h / 2, w, h }
    let straf = 0
    for (const ander of bezet) straf += overlapOppervlak(vak, ander)
    // Buiten het doek is geen optie; liever een beetje overlap dan een label
    // dat half wegvalt.
    const buiten =
      Math.max(0, -vak.x) +
      Math.max(0, -vak.y) +
      Math.max(0, vak.x + vak.w - doekBreedte) +
      Math.max(0, vak.y + vak.h - doekHoogte)
    straf += buiten * 1000

    if (straf === 0) return kandidaat
    if (straf < besteStraf) {
      besteStraf = straf
      beste = kandidaat
    }
  }
  return beste
}

function overlapOppervlak(a: Vak, b: Vak): number {
  const dx = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  const dy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  return dx > 0 && dy > 0 ? dx * dy : 0
}

/** Zet een lange naam over twee regels, op een spatie. */
export function verdeelOverRegels(tekst: string): string[] {
  if (textWidth(tekst, LABEL_SIZE) <= LABEL_MAX_W) return [tekst]

  const woorden = tekst.split(' ')
  if (woorden.length === 1) return [tekst]

  // Zoek de knip die de twee regels het meest gelijk maakt.
  let besteIndex = 1
  let besteVerschil = Number.POSITIVE_INFINITY
  for (let i = 1; i < woorden.length; i++) {
    const links = textWidth(woorden.slice(0, i).join(' '), LABEL_SIZE)
    const rechts = textWidth(woorden.slice(i).join(' '), LABEL_SIZE)
    const verschil = Math.abs(links - rechts)
    if (verschil < besteVerschil) {
      besteVerschil = verschil
      besteIndex = i
    }
  }
  return [woorden.slice(0, besteIndex).join(' '), woorden.slice(besteIndex).join(' ')]
}

function bokstekst(node: Node, dy: number, text: string, font: string, size: number, bold: boolean): Shape {
  return {
    kind: 'text',
    x: node.x + node.w / 2,
    y: node.y + dy,
    text,
    size,
    bold,
    anchor: 'middle',
    fill: bold ? '#111111' : '#333333',
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
    const w = Math.min(BOX_W * 2, vak - 20)
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

type Kant = { node: Node; zijde: 'boven' | 'onder' }

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

function ankerpunt(kant: Kant, fluxId: string, slots: Map<string, string[]>): Punt {
  const lijst = slots.get(`${kant.node.id}:${kant.zijde}`) ?? [fluxId]
  const index = Math.max(0, lijst.indexOf(fluxId))
  const positie = (index + 1) / (lijst.length + 1)

  const { x, y, w, h } = kant.node
  return kant.zijde === 'boven' ? { x: x + w * positie, y } : { x: x + w * positie, y: y + h }
}

function pijlpunt(start: Punt, eind: Punt, kleurcode: string): Shape {
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

/** ARGB van ExcelJS naar een kleur die SVG begrijpt. */
export function kleur(argb: string): string {
  const hex = argb.length === 8 ? argb.slice(2) : argb
  return `#${hex.toLowerCase()}`
}
