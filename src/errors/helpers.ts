/**
 * Chirurgie op modellen en formules. Elke foutmodule gebruikt deze bewerkingen,
 * zodat de ingrepen overal hetzelfde uitpakken en de touched-lijst klopt.
 */
import { cloneExpr, con, dependencies, transform, type Expr } from '../core/expr'
import { type Flux, type WaterBalanceModel } from '../core/model'
import { solve } from '../core/solve'

/** Alle fluxen die in de formule van een andere flux voorkomen. */
export function referencedBy(model: WaterBalanceModel, fluxId: string): Flux[] {
  return model.fluxes.filter(
    (f) => f.definition.kind === 'expr' && dependencies(f.definition.expr).fluxes.includes(fluxId),
  )
}

/** Fluxen waar niemand naar verwijst; die kun je zonder gevolgen weghalen. */
export function unreferenced(model: WaterBalanceModel): Flux[] {
  return model.fluxes.filter((f) => referencedBy(model, f.id).length === 0)
}

/**
 * Haalt overbodige nullen weg, zodat een geschrapte term ook echt uit de
 * formule verdwijnt in plaats van als "- 0" te blijven staan.
 */
export function simplify(expr: Expr): Expr {
  if (expr.kind === 'op') {
    const left = simplify(expr.left)
    const right = simplify(expr.right)
    const linksNul = isZero(left)
    const rechtsNul = isZero(right)
    switch (expr.op) {
      case '+':
        if (linksNul) return right
        if (rechtsNul) return left
        break
      case '-':
        if (rechtsNul) return left
        break
      case '*':
        if (linksNul || rechtsNul) return con(0)
        if (isOne(left)) return right
        if (isOne(right)) return left
        break
      case '/':
        if (isOne(right)) return left
        break
    }
    return { kind: 'op', op: expr.op, left, right }
  }
  if (expr.kind === 'call') {
    return { kind: 'call', fn: expr.fn, args: expr.args.map(simplify) }
  }
  return cloneExpr(expr)
}

function isZero(expr: Expr): boolean {
  return expr.kind === 'const' && expr.value === 0
}

function isOne(expr: Expr): boolean {
  return expr.kind === 'const' && expr.value === 1 && expr.label === undefined
}

/** Vervangt elke verwijzing naar een flux door nul en ruimt de formule op. */
export function dropFluxReferences(model: WaterBalanceModel, fluxId: string): string[] {
  const aangeraakt: string[] = []
  for (const flux of model.fluxes) {
    if (flux.definition.kind !== 'expr') continue
    const deps = dependencies(flux.definition.expr).fluxes
    if (!deps.includes(fluxId)) continue
    flux.definition.expr = simplify(
      transform(flux.definition.expr, (node) => (node.kind === 'flux' && node.id === fluxId ? con(0) : null)),
    )
    aangeraakt.push(flux.id)
  }
  return aangeraakt
}

/** Vervangt elke verwijzing naar een parameter door een vast getal. */
export function replaceParam(model: WaterBalanceModel, paramId: string, value: number, label?: string): string[] {
  const aangeraakt: string[] = []
  const vervang = (expr: Expr): Expr =>
    simplify(
      transform(expr, (node) =>
        node.kind === 'param' && node.id === paramId
          ? label === undefined
            ? con(value)
            : con(value, label)
          : null,
      ),
    )

  for (const flux of model.fluxes) {
    if (flux.definition.kind !== 'expr') continue
    if (!dependencies(flux.definition.expr).params.includes(paramId)) continue
    flux.definition.expr = vervang(flux.definition.expr)
    aangeraakt.push(flux.id)
  }
  for (const bucket of model.buckets) {
    if (bucket.initialExpr && dependencies(bucket.initialExpr).params.includes(paramId)) {
      bucket.initialExpr = vervang(bucket.initialExpr)
      if (!aangeraakt.includes(bucket.id)) aangeraakt.push(bucket.id)
    }
    if (bucket.maxExpr && dependencies(bucket.maxExpr).params.includes(paramId)) {
      bucket.maxExpr = vervang(bucket.maxExpr)
      if (!aangeraakt.includes(bucket.id)) aangeraakt.push(bucket.id)
    }
  }
  return aangeraakt
}

