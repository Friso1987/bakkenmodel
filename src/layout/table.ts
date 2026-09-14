/**
 * Layout B: invoertabel, berekeningstabel, uitvoertabel. Geen diagram.
 *
 * De opmaak-assen bepalen waar de eenheden en de bronnen staan, of de maanden
 * in rijen of in kolommen staan, en of alles op één tabblad komt. Geen van die
 * keuzes maakt het model fout; alleen de presentatievlaggen uit het model doen
 * dat, en die komen uit een gekozen NAV-code.
 */
import { resolveConclusion, type WaterBalanceModel } from '../core/model'
import type { SolveResult } from '../core/solve'
import { unitLabel } from '../core/units'
import type { StyleChoices } from '../style/index'
import {
  bucketFluxes,
  fluxName,
  fluxOrder,
  footnoteFor,
  formulaGate,
  headerUnit,
  nameOf,
  showSourceColumn,
  showUnitColumnMixed,
  sourceText,
  withSourceComment,
  withUnit,
} from './common'
import {
  refKey,
  type PlanBlock,
  type PlanCell,
  type PlanSheet,
  type PlanTable,
  type WorkbookPlan,
} from './plan'

export function buildTableLayout(
  model: WaterBalanceModel,
  result: SolveResult,
  style: StyleChoices,
): WorkbookPlan {
  return assemble(model, style, {
    invoer: [...introBlocks(model, style), ...assumptionBlocks(model, style), inputSeriesTable(model, result, style)],
    berekening: [fluxTable(model, result, style), ...storageTables(model, result, style)],
    uitvoer: [balanceTable(model, result, style), ...outcomeBlocks(model, result, style)],
  }, 'B')
}

// --- blokken -----------------------------------------------------------------

export function introBlocks(model: WaterBalanceModel, _style: StyleChoices): PlanBlock[] {
  return [
    { kind: 'heading', text: model.title, level: 1, section: 'invoer' },
    { kind: 'paragraph', text: model.intro, section: 'invoer' },
    { kind: 'paragraph', label: 'Vraag', text: model.conclusion.question, section: 'invoer' },
    { kind: 'spacer', section: 'invoer' },
  ]
}

export function assumptionBlocks(model: WaterBalanceModel, style: StyleChoices): PlanBlock[] {
  if (model.presentation.hideAssumptions) return []

  const metEenheid = showUnitColumnMixed(model, style)
  const metBron = showSourceColumn(style)

  type Kolom = 'label' | 'waarde' | 'eenheid' | 'bron'
  const kolommen: Kolom[] =
    style.kolomvolgorde === 'eenheid-voor-waarde'
      ? ['label', 'eenheid', 'waarde', 'bron']
      : style.kolomvolgorde === 'bron-eerst'
        ? ['bron', 'label', 'waarde', 'eenheid']
        : ['label', 'waarde', 'eenheid', 'bron']

  const zichtbaar = kolommen.filter((k) => (k === 'eenheid' ? metEenheid : k === 'bron' ? metBron : true))

  const koppen: Record<Kolom, string> = {
    label: 'aanname of parameter',
    waarde: 'waarde',
    eenheid: 'eenheid',
    bron: 'bron',
  }

  const rows: PlanCell[][] = []
  const alleRegels = [
    {
      id: model.area.id,
      label: model.area.label,
      text: 'Het gebied waar deze balans over gaat.',
      value: model.area.value,
      unit: model.area.unit,
      decimals: 1,
    },
    ...model.assumptions.map((a) => ({
      id: a.id,
      label: a.label,
      text: a.text,
      value: a.value,
      unit: a.unit,
      decimals: a.decimals ?? 1,
    })),
  ]

  for (const regel of alleRegels) {
    const cellen: Record<Kolom, PlanCell> = {
      label: { kind: 'label', text: regel.label, comment: regel.text, elementId: regel.id },
      waarde: withSourceComment(
        withUnit(
          {
            kind: 'number',
            value: regel.value,
            decimals: regel.decimals,
            ref: refKey.param(regel.id),
            elementId: regel.id,
          },
          model,
          style,
          regel.unit,
        ),
        model,
        style,
        regel.id,
      ),
      eenheid: { kind: 'text', text: model.presentation.hideUnits ? '' : unitLabel(regel.unit) },
      bron: { kind: 'note', text: sourceText(model, regel.id) ?? '' },
    }
    rows.push(zichtbaar.map((k) => cellen[k]))
  }

  const table: PlanTable = {
    kind: 'table',
    id: 'aannames',
    title: 'Aannames en parameters',
    header: zichtbaar.map((k) => ({ kind: 'header', text: koppen[k] })),
    rows,
    section: 'invoer',
    columnWidths: zichtbaar.map((k) => (k === 'label' ? 34 : k === 'bron' ? 46 : 12)),
  }
  const footnote = footnoteFor(model, style, alleRegels.map((r) => r.id))
  if (footnote) table.footnote = footnote

  return [table, { kind: 'spacer', section: 'invoer' }]
}

