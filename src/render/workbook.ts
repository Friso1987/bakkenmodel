/**
 * Van werkmapplan naar xlsx, met ExcelJS.
 *
 * In twee slagen: eerst alle waarden plaatsen en onthouden op welk adres elk
 * modelelement terechtkwam, daarna de formules schrijven. Anders kan een
 * formule niet naar een cel verwijzen die verderop in het bestand staat.
 *
 * De idToCell-map die dit oplevert gaat mee naar de docentensleutel, zodat die
 * de exacte celverwijzing van de fout kan noemen.
 */
import ExcelJS from 'exceljs'
import type { Expr } from '../core/expr'
import type { WaterBalanceModel } from '../core/model'
import type { SolveResult } from '../core/solve'
import { refKey, type PlanBlock, type PlanCell, type WorkbookPlan } from '../layout/plan'
import { themeOf, type StyleChoices, type Theme } from '../style/index'
import {
  address,
  columnLetter,
  exprToFormula,
  refsToFormula,
  type CellAddress,
} from './formula'
import { normalizeZip, VASTE_DATUM } from './zip'


export type ImageBlock = Extract<PlanBlock, { kind: 'image' }>

/** Zet het diagram om naar base64-png. Zonder rasterizer komt de alt-tekst in het blad. */
export type Rasterizer = (image: ImageBlock) => Promise<string | null>

export type RenderOptions = {
  /** Zet een SVG om naar base64-png. In de browser via canvas; in Node via een stub. */
  rasterize?: Rasterizer
  /** Naam van de maker in de bestandseigenschappen. */
  creator?: string
}

export type RenderedWorkbook = {
  buffer: Uint8Array
  /** Modelelement-id naar celverwijzing, bijvoorbeeld "Invoer!B7". */
  idToCell: Record<string, string>
  /** Ruwe adressen per verwijzingssleutel. */
  addresses: Record<string, CellAddress>
}

type Placed = { cell: PlanCell; address: CellAddress }

