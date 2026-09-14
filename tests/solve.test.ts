import { describe, expect, it } from 'vitest'
import { buildModel } from '../src/catalog/contexts/index'
import { add, con, flx, fnMax, mul, ser, stor, sub } from '../src/core/expr'
import {
  bucketRef,
  externRef,
  cloneModel,
  defaultPresentation,
  getFlux,
  type WaterBalanceModel,
} from '../src/core/model'
import { BALANCE_TOLERANCE, SolveError, evaluationOrder, solve, sumOf } from '../src/core/solve'

const SEEDS = Array.from({ length: 40 }, (_, i) => `seed-${i.toString().padStart(2, '0')}`)

function stadWijk(seed = 'test-01'): WaterBalanceModel {
  return buildModel('stad-wijk', seed)
}

describe('solve op foutloze modellen', () => {
  it.each(SEEDS)('de systeembalans sluit binnen 0,1 procent (%s)', (seed) => {
    const result = solve(stadWijk(seed))
    expect(result.system.relResidual).toBeLessThan(BALANCE_TOLERANCE)
    expect(result.system.closes).toBe(true)
  })

  it.each(SEEDS)('elke bak sluit per tijdstap (%s)', (seed) => {
    const model = stadWijk(seed)
    const result = solve(model)
    for (const bucket of model.buckets) {
      const scale = Math.max(result.balances[bucket.id]!.inflow, 1)
      for (let t = 0; t < result.labels.length; t++) {
        let delta = 0
        for (const flux of model.fluxes) {
          if (flux.to.kind === 'bucket' && flux.to.id === bucket.id) delta += result.computed[flux.id]![t]!
          if (flux.from.kind === 'bucket' && flux.from.id === bucket.id) delta -= result.computed[flux.id]![t]!
        }
        const gemeten = result.storageEnd[bucket.id]![t]! - result.storageStart[bucket.id]![t]!
        expect(Math.abs(gemeten - delta) / scale).toBeLessThan(1e-9)
      }
    }
  })

  it.each(SEEDS)('geen bak raakt negatief of komt boven zijn maximum (%s)', (seed) => {
    const model = stadWijk(seed)
    const result = solve(model)
    for (const bucket of model.buckets) {
      const balance = result.balances[bucket.id]!
      expect(balance.minStorage).toBeGreaterThanOrEqual(-1e-6)
      if (bucket.maxStorage !== null) {
        expect(balance.maxStorage).toBeLessThanOrEqual(bucket.maxStorage * (1 + 1e-9) + 1e-6)
      }
    }
  })

  it.each(SEEDS)('een foutloos model levert geen enkele vlag op (%s)', (seed) => {
    expect(solve(stadWijk(seed)).flags).toEqual([])
  })

  it.each(SEEDS)('de hoofduitkomst is positief en gelijk aan de som van de flux (%s)', (seed) => {
    const model = stadWijk(seed)
    const result = solve(model)
    expect(result.main.value).toBeGreaterThan(0)
    expect(result.main.value).toBeCloseTo(sumOf(result.stated['Q_uit']!), 6)
  })

  it('getoonde en berekende waarden zijn gelijk zolang er niets overschreven is', () => {
    const result = solve(stadWijk())
    expect(result.consistency.maxRelDiff).toBe(0)
    expect(result.consistency.fluxId).toBeNull()
    for (const id of Object.keys(result.computed)) {
      expect(result.stated[id]).toEqual(result.computed[id])
    }
  })

  it('is een pure functie: het model verandert niet', () => {
    const model = stadWijk()
    const before = JSON.stringify(model)
    solve(model)
    expect(JSON.stringify(model)).toBe(before)
  })

  it('geeft bij dezelfde invoer tweemaal dezelfde uitkomst', () => {
    const model = stadWijk()
    expect(solve(model)).toEqual(solve(cloneModel(model)))
  })
})

describe('evaluatievolgorde', () => {
  it('zet elke flux na de fluxen waar hij van afhangt', () => {
    const model = stadWijk()
    const order = evaluationOrder(model)
    expect(order).toHaveLength(model.fluxes.length)
    for (const flux of model.fluxes) {
      if (flux.definition.kind !== 'expr') continue
      const index = order.indexOf(flux.id)
      const text = JSON.stringify(flux.definition.expr)
      for (const other of model.fluxes) {
        if (other.id === flux.id) continue
        if (text.includes(`"kind":"flux","id":"${other.id}"`)) {
          expect(order.indexOf(other.id)).toBeLessThan(index)
        }
      }
    }
  })

  it('stopt bij een kringverwijzing in plaats van stilletjes nul te rekenen', () => {
    const model = stadWijk()
    getFlux(model, 'E_water').definition = { kind: 'expr', expr: flx('Q_uit') }
    expect(() => solve(model)).toThrow(SolveError)
  })
})