export function inputSeriesTable(
  model: WaterBalanceModel,
  result: SolveResult,
  style: StyleChoices,
): PlanTable {
  const labels = result.labels
  const kolomKop = model.timeseries.step === 'maand' ? 'maand' : 'dag'

  const cel = (inputId: string, t: number): PlanCell => {
    const input = model.inputs.find((i) => i.id === inputId)!
    return withSourceComment(
      withUnit(
        {
          kind: 'number',
          value: model.timeseries.values[inputId]![t]!,
          decimals: input.decimals ?? 0,
          ref: refKey.series(inputId, t),
          elementId: inputId,
        },
        model,
        style,
        input.unit,
      ),
      model,
      style,
      inputId,
    )
  }

  const header: PlanCell[] = []
  const rows: PlanCell[][] = []

  if (style.tijdreeks === 'maanden-in-rijen') {
    header.push({ kind: 'header', text: kolomKop })
    for (const input of model.inputs) {
      header.push({ kind: 'header', text: nameOf(style, input.label, input.symbol) + headerUnit(model, style, input.unit) })
    }
    labels.forEach((label, t) => {
      rows.push([{ kind: 'label', text: label }, ...model.inputs.map((i) => cel(i.id, t))])
    })
  } else {
    header.push({ kind: 'header', text: 'post' }, ...labels.map((l) => ({ kind: 'header' as const, text: l })))
    for (const input of model.inputs) {
      rows.push([
        { kind: 'label', text: nameOf(style, input.label, input.symbol) + headerUnit(model, style, input.unit) },
        ...labels.map((_, t) => cel(input.id, t)),
      ])
    }
  }

  const table: PlanTable = {
    kind: 'table',
    id: 'invoerreeksen',
    title: 'Gemeten reeksen',
    header,
    rows,
    section: 'invoer',
    columnWidths:
      style.tijdreeks === 'maanden-in-rijen'
        ? [14, ...model.inputs.map(() => 18)]
        : [30, ...labels.map(() => 10)],
  }
  const footnote = footnoteFor(model, style, model.inputs.map((i) => i.id))
  if (footnote) table.footnote = footnote
  return table
}

export function fluxTable(model: WaterBalanceModel, result: SolveResult, style: StyleChoices): PlanTable {
  const fluxen = fluxOrder(model, result, style)
  const gate = formulaGate(model, style)
  const labels = result.labels

  const cel = (fluxId: string, t: number): PlanCell => {
    const flux = model.fluxes.find((f) => f.id === fluxId)!
    const berekend = result.computed[fluxId]![t]!
    const getoond = result.stated[fluxId]![t]!
    const cell: PlanCell = {
      kind: 'number',
      value: getoond,
      decimals: flux.decimals ?? 0,
      ref: refKey.flux(fluxId, t),
      elementId: fluxId,
      timeIndex: t,
    }
    if (flux.definition.kind === 'expr' && gate(fluxId)) {
      cell.formula = flux.definition.expr
      if (Math.abs(getoond - berekend) > 1e-9) cell.shownValue = getoond
    }
    if (flux.note) cell.comment = flux.note
    return withUnit(cell, model, style, flux.unit)
  }

  const totaalCel = (fluxId: string): PlanCell => {
    const flux = model.fluxes.find((f) => f.id === fluxId)!
    return withUnit(
      {
        kind: 'total',
        value: result.totals[fluxId]!,
        decimals: flux.decimals ?? 0,
        ref: refKey.total(fluxId),
        elementId: fluxId,
        bold: true,
        formulaRefs: labels.map((_, t) => ({ ref: refKey.flux(fluxId, t) })),
      },
      model,
      style,
      flux.unit,
    )
  }

  const header: PlanCell[] = []
  const rows: PlanCell[][] = []
  const kolomKop = model.timeseries.step === 'maand' ? 'maand' : 'dag'

  if (style.tijdreeks === 'maanden-in-rijen') {
    header.push({ kind: 'header', text: kolomKop })
    for (const flux of fluxen) {
      header.push({ kind: 'header', text: fluxName(style, flux) + headerUnit(model, style, flux.unit) })
    }
    labels.forEach((label, t) => {
      rows.push([{ kind: 'label', text: label }, ...fluxen.map((f) => cel(f.id, t))])
    })
    rows.push([{ kind: 'total', text: 'totaal', bold: true }, ...fluxen.map((f) => totaalCel(f.id))])
  } else {
    header.push(
      { kind: 'header', text: 'post' },
      ...labels.map((l) => ({ kind: 'header' as const, text: l })),
      { kind: 'header', text: 'totaal' },
    )
    for (const flux of fluxen) {
      rows.push([
        { kind: 'label', text: fluxName(style, flux) + headerUnit(model, style, flux.unit), elementId: flux.id },
        ...labels.map((_, t) => cel(flux.id, t)),
        totaalCel(flux.id),
      ])
    }
  }

  return {
    kind: 'table',
    id: 'fluxen',
    title: `Posten per ${model.timeseries.step}`,
    header,
    rows,
    section: 'berekening',
    columnWidths:
      style.tijdreeks === 'maanden-in-rijen'
        ? [14, ...fluxen.map(() => 16)]
        : [34, ...labels.map(() => 12), 14],
  }
}

