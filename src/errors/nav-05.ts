import type { ErrorDef } from './types'

/**
 * NAV-05: invoer, berekening en uitvoer staan door elkaar op één tabblad,
 * zonder kopjes. De opmaak-as die alles op één tabblad zet, houdt de secties
 * juist wel netjes uit elkaar; het verschil zit in de ordening.
 */
export const NAV_05: ErrorDef = {
  code: 'NAV-05',
  layer: 4,
  label: 'Invoer, berekening en uitvoer door elkaar',
  description: 'Alles staat ongesorteerd op één tabblad, zonder kopjes.',
  layouts: ['B', 'C'],
  applies: (model) => !model.presentation.interleave,

  apply: (model) => {
    model.presentation.interleave = true
    return {
      primary: 'presentatie',
      touched: ['presentatie'],
      detail: 'De blokken staan door elkaar op één tabblad, zonder kopjes boven de secties.',
    }
  },

  explain: () => ({
    wat: 'Invoergegevens, tussenberekeningen en uitkomsten staan door elkaar op één tabblad, zonder dat ergens staat wat wat is.',
    waarom:
      'Wie een model overneemt, moet als eerste kunnen zien wat de invoer is en wat het resultaat. Lopen die door elkaar, dan is niet te zien welke getallen je mag aanpassen en welke uit een berekening volgen.',
    gevolg:
      'Elke controle kost onnodig veel tijd, en de kans dat iemand een berekende cel overschrijft met een eigen getal is groot.',
    ankers: [
      'Invoer, berekening en uitvoer lopen door elkaar en er staan geen kopjes boven de onderdelen.',
      'Je kunt niet zien welke cellen invoer zijn en welke uit een formule komen.',
      'Zet invoer, berekening en uitvoer in aparte blokken of op aparte tabbladen.',
    ],
  }),
}
