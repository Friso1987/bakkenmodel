/** Eenheden die in de modellen voorkomen. Puur label-werk: solve() rekent niet om. */
export type Unit =
  | 'mm'
  | 'mm/dag'
  | 'mm/maand'
  | 'm'
  | 'm2'
  | 'ha'
  | 'm3'
  | 'm3/dag'
  | 'm3/maand'
  | 'm3/jaar'
  | 'l/s'
  | 'dag'
  | '-'
  | '%'

/** Weergave van een eenheid in de werkmap en in de sleutel. */
export const UNIT_LABEL: Record<Unit, string> = {
  mm: 'mm',
  'mm/dag': 'mm/dag',
  'mm/maand': 'mm/maand',
  m: 'm',
  m2: 'm²',
  ha: 'ha',
  m3: 'm³',
  'm3/dag': 'm³/dag',
  'm3/maand': 'm³/maand',
  'm3/jaar': 'm³/jaar',
  'l/s': 'l/s',
  dag: 'dag',
  '-': '-',
  '%': '%',
}

export function unitLabel(unit: Unit): string {
  return UNIT_LABEL[unit]
}

/** Volume-eenheid die bij een tijdstap hoort. */
export function volumeUnitForStep(step: 'dag' | 'maand'): Unit {
  return step === 'dag' ? 'm3/dag' : 'm3/maand'
}

/** Getal in Nederlandse notatie, voor de sleutel en de preview. */
export function formatNumber(value: number, decimals = 0): string {
  return value.toLocaleString('nl-NL', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}
