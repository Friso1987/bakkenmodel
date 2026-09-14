import { roundTo } from '../core/rng'
import { findInput } from '../core/model'
import type { ErrorDef } from './types'

/**
 * SCH-05: een jaargemiddelde in plaats van het werkelijke verloop. Elke maand
 * krijgt dezelfde waarde. Het jaartotaal klopt nog, maar juist de vraag waar
 * het om gaat, wanneer de belasting het grootst is, kan het model niet meer
 * beantwoorden.
 */
export const SCH_05: ErrorDef = {
  code: 'SCH-05',
  layer: 3,
  label: 'Jaargemiddelde in plaats van het verloop',
  description: 'Een reeks is vervangen door zijn jaargemiddelde, terwijl de vraag over pieken gaat.',
  applies: (model) => model.inputs.some((input) => varieert(model.timeseries.values[input.id])),

  apply: (model, rng) => {
    const reeks = rng.pick(model.inputs.filter((input) => varieert(model.timeseries.values[input.id])))
    const waarden = model.timeseries.values[reeks.id]!
    const gemiddelde = roundTo(waarden.reduce((a, b) => a + b, 0) / waarden.length, reeks.decimals ?? 0)
    model.timeseries.values[reeks.id] = waarden.map(() => gemiddelde)
    return {
      primary: reeks.id,
      touched: [reeks.id],
      detail: `${reeks.label} staat in elke maand op het jaargemiddelde van ${gemiddelde}.`,
    }
  },

  explain: (model, applied) => {
    const reeks = findInput(model, applied.primary)
    const label = reeks?.label ?? applied.primary
    return {
      wat: `${label} heeft in elke maand dezelfde waarde: het jaargemiddelde. Het werkelijke verloop over het jaar is eruit verdwenen.`,
      waarom:
        'Het jaartotaal blijft kloppen, maar de vraag gaat over wanneer de belasting het grootst is. Een gemiddelde kent geen natte winter en geen droge zomer, dus precies de informatie die je nodig hebt is weggemiddeld.',
      gevolg:
        'Het model laat geen enkele piek meer zien. Een maatregel die op deze uitkomst wordt gedimensioneerd, is in de natte maanden te krap.',
      ankers: [
        `${label} is in alle maanden gelijk; dat kan bij een meetreeks niet.`,
        'Met een jaargemiddelde kun je geen vraag over pieken of over droogte beantwoorden.',
        'Het jaartotaal klopt nog wel, dus de fout zit in de verdeling over de maanden en niet in de hoeveelheid.',
      ],
    }
  },
}

function varieert(waarden: number[] | undefined): boolean {
  if (!waarden || waarden.length < 3) return false
  return Math.max(...waarden) - Math.min(...waarden) > 1e-9
}
