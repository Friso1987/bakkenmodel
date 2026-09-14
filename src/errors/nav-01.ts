import { con, dependencies, transform } from '../core/expr'
import { getAssumption, getFlux, type WaterBalanceModel } from '../core/model'
import { computedFluxes, exprOf, setExpr } from './helpers'
import type { ErrorDef } from './types'

/**
 * NAV-01: een hardcoded getal midden in een formule. De uitkomst klopt nog
 * precies, want het getal is gelijk aan de parameter. Maar wie de aanname
 * aanpast, ziet deze post niet meebewegen.
 */
export const NAV_01: ErrorDef = {
  code: 'NAV-01',
  layer: 4,
  label: 'Hardcoded getal in een formule',
  description: 'Een parameter staat als kaal getal in de formule in plaats van als celverwijzing.',
  layouts: ['B', 'C'],
  applies: (model) => kandidaten(model).length > 0,

  apply: (model, rng) => {
    const { flux, parameter } = rng.pick(kandidaten(model))
    const waarde = getAssumption(model, parameter).value
    setExpr(
      flux,
      transform(exprOf(flux), (node) => (node.kind === 'param' && node.id === parameter ? con(waarde) : null)),
    )
    return {
      primary: flux.id,
      touched: [flux.id],
      detail: `${getAssumption(model, parameter).label} staat als getal ${waarde} in de formule van ${flux.label}.`,
    }
  },

  explain: (model, applied) => {
    const flux = getFlux(model, applied.primary)
    return {
      wat: `In de formule van ${flux.label} staat een kaal getal waar een verwijzing naar de aannametabel hoort.`,
      waarom:
        'Een model moet navolgbaar zijn. Staat een aanname op twee plekken, in de tabel en in de formule, dan lopen die twee vroeg of laat uit elkaar. Bij een gevoeligheidsanalyse of een nieuwe versie beweegt deze post niet mee.',
      gevolg:
        'Vandaag klopt de uitkomst nog. Zodra iemand de aanname bijstelt, rekent dit model stilletjes met de oude waarde en is er niets aan te zien.',
      ankers: [
        'Er staat een getal in de formule dat ook in de aannametabel staat; die had een celverwijzing moeten zijn.',
        'Als je de aanname in de tabel verandert, verandert deze post niet mee.',
        'Elke waarde hoort maar op één plek in het model te staan.',
      ],
    }
  },
}

function kandidaten(model: WaterBalanceModel) {
  const uit: Array<{ flux: (typeof model.fluxes)[number]; parameter: string }> = []
  for (const flux of computedFluxes(model)) {
    for (const parameter of dependencies(exprOf(flux)).params) {
      if (model.assumptions.some((a) => a.id === parameter)) uit.push({ flux, parameter })
    }
  }
  return uit
}