export async function renderWorkbook(
  plan: WorkbookPlan,
  model: WaterBalanceModel,
  result: SolveResult,
  style: StyleChoices,
  options: RenderOptions = {},
): Promise<RenderedWorkbook> {
  const theme = themeOf(style)
  const workbook = new ExcelJS.Workbook()
  workbook.creator = options.creator ?? 'Bakkenmodel-generator'
  workbook.lastModifiedBy = workbook.creator
  workbook.created = VASTE_DATUM
  workbook.modified = VASTE_DATUM
  workbook.properties.date1904 = false

  const addresses: Record<string, CellAddress> = {}
  const placed: Placed[] = []
  const idToCell: Record<string, string> = {}
  // Een element krijgt bij voorkeur het adres van zijn waardecel, niet dat van
  // het label ernaast; daar wijst de sleutel straks naar.
  const idViaWaarde = new Set<string>()

  for (const sheetPlan of plan.sheets) {
    const sheet = workbook.addWorksheet(sheetPlan.name, {
      views: [{ showGridLines: theme.border === 'geen' }],
      properties: { defaultRowHeight: theme.fontSize + 5 },
    })
    const widths: number[] = [...(sheetPlan.columnWidths ?? [])]
    let row = 1

    for (const block of sheetPlan.blocks) {
      row = await writeBlock(block, sheet, row)
    }

    widths.forEach((width, index) => {
      if (width > 0) sheet.getColumn(index + 1).width = width
    })

    async function writeBlock(block: PlanBlock, ws: ExcelJS.Worksheet, startRow: number): Promise<number> {
      switch (block.kind) {
        case 'spacer':
          return startRow + 1
        case 'heading': {
          const cell = ws.getCell(startRow, 1)
          cell.value = block.text
          cell.font = {
            name: theme.headingFont,
            size: block.level === 1 ? theme.headingSize : theme.headingSize - 2,
            bold: true,
            color: { argb: theme.titleText },
          }
          return startRow + 2
        }
        case 'paragraph': {
          const cell = ws.getCell(startRow, 1)
          cell.value = block.label ? `${block.label}: ${block.text}` : block.text
          cell.font = { name: theme.font, size: theme.fontSize, italic: block.italic ?? false }
          cell.alignment = { vertical: 'top', wrapText: true }
          ws.mergeCells(startRow, 1, startRow, 8)
          ws.getRow(startRow).height = Math.max(16, Math.ceil(cell.value.toString().length / 95) * 15)
          return startRow + 2
        }
        case 'image': {
          // Zonder canvas, of als het tekenen misgaat, komt de alt-tekst in het
          // blad. Liever een bestand zonder plaatje dan helemaal geen bestand.
          const base64 = options.rasterize ? await veiligRasteren(options.rasterize, block) : null
          if (!base64) {
            const cell = ws.getCell(startRow, 1)
            cell.value = block.alt
            cell.font = { name: theme.font, size: theme.fontSize, italic: true }
            return startRow + 2
          }
          const imageId = workbook.addImage({ base64, extension: 'png' })
          const rijen = Math.ceil(block.heightPx / 20) + 1
          ws.addImage(imageId, {
            tl: { col: 0, row: startRow - 1 },
            ext: { width: block.widthPx, height: block.heightPx },
            editAs: 'oneCell',
          })
          return startRow + rijen
        }
        case 'table': {
          let r = startRow
          if (block.title) {
            const cell = ws.getCell(r, 1)
            cell.value = block.title
            cell.font = { name: theme.headingFont, size: theme.fontSize + 1, bold: true, color: { argb: theme.titleText } }
            r += 1
          }
          if (block.columnWidths) {
            block.columnWidths.forEach((width, index) => {
              widths[index] = Math.max(widths[index] ?? 0, width)
            })
          }
          if (block.header) {
            block.header.forEach((cell, index) => write(cell, ws, r, index + 1, true))
            ws.getRow(r).height = theme.fontSize + 10
            r += 1
          }
          const eersteDataRij = r
          block.rows.forEach((cells, rowIndex) => {
            cells.forEach((cell, index) => write(cell, ws, r, index + 1, false, rowIndex))
            r += 1
          })
          if (theme.zebra && block.rows.length > 2) {
            for (let i = 0; i < block.rows.length; i += 2) {
              const rij = ws.getRow(eersteDataRij + i)
              for (let c = 1; c <= (block.header?.length ?? block.rows[0]?.length ?? 1); c++) {
                const cell = rij.getCell(c)
                if (!cell.fill || cell.fill.type !== 'pattern') {
                  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: theme.zebra } }
                }
              }
            }
          }
          if (block.footnote) {
            const cell = ws.getCell(r, 1)
            cell.value = block.footnote
            cell.font = { name: theme.font, size: theme.fontSize - 1, italic: true }
            ws.mergeCells(r, 1, r, Math.max(2, block.header?.length ?? 2))
            r += 1
          }
          return r + 1
        }
      }
    }

    function write(
      cell: PlanCell,
      ws: ExcelJS.Worksheet,
      rowIndex: number,
      colIndex: number,
      isHeader: boolean,
      _dataRow = 0,
    ): void {
      const target = ws.getCell(rowIndex, colIndex)
      const here: CellAddress = { sheet: sheetPlan.name, row: rowIndex, col: colIndex }

      const isGetal =
        (cell.kind === 'number' || cell.kind === 'total') &&
        (cell.value !== undefined || cell.shownValue !== undefined)
      if (isGetal) {
        target.value = cell.shownValue ?? cell.value ?? 0
        target.numFmt = numberFormat(cell)
        target.alignment = { horizontal: 'right' }
      } else {
        target.value = cell.text ?? ''
        target.alignment = { horizontal: 'left', indent: cell.indent ?? 0, wrapText: false }
      }

      target.font = {
        name: isHeader ? theme.headingFont : theme.font,
        size: theme.fontSize,
        bold: isHeader || cell.bold === true || cell.kind === 'total',
        italic: cell.italic ?? cell.kind === 'note',
        color: { argb: isHeader ? theme.headerText : 'FF000000' },
      }
      if (isHeader) {
        target.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: theme.headerFill } }
        target.alignment = { ...target.alignment, wrapText: true, vertical: 'bottom' }
      } else if (cell.kind === 'total' && theme.totalFill) {
        target.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: theme.totalFill } }
      }
      applyBorder(target, theme, isHeader)

      if (cell.comment) target.note = cell.comment
      if (cell.span && cell.span > 1) ws.mergeCells(rowIndex, colIndex, rowIndex, colIndex + cell.span - 1)

      if (cell.ref) addresses[cell.ref] = here
      if (cell.elementId) {
        const heeftWaarde = cell.ref !== undefined
        if (!idToCell[cell.elementId] || (heeftWaarde && !idViaWaarde.has(cell.elementId))) {
          idToCell[cell.elementId] = address(here, '')
          if (heeftWaarde) idViaWaarde.add(cell.elementId)
        }
      }
      if (cell.formula || cell.formulaRefs) placed.push({ cell, address: here })
    }
  }

  // Tweede slag: nu alle adressen bekend zijn, komen de formules erin.
  const literal = literalResolver(model, result)
  for (const { cell, address: at } of placed) {
    const ws = workbook.getWorksheet(at.sheet)
    if (!ws) continue
    const target = ws.getCell(at.row, at.col)
    const resolve = (ref: string): string | null => {
      const found = addresses[ref]
      return found ? address(found, at.sheet) : null
    }

    let formula: string | null = null
    if (cell.formula) {
      formula = exprToFormula(cell.formula, cell.timeIndex ?? 0, resolve, literal)
    } else if (cell.formulaRefs) {
      formula = refsToFormula(cell.formulaRefs, (ref) => addresses[ref] ?? null, at.sheet)
    }
    if (formula) {
      target.value = { formula, result: cell.shownValue ?? cell.value ?? 0 }
    }
  }

  const ruw = await workbook.xlsx.writeBuffer()
  const buffer = await normalizeZip(new Uint8Array(ruw as ArrayBuffer))
  return { buffer, idToCell, addresses }
}

