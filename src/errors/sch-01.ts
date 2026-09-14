import { con, div } from '../core/expr'
import { getFlux } from '../core/model'
import { computedFluxes, exprOf, setExpr, significantFluxes } from './helpers'
import type { ErrorDef } from './types'

/** Gemiddeld aantal dagen in een maand. */
const DAGEN_PER_MAAND = 30

/**
 * SCH-01: tijdstapmismatch. Eén post is per dag uitgerekend, de rest per maand.
 * De getallen staan gewoon bij elkaar in dezelfde kolom, maar ze gaan over
 * verschillende perioden en mogen dus niet opgeteld worden.
 */
export const SCH_01: ErrorDef = {
  code: 'SCH-01',
  layer: 3,
  label: 'Tijdstapmismatch',
  description: 'Eén post is per dag berekend terwijl de rest van de balans per maand gaat.',
  // In het diagram staan alleen jaartotalen; daar valt een tijdstap niet aan af te lezen.
  layouts: ['B', 'C'],
  applies: (model) => model.timeseries.step === 'maand' && computedFluxes(model).length > 1,

  apply: (model, rng) => {
    const doel = rng.pick(significantFluxes(model, computedFluxes(model), 0.03))
    setExpr(doel, div(exprOf(doel), con(DAGEN_PER_MAAND, `${DAGEN_PER_MAAND} dagen/maand`)))
    doel.unit = 'm3/dag'
    return {
      primary: doel.id,
      touched: [doel.id],
      detail: `${doel.label} staat als daggemiddelde in de maandbalans.`,
    }
  },

  explain: (model, applied) => {
    const flux = getFlux(model, applied.primary)
    return {
      wat: `${flux.label} is per dag uitgerekend en staat in m³/dag, terwijl alle andere posten maandsommen in m³/maand zijn.`,
      waarom:
        'Een balans telt hoeveelheden over dezelfde periode bij elkaar op. Een daggemiddelde en een maandsom zijn niet dezelfde grootheid; ze optellen is hetzelfde als appels bij peren tellen.',
      gevolg: `${flux.label} telt ongeveer dertig keer te licht mee, en de balans klopt daardoor niet meer, hoe netjes de sommen er ook uitzien.`,
      ankers: [
        'De eenheid van deze post is m³/dag, terwijl de rest van de tabel in m³/maand staat.',
        'Posten met verschillende tijdstappen mogen niet in dezelfde balans opgeteld worden.',
        'Vermenigvuldig de dagwaarde met het aantal dagen in de maand voordat je hem meetelt.',
      ],
    }
  },
}
