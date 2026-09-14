/**
 * Layout C: het diagram boven de tabellen. De student ziet eerst de structuur
 * en daarna de getallen, en kan de twee tegen elkaar leggen.
 */
import type { WaterBalanceModel } from '../core/model'
import type { SolveResult } from '../core/solve'
import { buildDiagram } from '../render/diagram'
import type { StyleChoices } from '../style/index'
import {
  assemble,
  assumptionBlocks,
  balanceTable,
  fluxTable,
  inputSeriesTable,
  introBlocks,
  outcomeBlocks,
  storageTables,
} from './table'
import type { PlanBlock, WorkbookPlan } from './plan'

export function buildHybridLayout(
  model: WaterBalanceModel,
  result: SolveResult,
  style: StyleChoices,
): WorkbookPlan {
  const diagram = buildDiagram(model, result, style, { showValues: false })

  const diagramBlok: PlanBlock = {
    kind: 'image',
    id: 'diagram',
    svg: diagram.svg,
    drawing: diagram,
    widthPx: diagram.width,
    heightPx: diagram.height,
    alt: `Bakkendiagram van ${model.title}. De afbeelding kon niet worden opgebouwd.`,
    section: 'invoer',
  }

  return assemble(
    model,
    style,
    {
      invoer: [
        ...introBlocks(model, style),
        diagramBlok,
        { kind: 'spacer', section: 'invoer' },
        ...assumptionBlocks(model, style),
        inputSeriesTable(model, result, style),
      ],
      berekening: [fluxTable(model, result, style), ...storageTables(model, result, style)],
      uitvoer: [balanceTable(model, result, style), ...outcomeBlocks(model, result, style)],
    },
    'C',
  )
}
