/**
 * De pagina. Eén scherm, geen router, geen inlog. De gebruiker is een docent
 * die dit twee keer per jaar gebruikt en geen handleiding leest, dus alles wat
 * er te kiezen valt staat meteen zichtbaar op het scherm.
 */
import './style.css'
import { contextIds } from '../catalog/contexts/index'
import { CONTEXT_LABEL } from '../catalog/contexts/labels'
import type { ContextId } from '../core/model'
import { randomSeedString } from '../core/rng'
import { ERRORS, errorsForContext, LAYER_LABEL, type ErrorLayer } from '../errors/index'
import {
  defaultSettings,
  planGeneration,
  type GenerateSettings,
  type LayoutMix,
} from '../planning'
import { LAYOUT_LABEL, type LayoutId } from '../layout/index'
import type { StyleVariation } from '../style/index'
import { BUILD_ID } from '../version'
import { previewHtml } from './preview'

type Staat = {
  contexts: Set<ContextId>
  codes: Set<string>
  counts: Record<string, number>
  total: number
  nulShare: number
  layouts: LayoutMix
  variation: StyleVariation
  seed: string
  bezig: boolean
  status: string
  preview: string | null
  previewBijschrift: string
}

const alleCodes = ERRORS.filter((e) => e.code !== 'NUL-00')

const staat: Staat = {
  contexts: new Set(contextIds()),
  codes: new Set(alleCodes.map((e) => e.code)),
  counts: {},
  total: 12,
  nulShare: 0.25,
  layouts: 'gemengd',
  variation: 'hoog',
  seed: '',
  bezig: false,
  status: '',
  preview: null,
  previewBijschrift: '',
}

const app = document.getElementById('app')!
teken()

function instellingen(): GenerateSettings {
  const seed = staat.seed.trim() || randomSeedString(Math.random)
  return {
    ...defaultSettings(seed),
    contexts: [...staat.contexts],
    codes: [...staat.codes],
    counts: Object.keys(staat.counts).length > 0 ? staat.counts : undefined,
    total: staat.total,
    nulShare: staat.nulShare,
    layouts: staat.layouts,
    variation: staat.variation,
  } as GenerateSettings
}

/** Waarschuwingen die je meteen ziet, niet pas na het klikken. */
function meldingen(): { waarschuwingen: string[]; blokkerend: string | null } {
  const waarschuwingen: string[] = []
  if (staat.contexts.size === 0) return { waarschuwingen, blokkerend: 'Kies minstens één context.' }
  if (staat.codes.size === 0 && staat.nulShare < 1) {
    waarschuwingen.push('Er is geen enkele fout aangevinkt; alle varianten worden foutloos.')
  }
  const plan = planGeneration({ ...instellingen(), seed: staat.seed.trim() || 'voorbeeld' })
  waarschuwingen.push(...plan.warnings)
  if (plan.variants.length === 0) {
    return { waarschuwingen, blokkerend: 'Deze combinatie levert geen enkel bestand op.' }
  }
  return { waarschuwingen, blokkerend: null }
}

