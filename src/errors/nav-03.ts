import type { ErrorDef } from './types'

/**
 * NAV-03: de aannames staan nergens. De getallen zitten in de formules en er is
 * geen tabel waarin staat waar ze vandaan komen.
 */
export const NAV_03: ErrorDef = {
  code: 'NAV-03',
  layer: 4,
  label: 'Aannames nergens vastgelegd',
  description: 'Het bestand bevat geen overzicht van de gebruikte aannames en parameters.',
  // Layout A heeft sowieso geen tabellen; daar zou de fout niet opvallen.
  layouts: ['B', 'C'],
  applies: (model) => !model.presentation.hideAssumptions && model.assumptions.length > 0,

  apply: (model) => {
    model.presentation.hideAssumptions = true
    return {
      primary: 'presentatie',
      touched: ['presentatie'],
      detail: 'De aannametabel staat niet in het bestand; de waarden zitten in de formules.',
    }
  },

  explain: () => ({
    wat: 'Er is geen overzicht van de aannames en parameters. De waarden staan alleen nog in de formules zelf.',
    waarom:
      'Een waterbalans steunt op keuzes: een gewasfactor, een bergingscapaciteit, een oppervlak. Staan die niet op een rij met hun bron, dan kan niemand nagaan waar ze vandaan komen en of ze verdedigbaar zijn.',
    gevolg:
      'Het model is niet te controleren en niet over te nemen. Een volgende gebruiker moet elke waarde uit de formules terugpuzzelen.',
    ankers: [
      'Er staat geen aannametabel in het bestand, dus de gebruikte waarden zijn niet te herleiden.',
      'De parameters staan alleen in de formules en niet als invoer met een bron erbij.',
      'Zonder vastgelegde aannames kun je de uitkomst niet reproduceren en niet ter discussie stellen.',
    ],
  }),
}
