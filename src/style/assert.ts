/**
 * De regel uit §7 van de specificatie, in code.
 *
 * Een opmaakkeuze mag nooit op zichzelf een fout zijn. "Eenheden als tekst
 * achter de waarde" is lelijk, maar niet fout. Als de docent NAV-02 kiest,
 * dan verdwijnen de eenheden echt, en alleen dan. De student moet kunnen weten
 * wat telt.
 *
 * Deze controle draait bij elke gegenereerde variant. Slaat hij aan, dan is er
 * een bug in een layout of in een foutmodule, en niet iets om te negeren.
 */
import type { WaterBalanceModel } from '../core/model'
import type { LayoutId } from '../layout/index'
import { allCells, type WorkbookPlan } from '../layout/plan'

export class StyleAssertionError extends Error {}

/** Codes die iets uit het bestand halen; alleen zij mogen dat. */
const VERWIJDERT_EENHEDEN = 'NAV-02'
const VERWIJDERT_AANNAMES = 'NAV-03'
const MENGT_SECTIES = 'NAV-05'
const VRAAGT_FORMULES = ['NAV-01', 'NAV-04', 'NAV-06']
const VRAAGT_BRONNEN = 'SCH-06'

export function assertErrorVisible(
  plan: WorkbookPlan,
  code: string,
  layout: LayoutId,
  model?: WaterBalanceModel,
): void {
  const eisen: string[] = []

  // De kern: zit de fout in een formule, dan moet die formule in het bestand
  // staan. Anders ziet de student alleen een getal dat wat anders is en valt er
  // niets na te lopen.
  for (const fluxId of model?.presentation.formulaMustShow ?? []) {
    const heeftFormule = allCells(plan).some((cell) => cell.elementId === fluxId && cell.formula !== undefined)
    if (!heeftFormule) {
      eisen.push(
        `de fout zit in de formule van ${fluxId}, maar die formule staat niet in het bestand; ` +
          'zo is er niets na te lopen',
      )
    }
  }

  if (code === VERWIJDERT_EENHEDEN) {
    if (plan.meta.hasUnits) eisen.push('NAV-02 is gekozen, maar er staan nog eenheden in het bestand')
  } else if (!plan.meta.hasUnits) {
    eisen.push(`de eenheden ontbreken terwijl ${code} daar niet over gaat; dat zou de student op het verkeerde been zetten`)
  }

  if (code === VERWIJDERT_AANNAMES) {
    if (plan.meta.hasAssumptions) eisen.push('NAV-03 is gekozen, maar de aannames staan er nog gewoon in')
  } else if (!plan.meta.hasAssumptions && layout !== 'A') {
    eisen.push(`de aannames ontbreken terwijl ${code} daar niet over gaat`)
  }

  if (code === MENGT_SECTIES) {
    if (plan.meta.sectionsLabelled) eisen.push('NAV-05 is gekozen, maar invoer, berekening en uitvoer staan nog netjes gescheiden')
  } else if (!plan.meta.sectionsLabelled) {
    eisen.push(`de secties lopen door elkaar terwijl ${code} daar niet over gaat`)
  }

  if (VRAAGT_FORMULES.includes(code) && !plan.meta.hasFormulas) {
    eisen.push(`${code} zit in een formule, maar dit bestand bevat geen formules`)
  }

  if (code === VRAAGT_BRONNEN && !plan.meta.hasSources) {
    eisen.push('SCH-06 zit in de bronvermelding, maar dit bestand noemt nergens een bron')
  }

  if (layout === 'A' && !plan.meta.hasDiagram) eisen.push('layout A hoort een diagram te bevatten')
  if (layout === 'C' && !plan.meta.hasDiagram) eisen.push('layout C hoort een diagram te bevatten')

  if (eisen.length > 0) {
    throw new StyleAssertionError(`Opmaak en fout bijten elkaar bij ${code} (layout ${layout}): ${eisen.join('; ')}`)
  }
}
