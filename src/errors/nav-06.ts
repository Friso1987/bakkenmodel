import { getFlux } from '../core/model'
import { solve } from '../core/solve'
import { formatNumber } from '../core/units'
import { computedFluxes, significantFluxes } from './helpers'
import type { ErrorDef } from './types'

/**
 * NAV-06: de formule staat er, maar het getoonde getal komt er niet uit.
 *
 * Zo ontstaat dit in het echt: iemand typt een waarde over een formule heen, of
 * plakt een oude uitkomst terug. Excel toont de opgeslagen waarde en rekent pas
 * opnieuw als er iets verandert. De student ziet dus een formule en een getal
 * die niet bij elkaar horen.
 */
export const NAV_06: ErrorDef = {
  code: 'NAV-06',
  layer: 4,
  label: 'Getoonde waarde komt niet uit de formule',
  description: 'De formule staat in de cel, maar het getal dat er staat is een ander.',
  layouts: ['B', 'C'],
  applies: (model) => computedFluxes(model).length > 0,

  apply: (model, rng) => {
    const doel = rng.pick(significantFluxes(model, computedFluxes(model), 0.03))
    const berekend = solve(model).computed[doel.id]!
    const factor = rng.chance(0.5) ? rng.float(1.2, 1.6) : rng.float(0.45, 0.8)
    doel.statedOverride = berekend.map((waarde) => Math.round(waarde * factor))
    return {
      primary: doel.id,
      touched: [doel.id],
      detail: `De cellen van ${doel.label} tonen andere getallen dan hun eigen formule oplevert.`,
    }
  },

  explain: (model, applied) => {
    const flux = getFlux(model, applied.primary)
    const uitkomst = solve(model)
    const eerste = uitkomst.computed[flux.id]?.[0] ?? 0
    const getoond = uitkomst.stated[flux.id]?.[0] ?? 0
    return {
      wat:
        `Bij ${flux.label} staat een formule in de cel, maar het getal dat getoond wordt komt daar niet uit. ` +
        `In ${model.timeseries.labels[0]} geeft de formule ${formatNumber(eerste, 0)} terwijl er ${formatNumber(getoond, 0)} staat.`,
      waarom:
        'Een formule en de waarde in dezelfde cel horen hetzelfde te zijn. Wijken ze af, dan is er een getal overheen getypt of een oude uitkomst teruggeplakt. Het model rekent dan met iets anders dan het laat zien.',
      gevolg:
        'De hele kolom en alles wat daarvan afhangt is onbetrouwbaar. Zodra iemand het bestand laat doorrekenen, verandert de uitkomst zonder dat er iets is aangepast.',
      ankers: [
        'De formule in de cel levert een ander getal op dan er staat; er is overheen getypt.',
        'Reken de formule met de hand na voor één maand; dan zie je het verschil.',
        'Laat het blad opnieuw doorrekenen: de waarde springt, terwijl er niets is veranderd.',
      ],
    }
  },
}
