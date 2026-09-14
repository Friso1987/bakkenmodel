import { roundTo } from '../core/rng'
import type { ErrorDef } from './types'

/**
 * SCH-02: de deelgebieden tellen niet op tot het totaal. Elk deelgebied is op
 * zich verdedigbaar, maar samen beschrijven ze een ander gebied dan het totaal
 * dat bovenaan staat.
 */
export const SCH_02: ErrorDef = {
  code: 'SCH-02',
  layer: 3,
  label: 'Oppervlakken inconsistent',
  description: 'De som van de deelgebieden is ongelijk aan het opgegeven totaal.',
  // Het totale oppervlak staat alleen in de aannametabel.
  layouts: ['B', 'C'],
  applies: (model) => model.assumptions.filter((a) => a.role === 'deeloppervlak').length >= 2,

  apply: (model, rng) => {
    const factor = rng.chance(0.5) ? rng.float(1.08, 1.2) : rng.float(0.8, 0.92)
    const oud = model.area.value
    model.area.value = roundTo(oud * factor, model.area.unit === 'ha' ? 1 : 0)
    return {
      primary: model.area.id,
      touched: [model.area.id],
      detail: `Het totale oppervlak staat op ${model.area.value} ${model.area.unit}, terwijl de deelgebieden samen ${roundTo(oud, 1)} ${model.area.unit} zijn.`,
    }
  },

  explain: (model) => {
    const delen = model.assumptions.filter((a) => a.role === 'deeloppervlak')
    const som = roundTo(
      delen.reduce((acc, a) => acc + a.value, 0),
      1,
    )
    return {
      wat: `Het opgegeven ${model.area.label} is ${model.area.value} ${model.area.unit}, maar de deelgebieden samen zijn ${som} ${model.area.unit}.`,
      waarom:
        'De deelgebieden horen het hele gebied te beslaan, zonder overlap en zonder gaten. Zolang die twee niet gelijk zijn, weet je niet welk gebied het model eigenlijk doorrekent.',
      gevolg:
        'Posten die over het totaal gerekend worden en posten die per deelgebied gerekend worden, gaan over verschillende gebieden. De balans lijkt te sluiten, maar op twee verschillende werkelijkheden.',
      ankers: [
        `De deelgebieden tellen op tot ${som} ${model.area.unit} en niet tot het opgegeven totaal.`,
        'Een gebiedsindeling hoort sluitend te zijn: geen overlap en geen gaten.',
        'Tel de oppervlakken in de aannametabel op en vergelijk ze met het totaal dat erboven staat.',
      ],
    }
  },
}