export function storageTables(
  model: WaterBalanceModel,
  result: SolveResult,
  style: StyleChoices,
): PlanBlock[] {
  const labels = result.labels
  const blocks: PlanBlock[] = []

  for (const bucket of model.buckets) {
    const { in: binnen, out: buiten } = bucketFluxes(model, bucket.id)
    const rows: PlanCell[][] = []

    labels.forEach((label, t) => {
      const begin: PlanCell = withUnit(
        {
          kind: 'number',
          value: result.storageStart[bucket.id]![t]!,
          decimals: 0,
          ref: refKey.storageStart(bucket.id, t),
          elementId: bucket.id,
        },
        model,
        style,
        bucket.unit,
      )
      if (t > 0) begin.formulaRefs = [{ ref: refKey.storageEnd(bucket.id, t - 1) }]

      const som = (fluxen: typeof binnen): PlanCell =>
        withUnit(
          {
            kind: 'number',
            value: fluxen.reduce((acc, f) => acc + result.stated[f.id]![t]!, 0),
            decimals: 0,
            formulaRefs: fluxen.map((f) => ({ ref: refKey.flux(f.id, t) })),
          },
          model,
          style,
          bucket.unit,
        )

      const eind: PlanCell = withUnit(
        {
          kind: 'number',
          value: result.storageEnd[bucket.id]![t]!,
          decimals: 0,
          ref: refKey.storageEnd(bucket.id, t),
          elementId: bucket.id,
          formulaRefs: [
            { ref: refKey.storageStart(bucket.id, t) },
            ...binnen.map((f) => ({ ref: refKey.flux(f.id, t) })),
            ...buiten.map((f) => ({ ref: refKey.flux(f.id, t), sign: -1 as const })),
          ],
        },
        model,
        style,
        bucket.unit,
      )

      rows.push([{ kind: 'label', text: label }, begin, som(binnen), som(buiten), eind])
    })

    const kop = model.timeseries.step === 'maand' ? 'maand' : 'dag'
    const capaciteit = result.capacity[bucket.id] ?? null
    const table: PlanTable = {
      kind: 'table',
      id: `berging-${bucket.id}`,
      title: `Berging ${bucket.label}`,
      header: [
        { kind: 'header', text: kop },
        { kind: 'header', text: 'beginberging' + headerUnit(model, style, bucket.unit) },
        { kind: 'header', text: 'in' + headerUnit(model, style, bucket.unit) },
        { kind: 'header', text: 'uit' + headerUnit(model, style, bucket.unit) },
        { kind: 'header', text: 'eindberging' + headerUnit(model, style, bucket.unit) },
      ],
      rows,
      section: 'berekening',
      columnWidths: [14, 16, 14, 14, 16],
    }
    const toelichting = [bucket.note, capaciteit === null ? undefined : `maximale berging ${Math.round(capaciteit)} ${unitLabel(bucket.unit)}`]
      .filter(Boolean)
      .join(' — ')
    if (toelichting) table.footnote = toelichting
    blocks.push(table)
  }

  return blocks
}

