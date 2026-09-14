/**
 * Het werkmapplan als HTML, voor de voorvertoning in de pagina. Dezelfde
 * blokken als in de xlsx, zodat de docent vóór het downloaden kan zien of het
 * klopt.
 */
import { formatNumber } from '../core/units'
import type { PlanBlock, PlanCell, WorkbookPlan } from '../layout/plan'

export function previewHtml(plan: WorkbookPlan): string {
  const delen: string[] = []
  for (const sheet of plan.sheets) {
    delen.push(`<section class="preview-sheet"><h3 class="preview-tab">Tabblad ${escapeHtml(sheet.name)}</h3>`)
    for (const block of sheet.blocks) delen.push(blockHtml(block))
    delen.push('</section>')
  }
  return delen.join('\n')
}

function blockHtml(block: PlanBlock): string {
  switch (block.kind) {
    case 'spacer':
      return ''
    case 'heading':
      return `<h${block.level === 1 ? 4 : 5} class="preview-heading">${escapeHtml(block.text)}</h${block.level === 1 ? 4 : 5}>`
    case 'paragraph':
      return `<p class="preview-paragraph">${block.label ? `<strong>${escapeHtml(block.label)}:</strong> ` : ''}${escapeHtml(block.text)}</p>`
    case 'image':
      return `<figure class="preview-diagram">${block.svg}<figcaption>${escapeHtml(block.alt.split('.')[0] ?? '')}</figcaption></figure>`
    case 'table': {
      const delen: string[] = []
      if (block.title) delen.push(`<p class="preview-tabletitle">${escapeHtml(block.title)}</p>`)
      delen.push('<div class="preview-scroll"><table class="preview-table">')
      if (block.header) {
        delen.push('<thead><tr>')
        for (const cell of block.header) delen.push(`<th>${escapeHtml(cell.text ?? '')}</th>`)
        delen.push('</tr></thead>')
      }
      delen.push('<tbody>')
      for (const row of block.rows) {
        delen.push('<tr>')
        for (const cell of row) delen.push(cellHtml(cell))
        delen.push('</tr>')
      }
      delen.push('</tbody></table></div>')
      if (block.footnote) delen.push(`<p class="preview-footnote">${escapeHtml(block.footnote)}</p>`)
      return delen.join('')
    }
  }
}

function cellHtml(cell: PlanCell): string {
  const klassen = ['preview-cell', `is-${cell.kind}`]
  if (cell.bold || cell.kind === 'total') klassen.push('is-bold')

  const titel = cell.comment ? ` title="${escapeHtml(cell.comment)}"` : ''
  if (cell.kind === 'number' || cell.kind === 'total') {
    if (cell.value === undefined && cell.shownValue === undefined) {
      return `<td class="${klassen.join(' ')}"${titel}>${escapeHtml(cell.text ?? '')}</td>`
    }
    const waarde = cell.shownValue ?? cell.value ?? 0
    const tekst = formatNumber(waarde, cell.decimals ?? 0) + (cell.unitSuffix ? ` ${cell.unitSuffix}` : '')
    const formule = cell.formula || cell.formulaRefs ? ' data-formule="ja"' : ''
    return `<td class="${klassen.join(' ')} is-getal"${titel}${formule}>${escapeHtml(tekst)}</td>`
  }
  return `<td class="${klassen.join(' ')}"${titel}>${escapeHtml(cell.text ?? '')}</td>`
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
