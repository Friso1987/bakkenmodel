import { describe, expect, it } from 'vitest'
import {
  add,
  con,
  dependencies,
  div,
  evalExpr,
  exprToText,
  flx,
  fnMax,
  fnMin,
  mul,
  par,
  ser,
  stor,
  sub,
  sum,
  transform,
  type EvalContext,
} from '../src/core/expr'

const ctx: EvalContext = {
  param: (id) => ({ a: 10, b: 4 })[id] ?? 0,
  series: (id) => ({ P: 80 })[id] ?? 0,
  flux: (id) => ({ Q: 5 })[id] ?? 0,
  storage: (id) => ({ bak: 100 })[id] ?? 0,
}

describe('evalExpr', () => {
  it('rekent de basisbewerkingen', () => {
    expect(evalExpr(add(con(2), con(3)), ctx)).toBe(5)
    expect(evalExpr(sub(con(2), con(3)), ctx)).toBe(-1)
    expect(evalExpr(mul(con(2), con(3)), ctx)).toBe(6)
    expect(evalExpr(div(con(6), con(3)), ctx)).toBe(2)
  })

  it('leest parameters, reeksen, fluxen en bergingen', () => {
    expect(evalExpr(par('a'), ctx)).toBe(10)
    expect(evalExpr(ser('P'), ctx)).toBe(80)
    expect(evalExpr(flx('Q'), ctx)).toBe(5)
    expect(evalExpr(stor('bak'), ctx)).toBe(100)
  })

  it('kent min en max', () => {
    expect(evalExpr(fnMin(con(3), con(7), con(5)), ctx)).toBe(3)
    expect(evalExpr(fnMax(con(3), con(7), con(5)), ctx)).toBe(7)
  })

  it('geeft nul bij deling door nul in plaats van oneindig', () => {
    expect(evalExpr(div(con(5), con(0)), ctx)).toBe(0)
  })

  it('sum van een lege lijst is nul', () => {
    expect(evalExpr(sum([]), ctx)).toBe(0)
    expect(evalExpr(sum([con(1), con(2), con(3)]), ctx)).toBe(6)
  })
})

describe('dependencies', () => {
  it('verzamelt elk verwijzingstype zonder dubbelingen', () => {
    const expr = add(mul(par('a'), ser('P')), fnMax(flx('Q'), add(stor('bak'), par('a'))))
    expect(dependencies(expr)).toEqual({
      params: ['a'],
      series: ['P'],
      fluxes: ['Q'],
      storages: ['bak'],
    })
  })
})

describe('transform', () => {
  it('vervangt knopen en laat het origineel ongemoeid', () => {
    const original = mul(ser('P'), con(10000, '10.000 m²/ha'))
    const zonderFactor = transform(original, (node) =>
      node.kind === 'const' && node.value === 10000 ? con(1) : null,
    )
    expect(evalExpr(zonderFactor, ctx)).toBe(80)
    expect(evalExpr(original, ctx)).toBe(800000)
  })
})

describe('exprToText', () => {
  const labels = {
    param: (id: string) => `par:${id}`,
    series: (id: string) => `ser:${id}`,
    flux: (id: string) => `flux:${id}`,
    storage: (id: string) => `berging:${id}`,
  }

  it('gebruikt het label van een omrekenfactor', () => {
    expect(exprToText(mul(ser('P'), con(10000, '10.000 m²/ha')), labels)).toBe('ser:P * 10.000 m²/ha')
  })

  it('zet haakjes waar de voorrang dat vraagt, en nergens anders', () => {
    expect(exprToText(mul(add(con(1), con(2)), con(3)), labels)).toBe('(1 + 2) * 3')
    expect(exprToText(add(mul(con(1), con(2)), con(3)), labels)).toBe('1 * 2 + 3')
    expect(exprToText(sub(con(1), add(con(2), con(3))), labels)).toBe('1 - (2 + 3)')
  })

  it('schrijft functies met puntkomma, zoals in Excel', () => {
    expect(exprToText(fnMax(con(0), flx('Q')), labels)).toBe('MAX(0; flux:Q)')
  })
})
