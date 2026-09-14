import { add, ser } from '../core/expr'
import { getFlux, labelOf } from '../core/model'
import { computedFluxes, exprOf, setExpr } from './helpers'
import type { ErrorDef } from './types'

/**
 * EEN-01: een hoeveelheid in mm wordt bij een volume in m3 opgeteld.
 *
 * De post krijgt er een term bij die nooit door het oppervlak is gegaan. Het
 * getal is klein ten opzichte van de rest, dus de uitkomst schuift maar een
 * beetje op; juist daarom is het een goede oefening.
 */
export const EEN_01: ErrorDef = {
  code: 'EEN-01',
  layer: 1,
  label: 'mm bij m³ opgeteld',
  description: 'Een waarde in millimeters wordt zonder omrekening bij een volume opgeteld.',
  applies: (model) => model.inputs.some((i) => i.unit.startsWith('mm')) && computedFluxes(model).length > 0,

  apply: (model, rng) => {
    const reeks = rng.pick(model.inputs.filter((i) => i.unit.startsWith('mm')))
    // Bij voorkeur een post die zelf al een optelsom is; daar valt een extra
    // term het minst op.
    const somposten = computedFluxes(model).filter((f) => exprOf(f).kind === 'op' || exprOf(f).kind === 'call')
    const doel = rng.pick(somposten.length > 0 ? somposten : computedFluxes(model))
    setExpr(doel, add(exprOf(doel), ser(reeks.id)))
    return {
      primary: doel.id,
      touched: [doel.id],
      detail: `${reeks.label} in ${reeks.unit} is opgeteld bij ${doel.label} in ${doel.unit}.`,
    }
  },

  explain: (model, applied) => {
    const flux = getFlux(model, applied.primary)
    return {
      wat: `In de formule van ${flux.label} staat een term in millimeters opgeteld bij een volume in ${flux.unit}.`,
      waarom:
        'Millimeters zijn een waterschijf, geen volume. Pas na vermenigvuldiging met het oppervlak waar die schijf op valt, ontstaat er een hoeveelheid water die je bij een ander volume mag optellen.',
      gevolg: `${labelOf(model, applied.primary)} komt te hoog uit, en daarmee ook alles wat daarvan afhangt. De fout is klein in getal en groot in principe.`,
      ankers: [
        'Er wordt een getal in mm bij een getal in m³ opgeteld; dat mag niet zonder eerst met het oppervlak te vermenigvuldigen.',
        'De term mist de vermenigvuldiging met het oppervlak en de deling door 1000.',
        'Controleer de eenheden per term: links en rechts van het plusteken staat niet dezelfde grootheid.',
      ],
    }
  },
}
