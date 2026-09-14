/**
 * Van expressieboom naar Excel-formule. Verwijzingen worden celadressen zodra
 * de cel in het bestand staat; staat hij er niet, dan komt het getal er hard in
 * te staan. Dat laatste is precies wat NAV-01 doet, alleen dan met opzet.
 *
 * In het xlsx-formaat scheidt een komma de argumenten van een functie, ook in
 * een Nederlandse Excel. Die toont er zelf een puntkomma van.
 */
import type { BinaryOp, Expr } from '../core/expr'
import { refKey } from '../layout/plan'

export type AddressResolver = (ref: string) => string | null
export type LiteralResolver = (node: Expr, timeIndex: number) => number

const PRECEDENCE: Record<BinaryOp, number> = { '+': 1, '-': 1, '*': 2, '/': 2 }

export function exprToFormula(
  expr: Expr,
  timeIndex: number,
  address: AddressResolver,
  literal: LiteralResolver,
): string {
  return render(expr, 0)

  function render(node: Expr, parentPrecedence: number): string {
    switch (node.kind) {
      case 'const':
        return formatNumber(node.value)
      case 'param':
        return address(refKey.param(node.id)) ?? formatNumber(literal(node, timeIndex))
      case 'series':
        return address(refKey.series(node.id, node.at ?? timeIndex)) ?? formatNumber(literal(node, timeIndex))
      case 'flux':
        return address(refKey.flux(node.id, node.at ?? timeIndex)) ?? formatNumber(literal(node, timeIndex))
      case 'storage':
        return address(refKey.storageStart(node.id, timeIndex)) ?? formatNumber(literal(node, timeIndex))
      case 'call':
        return `${node.fn.toUpperCase()}(${node.args.map((arg) => render(arg, 0)).join(',')})`
      case 'op': {
        const precedence = PRECEDENCE[node.op]
        const text = `${render(node.left, precedence)}${node.op}${render(node.right, precedence + 1)}`
        return precedence < parentPrecedence ? `(${text})` : text
      }
    }
  }
}

/** Getal zoals Excel het in een formule verwacht: punt als decimaalteken. */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '0'
  const rounded = Math.abs(value) < 1e-9 ? 0 : value
  return String(Number(rounded.toPrecision(12)))
}

export type CellAddress = { sheet: string; row: number; col: number }

/**
 * Formule als optelsom van andere cellen. Drie of meer cellen onder of naast
 * elkaar worden een SUM-bereik, want zo schrijft een mens het ook op.
 */
export function refsToFormula(
  refs: Array<{ ref: string; sign?: -1 }>,
  lookup: (ref: string) => CellAddress | null,
  currentSheet: string,
): string | null {
  const terms: Array<{ address: CellAddress; sign: 1 | -1 }> = []
  for (const item of refs) {
    const address = lookup(item.ref)
    if (!address) return null
    terms.push({ address, sign: item.sign === -1 ? -1 : 1 })
  }
  if (terms.length === 0) return null

  const parts: string[] = []
  let index = 0
  while (index < terms.length) {
    const run = contiguousRun(terms, index)
    if (run > 2) {
      const first = terms[index]!.address
      const last = terms[index + run - 1]!.address
      const bereik = `${address(first, currentSheet)}:${address(last, currentSheet, true)}`
      parts.push(`${parts.length === 0 ? '' : '+'}SUM(${bereik})`)
      index += run
    } else {
      const term = terms[index]!
      const teken = term.sign === -1 ? '-' : parts.length === 0 ? '' : '+'
      parts.push(`${teken}${address(term.address, currentSheet)}`)
      index += 1
    }
  }
  return parts.join('')
}

function contiguousRun(terms: Array<{ address: CellAddress; sign: 1 | -1 }>, start: number): number {
  let run = 1
  const eerste = terms[start]!
  if (eerste.sign !== 1) return 1
  for (let i = start + 1; i < terms.length; i++) {
    const vorige = terms[i - 1]!.address
    const huidige = terms[i]!.address
    const zelfdeBlad = vorige.sheet === huidige.sheet
    const eenRijLager = huidige.col === vorige.col && huidige.row === vorige.row + 1
    const eenKolomVerder = huidige.row === vorige.row && huidige.col === vorige.col + 1
    if (terms[i]!.sign !== 1 || !zelfdeBlad || !(eenRijLager || eenKolomVerder)) break
    run++
  }
  return run
}

export function address(cell: CellAddress, currentSheet: string, zonderBlad = false): string {
  const local = `${columnLetter(cell.col)}${cell.row}`
  if (cell.sheet === currentSheet || zonderBlad) return local
  return `${quoteSheet(cell.sheet)}!${local}`
}

export function quoteSheet(name: string): string {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? name : `'${name.replace(/'/g, "''")}'`
}

export function columnLetter(col: number): string {
  let out = ''
  let n = col
  while (n > 0) {
    const rest = (n - 1) % 26
    out = String.fromCharCode(65 + rest) + out
    n = Math.floor((n - 1) / 26)
  }
  return out
}
