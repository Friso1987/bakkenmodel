/**
 * De planning: welke variant krijgt welke fout, welke context en welke layout.
 *
 * Bewust los van het renderen. De UI heeft deze module nodig bij elke
 * toetsaanslag, om meteen te kunnen waarschuwen bij een onmogelijke
 * combinatie. ExcelJS wordt hier niet aangeraakt, zodat die pas geladen wordt
 * als er echt bestanden gemaakt worden.
 */
import { contextIds } from './catalog/contexts/index'
import type { ContextId } from './core/model'
import { createRng } from './core/rng'
import { ERRORS, errorsForContext, getError } from './errors/index'
import { LAYOUTS, type LayoutId } from './layout/index'
import type { StyleVariation } from './style/index'

export type LayoutMix = LayoutId | 'gemengd'

export type GenerateSettings = {
  contexts: ContextId[]
  /** Gekozen foutcodes, NUL-00 hoeft er niet bij te staan. */
  codes: string[]
  /** Optioneel: een vast aantal per foutcode. Overschrijft de verdeling. */
  counts?: Record<string, number>
  /** Totaal aantal varianten, inclusief de foutloze. */
  total: number
  /** Aandeel foutloze varianten, 0 tot 1. */
  nulShare: number
  layouts: LayoutMix
  variation: StyleVariation
  seed: string
}

export function defaultSettings(seed: string): GenerateSettings {
  return {
    contexts: contextIds(),
    codes: ERRORS.filter((e) => e.code !== 'NUL-00').map((e) => e.code),
    total: 8,
    nulShare: 0.25,
    layouts: 'gemengd',
    variation: 'hoog',
    seed,
  }
}

export type PlannedVariant = {
  index: number
  code: string
  context: ContextId
  layout: LayoutId
  seed: string
}

export type GenerationPlan = {
  variants: PlannedVariant[]
  warnings: string[]
}



/**
 * Verdeelt de varianten over codes, contexten en layouts. Codes die in geen
 * enkele gekozen context passen, komen als waarschuwing terug in plaats van
 * stilletjes te verdwijnen.
 */
export function planGeneration(settings: GenerateSettings): GenerationPlan {
  const warnings: string[] = []
  const contexts = settings.contexts.length > 0 ? settings.contexts : contextIds()

  const passendeContexten = new Map<string, ContextId[]>()
  for (const code of [...settings.codes, 'NUL-00']) {
    const passend = contexts.filter((context) =>
      errorsForContext(context, settings.seed).some((e) => e.code === code),
    )
    passendeContexten.set(code, passend)
    if (passend.length === 0) {
      warnings.push(
        `${code} (${getError(code).label}) past niet in de gekozen contexten en is overgeslagen.`,
      )
    }
  }

  // Niet elke fout is in elke layout te zien: een fout in een formule valt weg
  // in een diagram. De catalogus geeft per code aan welke layouts werken.
  const toegestaneLayouts = new Map<string, LayoutId[]>()
  for (const code of [...settings.codes, 'NUL-00']) {
    const gevraagd = settings.layouts === 'gemengd' ? LAYOUTS : [settings.layouts]
    const mogelijk = getError(code).layouts ?? LAYOUTS
    const overlap = gevraagd.filter((layout) => mogelijk.includes(layout))
    toegestaneLayouts.set(code, overlap)
    if (overlap.length === 0) {
      warnings.push(
        `${code} (${getError(code).label}) is niet zichtbaar in de gekozen layout en is overgeslagen. ` +
          `Deze fout vraagt om layout ${mogelijk.join(' of ')}.`,
      )
    }
  }

  const bruikbaar = settings.codes.filter(
    (code) => (passendeContexten.get(code) ?? []).length > 0 && (toegestaneLayouts.get(code) ?? []).length > 0,
  )
  if (bruikbaar.length === 0 && settings.nulShare < 1) {
    warnings.push('Geen enkele gekozen foutcode past bij de gekozen contexten; er komen alleen foutloze modellen uit.')
  }

  const rng = createRng(`${settings.seed}:plan`)
  // Bij een kleine partij is er niet voor elke aangevinkte code plek. De
  // volgorde wordt daarom geloot, zodat het niet altijd de eerste codes uit de
  // catalogus zijn die aan bod komen.
  const aantallen = verdeel(settings, rng.shuffle(bruikbaar))

  const varianten: PlannedVariant[] = []
  let index = 0
  for (const [code, aantal] of aantallen) {
    const mogelijk = passendeContexten.get(code) ?? []
    if (mogelijk.length === 0) continue
    for (let i = 0; i < aantal; i++) {
      const context = mogelijk[(index + i) % mogelijk.length]!
      varianten.push({
        index: index + i,
        code,
        context,
        layout: rng.pick(toegestaneLayouts.get(code) ?? LAYOUTS),
        seed: `${settings.seed}-${String(index + i + 1).padStart(2, '0')}`,
      })
    }
    index += aantal
  }

  // Door elkaar, zodat de volgorde van de bestanden niets over de fout verraadt.
  const gemengd = rng.shuffle(varianten).map((variant, i) => ({ ...variant, index: i }))
  return { variants: gemengd, warnings }
}

function verdeel(settings: GenerateSettings, bruikbaar: string[]): Array<[string, number]> {
  const totaal = Math.max(1, Math.round(settings.total))

  if (settings.counts && Object.keys(settings.counts).length > 0) {
    const uit: Array<[string, number]> = []
    for (const [code, aantal] of Object.entries(settings.counts)) {
      if (aantal > 0) uit.push([code, Math.round(aantal)])
    }
    return uit
  }

  const nul = Math.min(totaal, Math.round(totaal * clamp(settings.nulShare, 0, 1)))
  const rest = totaal - nul
  const uit: Array<[string, number]> = []

  if (bruikbaar.length > 0 && rest > 0) {
    const basis = Math.floor(rest / bruikbaar.length)
    let over = rest - basis * bruikbaar.length
    for (const code of bruikbaar) {
      const extra = over > 0 ? 1 : 0
      over -= extra
      const aantal = basis + extra
      if (aantal > 0) uit.push([code, aantal])
    }
  }
  if (nul > 0) uit.push(['NUL-00', nul])
  if (uit.length === 0) uit.push(['NUL-00', totaal])
  return uit
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

