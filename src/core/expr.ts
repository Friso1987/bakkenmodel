/**
 * Minimale rekenkundige boom voor fluxdefinities.
 *
 * Waarom een boom en niet een string of een closure: de renderer moet er een
 * echte Excel-formule van kunnen maken, de sleutel moet hem leesbaar kunnen
 * opschrijven, en de foutmodules moeten hem kunnen transformeren (een factor
 * weghalen, een parameter vervangen, een term schrappen). Een closure kun je
 * niet inspecteren, een string moet je parsen.
 *
 * Omrekenfactoren staan expliciet als `const` in de boom, met een label. Daar
 * hangen de eenheidsfouten uit laag 1 aan: die halen de factor weg of
 * vervangen hem, terwijl de rest van de formule blijft staan.
 */

export type Expr =
  | { kind: 'const'; value: number; label?: string }
  | { kind: 'param'; id: string }
  | { kind: 'series'; id: string; at?: number }
  | { kind: 'flux'; id: string; at?: number }
  | { kind: 'storage'; id: string }
  | { kind: 'op'; op: BinaryOp; left: Expr; right: Expr }
  | { kind: 'call'; fn: 'min' | 'max'; args: Expr[] }

export type BinaryOp = '+' | '-' | '*' | '/'

// --- constructors -----------------------------------------------------------

export const con = (value: number, label?: string): Expr =>
  label === undefined ? { kind: 'const', value } : { kind: 'const', value, label }
export const par = (id: string): Expr => ({ kind: 'param', id })
export const ser = (id: string, at?: number): Expr =>
  at === undefined ? { kind: 'series', id } : { kind: 'series', id, at }
export const flx = (id: string, at?: number): Expr =>
  at === undefined ? { kind: 'flux', id } : { kind: 'flux', id, at }
export const stor = (id: string): Expr => ({ kind: 'storage', id })
export const add = (left: Expr, right: Expr): Expr => ({ kind: 'op', op: '+', left, right })
export const sub = (left: Expr, right: Expr): Expr => ({ kind: 'op', op: '-', left, right })
export const mul = (left: Expr, right: Expr): Expr => ({ kind: 'op', op: '*', left, right })
export const div = (left: Expr, right: Expr): Expr => ({ kind: 'op', op: '/', left, right })
export const fnMin = (...args: Expr[]): Expr => ({ kind: 'call', fn: 'min', args })
export const fnMax = (...args: Expr[]): Expr => ({ kind: 'call', fn: 'max', args })

/** Som van een lijst termen, links-associatief. */
export function sum(terms: Expr[]): Expr {
  if (terms.length === 0) return con(0)
  return terms.reduce((acc, term) => add(acc, term))
}

// --- inspectie ---------------------------------------------------------------

export type ExprDeps = {
  params: string[]
  series: string[]
  fluxes: string[]
  storages: string[]
}

export function dependencies(expr: Expr): ExprDeps {
  const deps: ExprDeps = { params: [], series: [], fluxes: [], storages: [] }
  walk(expr, (node) => {
    if (node.kind === 'param') pushUnique(deps.params, node.id)
    else if (node.kind === 'series') pushUnique(deps.series, node.id)
    else if (node.kind === 'flux') pushUnique(deps.fluxes, node.id)
    else if (node.kind === 'storage') pushUnique(deps.storages, node.id)
  })
  return deps
}

export function walk(expr: Expr, visit: (node: Expr) => void): void {
  visit(expr)
  if (expr.kind === 'op') {
    walk(expr.left, visit)
    walk(expr.right, visit)
  } else if (expr.kind === 'call') {
    for (const arg of expr.args) walk(arg, visit)
  }
}

/** Diepe kopie, zodat foutmodules vrij kunnen transformeren. */
export function cloneExpr(expr: Expr): Expr {
  if (expr.kind === 'op') return { kind: 'op', op: expr.op, left: cloneExpr(expr.left), right: cloneExpr(expr.right) }
  if (expr.kind === 'call') return { kind: 'call', fn: expr.fn, args: expr.args.map(cloneExpr) }
  return { ...expr }
}