async function veiligRasteren(rasterize: Rasterizer, block: ImageBlock): Promise<string | null> {
  try {
    return await rasterize(block)
  } catch {
    return null
  }
}

function literalResolver(model: WaterBalanceModel, result: SolveResult) {
  return (node: Expr, timeIndex: number): number => {
    switch (node.kind) {
      case 'param': {
        const assumption = model.assumptions.find((a) => a.id === node.id)
        if (assumption) return assumption.value
        return model.area.id === node.id ? model.area.value : 0
      }
      case 'series':
        return model.timeseries.values[node.id]?.[node.at ?? timeIndex] ?? 0
      case 'flux':
        return result.computed[node.id]?.[node.at ?? timeIndex] ?? 0
      case 'storage':
        return result.storageStart[node.id]?.[timeIndex] ?? 0
      default:
        return 0
    }
  }
}

function numberFormat(cell: PlanCell): string {
  const decimals = cell.decimals ?? 0
  const basis = decimals > 0 ? `#,##0.${'0'.repeat(decimals)}` : '#,##0'
  if (!cell.unitSuffix) return basis
  return `${basis}" ${cell.unitSuffix}"`
}

function applyBorder(cell: ExcelJS.Cell, theme: Theme, isHeader: boolean): void {
  const dun = { style: 'thin' as const, color: { argb: 'FFBFBFBF' } }
  const stevig = { style: 'thin' as const, color: { argb: theme.headerFill } }
  switch (theme.border) {
    case 'geen':
      if (isHeader) cell.border = { bottom: stevig }
      break
    case 'dun':
      cell.border = isHeader ? { bottom: stevig } : { bottom: dun }
      break
    case 'kader':
      cell.border = { top: dun, bottom: dun, left: dun, right: dun }
      break
    case 'alles':
      cell.border = { top: dun, bottom: dun, left: dun, right: dun }
      if (isHeader) cell.border = { top: stevig, bottom: stevig, left: stevig, right: stevig }
      break
  }
}

/** Celverwijzing van een modelelement, zoals de sleutel hem noemt. */
export function cellOf(rendered: RenderedWorkbook, ref: string): string | null {
  const found = rendered.addresses[ref]
  return found ? `${found.sheet}!${columnLetter(found.col)}${found.row}` : null
}

export { refKey }