function teken(): void {
  const { waarschuwingen, blokkerend } = meldingen()
  const mogelijkPerContext = new Map<ContextId, Set<string>>()
  for (const context of contextIds()) {
    mogelijkPerContext.set(context, new Set(errorsForContext(context).map((e) => e.code)))
  }
  const mogelijk = (code: string): boolean =>
    [...staat.contexts].some((context) => mogelijkPerContext.get(context)?.has(code))

  const lagen = [...new Set(alleCodes.map((e) => e.layer))].sort((a, b) => a - b)

  app.innerHTML = `
    <h1>Bakkenmodellen met één fout</h1>
    <p class="lead">
      Genereert Excel-waterbalansen voor eerstejaars watermanagement. Elk bestand bevat precies één
      ingebouwde fout, of geen enkele. De studenten zoeken de fout en beargumenteren waarom het er een is.
      U krijgt een zip met de studentbestanden, de sleutel en de foutloze modellen.
    </p>

    <h2>Context</h2>
    <p class="hint">Waar gaat de balans over? Niet elke fout past in elk gebied.</p>
    <div class="kolommen">
      <fieldset>
        ${contextIds()
          .map(
            (context) => `
          <label class="keuze">
            <input type="checkbox" data-context="${context}" ${staat.contexts.has(context) ? 'checked' : ''} />
            <span>${CONTEXT_LABEL[context]}</span>
          </label>`,
          )
          .join('')}
      </fieldset>
    </div>

    <h2>Fouttypes</h2>
    <p class="hint">
      Per laag aan of uit, of per code. Een aantal invullen achter een code overschrijft de verdeling hieronder.
      Grijze regels passen niet bij de gekozen contexten.
    </p>
    <div class="lagen">
      ${lagen.map((laag) => laagHtml(laag, mogelijk)).join('')}
    </div>

    <h2>Omvang en vorm</h2>
    <div class="kolommen">
      <div>
        <h3>Aantal varianten</h3>
        <label class="keuze">
          <input type="number" min="1" max="120" value="${staat.total}" data-veld="total" />
          <span class="toelichting">totaal, inclusief de foutloze</span>
        </label>
        <h3>Aandeel zonder fout</h3>
        <label class="keuze">
          <input type="number" min="0" max="100" step="5" value="${Math.round(staat.nulShare * 100)}" data-veld="nul" />
          <span class="toelichting">procent</span>
        </label>
      </div>
      <div>
        <h3>Layout</h3>
        ${[
          ['A', `alleen A (${LAYOUT_LABEL.A})`],
          ['B', `alleen B (${LAYOUT_LABEL.B})`],
          ['C', `alleen C (${LAYOUT_LABEL.C})`],
          ['gemengd', 'gemengd'],
        ]
          .map(
            ([waarde, label]) => `
          <label class="keuze">
            <input type="radio" name="layout" value="${waarde}" ${staat.layouts === waarde ? 'checked' : ''} />
            <span>${label}</span>
          </label>`,
          )
          .join('')}
      </div>
      <div>
        <h3>Opmaakvariatie</h3>
        <label class="keuze">
          <input type="radio" name="variatie" value="laag" ${staat.variation === 'laag' ? 'checked' : ''} />
          <span>laag<br /><span class="toelichting">één thema, weinig verschil</span></span>
        </label>
        <label class="keuze">
          <input type="radio" name="variatie" value="hoog" ${staat.variation === 'hoog' ? 'checked' : ''} />
          <span>hoog<br /><span class="toelichting">alles geloot, zodat de vorm niets verraadt</span></span>
        </label>
        <h3>Seed</h3>
        <input type="text" value="${escape(staat.seed)}" data-veld="seed" placeholder="leeg laten voor willekeurig" />
        <p class="hint">Dezelfde seed met dezelfde instellingen levert exact dezelfde bestanden.</p>
      </div>
    </div>

    ${blokkerend ? `<div class="melding fout">${escape(blokkerend)}</div>` : ''}
    ${
      waarschuwingen.length > 0
        ? `<div class="melding"><strong>Let op</strong><ul>${waarschuwingen
            .map((w) => `<li>${escape(w)}</li>`)
            .join('')}</ul></div>`
        : ''
    }

    <div class="knoppen">
      <button data-actie="genereer" ${staat.bezig || blokkerend ? 'disabled' : ''}>Genereer bestanden en download de zip</button>
      <button class="tweede" data-actie="voorbeeld" ${staat.bezig || blokkerend ? 'disabled' : ''}>Toon één variant</button>
      <span class="status">${escape(staat.status)}</span>
    </div>

    <p class="versie">
      Versie ${escape(BUILD_ID)}. Ziet u een oude versie, ververs de pagina dan met Ctrl+F5.
    </p>

    ${staat.preview ? `<h2>Voorbeeld</h2><p class="hint">${escape(staat.previewBijschrift)}</p>${staat.preview}` : ''}
  `

  bindHandlers()
}

function laagHtml(laag: ErrorLayer, mogelijk: (code: string) => boolean): string {
  const codes = alleCodes.filter((e) => e.layer === laag)
  const aan = codes.filter((e) => staat.codes.has(e.code)).length
  return `
    <div class="laag">
      <label class="laagkop">
        <input type="checkbox" data-laag="${laag}" ${aan === codes.length ? 'checked' : ''} />
        <span>Laag ${laag} — ${LAYER_LABEL[laag]}</span>
        <span class="telling">${aan} van ${codes.length}</span>
      </label>
      ${codes
        .map((def) => {
          const kan = mogelijk(def.code)
          const gekozen = staat.codes.has(def.code)
          return `
        <label class="foutregel ${kan ? '' : 'niet-mogelijk'}">
          <input type="checkbox" data-code="${def.code}" ${gekozen ? 'checked' : ''} ${kan ? '' : 'disabled'} />
          <code>${def.code}</code>
          <span>${escape(def.label)}</span>
          <span class="omschrijving">${escape(def.description)}</span>
          <input type="number" min="0" max="60" placeholder="auto" data-aantal="${def.code}"
            value="${staat.counts[def.code] ?? ''}" ${kan && gekozen ? '' : 'disabled'} />
        </label>`
        })
        .join('')}
    </div>`
}

