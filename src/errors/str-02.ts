import { getFlux, type Flux } from '../core/model'
import { externalFluxes, fluxLabel, significantFluxes } from './helpers'
import type { ErrorDef } from './types'

/**
 * STR-02: verkeerd teken. Een ingaande post staat als uitgaand in de balans,
 * of andersom. De post zelf is goed berekend; alleen de richting klopt niet.
 */
export const STR_02: ErrorDef = {
  code: 'STR-02',
  layer: 2,
  label: 'Verkeerd teken',
  description: 'Een ingaande post is als uitgaande post opgevoerd, of omgekeerd.',
  applies: (model) => externalFluxes(model).length > 0,

  apply: (model, rng) => {
    const doel = rng.pick(significantFluxes(model, externalFluxes(model), 0.02))
    const van = doel.from
    doel.from = doel.to
    doel.to = van
    return {
      primary: doel.id,
      touched: [doel.id],
      detail: `${fluxLabel(doel)} loopt nu de verkeerde kant op: ${richting(doel)}.`,
    }
  },

  explain: (model, applied) => {
    const flux = getFlux(model, applied.primary)
    const naarBinnen = flux.to.kind === 'bucket'
    return {
      wat: `${flux.label} staat in dit model als ${naarBinnen ? 'ingaande' : 'uitgaande'} post, terwijl die post het gebied juist ${naarBinnen ? 'verlaat' : 'binnenkomt'}.`,
      waarom:
        'De richting van een post bepaalt zijn teken in de balans. Een verkeerd teken telt dubbel door: de post ontbreekt aan de ene kant en staat er te veel aan de andere kant.',
      gevolg:
        'De uitkomst schuift op met tweemaal de omvang van deze post. Bij een grote post kan het advies daardoor de verkeerde kant op wijzen.',
      ankers: [
        `${flux.label} is in werkelijkheid een ${naarBinnen ? 'uitgaande' : 'ingaande'} post en staat aan de verkeerde kant van de balans.`,
        'Het verkeerde teken telt dubbel door, want de post ontbreekt aan de ene kant en staat te veel aan de andere kant.',
        'Controleer per post of het water het gebied in of uit gaat; verdamping gaat altijd het gebied uit.',
      ],
    }
  },
}

function richting(flux: Flux): string {
  const van = flux.from.kind === 'bucket' ? flux.from.id : flux.from.label
  const naar = flux.to.kind === 'bucket' ? flux.to.id : flux.to.label
  return `van ${van} naar ${naar}`
}
