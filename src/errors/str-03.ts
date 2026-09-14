import { getBucket } from '../core/model'
import { bucketsWithStorage, replaceParam } from './helpers'
import type { ErrorDef } from './types'

/**
 * STR-03: de berging is weggelaten. De bak kan niets meer vasthouden, dus alles
 * wat erin komt gaat er in dezelfde tijdstap weer uit. Voor een vraag over
 * droogte of over een piekbui is dat precies het verkeerde model.
 */
/** Bakken met een bergingscapaciteit die in dit model ook echt gevuld raakt. */
function bergingsbakken(model: import('../core/model').WaterBalanceModel) {
  return bucketsWithStorage(model).filter((b) => b.capacityParam !== undefined)
}

export const STR_03: ErrorDef = {
  code: 'STR-03',
  layer: 2,
  label: 'Berging weggelaten, stationair gerekend',
  description: 'Een bak houdt niets meer vast: het model rekent stationair terwijl de vraag dynamisch is.',
  applies: (model) => bergingsbakken(model).length > 0,

  apply: (model, rng) => {
    const bak = rng.pick(bergingsbakken(model))
    const parameter = bak.capacityParam!
    const aangeraakt = replaceParam(model, parameter, 0)

    const aanname = model.assumptions.find((a) => a.id === parameter)
    if (aanname) {
      aanname.value = 0
      aangeraakt.push(aanname.id)
    }
    bak.maxStorage = 0
    delete bak.maxExpr
    if (bak.initialParam) {
      const begin = model.assumptions.find((a) => a.id === bak.initialParam)
      if (begin) {
        begin.value = 0
        aangeraakt.push(begin.id)
      }
      bak.initialStorage = 0
      delete bak.initialExpr
    }

    return {
      primary: bak.id,
      touched: [bak.id, ...aangeraakt],
      detail: `${bak.label} heeft geen bergingscapaciteit meer; alles stroomt in dezelfde tijdstap door.`,
    }
  },

  explain: (model, applied) => {
    const bak = getBucket(model, applied.primary)
    return {
      wat: `${bak.label} houdt in dit model niets vast: de bergingscapaciteit staat op nul, dus wat er binnenkomt gaat er meteen weer uit.`,
      waarom:
        'Juist de berging maakt een bakkenmodel een bakkenmodel. Zonder berging is elke tijdstap los van de vorige, en dat klopt niet met een vraag waarin het weer van vorige maand nog doorwerkt.',
      gevolg: `${bak.label} vlakt niets meer af. Natte perioden komen te scherp door en droge perioden veel te hard, want er is geen voorraad om op te teren.`,
      ankers: [
        `De bergingscapaciteit van ${bak.label} staat op nul, waardoor er geen voorraad meer wordt meegenomen naar de volgende tijdstap.`,
        'Het model rekent stationair terwijl de vraag over een verloop in de tijd gaat.',
        'De eindberging van elke tijdstap is gelijk aan de beginberging; er zit geen dynamiek meer in.',
      ],
    }
  },
}
