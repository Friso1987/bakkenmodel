// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildModel } from '../src/catalog/contexts/index'
import { solve } from '../src/core/solve'
import { buildPlan } from '../src/layout/index'
import { defaultStyle } from '../src/style/index'
import { previewHtml } from '../src/ui/preview'

describe('de voorvertoning', () => {
  it('zet elk blok uit het plan om naar html', () => {
    const model = buildModel('stad-wijk', 'preview')
    const result = solve(model)
    const html = previewHtml(buildPlan('B', model, result, defaultStyle()))

    expect(html).toContain('<table class="preview-table">')
    expect(html).toContain(model.title)
    expect(html).toContain('Aannames en parameters')
    expect(html).toContain('preview-tab')
    expect(html).toContain('is-getal')
  })

  it('toont het diagram als svg', () => {
    const model = buildModel('stad-wijk', 'preview')
    const html = previewHtml(buildPlan('A', model, solve(model), defaultStyle()))
    expect(html).toContain('<svg')
    expect(html).toContain('preview-diagram')
  })

  it('ontsnapt tekens die anders de html zouden breken', () => {
    const model = buildModel('stad-wijk', 'preview')
    model.title = 'Wijk <script>alert("x")</script> & co'
    const html = previewHtml(buildPlan('B', model, solve(model), defaultStyle()))
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('&amp; co')
  })
})

describe('de pagina', () => {
  beforeEach(() => {
    document.body.innerHTML = '<main id="app"></main>'
  })

  it('bouwt alle bedieningselementen op', async () => {
    await laadPagina()
    const app = document.getElementById('app')!

    expect(app.querySelector('h1')?.textContent).toContain('Bakkenmodellen')
    expect(app.querySelectorAll('[data-context]').length).toBeGreaterThan(0)
    expect(app.querySelectorAll('[data-code]').length).toBeGreaterThan(5)
    expect(app.querySelectorAll('[data-laag]').length).toBeGreaterThan(1)
    expect(app.querySelector('[data-veld="seed"]')).toBeTruthy()
    expect(app.querySelector('[data-veld="total"]')).toBeTruthy()
    expect(app.querySelectorAll('input[name="layout"]').length).toBe(4)
    expect(app.querySelectorAll('input[name="variatie"]').length).toBe(2)
    expect(app.querySelector('[data-actie="genereer"]')).toBeTruthy()
    expect(app.querySelector('[data-actie="voorbeeld"]')).toBeTruthy()
  })

  it('vinkt een hele laag in één keer uit en weer aan', async () => {
    await laadPagina()
    const app = document.getElementById('app')!
    const laag = app.querySelector<HTMLInputElement>('[data-laag="1"]')!
    const codesInLaag = () =>
      [...document.querySelectorAll<HTMLInputElement>('[data-code^="EEN"]')].filter((el) => el.checked).length

    expect(codesInLaag()).toBeGreaterThan(0)
    laag.checked = false
    laag.dispatchEvent(new Event('change'))
    expect(codesInLaag()).toBe(0)

    const opnieuw = document.querySelector<HTMLInputElement>('[data-laag="1"]')!
    opnieuw.checked = true
    opnieuw.dispatchEvent(new Event('change'))
    expect(codesInLaag()).toBeGreaterThan(0)
  })

  it('waarschuwt meteen bij een combinatie die niets oplevert', async () => {
    await laadPagina()
    // Alle contexten uit: dan valt er niets te maken.
    for (const el of document.querySelectorAll<HTMLInputElement>('[data-context]')) {
      el.checked = false
      el.dispatchEvent(new Event('change'))
    }
    const melding = document.querySelector('.melding.fout')
    expect(melding?.textContent).toContain('context')
    expect(document.querySelector<HTMLButtonElement>('[data-actie="genereer"]')?.disabled).toBe(true)
  })

  it('meldt een foutcode die niet in de gekozen context past', async () => {
    await laadPagina()
    // Alleen de stadswijk: een fout met een debiet in l/s past daar niet in.
    for (const el of document.querySelectorAll<HTMLInputElement>('[data-context]')) {
      if (el.dataset.context === 'stad-wijk') continue
      el.checked = false
      el.dispatchEvent(new Event('change'))
    }
    const tekst = document.getElementById('app')!.textContent ?? ''
    expect(tekst).toContain('past niet in de gekozen contexten')
    expect(tekst).toContain('EEN-04')
  })

  it('laat een voorbeeld zien zonder iets te downloaden', async () => {
    await laadPagina()
    const knop = document.querySelector<HTMLButtonElement>('[data-actie="voorbeeld"]')!
    knop.click()
    await wachtOp(() => document.querySelector('.preview-sheet') !== null, 20000)

    expect(document.querySelector('.preview-sheet')).toBeTruthy()
    expect(document.getElementById('app')!.textContent).toContain('Voorbeeld')
    // De seed staat na afloop in het veld, zodat hij te herhalen is.
    const seed = document.querySelector<HTMLInputElement>('[data-veld="seed"]')!
    expect(seed.value.length).toBeGreaterThan(3)
  }, 30000)
})

