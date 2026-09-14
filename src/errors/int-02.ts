import type { ErrorDef } from './types'

const VRAGEN = [
  'Hoeveel water staat er op straat bij een bui van 60 mm in één uur, en waar blijft dat het langst staan?',
  'Hoe lang duurt het bij een piekbui voordat het water weer weg is, en welke straten lopen als eerste onder?',
  'Wat gebeurt er tijdens een hoosbui van een half uur, en is de afvoercapaciteit op dat moment toereikend?',
]

/**
 * INT-02: het model beantwoordt de gestelde vraag niet. De vraag gaat over een
 * bui van een uur, het model rekent maandsommen. Alles in het model klopt; het
 * gaat alleen over iets anders.
 */
export const INT_02: ErrorDef = {
  code: 'INT-02',
  layer: 5,
  label: 'Model beantwoordt de vraag niet',
  description: 'De vraag gaat over een piekbui, het model rekent een jaarbalans in maanden.',
  applies: (model) => model.timeseries.step === 'maand',

  apply: (model, rng) => {
    model.conclusion.question = rng.pick(VRAGEN)
    return {
      primary: 'conclusie',
      touched: ['conclusie'],
      detail: 'De vraag gaat over een piekbui, terwijl het model met maandsommen rekent.',
    }
  },

  explain: (model) => ({
    wat: `De vraag boven het model gaat over wat er tijdens een korte, hevige bui gebeurt. Het model rekent met ${model.timeseries.labels.length} maandsommen over een heel jaar.`,
    waarom:
      'Een maandbalans middelt alles uit over dertig dagen. Een bui van een uur is daarin niet te zien, hoe goed de balans verder ook is. Het model is niet fout, het is het verkeerde gereedschap voor deze vraag.',
    gevolg:
      'Elk antwoord dat uit dit model rolt, gaat over iets anders dan er gevraagd is. Wie dat niet in de gaten heeft, onderschat de wateroverlast fors.',
    ankers: [
      'De vraag gaat over een piekbui en het model rekent met maandsommen; die tijdstap past niet bij de vraag.',
      'Voor een vraag over wateroverlast heb je een model met een tijdstap van minuten tot uren nodig.',
      'Het model is op zichzelf in orde, maar beantwoordt de gestelde vraag niet.',
    ],
  }),
}
