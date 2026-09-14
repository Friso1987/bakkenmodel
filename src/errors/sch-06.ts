import { findInput } from '../core/model'
import type { ErrorDef } from './types'

const VERWEG = [
  { plaats: 'Vlissingen', afstand: 'ruim honderd kilometer' },
  { plaats: 'Eelde', afstand: 'ruim honderd kilometer' },
  { plaats: 'Maastricht-Beek', afstand: 'ruim honderd kilometer' },
  { plaats: 'Den Helder', afstand: 'ruim honderd kilometer' },
]

/**
 * SCH-06: het neerslagstation ligt buiten het gebied, en het is er ook nog eens
 * maar één. De getallen in het bestand kloppen met de meting; alleen de meting
 * gaat over een ander gebied. Aan de uitkomst is niets te zien, dus deze fout
 * moet uit de bronvermelding komen.
 */
export const SCH_06: ErrorDef = {
  code: 'SCH-06',
  layer: 3,
  label: 'Neerslagstation buiten het gebied',
  description: 'De neerslag komt van één station ver buiten het gebied.',
  // De bron moet zichtbaar zijn; in een diagram staat hij niet.
  layouts: ['B', 'C'],
  applies: (model) =>
    model.inputs.some((input) => input.unit.startsWith('mm') && model.sources.some((s) => s.target === input.id)),

  apply: (model, rng) => {
    const reeks = rng.pick(
      model.inputs.filter(
        (input) => input.unit.startsWith('mm') && model.sources.some((s) => s.target === input.id),
      ),
    )
    const bron = model.sources.find((s) => s.target === reeks.id)!
    const ver = rng.pick(VERWEG)
    bron.reference = `KNMI, maandsommen neerslag station ${ver.plaats}; enig station, ${ver.afstand} van het gebied`
    return {
      primary: reeks.id,
      touched: [bron.id],
      detail: `${reeks.label} komt van station ${ver.plaats}, ${ver.afstand} buiten het gebied.`,
    }
  },

  explain: (model, applied) => {
    const reeks = findInput(model, applied.primary)
    const label = reeks?.label ?? applied.primary
    return {
      wat: `${label} komt van één meetstation dat ver buiten het gebied ligt.`,
      waarom:
        'Neerslag verschilt sterk over korte afstanden, zeker bij buien. Eén station op honderd kilometer afstand zegt weinig over dit gebied, en met één station kun je ook niet interpoleren of controleren.',
      gevolg:
        'De hele balans hangt aan een reeks die over een ander gebied gaat. Er is geen enkele manier om te zien hoe groot die afwijking is, want er is niets om mee te vergelijken.',
      ankers: [
        'Het neerslagstation ligt buiten het gebied; de reeks is niet representatief.',
        'Met één station kun je niet interpoleren en niet controleren; gebruik meerdere stations of de radargegevens.',
        'Aan de getallen in het bestand is niets te zien, dus deze fout vind je alleen in de bronvermelding.',
      ],
    }
  },
}
