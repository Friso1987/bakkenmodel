import { labelOf, type WaterBalanceModel } from '../core/model'
import { dropFluxReferences, externalFluxes, fluxLabel, significantFluxes } from './helpers'
import type { ErrorDef } from './types'

/**
 * STR-01: een term ontbreekt in de balans.
 *
 * Er verdwijnt een post die het gebied in of uit gaat: kwel in een polder,
 * verdamping van open water in een wijk. De balans lijkt daarna gewoon te
 * sluiten, want alles wat er nog in staat klopt onderling. Dat maakt het een
 * lastige: je moet weten welke posten er hóren te zijn.
 */
export const STR_01: ErrorDef = {
  code: 'STR-01',
  layer: 2,
  label: 'Ontbrekende term in de balans',
  description: 'Een post die het gebied in of uit gaat, is weggelaten.',
  applies: (model) => kandidaten(model).length > 0,

  apply: (model, rng) => {
    const doel = rng.pick(kandidaten(model))
    const label = fluxLabel(doel)
    const meeveranderd = dropFluxReferences(model, doel.id)
    model.fluxes = model.fluxes.filter((f) => f.id !== doel.id)
    return {
      primary: doel.id,
      touched: [doel.id, ...meeveranderd],
      detail: `${label} is uit de balans verdwenen.`,
    }
  },

  explain: (model, applied) => {
    const label = applied.detail.split(' is uit')[0] ?? labelOf(model, applied.primary)
    return {
      wat: `${label} komt in dit model helemaal niet voor, terwijl die post in dit gebied wel degelijk water aan- of afvoert.`,
      waarom:
        'Een waterbalans moet compleet zijn. Zodra er een post ontbreekt, sluit de balans nog steeds keurig, maar dan op een gebied dat niet bestaat.',
      gevolg:
        'De uitkomst is systematisch scheef: alles wat de ontbrekende post had moeten aan- of afvoeren, komt nu op het conto van de posten die er wel staan.',
      ankers: [
        `${label} ontbreekt in de balans, terwijl die post in dit gebied hoort voor te komen.`,
        'Een sluitende balans is geen bewijs van een complete balans: controleer of alle posten benoemd zijn.',
        'Loop de bakken langs en vraag per bak: waar komt het water vandaan en waar gaat het heen?',
      ],
    }
  },
}

/**
 * Alleen posten naar of van de buitenwereld, en nooit de post waar de
 * hoofduitkomst op staat. Een bak helemaal zonder uitgang achterlaten is
 * STR-05, niet deze code.
 */
function kandidaten(model: WaterBalanceModel) {
  const hoofdflux = model.mainOutcome.kind === 'peakStorage' ? null : model.mainOutcome.fluxId
  const bruikbaar = externalFluxes(model).filter((flux) => {
    if (flux.id === hoofdflux) return false
    const bak = flux.from.kind === 'bucket' ? flux.from.id : flux.to.kind === 'bucket' ? flux.to.id : null
    if (!bak) return false
    const richting = flux.from.kind === 'bucket' ? 'uit' : 'in'
    const overgebleven = model.fluxes.filter(
      (f) =>
        f.id !== flux.id &&
        (richting === 'uit'
          ? f.from.kind === 'bucket' && f.from.id === bak
          : f.to.kind === 'bucket' && f.to.id === bak),
    )
    return overgebleven.length > 0
  })
  return significantFluxes(model, bruikbaar, 0.02)
}