/**
 * Vervang knopen die aan `match` voldoen. Geeft een nieuwe boom terug; de
 * originele blijft ongemoeid.
 */
export function transform(expr: Expr, replace: (node: Expr) => Expr | null): Expr {
  const replacement = replace(expr)
  if (replacement !== null) return replacement
  if (expr.kind === 'op') {
    return { kind: 'op', op: expr.op, left: transform(expr.left, replace), right: transform(expr.right, replace) }
  }
  if (expr.kind === 'call') {
    return { kind: 'call', fn: expr.fn, args: expr.args.map((arg) => transform(arg, replace)) }
  }
  return { ...expr }
}

// --- evaluatie ---------------------------------------------------------------

export type EvalContext = {
  /** Waarde van een aanname of parameter. */
  param(id: string): number
  /** Waarde van een invoertijdreeks; `at` wijst een vaste tijdstap aan. */
  series(id: string, at?: number): number
  /** Waarde van een eerder berekende flux; `at` wijst een vaste tijdstap aan. */
  flux(id: string, at?: number): number
  /** Berging aan het begin van de huidige tijdstap. */
  storage(id: string): number
}

export function evalExpr(expr: Expr, ctx: EvalContext): number {
  switch (expr.kind) {
    case 'const':
      return expr.value
    case 'param':
      return ctx.param(expr.id)
    case 'series':
      return ctx.series(expr.id, expr.at)
    case 'flux':
      return ctx.flux(expr.id, expr.at)
    case 'storage':
      return ctx.storage(expr.id)
    case 'op': {
      const left = evalExpr(expr.left, ctx)
      const right = evalExpr(expr.right, ctx)
      switch (expr.op) {
        case '+':
          return left + right
        case '-':
          return left - right
        case '*':
          return left * right
        case '/':
          return right === 0 ? 0 : left / right
      }
      break
    }
    case 'call': {
      const values = expr.args.map((arg) => evalExpr(arg, ctx))
      return expr.fn === 'min' ? Math.min(...values) : Math.max(...values)
    }
  }
  throw new Error(`Onbekend knooptype in expressie: ${JSON.stringify(expr)}`)
}

// --- weergave ----------------------------------------------------------------

export type LabelResolver = {
  param(id: string): string
  series(id: string): string
  flux(id: string): string
  storage(id: string): string
  /** Getalweergave; standaard de Nederlandse notatie. */
  number?(value: number): string
}

const PRECEDENCE: Record<BinaryOp, number> = { '+': 1, '-': 1, '*': 2, '/': 2 }

/**
 * Leesbare tekstvorm, voor de sleutel en de preview. De Excel-variant komt
 * later in render/ en gebruikt dezelfde boom met celverwijzingen.
 */
export function exprToText(expr: Expr, labels: LabelResolver): string {
  return render(expr, 0)

  function render(node: Expr, parentPrecedence: number): string {
    switch (node.kind) {
      case 'const':
        return node.label ?? formatConst(node.value)
      case 'param':
        return labels.param(node.id)
      case 'series':
        return labels.series(node.id)
      case 'flux':
        return labels.flux(node.id)
      case 'storage':
        return labels.storage(node.id)
      case 'call':
        return `${node.fn.toUpperCase()}(${node.args.map((arg) => render(arg, 0)).join('; ')})`
      case 'op': {
        const precedence = PRECEDENCE[node.op]
        const text = `${render(node.left, precedence)} ${node.op} ${render(node.right, precedence + 1)}`
        return precedence < parentPrecedence ? `(${text})` : text
      }
    }
  }

  function formatConst(value: number): string {
    if (labels.number) return labels.number(value)
    return value.toLocaleString('nl-NL', { maximumFractionDigits: 6 })
  }
}

function pushUnique(list: string[], value: string): void {
  if (!list.includes(value)) list.push(value)
}