export function balanceTable(
  model: WaterBalanceModel,
  result: SolveResult,
  style: StyleChoices,
): PlanTable {
  const ingaand = model.fluxes.filter((f) => f.from.kind === 'extern' && f.to.kind === 'bucket')
  const uitgaand = model.fluxes.filter((f) => f.from.kind === 'bucket' && f.to.kind === 'extern')

  const rows: PlanCell[][] = []
  const regel = (label: string, flux: (typeof model.fluxes)[number]): PlanCell[] => [
    { kind: 'label', text: label, indent: 1, elementId: flux.id },
    withUnit(
      {
        kind: 'number',
        value: result.totals[flux.id]!,
        decimals: 0,
        formulaRefs: [{ ref: refKey.total(flux.id) }],
        elementId: flux.id,
      },
      model,
      style,
      flux.unit,
    ),
  ]

  rows.push([{ kind: 'label', text: 'ingaande posten', bold: true }, { kind: 'text', text: '' }])
  for (const flux of ingaand) rows.push(regel(fluxName(style, flux), flux))
  rows.push([
    { kind: 'total', text: 'totaal in', bold: true },
    withUnit(
      {
        kind: 'total',
        value: result.system.inflow,
        decimals: 0,
        bold: true,
        ref: 'totaal-in',
        formulaRefs: ingaand.map((f) => ({ ref: refKey.total(f.id) })),
      },
      model,
      style,
      'm3',
    ),
  ])

  rows.push([{ kind: 'label', text: 'uitgaande posten', bold: true }, { kind: 'text', text: '' }])
  for (const flux of uitgaand) rows.push(regel(fluxName(style, flux), flux))
  rows.push([
    { kind: 'total', text: 'totaal uit', bold: true },
    withUnit(
      {
        kind: 'total',
        value: result.system.outflow,
        decimals: 0,
        bold: true,
        ref: 'totaal-uit',
        formulaRefs: uitgaand.map((f) => ({ ref: refKey.total(f.id) })),
      },
      model,
      style,
      'm3',
    ),
  ])

  rows.push([
    { kind: 'label', text: 'verandering van de berging', bold: true },
    withUnit(
      {
        kind: 'number',
        value: result.system.deltaStorage,
        decimals: 0,
        ref: 'delta-berging',
        formulaRefs: model.buckets.flatMap((b) => [
          { ref: refKey.storageEnd(b.id, result.labels.length - 1) },
          { ref: refKey.storageStart(b.id, 0), sign: -1 as const },
        ]),
      },
      model,
      style,
      'm3',
    ),
  ])

  rows.push([
    { kind: 'total', text: 'controle: in - uit - verandering', bold: true },
    withUnit(
      {
        kind: 'total',
        value: result.system.residual,
        decimals: 1,
        bold: true,
        formulaRefs: [
          { ref: 'totaal-in' },
          { ref: 'totaal-uit', sign: -1 },
          { ref: 'delta-berging', sign: -1 },
        ],
      },
      model,
      style,
      'm3',
    ),
  ])

  return {
    kind: 'table',
    id: 'jaarbalans',
    title: `Balans over de hele periode`,
    header: [
      { kind: 'header', text: 'post' },
      { kind: 'header', text: 'totaal' + headerUnit(model, style, 'm3') },
    ],
    rows,
    section: 'uitvoer',
    columnWidths: [38, 16],
  }
}

export function outcomeBlocks(
  model: WaterBalanceModel,
  result: SolveResult,
  style: StyleChoices,
): PlanBlock[] {
  const outcome = model.mainOutcome
  const bron =
    outcome.kind === 'fluxTotal'
      ? [{ ref: refKey.total(outcome.fluxId) }]
      : undefined

  const waarde: PlanCell = withUnit(
    {
      kind: 'total',
      value: result.main.value,
      decimals: outcome.decimals,
      bold: true,
      ref: refKey.main(),
      elementId: outcome.id,
      ...(bron ? { formulaRefs: bron } : {}),
    },
    model,
    style,
    outcome.unit,
  )

  const table: PlanTable = {
    kind: 'table',
    id: 'hoofduitkomst',
    title: 'Uitkomst',
    header: [
      { kind: 'header', text: 'uitkomst' },
      { kind: 'header', text: 'waarde' + headerUnit(model, style, outcome.unit) },
    ],
    rows: [[{ kind: 'label', text: nameOf(style, outcome.label), bold: true }, waarde]],
    section: 'uitvoer',
    columnWidths: [38, 16],
  }

  return [
    table,
    { kind: 'spacer', section: 'uitvoer' },
    {
      kind: 'paragraph',
      label: 'Conclusie',
      text: resolveConclusion(model, result.main.value),
      section: 'uitvoer',
    },
  ]
}

