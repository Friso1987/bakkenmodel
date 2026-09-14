import { dependencies, ser, transform } from '../core/expr'
import { findInput, getFlux, type WaterBalanceModel } from '../core/model'
import { computedFluxes, exprOf, setExpr } from './helpers'
import type { ErrorDef } from './types'

/**
 * NAV-04: een verkeerde celverwijzing die voor de eerste rij toevallig klopt.
 * De formule verwijst niet naar de waarde van deze maand, maar steeds naar die
 * van januari. In de eerste regel is er dus niets aan de hand, en juist daar
 * kijkt iedereen.
 */
export const NAV_04: ErrorDef = {
  code: 'NAV-04',
  layer: 4,
  label: 'Verkeerde celverwijzing',
  description: 'Een formule verwijst in elke rij naar de eerste rij; daar klopt hij toevallig.',
  layouts: ['B', 'C'],
  applies: (model) => kandidaten(model).length > 0,

  apply: (model, rng) => {
    const { flux, reeks } = rng.pick(kandidaten(model))
    setExpr(
      flux,
      transform(exprOf(flux), (node) =>
        node.kind === 'series' && node.id === reeks && node.at === undefined ? ser(reeks, 0) : null,
      ),
    )
    const label = findInput(model, reeks)?.label ?? reeks
    return {
      primary: flux.id,
      touched: [flux.id],
      detail: `${flux.label} gebruikt in elke tijdstap de ${label} van ${model.timeseries.labels[0]}.`,
    }
  },

  explain: (model, applied) => {
    const flux = getFlux(model, applied.primary)
    const eerste = model.timeseries.labels[0] ?? 'de eerste rij'
    return {
      wat: `De formule van ${flux.label} verwijst in elke rij naar de invoer van ${eerste}, in plaats van naar de rij waar hij zelf in staat.`,
      waarom:
        'Een verwijzing die niet meeloopt met de rij is een klassieke fout bij het doorkopiëren van een formule. In de eerste rij klopt hij, dus een steekproef op de bovenste regel merkt er niets van.',
      gevolg: `Elke maand rekent met de waarden van ${eerste}. Het seizoensverloop verdwijnt uit deze post, terwijl de tabel er normaal uitziet.`,
      ankers: [
        `Deze formule verwijst in alle rijen naar de cel van ${eerste}; er ontbreekt een relatieve verwijzing.`,
        'Controleer een formule altijd in een rij in het midden en niet alleen in de eerste rij.',
        'De post verandert niet met het seizoen mee, terwijl de invoer dat wel doet.',
      ],
    }
  },
}

function kandidaten(model: WaterBalanceModel) {
  const uit: Array<{ flux: (typeof model.fluxes)[number]; reeks: string }> = []
  for (const flux of computedFluxes(model)) {
    for (const reeks of dependencies(exprOf(flux)).series) {
      const waarden = model.timeseries.values[reeks]
      // Alleen zinvol als de reeks varieert; anders verandert er niets.
      if (waarden && Math.max(...waarden) - Math.min(...waarden) > 1e-9) uit.push({ flux, reeks })
    }
  }
  return uit
}
