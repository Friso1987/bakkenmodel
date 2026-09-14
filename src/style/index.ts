/**
 * De opmaak-assen. Elke as wordt onafhankelijk geloot uit de seed; dat is de
 * bron van de visuele variatie tussen twee bestanden met dezelfde fout.
 *
 * Harde regel: een opmaakkeuze is nooit op zichzelf een fout. "Eenheden als
 * tekst achter de waarde" is lelijk, maar niet fout. Alleen een gekozen
 * NAV-code mag iets echt wegnemen. style/assert.ts dwingt dat af.
 */
import type { Rng } from '../core/rng'

export type SourceStyle = 'apart-tabblad' | 'kolom' | 'celopmerking' | 'voetnoot' | 'geen'
export type UnitStyle = 'in-kop' | 'eigen-kolom' | 'achter-waarde'
export type FormulaStyle = 'formules' | 'waarden' | 'mix'
export type SheetStyle = 'een-tabblad' | 'gescheiden'
export type SeriesStyle = 'maanden-in-rijen' | 'maanden-in-kolommen'
export type LabelStyle = 'volluit' | 'symbool' | 'beide'
export type ColumnOrder = 'standaard' | 'eenheid-voor-waarde' | 'bron-eerst'
export type ThemeId = 'zakelijk' | 'blauwdruk' | 'krijt' | 'klassiek'

export type StyleChoices = {
  bronvermelding: SourceStyle
  eenheden: UnitStyle
  formules: FormulaStyle
  tabbladen: SheetStyle
  tijdreeks: SeriesStyle
  labels: LabelStyle
  kolomvolgorde: ColumnOrder
  thema: ThemeId
}

export type Theme = {
  id: ThemeId
  label: string
  font: string
  fontSize: number
  headingFont: string
  headingSize: number
  /** ARGB zonder hekje, zoals ExcelJS het wil. */
  headerFill: string
  headerText: string
  titleText: string
  accent: string
  zebra: string | null
  border: 'geen' | 'dun' | 'kader' | 'alles'
  totalFill: string | null
}

export const THEMES: Record<ThemeId, Theme> = {
  zakelijk: {
    id: 'zakelijk',
    label: 'zakelijk',
    font: 'Calibri',
    fontSize: 11,
    headingFont: 'Calibri',
    headingSize: 14,
    headerFill: 'FF1F4E79',
    headerText: 'FFFFFFFF',
    titleText: 'FF1F4E79',
    accent: 'FFDCE6F1',
    zebra: 'FFF2F6FA',
    border: 'dun',
    totalFill: 'FFDCE6F1',
  },
  blauwdruk: {
    id: 'blauwdruk',
    label: 'blauwdruk',
    font: 'Consolas',
    fontSize: 10,
    headingFont: 'Consolas',
    headingSize: 13,
    headerFill: 'FF204A60',
    headerText: 'FFEAF4F8',
    titleText: 'FF204A60',
    accent: 'FFD6E9F0',
    zebra: null,
    border: 'alles',
    totalFill: 'FFD6E9F0',
  },
  krijt: {
    id: 'krijt',
    label: 'krijt',
    font: 'Verdana',
    fontSize: 10,
    headingFont: 'Verdana',
    headingSize: 13,
    headerFill: 'FF4F6228',
    headerText: 'FFFFFFFF',
    titleText: 'FF4F6228',
    accent: 'FFEBF1DE',
    zebra: 'FFF7FAF0',
    border: 'kader',
    totalFill: 'FFEBF1DE',
  },
  klassiek: {
    id: 'klassiek',
    label: 'klassiek',
    font: 'Times New Roman',
    fontSize: 12,
    headingFont: 'Times New Roman',
    headingSize: 15,
    headerFill: 'FFFFFFFF',
    headerText: 'FF000000',
    titleText: 'FF000000',
    accent: 'FFEFEFEF',
    zebra: null,
    border: 'geen',
    totalFill: null,
  },
}

