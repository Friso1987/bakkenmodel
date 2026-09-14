import { roundTo } from '../core/rng'
import { findInput } from '../core/model'
import type { ErrorDef } from './types'

/** Gemiddeld aantal dagen in een maand. */
const DAGEN_PER_MAAND = 30.4

/**
 * EEN-03: een reeks staat in mm/dag, maar de formule rekent hem als mm/maand.
 *
 * De reeks zelf is netjes: alleen de eenheid is een andere dan het model
 * aanneemt. Dat is de fout die je maakt als je een dagreeks overneemt in een
 * maandmodel.
 */
export const EEN_03: ErrorDef = {
  code: 'EEN-03',
  layer: 1,
  label: 'mm/dag niet omgerekend naar mm/maand',
  description: 'Een dagwaarde wordt in een maandbalans gebruikt alsof het een maandsom is.',
  // De eenheid van de reeks staat alleen in een tabel; in het diagram is er niets van te zien.
  layouts: ['B', 'C'],
  applies: (model) =>
    model.timeseries.step === 'maand' && model.inputs.some((i) => i.unit === 'mm/maand'),

  apply: (model, rng) => {
    const reeks = rng.pick(model.inputs.filter((i) => i.unit === 'mm/maand'))
    const waarden = model.timeseries.values[reeks.id]!
    model.timeseries.values[reeks.id] = waarden.map((v) => roundTo(v / DAGEN_PER_MAAND, 1))
    reeks.unit = 'mm/dag'
    reeks.decimals = 1
    return {
      primary: reeks.id,
      touched: [reeks.id],
      detail: `${reeks.label} staat nu als dagwaarde in het bestand, terwijl de formules met maandsommen rekenen.`,
    }
  },

  explain: (model, applied) => {
    const reeks = findInput(model, applied.primary)
    const label = reeks?.label ?? applied.primary
    return {
      wat: `${label} staat in mm/dag, maar wordt in de maandbalans gebruikt alsof het een maandsom is.`,
      waarom:
        'Een maandbalans telt hoeveelheden over een hele maand op. Een dagwaarde moet daarvoor met het aantal dagen van die maand worden vermenigvuldigd, ruim dertig keer zoveel.',
      gevolg: `${label} telt ongeveer dertig keer te licht mee. De balans sluit nog steeds, maar op de verkeerde getallen.`,
      ankers: [
        'De eenheid bij deze reeks is mm/dag, terwijl de tijdstap van het model een maand is.',
        'De reeks moet met het aantal dagen per maand vermenigvuldigd worden voordat hij in de balans mag.',
        'Vergelijk de jaarsom met wat je van een Nederlands klimaat verwacht: die is ongeveer dertig keer te klein.',
      ],
    }
  },
}
