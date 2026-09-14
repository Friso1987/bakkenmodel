import type { WaterBalanceModel } from '../core/model'
import type { SolveResult } from '../core/solve'
import type { StyleChoices } from '../style/index'
import { buildDiagramLayout } from './diagram-layout'
import { buildHybridLayout } from './hybrid'
import { buildTableLayout } from './table'
import type { WorkbookPlan } from './plan'

export type LayoutId = 'A' | 'B' | 'C'

export const LAYOUTS: LayoutId[] = ['A', 'B', 'C']

export const LAYOUT_LABEL: Record<LayoutId, string> = {
  A: 'diagram',
  B: 'tabellen',
  C: 'hybride',
}

export function buildPlan(
  layout: LayoutId,
  model: WaterBalanceModel,
  result: SolveResult,
  style: StyleChoices,
): WorkbookPlan {
  switch (layout) {
    case 'A':
      return buildDiagramLayout(model, result, style)
    case 'B':
      return buildTableLayout(model, result, style)
    case 'C':
      return buildHybridLayout(model, result, style)
  }
}