/**
 * Haalt een vermenigvuldiging met een vaste factor uit een formule weg, zoals
 * de 10.000 tussen hectare en vierkante meter.
 */
export function removeFactor(expr: Expr, value: number): Expr {
  return transform(expr, (node) => {
    if (node.kind !== 'op' || node.op !== '*') return null
    if (node.right.kind === 'const' && node.right.value === value) return removeFactor(node.left, value)
    if (node.left.kind === 'const' && node.left.value === value) return removeFactor(node.right, value)
    return null
  })
}

/** Haalt een deling door een vaste factor weg, zoals de 1000 tussen mm en m. */
export function removeDivisor(expr: Expr, value: number): Expr {
  return transform(expr, (node) => {
    if (node.kind !== 'op' || node.op !== '/') return null
    if (node.right.kind === 'const' && node.right.value === value) return removeDivisor(node.left, value)
    return null
  })
}

export function containsFactor(expr: Expr, value: number): boolean {
  let gevonden = false
  const zoek = (node: Expr): void => {
    if (node.kind === 'const' && node.value === value) gevonden = true
    if (node.kind === 'op') {
      zoek(node.left)
      zoek(node.right)
    }
    if (node.kind === 'call') node.args.forEach(zoek)
  }
  zoek(expr)
  return gevonden
}

/** Fluxen met een echte formule, in een vaste volgorde. */
export function computedFluxes(model: WaterBalanceModel): Flux[] {
  return model.fluxes.filter((f) => f.definition.kind === 'expr')
}

export function exprOf(flux: Flux): Expr {
  if (flux.definition.kind !== 'expr') throw new Error(`${flux.id} heeft geen formule`)
  return flux.definition.expr
}

export function setExpr(flux: Flux, expr: Expr): void {
  flux.definition = { kind: 'expr', expr }
}

/** Posten die het gebied in of uit gaan. */
export function externalFluxes(model: WaterBalanceModel): Flux[] {
  return model.fluxes.filter((f) => f.from.kind === 'extern' || f.to.kind === 'extern')
}

/** Posten die water van de ene bak naar de andere brengen. */
export function routingFluxes(model: WaterBalanceModel): Flux[] {
  return model.fluxes.filter((f) => f.from.kind === 'bucket' && f.to.kind === 'bucket')
}

export function fluxLabel(flux: Flux): string {
  return `${flux.label} (${flux.symbol})`
}

/**
 * Posten die in dit model echt water verzetten. Een fout in een post die het
 * hele jaar nul is, verandert geen enkel getal in het bestand; daar valt niets
 * aan te vinden en dus ook niets van te leren.
 */
export function significantFluxes(
  model: WaterBalanceModel,
  kandidaten: Flux[],
  minAandeel = 0.01,
): Flux[] {
  let result
  try {
    result = solve(model)
  } catch {
    return kandidaten
  }
  const schaal = Math.max(result.system.inflow, 1)
  const zichtbaar = kandidaten.filter((flux) => Math.abs(result.totals[flux.id] ?? 0) / schaal >= minAandeel)
  return zichtbaar.length > 0 ? zichtbaar : kandidaten
}

/**
 * Bakken waarvan de berging in de loop van de tijd echt verandert. Een bak die
 * altijd op hetzelfde niveau staat, merkt niets van een ingreep in zijn
 * bergingscapaciteit; daar valt dus ook niets aan te ontdekken.
 */
export function bucketsWithStorage(model: WaterBalanceModel): WaterBalanceModel['buckets'] {
  let result
  try {
    result = solve(model)
  } catch {
    return model.buckets
  }
  return model.buckets.filter((bucket) => {
    const balans = result.balances[bucket.id]
    if (!balans) return false
    const schaal = Math.max(balans.inflow, 1)
    return (balans.maxStorage - balans.minStorage) / schaal > 0.01
  })
}
