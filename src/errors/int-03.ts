import { getFlux } from '../core/model'
import { computedFluxes, significantFluxes } from './helpers'
import type { ErrorDef } from './types'

/**
 * INT-03: schijnnauwkeurigheid. Drie decimalen achter een post die op een
 * geschatte factor rust. Het getal suggereert een precisie die er niet is.
 */
export const INT_03: ErrorDef = {
  code: 'INT-03',
  layer: 5,
  label: 'Schijnnauwkeurigheid',
  description: 'Een geschatte post wordt met drie decimalen gepresenteerd.',
  // Decimalen zijn alleen in de tabellen te zien.
  layouts: ['B', 'C'],
  applies: (model) => computedFluxes(model).length > 0,

  apply: (model, rng) => {
    const doel = rng.pick(significantFluxes(model, computedFluxes(model), 0.03))
    doel.decimals = 3
    model.mainOutcome = { ...model.mainOutcome, decimals: 3 }
    return {
      primary: doel.id,
      touched: [doel.id, model.mainOutcome.id],
      detail: `${doel.label} en de hoofduitkomst staan met drie decimalen in het bestand.`,
    }
  },

  explain: (model, applied) => {
    const flux = getFlux(model, applied.primary)
    return {
      wat: `${flux.label} staat met drie decimalen in het bestand, tot op de liter nauwkeurig.`,
      waarom:
        'De invoer bestaat uit afgeronde maandsommen en geschatte factoren. Een uitkomst kan nooit nauwkeuriger zijn dan de gegevens waar hij op rust. Drie decimalen suggereren een precisie die er niet is.',
      gevolg:
        'De lezer denkt met een exact getal te maken te hebben en gaat er verschillen in zien die er niet zijn. Bij een gevoeligheidsanalyse blijkt de werkelijke marge tientallen procenten.',
      ankers: [
        'De post staat op drie decimalen, terwijl de invoer op hele millimeters is afgerond.',
        'Een uitkomst kan niet nauwkeuriger zijn dan de gegevens waar hij uit volgt.',
        'Rond af op een aantal cijfers dat past bij de onzekerheid in de aannames.',
      ],
    }
  },
}
