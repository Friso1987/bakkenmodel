import { getBucket, type WaterBalanceModel } from '../core/model'
import { dropFluxReferences, fluxLabel } from './helpers'
import type { ErrorDef } from './types'

/**
 * STR-05: een bak zonder uitgang. De post die het water afvoert is er niet,
 * dus de berging loopt op tot boven wat de bak fysiek kan bevatten. Dat is in
 * de bergingskolom te zien, en nergens anders.
 */
export const STR_05: ErrorDef = {
  code: 'STR-05',
  layer: 2,
  label: 'Bak zonder uitgang',
  description: 'Een bak heeft geen afvoer meer, waardoor de berging onbeperkt oploopt.',
  applies: (model) => kandidaten(model).length > 0,

  apply: (model, rng) => {
    const { bak, afvoer } = rng.pick(kandidaten(model))
    const label = fluxLabel(afvoer)
    const meeveranderd = dropFluxReferences(model, afvoer.id)
    model.fluxes = model.fluxes.filter((f) => f.id !== afvoer.id)
    return {
      primary: bak.id,
      // De bak zelf verandert niet; alleen zijn afvoer verdwijnt. De sleutel
      // wijst wel naar de bak, want daar is het gevolg te zien.
      touched: [afvoer.id, ...meeveranderd],
      detail: `${label} is weggehaald, waardoor ${bak.label} geen afvoer meer heeft.`,
    }
  },

  explain: (model, applied) => {
    const bak = getBucket(model, applied.primary)
    return {
      wat: `${bak.label} heeft geen afvoer meer. Alles wat erin komt blijft erin zitten.`,
      waarom:
        'Een bak zonder uitgang kan alleen maar voller worden. Dat is fysiek onmogelijk: op enig moment loopt hij over, infiltreert het water, of stroomt het af.',
      gevolg: `De berging in ${bak.label} loopt tot boven de capaciteit op, en het water dat had moeten doorstromen ontbreekt verderop in de keten.`,
      ankers: [
        `${bak.label} heeft geen uitgaande post; de berging loopt maand na maand op.`,
        'De eindberging komt boven de opgegeven maximale berging uit, wat fysiek niet kan.',
        'Volg het water: wat er in deze bak komt moet ergens heen, en die post staat er niet.',
      ],
    }
  },
}

/** Bakken met een doorstroompost naar een andere bak, en nog een andere uitgang. */
function kandidaten(model: WaterBalanceModel) {
  const paren: Array<{ bak: (typeof model.buckets)[number]; afvoer: (typeof model.fluxes)[number] }> = []
  for (const bak of model.buckets) {
    const uitgaand = model.fluxes.filter((f) => f.from.kind === 'bucket' && f.from.id === bak.id)
    const doorstroom = uitgaand.filter((f) => f.to.kind === 'bucket')
    // Alleen zinvol als de bak iets kan vasthouden; anders valt er niets op te lopen.
    const heeftBerging = bak.maxStorage === null || bak.maxStorage > 0
    if (doorstroom.length === 1 && heeftBerging) {
      paren.push({ bak, afvoer: doorstroom[0]! })
    }
  }
  return paren
}
