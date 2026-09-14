import { solve } from '../core/solve'
import { formatNumber, unitLabel } from '../core/units'
import type { ErrorDef } from './types'

/**
 * INT-01: de conclusie wordt niet gedekt door de uitkomst. De berekening is
 * goed, maar er staat iets onder dat er niet uit volgt. Dit is de fout die in
 * de praktijk het meeste schade doet, want alleen de conclusie wordt gelezen.
 */
export const INT_01: ErrorDef = {
  code: 'INT-01',
  layer: 5,
  label: 'Conclusie niet gedekt door de uitkomst',
  description: 'De conclusie onder het model volgt niet uit de berekende getallen.',
  applies: (model) => model.conclusion.template !== undefined && !model.conclusion.pinned,

  apply: (model, rng) => {
    const uitkomst = solve(model).main
    const factor = rng.chance(0.5) ? rng.float(0.4, 0.7) : rng.float(1.4, 2.2)
    const beweerd = Math.round(uitkomst.value * factor)
    model.conclusion.pinned = true
    model.conclusion.text =
      `${uitkomst.label[0]!.toUpperCase()}${uitkomst.label.slice(1)} komt uit op ongeveer ` +
      `${formatNumber(beweerd, 0)} ${unitLabel(uitkomst.unit)}. ` +
      (factor < 1
        ? 'De bestaande inrichting kan dat ruimschoots aan; maatregelen zijn niet nodig.'
        : 'Dat is meer dan het systeem aankan; uitbreiding van de capaciteit is onvermijdelijk.')
    return {
      primary: 'conclusie',
      touched: ['conclusie'],
      detail: `De conclusie noemt ${formatNumber(beweerd, 0)} ${unitLabel(uitkomst.unit)}, terwijl het model op ${formatNumber(uitkomst.value, 0)} uitkomt.`,
    }
  },

  explain: (model) => {
    const uitkomst = solve(model).main
    return {
      wat: `De conclusie onder het model noemt een ander getal dan het model zelf berekent; het model komt uit op ${formatNumber(uitkomst.value, uitkomst.decimals)} ${unitLabel(uitkomst.unit)}.`,
      waarom:
        'Een conclusie is geen losse mening. Hij hoort één op één te volgen uit de uitkomst die erboven staat. Wie alleen de conclusie leest, en dat zijn de meeste lezers, krijgt een verkeerd beeld.',
      gevolg:
        'Het advies dat hierop gebaseerd wordt, klopt niet, terwijl de berekening zelf in orde is. Precies daarom is dit zo lastig te vinden: alles klopt behalve de laatste zin.',
      ankers: [
        `De conclusie noemt een ander getal dan de uitkomst van het model (${formatNumber(uitkomst.value, 0)} ${unitLabel(uitkomst.unit)}).`,
        'De strekking van de conclusie volgt niet uit de berekende getallen.',
        'Leg de conclusie naast de uitvoertabel; ze spreken elkaar tegen.',
      ],
    }
  },
}
