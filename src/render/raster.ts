/**
 * De diagramvormen op een canvas, en van daaruit naar png. Alleen in de
 * browser: Node heeft geen canvas, en daar valt de renderer terug op de
 * alt-tekst. De werkelijke bestanden worden in de browser gemaakt, dus dat
 * raakt de docent niet.
 */
import type { ImageBlock, Rasterizer } from './workbook'
import type { Shape } from './shapes'

export function canvasRasterizer(scale = 2): Rasterizer {
  return async (image: ImageBlock): Promise<string | null> => {
    if (typeof document === 'undefined') return null
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(image.widthPx * scale)
    canvas.height = Math.ceil(image.heightPx * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    ctx.scale(scale, scale)
    ctx.fillStyle = image.drawing.background
    ctx.fillRect(0, 0, image.widthPx, image.heightPx)
    for (const shape of image.drawing.shapes) draw(ctx, shape)

    const dataUrl = canvas.toDataURL('image/png')
    const komma = dataUrl.indexOf(',')
    return komma >= 0 ? dataUrl.slice(komma + 1) : null
  }
}

function draw(ctx: CanvasRenderingContext2D, shape: Shape): void {
  switch (shape.kind) {
    case 'rect':
      ctx.beginPath()
      rounded(ctx, shape.x, shape.y, shape.w, shape.h, shape.radius)
      ctx.fillStyle = shape.fill
      ctx.fill()
      if (shape.strokeWidth > 0) {
        ctx.strokeStyle = shape.stroke
        ctx.lineWidth = shape.strokeWidth
        ctx.stroke()
      }
      break
    case 'line':
      ctx.beginPath()
      ctx.moveTo(shape.x1, shape.y1)
      ctx.lineTo(shape.x2, shape.y2)
      ctx.strokeStyle = shape.stroke
      ctx.lineWidth = shape.strokeWidth
      ctx.setLineDash(shape.dashed ? [5, 4] : [])
      ctx.stroke()
      ctx.setLineDash([])
      break
    case 'polyline': {
      const [eerste, ...rest] = shape.points
      if (!eerste) break
      ctx.beginPath()
      ctx.moveTo(eerste[0], eerste[1])
      for (const [x, y] of rest) ctx.lineTo(x, y)
      ctx.strokeStyle = shape.stroke
      ctx.lineWidth = shape.strokeWidth
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      ctx.stroke()
      break
    }
    case 'polygon': {
      const [eerste, ...rest] = shape.points
      if (!eerste) break
      ctx.beginPath()
      ctx.moveTo(eerste[0], eerste[1])
      for (const [x, y] of rest) ctx.lineTo(x, y)
      ctx.closePath()
      ctx.fillStyle = shape.fill
      ctx.fill()
      break
    }
    case 'text':
      ctx.font = `${shape.bold ? 'bold ' : ''}${shape.size}px ${shape.font}, sans-serif`
      ctx.fillStyle = shape.fill
      ctx.textAlign = shape.anchor === 'middle' ? 'center' : shape.anchor === 'end' ? 'right' : 'left'
      ctx.textBaseline = 'alphabetic'
      ctx.fillText(shape.text, shape.x, shape.y)
      break
  }
}

function rounded(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const straal = Math.min(r, w / 2, h / 2)
  ctx.moveTo(x + straal, y)
  ctx.arcTo(x + w, y, x + w, y + h, straal)
  ctx.arcTo(x + w, y + h, x, y + h, straal)
  ctx.arcTo(x, y + h, x, y, straal)
  ctx.arcTo(x, y, x + w, y, straal)
  ctx.closePath()
}
