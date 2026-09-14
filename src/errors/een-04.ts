import { dependencies, transform, type Expr } from '../core/expr'
import { findAssumption, type WaterBalanceModel } from '../core/model'
import type { ErrorDef } from './types'

/**
 * EEN-04: een debiet in l/s wordt behandeld als een volume in m3.
 *
 * Vraagt om een model met een post in l/s. In een stadswijk zonder gemaal-
 * capaciteit komt die niet voor; daar valt deze code buiten de selectie.
 */
export const EEN_04: ErrorDef = {
  code: 'EEN-04',
  layer: 1,
  label: 'debiet en volume verwisseld',
  description: 'Een debiet in l/s wordt zonder omrekening als een volume gebruikt.',
  // De fout zit in een formule; een diagram toont alleen totalen.
  layouts: ['B', 'C'],
  applies: (model) => model.assumptions.some((a) => a.unit === 'l/s'),

  apply: (model, rng) => {
    const parameter = rng.pick(model.assumptions.filter((a) => a.unit === 'l/s'))
    // De parameter zelf blijft ongemoeid; alleen de formules die hem gebruiken
    // veranderen. De sleutel wijst wel naar de parameter, want daar begint het.
    const aangeraakt: string[] = []

    // De omrekening van l/s naar m3 per tijdstap valt weg: het debiet blijft
    // als kaal getal in de formule staan.
    for (const flux of model.fluxes) {
      if (flux.definition.kind !== 'expr') continue
      if (!dependencies(flux.definition.expr).params.includes(parameter.id)) continue
      flux.definition.expr = stripConversion(flux.definition.expr, parameter.id)
      aangeraakt.push(flux.id)
    }

    return {
      // De sleutel wijst naar de post waar de omrekening ontbreekt, niet naar de
      // parameter zelf: daar is de fout te zien en na te rekenen.
      primary: aangeraakt[0] ?? parameter.id,
      touched: aangeraakt,
      detail: `${parameter.label} staat in l/s en wordt in ${aangeraakt.length} post(en) gebruikt alsof het een volume in m³ is.`,
    }
  },

  explain: (model, applied) => {
    const parameter = debietParameter(model, applied.primary)
    const flux = model.fluxes.find((f) => f.id === applied.primary)
    return {
      wat:
        `${parameter.label} is een debiet in l/s, maar komt in ${flux ? `de formule van ${flux.label}` : 'de balans'} ` +
        'terecht als een hoeveelheid in m³.',
      waarom:
        'Een debiet is een hoeveelheid per tijd. Om er een volume van te maken moet je met de duur van de tijdstap vermenigvuldigen, en van liters naar kubieke meters delen door 1000.',
      gevolg:
        'De post staat er met een getal in dat niets met de werkelijke hoeveelheid water te maken heeft. De orde van grootte klopt niet meer.',
      ankers: [
        'De eenheid l/s is een debiet en geen volume; er ontbreekt een vermenigvuldiging met de tijdsduur.',
        'Van liters naar kubieke meters hoort een deling door 1000.',
        'Reken na: een gemaal van een paar honderd l/s verzet in een maand honderdduizenden m³, niet een paar honderd.',
      ],
    }
  },
}

/** De parameter in l/s die deze post gebruikt. */
function debietParameter(model: WaterBalanceModel, fluxId: string) {
  const flux = model.fluxes.find((f) => f.id === fluxId)
  const gebruikt =
    flux && flux.definition.kind === 'expr' ? dependencies(flux.definition.expr).params : []
  const viaFormule = model.assumptions.find((a) => a.unit === 'l/s' && gebruikt.includes(a.id))
  return viaFormule ?? findAssumption(model, fluxId) ?? model.assumptions.find((a) => a.unit === 'l/s')!
}

/** Haalt de omrekening l/s naar m3 per tijdstap weg rond een parameter. */
function stripConversion(expr: Expr, paramId: string): Expr {
  return transform(expr, (node) => {
    if (node.kind !== 'op') return null
    const raaktParameter = dependencies(node).params.includes(paramId)
    if (!raaktParameter) return null
    if (node.op === '/' && node.right.kind === 'const' && node.right.value === 1000) {
      return stripConversion(node.left, paramId)
    }
    if (node.op === '*' && node.right.kind === 'const' && node.right.value >= 3600) {
      return stripConversion(node.left, paramId)
    }
    if (node.op === '*' && node.left.kind === 'const' && node.left.value >= 3600) {
      return stripConversion(node.right, paramId)
    }
    return null
  })
}