/** Vaste opmaak voor fase 2 en voor elke test die niet over opmaak gaat. */
export function defaultStyle(): StyleChoices {
  return {
    bronvermelding: 'kolom',
    eenheden: 'in-kop',
    formules: 'formules',
    tabbladen: 'een-tabblad',
    tijdreeks: 'maanden-in-rijen',
    labels: 'volluit',
    kolomvolgorde: 'standaard',
    thema: 'zakelijk',
  }
}

export type StyleVariation = 'laag' | 'hoog'

/**
 * Loot de assen. Bij variatie 'laag' blijft het bij één thema en twee assen,
 * zodat een docent die rust wil dat ook krijgt.
 *
 * `errorCode` beperkt de loting waar een fout anders onzichtbaar zou worden:
 * een fout in een formule zie je niet in een bestand zonder formules.
 */
export function pickStyle(rng: Rng, variation: StyleVariation, errorCode?: string): StyleChoices {
  const style = defaultStyle()

  if (variation === 'laag') {
    style.tijdreeks = 'maanden-in-rijen'
    style.labels = rng.pick<LabelStyle>(['volluit', 'beide'])
    style.formules = rng.pick<FormulaStyle>(['formules', 'mix'])
    style.tabbladen = rng.pick<SheetStyle>(['een-tabblad', 'gescheiden'])
  } else {
    style.bronvermelding = rng.pick<SourceStyle>(['apart-tabblad', 'kolom', 'celopmerking', 'voetnoot', 'geen'])
    style.eenheden = rng.pick<UnitStyle>(['in-kop', 'eigen-kolom', 'achter-waarde'])
    style.formules = rng.pick<FormulaStyle>(['formules', 'waarden', 'mix'])
    style.tabbladen = rng.pick<SheetStyle>(['een-tabblad', 'gescheiden'])
    style.tijdreeks = rng.pick<SeriesStyle>(['maanden-in-rijen', 'maanden-in-kolommen'])
    style.labels = rng.pick<LabelStyle>(['volluit', 'symbool', 'beide'])
    style.kolomvolgorde = rng.pick<ColumnOrder>(['standaard', 'eenheid-voor-waarde', 'bron-eerst'])
    style.thema = rng.pick<ThemeId>(['zakelijk', 'blauwdruk', 'krijt', 'klassiek'])
  }

  return constrainStyle(style, errorCode)
}

/**
 * Sommige fouten hebben een drager nodig. Zonder formules in het bestand valt
 * er niets te zien van een fout die in een formule zit.
 */
export function constrainStyle(style: StyleChoices, errorCode?: string): StyleChoices {
  if (!errorCode) return style
  const out = { ...style }
  if (['NAV-01', 'NAV-04', 'NAV-06'].includes(errorCode)) out.formules = 'formules'
  if (errorCode === 'NAV-02') out.eenheden = 'in-kop'
  if (errorCode === 'NAV-05') out.tabbladen = 'een-tabblad'
  if (errorCode === 'NAV-03' && out.bronvermelding === 'apart-tabblad') out.bronvermelding = 'kolom'
  // SCH-06 zit in de bronvermelding; zonder bronnen in het bestand is er niets te zien.
  if (errorCode === 'SCH-06' && out.bronvermelding === 'geen') out.bronvermelding = 'kolom'
  return out
}

export function themeOf(style: StyleChoices): Theme {
  return THEMES[style.thema]
}

/** Korte omschrijving voor de docentensleutel. */
export function describeStyle(style: StyleChoices): string {
  return [
    `thema ${style.thema}`,
    `labels ${style.labels}`,
    `eenheden ${style.eenheden}`,
    `formules ${style.formules}`,
    `bronnen ${style.bronvermelding}`,
    `tabbladen ${style.tabbladen}`,
    `tijdreeks ${style.tijdreeks}`,
    `kolomvolgorde ${style.kolomvolgorde}`,
  ].join(', ')
}
