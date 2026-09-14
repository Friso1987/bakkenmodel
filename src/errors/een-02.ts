import { getFlux } from '../core/model'
import { computedFluxes, containsFactor, exprOf, removeFactor, setExpr } from './helpers'
import type { ErrorDef } from './types'

/**
 * EEN-02: de factor 10.000 tussen hectare en vierkante meter is weggevallen.
 *
 * Deze fout is groot en meteen zichtbaar in de uitkomst, maar in een druk
 * werkblad zie je hem zomaar over het hoofd.
 */
export const EEN_02: ErrorDef = {
  code: 'EEN-02',
  layer: 1,
  label: 'ha versus m², factor 10.000 zoek',
  description: 'Een oppervlak in hectare wordt gebruikt alsof het in vierkante meters staat.',
  // De fout zit in een formule; een diagram toont alleen totalen.
  layouts: ['B', 'C'],
  applies: (model) => computedFluxes(model).some((f) => containsFactor(exprOf(f), 10000)),

  apply: (model, rng) => {
    const kandidaten = computedFluxes(model).filter((f) => containsFactor(exprOf(f), 10000))
    const doel = rng.pick(kandidaten)
    setExpr(doel, removeFactor(exprOf(doel), 10000))
    return {
      primary: doel.id,
      touched: [doel.id],
      detail: `De omrekening van hectare naar vierkante meter ontbreekt in ${doel.label}.`,
    }
  },

  explain: (model, applied) => {
    const flux = getFlux(model, applied.primary)
    return {
      wat: `De formule van ${flux.label} rekent met het oppervlak in hectare, terwijl de rest van de formule vierkante meters verwacht.`,
      waarom:
        'Eén hectare is 10.000 m². Zonder die factor is de post tienduizend keer te klein, terwijl de formule er verder helemaal logisch uitziet.',
      gevolg: `${flux.label} verdwijnt praktisch uit de balans. Elk advies over afvoer of berging dat hierop leunt, is onbruikbaar.`,
      ankers: [
        'De factor 10.000 tussen hectare en vierkante meter ontbreekt in deze formule.',
        'Reken de post met de hand na: de uitkomst is een factor 10.000 kleiner dan hij hoort te zijn.',
        'Vergelijk deze formule met dezelfde post voor een ander deelgebied; daar staat de factor wel.',
      ],
    }
  },
}
