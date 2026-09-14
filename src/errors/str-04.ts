import { add, dependencies, flx } from '../core/expr'
import { getFlux, type Flux, type WaterBalanceModel } from '../core/model'
import { exprOf, setExpr } from './helpers'
import type { ErrorDef } from './types'

/**
 * STR-04: dubbeltelling. Dezelfde stroom staat als twee posten in de balans,
 * onder twee namen. Beide posten zijn op zich goed berekend, dus elke post
 * afzonderlijk doorstaat de controle.
 */
export const STR_04: ErrorDef = {
  code: 'STR-04',
  layer: 2,
  label: 'Dubbeltelling',
  description: 'Dezelfde stroom zit onder twee namen in de balans.',
  applies: (model) => kandidaten(model).length > 0,

  apply: (model, rng) => {
    const { flux, gebruiker } = rng.pick(kandidaten(model))
    const kopie: Flux = {
      ...structuredClone(flux),
      id: `${flux.id}_dubbel`,
      label: alternatieveNaam(flux),
      symbol: `${flux.symbol}*`,
    }
    delete kopie.note

    const index = model.fluxes.findIndex((f) => f.id === flux.id)
    model.fluxes.splice(index + 1, 0, kopie)
    setExpr(gebruiker, add(exprOf(gebruiker), flx(kopie.id)))

    return {
      primary: kopie.id,
      touched: [kopie.id, gebruiker.id],
      detail: `${flux.label} staat er twee keer in: ook als "${kopie.label}".`,
    }
  },

  explain: (model, applied) => {
    const kopie = getFlux(model, applied.primary)
    const origineel = model.fluxes.find((f) => `${f.id}_dubbel` === kopie.id)
    return {
      wat: `${kopie.label} en ${origineel?.label ?? 'de oorspronkelijke post'} zijn dezelfde stroom water, maar staan allebei in de balans.`,
      waarom:
        'Elke hoeveelheid water mag maar één keer meetellen. Twee namen voor dezelfde stroom lijken twee posten, maar het is er één.',
      gevolg:
        'De afvoer wordt te hoog ingeschat en de bak waar het water vandaan komt raakt op papier leeg. Een maatregel die op dit getal wordt gedimensioneerd, wordt te zwaar.',
      ankers: [
        'Deze twee posten hebben dezelfde formule en beschrijven dezelfde stroom; het water wordt dubbel geteld.',
        'Tel de posten per bak op: er gaat meer uit dan er ooit in kan zijn gekomen.',
        'Vergelijk de twee formules: ze verwijzen naar precies dezelfde cellen.',
      ],
    }
  },
}

/** Posten die door een andere post opgeteld worden; alleen daar valt te dubbelen. */
function kandidaten(model: WaterBalanceModel): Array<{ flux: Flux; gebruiker: Flux }> {
  const paren: Array<{ flux: Flux; gebruiker: Flux }> = []
  for (const flux of model.fluxes) {
    for (const gebruiker of model.fluxes) {
      if (gebruiker.id === flux.id || gebruiker.definition.kind !== 'expr') continue
      if (dependencies(gebruiker.definition.expr).fluxes.includes(flux.id)) {
        paren.push({ flux, gebruiker })
      }
    }
  }
  return paren
}

function alternatieveNaam(flux: Flux): string {
  const woorden: Record<string, string> = {
    afstroming: 'afvoer via het riool',
    drainage: 'afvoer via de drains',
    neerslag: 'regenval',
    verdamping: 'verdampingsverlies',
    uitmaling: 'gemaalafvoer',
    inlaat: 'aanvoer van buiten',
    kwel: 'toestroming van onderaf',
  }
  for (const [sleutel, naam] of Object.entries(woorden)) {
    if (flux.label.toLowerCase().includes(sleutel)) return naam
  }
  return `${flux.label}, tweede telling`
}
