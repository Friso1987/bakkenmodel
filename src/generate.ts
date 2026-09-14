/**
 * Van plan naar bestand: model bouwen, fout injecteren, opmaak loten, layout
 * kiezen, renderen.
 *
 *   context -> buildModel() -> injectError() -> pickLayout() + pickStyle() -> render()
 *
 * Alles hangt aan één seed. Dezelfde seed met dezelfde instellingen levert
 * dezelfde bestanden op, tot op de byte.
 */
import { buildModel } from './catalog/contexts/index'
import type { WaterBalanceModel } from './core/model'
import { createRng } from './core/rng'
import { solve } from './core/solve'
import { getError, injectError, noError, type InjectedVariant } from './errors/index'
import { buildPlan, type LayoutId } from './layout/index'
import type { WorkbookPlan } from './layout/plan'
import { planGeneration, type GenerateSettings, type PlannedVariant } from './planning'
import { renderWorkbook, type RenderOptions, type RenderedWorkbook } from './render/workbook'
import { assertErrorVisible } from './style/assert'
import { pickStyle, type StyleChoices } from './style/index'

export * from './planning'

export type GeneratedVariant = PlannedVariant & {
  fileName: string
  style: StyleChoices
  injected: InjectedVariant
  plan: WorkbookPlan
  rendered: RenderedWorkbook
  /** Celverwijzing van de fout, of een omschrijving als er geen cel bij hoort. */
  cellRef: string
  /** De foutloze werkmap, voor de map correcte-modellen. */
  motherRendered: RenderedWorkbook
  motherFileName: string
}

/** Bouwt één variant: model, fout, opmaak, layout en werkmap. */
export async function generateVariant(
  planned: PlannedVariant,
  settings: GenerateSettings,
  options: RenderOptions = {},
): Promise<GeneratedVariant> {
  const mother = buildModel(planned.context, planned.seed)
  const injected =
    planned.code === 'NUL-00'
      ? noError(mother)
      : injectError(mother, getError(planned.code), createRng(`${planned.seed}:${planned.code}`))

  const style = pickStyle(
    createRng(`${planned.seed}:stijl`),
    settings.variation,
    planned.code,
    injected.model,
  )
  const plan = buildPlan(planned.layout, injected.model, injected.result, style)
  assertErrorVisible(plan, planned.code, planned.layout, injected.model)

  const rendered = await renderWorkbook(plan, injected.model, injected.result, style, options)

  const motherResult = solve(mother)
  const motherPlan = buildPlan(planned.layout, mother, motherResult, style)
  const motherRendered = await renderWorkbook(motherPlan, mother, motherResult, style, options)

  const nummer = String(planned.index + 1).padStart(2, '0')
  const fileName = `WAMTEK_${planned.context}_${settings.seed}_${nummer}.xlsx`

  return {
    ...planned,
    fileName,
    style,
    injected,
    plan,
    rendered,
    cellRef: cellReference(injected, rendered, planned.layout),
    motherRendered,
    motherFileName: `WAMTEK_${planned.context}_${settings.seed}_${nummer}_correct.xlsx`,
  }
}

export async function generateAll(
  settings: GenerateSettings,
  options: RenderOptions & { onProgress?: (done: number, total: number) => void } = {},
): Promise<{ variants: GeneratedVariant[]; warnings: string[] }> {
  const { variants: planned, warnings } = planGeneration(settings)
  const variants: GeneratedVariant[] = []
  for (const item of planned) {
    variants.push(await generateVariant(item, settings, options))
    options.onProgress?.(variants.length, planned.length)
  }
  return { variants, warnings }
}

/** Waar de fout in het bestand terechtkwam. */
export function cellReference(
  injected: InjectedVariant,
  rendered: RenderedWorkbook,
  layout: LayoutId,
): string {
  if (injected.code === 'NUL-00') return 'niet van toepassing'
  if (injected.applied.primary === 'conclusie') {
    return 'in de vraag en de conclusie onder het model, niet in een losse cel'
  }
  if (injected.applied.primary === 'presentatie') {
    return 'in de opzet van het bestand als geheel, niet in een losse cel'
  }

  const direct = rendered.idToCell[injected.applied.primary]
  if (direct) return direct

  const viaAangeraakt = injected.applied.touched
    .map((id) => rendered.idToCell[id])
    .find((cell): cell is string => cell !== undefined)
  if (viaAangeraakt) return `${viaAangeraakt} (de post zelf ontbreekt in het bestand)`

  if (layout === 'A') return 'in het diagram'
  return 'niet als losse cel aanwezig; de fout zit in de opzet van het model'
}

export function motherModelOf(variant: GeneratedVariant): WaterBalanceModel {
  return variant.injected.mother
}
