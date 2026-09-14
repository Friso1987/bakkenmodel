/**
 * De docentensleutel. Per variant: bestandsnaam, seed, context, layout,
 * foutcode, laag, celverwijzing, wat er fout is, waarom, gevolg voor het
 * advies, impactklasse en de drie ankerantwoorden.
 *
 * De sleutel wordt uit dezelfde objecten opgebouwd als de werkmap zelf, dus
 * hij kan niet uit de pas gaan lopen met wat er in de bestanden staat.
 */
import { contextLabel } from './catalog/contexts/labels'
import { formatNumber, unitLabel } from './core/units'
import { getError, IMPACT_LABEL, LAYER_LABEL, type ErrorExplanation } from './errors/index'
import type { GeneratedVariant, GenerateSettings } from './generate'
import { LAYOUT_LABEL } from './layout/index'
import { describeStyle } from './style/index'

export type KeyRow = {
  bestand: string
  seed: string
  context: string
  layout: string
  code: string
  laag: string
  cel: string
  wat: string
  waarom: string
  gevolg: string
  impact: string
  afwijking: string
  ankers: string[]
  opmaak: string
}

export function keyRows(variants: GeneratedVariant[]): KeyRow[] {
  return variants.map((variant) => {
    const uitleg = explanationOf(variant)
    const { injected } = variant
    return {
      bestand: variant.fileName,
      seed: variant.seed,
      context: contextLabel(variant.context),
      layout: `${variant.layout} (${LAYOUT_LABEL[variant.layout]})`,
      code: injected.code,
      laag: `${injected.layer} — ${LAYER_LABEL[injected.layer]}`,
      cel: variant.cellRef,
      wat: uitleg.wat,
      waarom: uitleg.waarom,
      gevolg: uitleg.gevolg,
      impact: IMPACT_LABEL[injected.impact],
      afwijking:
        injected.code === 'NUL-00'
          ? '0%'
          : `${(injected.deviation * 100).toFixed(1)}% op ${injected.result.main.label}`,
      ankers: uitleg.ankers,
      opmaak: describeStyle(variant.style),
    }
  })
}

export function explanationOf(variant: GeneratedVariant): ErrorExplanation {
  const uitleg = getError(variant.injected.code).explain(variant.injected.model, variant.injected.applied)
  // De teksten beginnen vaak met een label uit het model, en dat staat in het
  // model met een kleine letter. Aan het begin van een zin hoort een hoofdletter.
  return {
    wat: hoofdletter(uitleg.wat),
    waarom: hoofdletter(uitleg.waarom),
    gevolg: hoofdletter(uitleg.gevolg),
    ankers: uitleg.ankers.map(hoofdletter),
  }
}

function hoofdletter(tekst: string): string {
  return tekst.length === 0 ? tekst : tekst[0]!.toUpperCase() + tekst.slice(1)
}

/** De sleutel als leesbaar markdown-bestand. */
export function keyMarkdown(
  variants: GeneratedVariant[],
  settings: GenerateSettings,
  warnings: string[] = [],
): string {
  const rijen = keyRows(variants)
  const regels: string[] = []

  regels.push('# Docentensleutel bakkenmodellen')
  regels.push('')
  regels.push(`Seed: \`${settings.seed}\`. Met deze seed en dezelfde instellingen komen exact dezelfde bestanden er weer uit.`)
  regels.push('')
  regels.push(`Aantal varianten: ${variants.length}. Contexten: ${settings.contexts.map(contextLabel).join(', ')}.`)
  regels.push('')
  regels.push('Elk studentbestand bevat precies één fout, of geen enkele. De ankerantwoorden hieronder')
  regels.push('zijn formuleringen die je als goed mag rekenen; een student hoeft ze niet letterlijk zo op te schrijven.')
  regels.push('')

  if (warnings.length > 0) {
    regels.push('## Let op')
    regels.push('')
    for (const warning of warnings) regels.push(`- ${warning}`)
    regels.push('')
  }

  regels.push('## Overzicht')
  regels.push('')
  regels.push('| # | bestand | context | layout | code | laag | impact |')
  regels.push('| --- | --- | --- | --- | --- | --- | --- |')
  rijen.forEach((rij, i) => {
    regels.push(
      `| ${i + 1} | \`${rij.bestand}\` | ${rij.context} | ${rij.layout} | ${rij.code} | ${rij.laag.split(' — ')[0]} | ${impactKort(rij.impact)} |`,
    )
  })
  regels.push('')

  regels.push('## Per variant')
  regels.push('')
  rijen.forEach((rij, i) => {
    const variant = variants[i]!
    regels.push(`### ${i + 1}. ${rij.bestand}`)
    regels.push('')
    regels.push(`- **Foutcode:** ${rij.code} — ${variant.injected.label}`)
    regels.push(`- **Laag:** ${rij.laag}`)
    regels.push(`- **Context:** ${rij.context}`)
    regels.push(`- **Layout:** ${rij.layout}`)
    regels.push(`- **Seed van deze variant:** \`${rij.seed}\``)
    regels.push(`- **Celverwijzing:** ${rij.cel}`)
    regels.push(`- **Impact:** ${rij.impact}`)
    if (variant.injected.code !== 'NUL-00') {
      const voor = variant.injected.motherResult.main
      const na = variant.injected.result.main
      regels.push(
        `- **Uitkomst:** ${formatNumber(voor.value, voor.decimals)} ${unitLabel(voor.unit)} zonder fout, ` +
          `${formatNumber(na.value, na.decimals)} ${unitLabel(na.unit)} met fout (${rij.afwijking}).`,
      )
    }
    regels.push(`- **Opmaak:** ${rij.opmaak}`)
    regels.push('')
    regels.push(`**Wat er fout is.** ${rij.wat}`)
    regels.push('')
    regels.push(`**Waarom dat een fout is.** ${rij.waarom}`)
    regels.push('')
    regels.push(`**Gevolg voor het advies.** ${rij.gevolg}`)
    regels.push('')
    regels.push('**Ankerantwoorden.**')
    for (const anker of rij.ankers) regels.push(`1. ${anker}`)
    regels.push('')
    if (variant.injected.result.flags.length > 0) {
      regels.push('**Signalen in het bestand.**')
      for (const flag of variant.injected.result.flags) regels.push(`- ${flag.message}`)
      regels.push('')
    }
  })

  return regels.join('\n')
}

function impactKort(impact: string): string {
  return impact.split(' (')[0] ?? impact
}

/** Dezelfde inhoud als platte rijen, voor sleutel.xlsx. */
export function keyTableRows(variants: GeneratedVariant[]): Array<Record<string, string>> {
  return keyRows(variants).map((rij, i) => ({
    nummer: String(i + 1),
    bestand: rij.bestand,
    seed: rij.seed,
    context: rij.context,
    layout: rij.layout,
    foutcode: rij.code,
    laag: rij.laag,
    celverwijzing: rij.cel,
    impact: rij.impact,
    afwijking: rij.afwijking,
    wat: rij.wat,
    waarom: rij.waarom,
    gevolg: rij.gevolg,
    anker1: rij.ankers[0] ?? '',
    anker2: rij.ankers[1] ?? '',
    anker3: rij.ankers[2] ?? '',
    opmaak: rij.opmaak,
  }))
}