export function sourceSheet(model: WaterBalanceModel): PlanSheet {
  return {
    name: 'Bronnen',
    columnWidths: [30, 52, 10],
    blocks: [
      { kind: 'heading', text: 'Bronnen', level: 1, section: 'bronnen' },
      {
        kind: 'table',
        id: 'bronnen',
        header: [
          { kind: 'header', text: 'hoort bij' },
          { kind: 'header', text: 'bron' },
          { kind: 'header', text: 'jaar' },
        ],
        rows: model.sources.map((source) => [
          { kind: 'label' as const, text: source.target },
          { kind: 'text' as const, text: source.reference },
          { kind: 'number' as const, value: source.year, decimals: 0 },
        ]),
        section: 'bronnen',
      },
    ],
  }
}

// --- tabbladen samenstellen --------------------------------------------------

export type SectionBlocks = {
  invoer: PlanBlock[]
  berekening: PlanBlock[]
  uitvoer: PlanBlock[]
}

/**
 * Zet de secties op tabbladen. Bij de presentatievlag `interleave` (NAV-05)
 * gaat alles door elkaar op één tabblad, zonder kopjes; dat is dan de fout.
 * Zonder die vlag staan de secties altijd netjes gescheiden en gelabeld, ook
 * als de opmaak-as ze op hetzelfde tabblad zet.
 */
export function assemble(
  model: WaterBalanceModel,
  style: StyleChoices,
  sections: SectionBlocks,
  layout: 'A' | 'B' | 'C',
): WorkbookPlan {
  const sheets: PlanSheet[] = []
  const gelabeld = !model.presentation.interleave

  if (model.presentation.interleave) {
    sheets.push({ name: 'Blad1', blocks: interleaveBlocks(sections) })
  } else if (style.tabbladen === 'gescheiden') {
    sheets.push({ name: 'Invoer', blocks: withHeading(sections.invoer, 'Invoer') })
    sheets.push({ name: 'Berekening', blocks: withHeading(sections.berekening, 'Berekening') })
    sheets.push({ name: 'Uitvoer', blocks: withHeading(sections.uitvoer, 'Uitvoer') })
  } else {
    sheets.push({
      name: 'Waterbalans',
      blocks: [
        ...withHeading(sections.invoer, 'Invoer'),
        { kind: 'spacer', section: 'invoer' },
        ...withHeading(sections.berekening, 'Berekening'),
        { kind: 'spacer', section: 'berekening' },
        ...withHeading(sections.uitvoer, 'Uitvoer'),
      ],
    })
  }

  if (style.bronvermelding === 'apart-tabblad') sheets.push(sourceSheet(model))

  const blocks = sheets.flatMap((s) => s.blocks)
  const tables = blocks.filter((b): b is PlanTable => b.kind === 'table')

  return {
    sheets,
    meta: {
      layout,
      sectionsLabelled: gelabeld,
      hasUnits: !model.presentation.hideUnits,
      hasAssumptions: tables.some((t) => t.id === 'aannames'),
      hasSources:
        style.bronvermelding !== 'geen' &&
        (tables.some((t) => t.id === 'bronnen') ||
          tables.some((t) => t.footnote) ||
          tables.some((t) => [...(t.header ?? []), ...t.rows.flat()].some((c) => c.comment?.startsWith('Bron:'))) ||
          showSourceColumn(style)),
      hasFormulas: style.formules !== 'waarden',
      hasDiagram: blocks.some((b) => b.kind === 'image'),
    },
  }
}

function withHeading(blocks: PlanBlock[], text: string): PlanBlock[] {
  if (blocks.length === 0) return blocks
  const section = blocks[0]!.section
  // De titel van het model staat al bovenaan de invoer; die krijgt geen tweede kop.
  const heeftTitel = blocks[0]!.kind === 'heading' && blocks[0]!.level === 1
  return heeftTitel
    ? [blocks[0]!, { kind: 'heading', text, level: 2, section }, ...blocks.slice(1)]
    : [{ kind: 'heading', text, level: 2, section }, ...blocks]
}

/**
 * NAV-05: invoer, berekening en uitvoer door elkaar. De volgorde ligt vast, dus
 * hij is reproduceerbaar, en er staan geen kopjes meer boven de secties.
 */
function interleaveBlocks(sections: SectionBlocks): PlanBlock[] {
  const zonderKoppen = (blocks: PlanBlock[]) => blocks.filter((b) => b.kind !== 'heading')
  const invoer = zonderKoppen(sections.invoer)
  const berekening = zonderKoppen(sections.berekening)
  const uitvoer = zonderKoppen(sections.uitvoer)

  const out: PlanBlock[] = []
  const langste = Math.max(invoer.length, berekening.length, uitvoer.length)
  for (let i = 0; i < langste; i++) {
    if (berekening[i]) out.push(berekening[i]!)
    if (invoer[i]) out.push(invoer[i]!)
    if (uitvoer[i]) out.push(uitvoer[i]!)
  }
  return out
}
