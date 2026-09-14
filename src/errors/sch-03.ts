import { dependencies, par, transform } from '../core/expr'
import { getAssumption, getFlux, type WaterBalanceModel } from '../core/model'
import { exprOf, setExpr } from './helpers'
import type { ErrorDef } from './types'

/**
 * SCH-03: een deelgebied is op de verkeerde bak toegepast. Het verharde
 * oppervlak wordt bijvoorbeeld gebruikt voor de verdamping van het groen. De
 * formule klopt van vorm, maar hij staat op het verkeerde stuk grond.
 */
export const SCH_03: ErrorDef = {
  code: 'SCH-03',
  layer: 3,
  label: 'Deeloppervlak op de verkeerde bak',
  description: 'Een post wordt over het oppervlak van een ander deelgebied uitgerekend.',
  applies: (model) => kandidaten(model).length > 0,

  apply: (model, rng) => {
    const { flux, van, naar } = rng.pick(kandidaten(model))
    setExpr(
      flux,
      transform(exprOf(flux), (node) => (node.kind === 'param' && node.id === van ? par(naar) : null)),
    )
    return {
      primary: flux.id,
      touched: [flux.id],
      detail: `${flux.label} rekent met ${getAssumption(model, naar).label} in plaats van met ${getAssumption(model, van).label}.`,
    }
  },

  explain: (model, applied) => {
    const flux = getFlux(model, applied.primary)
    const gebruikt = dependencies(exprOf(flux)).params.find((id) =>
      model.assumptions.some((a) => a.id === id && a.role === 'deeloppervlak'),
    )
    const label = gebruikt ? getAssumption(model, gebruikt).label : 'een ander deelgebied'
    return {
      wat: `${flux.label} wordt uitgerekend over ${label}, terwijl die post bij een ander deel van het gebied hoort.`,
      waarom:
        'Een post geldt voor het oppervlak waar het proces zich afspeelt. Verdamping van gras gaat over het groen, afstroming van daken over het verharde deel. Wissel je die om, dan reken je een bestaand proces door op de verkeerde grond.',
      gevolg:
        'De post krijgt een omvang die niet bij het gebied past. Omdat de rest van de balans wel klopt, komt het verschil ergens anders naar boven en lijkt het daar een probleem.',
      ankers: [
        `${flux.label} verwijst naar het oppervlak van ${label}, en dat hoort hier niet.`,
        'Controleer per post op welk deelgebied het proces zich afspeelt en of de formule dat oppervlak gebruikt.',
        'Vergelijk de formules van vergelijkbare posten; die verwijzen naar een ander oppervlak.',
      ],
    }
  },
}

function kandidaten(model: WaterBalanceModel) {
  const delen = model.assumptions.filter((a) => a.role === 'deeloppervlak').map((a) => a.id)
  if (delen.length < 2) return []

  const uit: Array<{ flux: (typeof model.fluxes)[number]; van: string; naar: string }> = []
  for (const flux of model.fluxes) {
    if (flux.definition.kind !== 'expr') continue
    const gebruikt = dependencies(flux.definition.expr).params.filter((id) => delen.includes(id))
    if (gebruikt.length !== 1) continue
    const van = gebruikt[0]!
    for (const naar of delen) {
      if (naar !== van) uit.push({ flux, van, naar })
    }
  }
  return uit
}
