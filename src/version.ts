/**
 * Stempel van de build die dit bestand gemaakt heeft.
 *
 * Staat onderaan de pagina en in generatie.json. Zonder zo'n stempel is bij een
 * melding over de uitvoer niet vast te stellen welke versie hem gemaakt heeft,
 * en dat kost een ronde: een browser kan een oude versie in de cache hebben.
 */
declare const __BUILD_ID__: string | undefined

export const BUILD_ID: string = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'lokaal'
