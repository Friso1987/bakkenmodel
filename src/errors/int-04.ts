import { con, flx, mul } from '../core/expr'
import { externRef, getBucket, type Flux, type WaterBalanceModel } from '../core/model'
import { solve } from '../core/solve'
import type { ErrorDef } from './types'

/**
 * INT-04: de maatregel is in de verkeerde bak doorgerekend. Er wordt een kwart
 * van een stroom afgekoppeld, maar niet bij de bak waar de maatregel over gaat.
 * De rekensom zelf klopt; het effect landt alleen op de verkeerde plek.
 */
export const INT_04: ErrorDef = {
  code: 'INT-04',
  layer: 5,
  label: 'Maatregel in de verkeerde bak',
  description: 'Een voorgestelde maatregel is op een andere bak toegepast dan waar hij over gaat.',
  applies: (model) => kandidaten(model) !== null,

  apply: (model, rng) => {
    const keuze = kandidaten(model)!
    const deel = rng.round(0.2, 0.35, 2)
    const bodem = externRef('infiltratie', 'bodem en ondergrond')

    const maatregel: Flux = {
      id: 'maatregel_afkoppelen',
      label: 'afgekoppeld via een wadi',
      symbol: 'Q_wadi',
      from: { kind: 'bucket', id: keuze.verkeerd.id },
      to: bodem,
      unit: keuze.afvoer.unit,
      definition: { kind: 'expr', expr: mul(flx(keuze.afvoer.id), con(deel)) },
      decimals: 0,
      note: 'Maatregel: een deel van de afvoer gaat naar een wadi in plaats van naar het oppervlaktewater.',
    }
    model.fluxes.push(maatregel)

    model.conclusion.template =
      `${model.conclusion.template ?? ''} In deze balans is de voorgestelde maatregel verwerkt: ` +
      `een ${Math.round(deel * 100)} procent van de afvoer van ${keuze.bedoeld.label} wordt afgekoppeld naar een wadi.`

    return {
      primary: maatregel.id,
      touched: [maatregel.id, 'conclusie'],
      detail: `De maatregel hoort bij ${keuze.bedoeld.label}, maar hangt aan ${keuze.verkeerd.label}.`,
    }
  },

  explain: (model, applied) => {
    const maatregel = model.fluxes.find((f) => f.id === applied.primary)
    const bak = maatregel?.from.kind === 'bucket' ? getBucket(model, maatregel.from.id) : null
    return {
      wat: `De maatregel uit de conclusie, het afkoppelen naar een wadi, is in de balans opgevoerd bij ${bak?.label ?? 'een andere bak'} dan waar de maatregel over gaat.`,
      waarom:
        'Een maatregel grijpt aan op een bepaalde plek in het systeem. Afkoppelen haalt water weg bij het verharde oppervlak, niet bij de bodem of het oppervlaktewater. Reken je het effect ergens anders in, dan klopt de som wel maar het verhaal niet.',
      gevolg:
        'Het berekende effect van de maatregel is niet het effect dat je in werkelijkheid krijgt. Het advies belooft iets dat de maatregel niet gaat waarmaken.',
      ankers: [
        `De maatregel is verwerkt bij ${bak?.label ?? 'de verkeerde bak'}, terwijl de conclusie over een andere bak gaat.`,
        'Ga na op welke bak de maatregel fysiek aangrijpt en controleer of de post daar staat.',
        'De omvang van de post klopt, maar hij haalt water weg op de verkeerde plek in de balans.',
      ],
    }
  },
}

/** Verdamping is geen afvoerpost waar je iets van kunt afkoppelen. */
function isVerdamping(flux: Flux): boolean {
  return flux.to.kind === 'extern' && flux.to.id === 'atmosfeer'
}

/**
 * De maatregel hoort bij de bak met de grootste doorstroom. Hij wordt
 * opgehangen aan een andere bak die ook een doorstroompost heeft.
 */
function kandidaten(model: WaterBalanceModel) {
  if (model.fluxes.some((f) => f.id === 'maatregel_afkoppelen')) return null
  let uitkomst
  try {
    uitkomst = solve(model)
  } catch {
    return null
  }

  // Posten die water uit een bak wegvoeren, van groot naar klein. De maatregel
  // hoort bij de grootste; hij wordt aan een andere bak opgehangen.
  const afvoerposten = model.fluxes.filter((f) => f.from.kind === 'bucket' && !isVerdamping(f))
  if (afvoerposten.length < 2) return null

  const gesorteerd = [...afvoerposten].sort(
    (a, b) => (uitkomst.totals[b.id] ?? 0) - (uitkomst.totals[a.id] ?? 0),
  )
  const grootste = gesorteerd[0]!
  const andere = gesorteerd.find(
    (f) => f.from.kind === 'bucket' && grootste.from.kind === 'bucket' && f.from.id !== grootste.from.id,
  )
  if (!andere || andere.from.kind !== 'bucket' || grootste.from.kind !== 'bucket') return null

  return {
    bedoeld: getBucket(model, grootste.from.id),
    verkeerd: getBucket(model, andere.from.id),
    afvoer: andere,
  }
}
