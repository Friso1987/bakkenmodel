/**
 * Layout A: bakken en pijlen, waarden in en naast de blokjes. Geen tabellen.
 *
 * ExcelJS kan geen Excel-vormen schrijven, dus het diagram wordt een SVG die
 * in de browser via een canvas naar png gaat en als afbeelding in het blad
 * komt. De student kan hem niet bewerken; voor een auditopdracht mag dat.
 */
import { resolveConclusion, type WaterBalanceModel } from '../core/model'
import type { SolveResult } from '../core/solve'
import { formatNumber, unitLabel } from '../core/units'
import { buildDiagram } from '../render/diagram'
import type { StyleChoices } from '../style/index'
import { assemble, sourceSheet } from './table'
import type { PlanBlock, PlanSheet, WorkbookPlan } from './plan'

export function buildDiagramLayout(
  model: WaterBalanceModel,
  result: SolveResult,
  style: StyleChoices,
): WorkbookPlan {
  const diagram = buildDiagram(model, result, style)

  const blocks: PlanBlock[] = [
    { kind: 'heading', text: model.title, level: 1, section: 'diagram' },
    { kind: 'paragraph', text: model.intro, section: 'diagram' },
    { kind: 'paragraph', label: 'Vraag', text: model.conclusion.question, section: 'diagram' },
    { kind: 'spacer', section: 'diagram' },
    {
      kind: 'image',
      id: 'diagram',
      svg: diagram.svg,
      drawing: diagram,
      widthPx: diagram.width,
      heightPx: diagram.height,
      alt: `Bakkendiagram van ${model.title}. De afbeelding kon niet worden opgebouwd.`,
      section: 'diagram',
    },
    { kind: 'spacer', section: 'diagram' },
    {
      kind: 'paragraph',
      label: model.mainOutcome.label,
      text: `${formatNumber(result.main.value, model.mainOutcome.decimals)}${
        model.presentation.hideUnits ? '' : ` ${unitLabel(model.mainOutcome.unit)}`
      }`,
      section: 'diagram',
    },
    {
      kind: 'paragraph',
      label: 'Conclusie',
      text: resolveConclusion(model, result.main.value),
      section: 'diagram',
    },
  ]

  const sheets: PlanSheet[] = [{ name: 'Waterbalans', blocks, columnWidths: [14, 14, 14, 14, 14, 14, 14, 14] }]
  if (style.bronvermelding === 'apart-tabblad') sheets.push(sourceSheet(model))

  return {
    sheets,
    meta: {
      layout: 'A',
      // Er zijn geen secties om te scheiden, dus deze layout voldoet altijd aan
      // de eis dat invoer, berekening en uitvoer niet door elkaar lopen.
      sectionsLabelled: true,
      hasUnits: !model.presentation.hideUnits,
      hasAssumptions: false,
      hasSources: style.bronvermelding !== 'geen',
      hasFormulas: false,
      hasDiagram: true,
    },
  }
}

/** Alleen hier zodat hybride en diagram dezelfde ingang delen. */
export { assemble }