describe('vlaggen', () => {
  it('meldt een bak zonder uitgang', () => {
    const model = stadWijk()
    model.fluxes = model.fluxes.filter((f) => !['Q_uit', 'Q_in', 'E_water'].includes(f.id))
    model.mainOutcome = {
      id: 'piek',
      label: 'piekberging',
      unit: 'm3',
      decimals: 0,
      kind: 'peakStorage',
      bucketId: 'oppervlaktewater',
    }
    const result = solve(model)
    expect(result.flags.map((f) => f.code)).toContain('bak-zonder-uitgang')
  })

  it('meldt een getoonde waarde die niet uit de formule komt', () => {
    const model = stadWijk()
    const flux = getFlux(model, 'Q_uit')
    const basis = solve(model).computed['Q_uit']!
    flux.statedOverride = basis.map((v) => v * 1.5)
    const result = solve(model)
    expect(result.flags.map((f) => f.code)).toContain('getoonde-waarde-wijkt-af')
    expect(result.consistency.fluxId).toBe('Q_uit')
    expect(result.consistency.maxRelDiff).toBeGreaterThan(0)
    expect(result.main.value).toBeCloseTo(sumOf(basis) * 1.5, 6)
  })

  it('meldt deeloppervlakken die niet optellen tot het totaal', () => {
    const model = stadWijk()
    model.assumptions.find((a) => a.id === 'A_water')!.value += 3
    expect(solve(model).flags.map((f) => f.code)).toContain('oppervlakken-inconsistent')
  })

  it('meldt een negatieve berging', () => {
    const model = stadWijk()
    // Een gemaal dat vijftig keer zoveel uitmaalt als er binnenkomt.
    getFlux(model, 'Q_uit').definition = { kind: 'expr', expr: mul(flx('P_water'), con(50)) }
    const result = solve(model)
    expect(result.flags.map((f) => f.code)).toContain('negatieve-berging')
  })
})

describe('hoofduitkomst', () => {
  it('kan ook de piekberging van een bak zijn', () => {
    const model = stadWijk()
    model.mainOutcome = {
      id: 'piek',
      label: 'piekberging wortelzone',
      unit: 'm3',
      decimals: 0,
      kind: 'peakStorage',
      bucketId: 'wortelzone',
    }
    const result = solve(model)
    const start = result.storageStart['wortelzone']![0]!
    expect(result.main.value).toBeCloseTo(Math.max(...result.storageEnd['wortelzone']!) - start, 6)
  })

  it('kan de grootste maandwaarde van een flux zijn', () => {
    const model = stadWijk()
    model.mainOutcome = {
      id: 'piekafvoer',
      label: 'grootste maandafvoer',
      unit: 'm3/maand',
      decimals: 0,
      kind: 'fluxMax',
      fluxId: 'Q_uit',
    }
    const result = solve(model)
    expect(result.main.value).toBe(Math.max(...result.stated['Q_uit']!))
  })

  it('weigert een verwijzing naar een flux die niet bestaat', () => {
    const model = stadWijk()
    model.mainOutcome = { ...model.mainOutcome, kind: 'fluxTotal', fluxId: 'bestaat-niet' }
    expect(() => solve(model)).toThrow(SolveError)
  })
})

describe('een handgebouwd minimodel', () => {
  it('rekent de bak leeg en weer vol zonder restpost', () => {
    const model: WaterBalanceModel = {
      id: 'mini',
      context: 'stad-wijk',
      seed: 'mini',
      title: 'Minimodel',
      intro: 'Eén bak, één ingang, één uitgang.',
      area: { id: 'A_tot', label: 'oppervlak', value: 1, unit: 'ha' },
      buckets: [{ id: 'bak', label: 'bak', initialStorage: 50, maxStorage: 100, unit: 'm3' }],
      inputs: [{ id: 'P', label: 'neerslag', symbol: 'P', unit: 'mm/maand' }],
      fluxes: [
        {
          id: 'in',
          label: 'aanvoer',
          symbol: 'I',
          from: externRef('buiten', 'buiten'),
          to: bucketRef('bak'),
          unit: 'm3/maand',
          definition: { kind: 'expr', expr: mul(ser('P'), con(10)) },
        },
        {
          id: 'uit',
          label: 'afvoer',
          symbol: 'O',
          from: bucketRef('bak'),
          to: externRef('buiten', 'buiten'),
          unit: 'm3/maand',
          definition: {
            kind: 'expr',
            expr: fnMax(con(0), sub(add(stor('bak'), flx('in')), con(100))),
          },
        },
      ],
      timeseries: { step: 'maand', labels: ['jan', 'feb', 'mrt'], values: { P: [10, 0, 20] } },
      assumptions: [],
      sources: [],
      mainOutcome: { id: 'totaal', label: 'afvoer', unit: 'm3', decimals: 0, kind: 'fluxTotal', fluxId: 'uit' },
      conclusion: { question: 'Hoeveel gaat eruit?', text: 'Genoeg.' },
      presentation: defaultPresentation(),
    }
    const result = solve(model)
    expect(result.computed['in']).toEqual([100, 0, 200])
    expect(result.computed['uit']).toEqual([50, 0, 200])
    expect(result.storageEnd['bak']).toEqual([100, 100, 100])
    expect(result.system.residual).toBeCloseTo(0, 9)
    expect(result.main.value).toBe(250)
  })
})
