import type { ErrorDef } from './types'

/**
 * NAV-02: nergens een eenheid. De getallen kloppen allemaal, maar niemand kan
 * controleren of ze bij elkaar horen.
 *
 * Dit is de enige code die de eenheden uit het bestand haalt. De opmaak-assen
 * verplaatsen ze alleen maar; style/assert.ts bewaakt dat verschil.
 */
export const NAV_02: ErrorDef = {
  code: 'NAV-02',
  layer: 4,
  label: 'Geen eenheden',
  description: 'Nergens in het bestand staat een eenheid bij de getallen.',
  applies: (model) => !model.presentation.hideUnits,

  apply: (model) => {
    model.presentation.hideUnits = true
    return {
      primary: 'presentatie',
      touched: ['presentatie'],
      detail: 'Alle eenheden zijn uit het bestand verdwenen.',
    }
  },

  explain: () => ({
    wat: 'Bij geen enkel getal in dit bestand staat een eenheid: niet in de kolomkoppen, niet in een eigen kolom, en niet achter de waarde.',
    waarom:
      'Zonder eenheid is een getal geen grootheid. Je kunt niet zien of er millimeters of kubieke meters staan, en dus ook niet of de posten bij elkaar opgeteld mogen worden. Een controle is daarmee onmogelijk gemaakt.',
    gevolg:
      'De uitkomst is misschien goed, maar dat kan niemand vaststellen. Voor een model dat een advies moet dragen, is dat hetzelfde als fout.',
    ankers: [
      'Er staan nergens eenheden bij de getallen, dus de balans is niet te controleren.',
      'Zonder eenheden kun je niet zien of posten in mm of in m³ staan en of ze opgeteld mogen worden.',
      'Eenheden horen in de kolomkop, in een eigen kolom of achter de waarde te staan; hier staan ze nergens.',
    ],
  }),
}
