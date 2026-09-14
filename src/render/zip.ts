/**
 * ExcelJS zet de klok van dat moment in elke zip-ingang van een xlsx. Twee
 * werkmappen met exact dezelfde inhoud verschillen daardoor in bytes zodra ze
 * in een andere seconde geschreven worden.
 *
 * De specificatie eist dat dezelfde seed byte-identieke bestanden oplevert, en
 * daar wordt ook op getest. Daarom wordt elk bestand na het schrijven opnieuw
 * ingepakt met een vaste datum. De inhoud blijft gelijk; alleen de tijdstempels
 * liggen vast.
 */
import JSZip from 'jszip'

/** Vaste datum in elke zip-ingang. */
export const VASTE_DATUM = new Date(Date.UTC(2024, 0, 1, 12, 0, 0))

export async function normalizeZip(bytes: Uint8Array): Promise<Uint8Array> {
  const bron = await JSZip.loadAsync(bytes)
  const doel = new JSZip()

  // De volgorde van de ingangen blijft zoals ExcelJS hem bedoeld heeft;
  // [Content_Types].xml hoort vooraan te staan.
  for (const naam of Object.keys(bron.files)) {
    const ingang = bron.files[naam]!
    // Mapingangen worden overgeslagen: JSZip zet daar de klok van dit moment
    // in, en een zip heeft ze niet nodig.
    if (ingang.dir) continue
    doel.file(naam, await ingang.async('uint8array'), { date: VASTE_DATUM, createFolders: false })
  }

  return doel.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
    platform: 'UNIX',
  })
}