async function laadPagina(): Promise<void> {
  // Elke test wil een verse pagina; de module bouwt hem op bij het laden.
  vi.resetModules()
  await import('../src/ui/main')
}

async function wachtOp(voorwaarde: () => boolean, timeoutMs: number): Promise<void> {
  const start = Date.now()
  while (!voorwaarde()) {
    if (Date.now() - start > timeoutMs) throw new Error('wachttijd verstreken')
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
}

describe('het diagram op een canvas', () => {
  it('tekent elke vorm en levert base64-png op', async () => {
    const { canvasRasterizer } = await import('../src/render/raster')
    const { buildDiagram } = await import('../src/render/diagram')

    const aanroepen: string[] = []
    const stub = new Proxy(
      {
        canvas: {},
        setLineDash: () => {},
        font: '',
        lineWidth: 0,
        lineJoin: '',
        lineCap: '',
        fillStyle: '',
        strokeStyle: '',
        textAlign: '',
        textBaseline: '',
      } as Record<string, unknown>,
      {
        get(doel, sleutel: string) {
          if (sleutel in doel) return doel[sleutel]
          return (...args: unknown[]) => {
            aanroepen.push(`${sleutel}(${args.length})`)
          }
        },
        set(doel, sleutel: string, waarde) {
          doel[sleutel] = waarde
          return true
        },
      },
    )

    const origineleContext = HTMLCanvasElement.prototype.getContext
    const origineleUrl = HTMLCanvasElement.prototype.toDataURL
    HTMLCanvasElement.prototype.getContext = (() => stub) as never
    HTMLCanvasElement.prototype.toDataURL = (() => 'data:image/png;base64,QUJD') as never

    try {
      const model = buildModel('polder', 'canvas')
      const diagram = buildDiagram(model, solve(model), defaultStyle())
      const base64 = await canvasRasterizer(2)({
        kind: 'image',
        id: 'diagram',
        svg: diagram.svg,
        drawing: diagram,
        widthPx: diagram.width,
        heightPx: diagram.height,
        alt: 'test',
        section: 'diagram',
      })

      expect(base64).toBe('QUJD')
      expect(aanroepen.filter((a) => a.startsWith('fillText')).length).toBeGreaterThan(5)
      expect(aanroepen.some((a) => a.startsWith('arcTo'))).toBe(true)
      expect(aanroepen.some((a) => a.startsWith('stroke('))).toBe(true)
      expect(aanroepen.some((a) => a.startsWith('fill('))).toBe(true)
    } finally {
      HTMLCanvasElement.prototype.getContext = origineleContext
      HTMLCanvasElement.prototype.toDataURL = origineleUrl
    }
  })

  it('valt terug op de alt-tekst als het tekenen misgaat', async () => {
    const { renderWorkbook } = await import('../src/render/workbook')
    const model = buildModel('stad-wijk', 'terugval')
    const result = solve(model)
    const style = defaultStyle()
    const plan = buildPlan('A', model, result, style)

    const rendered = await renderWorkbook(plan, model, result, style, {
      rasterize: async () => {
        throw new Error('geen canvas')
      },
    })
    expect(rendered.buffer.length).toBeGreaterThan(4000)
  })
})
