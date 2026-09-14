/**
 * Het werkmapplan: een abstracte beschrijving van wat er in het bestand komt,
 * los van ExcelJS. De layouts bouwen een plan, de renderer zet het om naar
 * cellen, en de HTML-preview in de UI leest hetzelfde plan.
 *
 * Waarom deze tussenlaag: de opmaak-assen en de layouts grijpen allemaal op
 * dezelfde plek in, en de assert uit §7 van de specificatie kan zo op het plan
 * controleren of een fout nog wel zichtbaar is.
 */
import type { Expr } from '../core/expr'
import type { Unit } from '../core/units'
import type { Drawing } from '../render/shapes'

export type SectionId = 'invoer' | 'berekening' | 'uitvoer' | 'bronnen' | 'diagram'

export type CellKind = 'header' | 'label' | 'number' | 'text' | 'total' | 'note'

export type PlanCell = {
  kind: CellKind
  text?: string
  value?: number
  /** Sleutel waaronder de renderer dit adres onthoudt, zie refKey(). */
  ref?: string
  /** Formule; de renderer maakt er A1-verwijzingen van. */
  formula?: Expr
  /**
   * Formule als optelsom van andere cellen, bijvoorbeeld een totaalrij of
   * "eindberging = beginberging + in - uit". De renderer maakt er SUM() van
   * zodra drie of meer cellen onder elkaar staan.
   */
  formulaRefs?: Array<{ ref: string; sign?: -1 }>
  /** Tijdstap waarin de formule staat; nodig om reeksverwijzingen op te lossen. */
  timeIndex?: number
  /**
   * De waarde die getoond moet worden als die bewust afwijkt van wat de
   * formule oplevert. Alleen NAV-06 gebruikt dit.
   */
  shownValue?: number
  decimals?: number
  unit?: Unit
  /** Eenheid als achtervoegsel in het getalformaat, in plaats van in een kolom. */
  unitSuffix?: string
  comment?: string
  bold?: boolean
  italic?: boolean
  indent?: number
  span?: number
  /** Id van het modelelement, voor de sleutel. */
  elementId?: string
}

export type PlanTable = {
  kind: 'table'
  id: string
  title?: string
  header?: PlanCell[]
  rows: PlanCell[][]
  footnote?: string
  columnWidths?: number[]
  section: SectionId
}

export type PlanBlock =
  | { kind: 'heading'; text: string; level: 1 | 2; section: SectionId }
  | { kind: 'paragraph'; text: string; label?: string; section: SectionId; italic?: boolean }
  | PlanTable
  | {
      kind: 'image'
      id: string
      /** Voor de preview in de pagina. */
      svg: string
      /** Dezelfde vormen, om rechtstreeks op een canvas te tekenen voor de png. */
      drawing: Drawing
      widthPx: number
      heightPx: number
      alt: string
      section: SectionId
    }
  | { kind: 'spacer'; section: SectionId }

export type PlanSheet = {
  name: string
  blocks: PlanBlock[]
  /** Kolombreedtes voor het hele tabblad, als de blokken er geen opgeven. */
  columnWidths?: number[]
}

export type WorkbookPlan = {
  sheets: PlanSheet[]
  /** Waar de renderer straks de celadressen in kwijt kan. */
  meta: {
    layout: 'A' | 'B' | 'C'
    /** Zijn invoer, berekening en uitvoer met kopjes van elkaar gescheiden? */
    sectionsLabelled: boolean
    hasUnits: boolean
    hasAssumptions: boolean
    hasSources: boolean
    hasFormulas: boolean
    hasDiagram: boolean
  }
}

// --- verwijzingssleutels -----------------------------------------------------

export const refKey = {
  param: (id: string) => `par:${id}`,
  series: (id: string, t: number) => `ser:${id}@${t}`,
  flux: (id: string, t: number) => `flux:${id}@${t}`,
  storageStart: (id: string, t: number) => `bergin:${id}@${t}`,
  storageEnd: (id: string, t: number) => `bergeind:${id}@${t}`,
  total: (id: string) => `totaal:${id}`,
  main: () => 'hoofduitkomst',
}

// --- doorzoeken --------------------------------------------------------------

export function allBlocks(plan: WorkbookPlan): PlanBlock[] {
  return plan.sheets.flatMap((sheet) => sheet.blocks)
}

export function allTables(plan: WorkbookPlan): PlanTable[] {
  return allBlocks(plan).filter((b): b is PlanTable => b.kind === 'table')
}

export function allCells(plan: WorkbookPlan): PlanCell[] {
  return allTables(plan).flatMap((table) => [...(table.header ?? []), ...table.rows.flat()])
}

export function findCellByRef(plan: WorkbookPlan, ref: string): PlanCell | undefined {
  return allCells(plan).find((cell) => cell.ref === ref)
}

/** Alle tekst in het plan, voor tests en voor de zoekfunctie in de preview. */
export function planText(plan: WorkbookPlan): string {
  const parts: string[] = []
  for (const sheet of plan.sheets) {
    parts.push(sheet.name)
    for (const block of sheet.blocks) {
      if (block.kind === 'heading' || block.kind === 'paragraph') parts.push(block.text)
      if (block.kind === 'table') {
        if (block.title) parts.push(block.title)
        if (block.footnote) parts.push(block.footnote)
        for (const cell of [...(block.header ?? []), ...block.rows.flat()]) {
          if (cell.text) parts.push(cell.text)
          if (cell.comment) parts.push(cell.comment)
          if (cell.unitSuffix) parts.push(cell.unitSuffix)
        }
      }
      if (block.kind === 'image') parts.push(block.alt, block.svg)
    }
  }
  return parts.join('\n')
}
