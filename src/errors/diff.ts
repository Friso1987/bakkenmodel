/**
 * Verschil tussen twee modellen, per element-id. Hiermee toetst de test of een
 * foutmodel precies één afwijking heeft ten opzichte van het moedermodel, en
 * niet stiekem meer.
 */
import type { WaterBalanceModel } from '../core/model'

export type ModelDiff = {
  /** Ids van elementen die veranderd, verdwenen of bijgekomen zijn. */
  changedIds: string[]
  /** Leesbare beschrijving per verschil. */
  changes: string[]
}

type Element = { id: string }

export function diffModels(voor: WaterBalanceModel, na: WaterBalanceModel): ModelDiff {
  const changes: string[] = []
  const changedIds = new Set<string>()

  const noteer = (id: string, tekst: string): void => {
    changedIds.add(id)
    changes.push(tekst)
  }

  compareLists(voor.buckets, na.buckets, 'bak', noteer)
  compareLists(voor.fluxes, na.fluxes, 'flux', noteer)
  compareLists(voor.assumptions, na.assumptions, 'aanname', noteer)
  compareLists(voor.inputs, na.inputs, 'reeks', noteer)
  compareLists(voor.sources, na.sources, 'bron', noteer)

  for (const id of new Set([...Object.keys(voor.timeseries.values), ...Object.keys(na.timeseries.values)])) {
    const a = JSON.stringify(voor.timeseries.values[id] ?? null)
    const b = JSON.stringify(na.timeseries.values[id] ?? null)
    if (a !== b) noteer(id, `reeks ${id}: de waarden zijn veranderd`)
  }

  if (JSON.stringify(voor.area) !== JSON.stringify(na.area)) noteer(voor.area.id, 'het gebiedsoppervlak is veranderd')
  if (JSON.stringify(voor.mainOutcome) !== JSON.stringify(na.mainOutcome)) {
    noteer(voor.mainOutcome.id, 'de hoofduitkomst wijst naar iets anders')
  }
  if (JSON.stringify(voor.conclusion) !== JSON.stringify(na.conclusion)) noteer('conclusie', 'de conclusie is veranderd')
  if (JSON.stringify(voor.presentation) !== JSON.stringify(na.presentation)) {
    noteer('presentatie', 'de presentatie van het model is veranderd')
  }
  if (voor.timeseries.step !== na.timeseries.step) noteer('tijdstap', 'de tijdstap is veranderd')

  return { changedIds: [...changedIds], changes }
}

function compareLists<T extends Element>(
  voor: T[],
  na: T[],
  soort: string,
  noteer: (id: string, tekst: string) => void,
): void {
  const voorMap = new Map(voor.map((e) => [e.id, e]))
  const naMap = new Map(na.map((e) => [e.id, e]))

  for (const [id, element] of voorMap) {
    const nieuw = naMap.get(id)
    if (!nieuw) {
      noteer(id, `${soort} ${id} is verdwenen`)
      continue
    }
    if (JSON.stringify(element) !== JSON.stringify(nieuw)) noteer(id, `${soort} ${id} is veranderd`)
  }
  for (const id of naMap.keys()) {
    if (!voorMap.has(id)) noteer(id, `${soort} ${id} is toegevoegd`)
  }
}
