import { getAssumption } from '../core/model'
import { roundTo } from '../core/rng'
import { unitLabel } from '../core/units'
import type { ErrorDef } from './types'

/**
 * SCH-04: een parameter staat buiten zijn fysische bereik. Een gewasfactor van
 * 3,5 bestaat niet; klei laat geen zandinfiltratie zien. De formule doet er
 * niets verkeerds mee, dus de fout zit puur in de waarde.
 */
export const SCH_04: ErrorDef = {
  code: 'SCH-04',
  layer: 3,
  label: 'Parameter buiten het fysische bereik',
  description: 'Een parameter heeft een waarde die in de werkelijkheid niet voorkomt.',
  // De parameterwaarden staan alleen in de aannametabel.
  layouts: ['B', 'C'],
  applies: (model) => model.assumptions.some((a) => a.range !== undefined),

  apply: (model, rng) => {
    const parameter = rng.pick(model.assumptions.filter((a) => a.range !== undefined))
    const [, max] = parameter.range!
    const factor = rng.float(2.5, 4)
    const decimalen = parameter.decimals ?? 2
    parameter.value = roundTo(Math.max(max * factor, max + 1), decimalen)
    return {
      primary: parameter.id,
      touched: [parameter.id],
      detail: `${parameter.label} staat op ${parameter.value} ${unitLabel(parameter.unit)}, ruim buiten wat fysisch kan.`,
    }
  },

  explain: (model, applied) => {
    const parameter = getAssumption(model, applied.primary)
    const [min, max] = parameter.range ?? [0, 1]
    return {
      wat: `${parameter.label} staat op ${parameter.value} ${unitLabel(parameter.unit)}. In de praktijk ligt die waarde tussen ongeveer ${min} en ${max} ${unitLabel(parameter.unit)}.`,
      waarom:
        'Een parameter is geen vrije knop. Hij hoort bij een gemeten of afgeleide eigenschap van het gebied, en daar zit een bandbreedte aan. Een waarde erbuiten betekent dat er iets anders mis is: een typefout, een verkeerde eenheid, of een bron die over een ander gebied gaat.',
      gevolg: `De post die met ${parameter.label} rekent, komt ver naast de werkelijkheid uit. Alles wat daarvan afhangt, schuift mee.`,
      ankers: [
        `${parameter.label} van ${parameter.value} ${unitLabel(parameter.unit)} bestaat niet; realistisch is ongeveer ${min} tot ${max}.`,
        'Toets elke parameter aan zijn fysische bandbreedte voordat je de uitkomst gelooft.',
        'De opgegeven bron hoort een waarde binnen het normale bereik te geven; controleer of de bron wel over dit gebied gaat.',
      ],
    }
  },
}