function bindHandlers(): void {
  app.querySelectorAll<HTMLInputElement>('[data-context]').forEach((el) => {
    el.addEventListener('change', () => {
      const context = el.dataset.context as ContextId
      if (el.checked) staat.contexts.add(context)
      else staat.contexts.delete(context)
      teken()
    })
  })

  app.querySelectorAll<HTMLInputElement>('[data-laag]').forEach((el) => {
    el.addEventListener('change', () => {
      const laag = Number(el.dataset.laag) as ErrorLayer
      for (const def of alleCodes.filter((e) => e.layer === laag)) {
        if (el.checked) staat.codes.add(def.code)
        else staat.codes.delete(def.code)
      }
      teken()
    })
  })

  app.querySelectorAll<HTMLInputElement>('[data-code]').forEach((el) => {
    el.addEventListener('change', () => {
      const code = el.dataset.code!
      if (el.checked) staat.codes.add(code)
      else {
        staat.codes.delete(code)
        delete staat.counts[code]
      }
      teken()
    })
  })

  app.querySelectorAll<HTMLInputElement>('[data-aantal]').forEach((el) => {
    el.addEventListener('change', () => {
      const code = el.dataset.aantal!
      const waarde = Number(el.value)
      if (el.value === '' || !Number.isFinite(waarde) || waarde <= 0) delete staat.counts[code]
      else staat.counts[code] = Math.round(waarde)
      teken()
    })
  })

  app.querySelectorAll<HTMLInputElement>('[data-veld]').forEach((el) => {
    const gebeurtenis = el.type === 'text' ? 'input' : 'change'
    el.addEventListener(gebeurtenis, () => {
      if (el.dataset.veld === 'total') staat.total = Math.max(1, Math.round(Number(el.value) || 1))
      if (el.dataset.veld === 'nul') staat.nulShare = Math.min(1, Math.max(0, Number(el.value) / 100))
      if (el.dataset.veld === 'seed') {
        staat.seed = el.value
        return // niet hertekenen tijdens het typen
      }
      teken()
    })
  })

  app.querySelectorAll<HTMLInputElement>('input[name="layout"]').forEach((el) => {
    el.addEventListener('change', () => {
      staat.layouts = el.value as LayoutMix
      teken()
    })
  })

  app.querySelectorAll<HTMLInputElement>('input[name="variatie"]').forEach((el) => {
    el.addEventListener('change', () => {
      staat.variation = el.value as StyleVariation
      teken()
    })
  })

  app.querySelector<HTMLButtonElement>('[data-actie="genereer"]')?.addEventListener('click', genereer)
  app.querySelector<HTMLButtonElement>('[data-actie="voorbeeld"]')?.addEventListener('click', toonVoorbeeld)
}

async function toonVoorbeeld(): Promise<void> {
  const settings = instellingen()
  staat.seed = settings.seed
  staat.bezig = true
  staat.status = 'bezig met het voorbeeld…'
  teken()

  try {
    const plan = planGeneration(settings)
    const eerste = plan.variants[0]
    if (!eerste) throw new Error('Deze combinatie levert geen enkele variant op.')
    const { generateVariant, canvasRasterizer } = await zwaarGereedschap()
    const variant = await generateVariant(eerste, settings, { rasterize: canvasRasterizer() })
    staat.preview = previewHtml(variant.plan)
    staat.previewBijschrift =
      `${variant.fileName} — layout ${variant.layout} (${LAYOUT_LABEL[variant.layout as LayoutId]}), ` +
      `foutcode ${variant.injected.code}. Deze voorvertoning is voor u; de student ziet alleen het Excel-bestand.`
    staat.status = ''
  } catch (fout) {
    staat.status = `er ging iets mis: ${(fout as Error).message}`
    staat.preview = null
  } finally {
    staat.bezig = false
    teken()
  }
}

async function genereer(): Promise<void> {
  const settings = instellingen()
  staat.seed = settings.seed
  staat.bezig = true
  staat.status = 'bezig…'
  teken()

  try {
    const { generateAll, canvasRasterizer, buildBundle, bundleName } = await zwaarGereedschap()
    const { variants, warnings } = await generateAll(settings, {
      rasterize: canvasRasterizer(),
      onProgress: (klaar, totaal) => {
        const status = app.querySelector('.status')
        if (status) status.textContent = `bezig… ${klaar} van ${totaal}`
      },
    })
    const blob = await buildBundle(variants, settings, warnings)
    downloadBlob(blob, bundleName(settings.seed))
    staat.status = `${variants.length} bestanden klaar, seed ${settings.seed}`
  } catch (fout) {
    staat.status = `er ging iets mis: ${(fout as Error).message}`
  } finally {
    staat.bezig = false
    teken()
  }
}

/**
 * ExcelJS en JSZip zijn samen het grootste deel van de code. Ze worden pas
 * geladen zodra er echt een bestand gemaakt moet worden, zodat de pagina
 * meteen bruikbaar is.
 */
async function zwaarGereedschap() {
  const [generate, bundle, raster] = await Promise.all([
    import('../generate'),
    import('../bundle'),
    import('../render/raster'),
  ])
  return {
    generateAll: generate.generateAll,
    generateVariant: generate.generateVariant,
    buildBundle: bundle.buildBundle,
    bundleName: bundle.bundleName,
    canvasRasterizer: raster.canvasRasterizer,
  }
}

function downloadBlob(blob: Blob, naam: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = naam
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

function escape(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
