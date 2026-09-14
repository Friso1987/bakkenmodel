import type { ErrorDef } from './types'

/** Geen fout. Zit in de catalogus zodat een deel van de varianten schoon is. */
export const NUL_00: ErrorDef = {
  code: 'NUL-00',
  layer: 0,
  label: 'Geen fout',
  description: 'Een correct model. De student hoort te concluderen dat er niets mis is.',
  applies: () => true,
  apply: () => ({ primary: '', touched: [], detail: 'Het model is ongewijzigd gebleven.' }),
  explain: () => ({
    wat: 'Er zit geen fout in dit bestand.',
    waarom:
      'Een audit levert niet altijd een vondst op. Wie hier iets "vindt", moet dat net zo goed kunnen onderbouwen als een echte fout.',
    gevolg: 'Het advies dat op dit model gebaseerd wordt, is bruikbaar.',
    ankers: [
      'De balans sluit: in min uit min de verandering van de berging komt op nul uit.',
      'De eenheden kloppen overal: mm wordt via het oppervlak omgerekend naar m³.',
      'Alle posten zitten in de balans en de aannames zijn vastgelegd met een bron.',
    ],
  }),
}
