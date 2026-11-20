import { StaticCanvas } from 'fabric'
import { Template } from '@/types/canvas'
import { WorkSpaceDrawType, WorkSpaceThumbType } from '@/configs/canvas'
import { ElementNames } from '@/types/elements'

export interface RenderedPage {
  /** Canvas fabric ẩn đã nạp trang, khung nhìn đặt đúng vào vùng làm việc. */
  canvas: StaticCanvas
  /** Phần tử <canvas> chứa hình đã vẽ. */
  element: HTMLCanvasElement
  width: number
  height: number
  /** Toạ độ góc trên-trái của vùng làm việc trong hệ toạ độ của trang. */
  originX: number
  originY: number
  scale: number
  dispose: () => void
}

/**
 * Vẽ một trang ra canvas ẩn theo tỉ lệ `scale` (1 = đúng kích thước điểm ảnh của trang).
 * Không đụng tới canvas đang chỉnh sửa nên không làm mất vùng chọn hay nháy màn hình.
 * Trả về null nếu trang không có kích thước hợp lệ hoặc không nạp được.
 */
export async function renderPage(page: Template, scale: number): Promise<RenderedPage | null> {
  const zoom = page.zoom || 1
  const pageWidth = page.width / zoom
  const pageHeight = page.height / zoom
  if (!(pageWidth > 0) || !(pageHeight > 0) || !(scale > 0)) return null
  const dimensions = { width: Math.round(pageWidth * scale), height: Math.round(pageHeight * scale) }

  const canvas = new StaticCanvas(undefined, { ...dimensions, enableRetinaScaling: false, backgroundColor: '#fff' })
  try {
    await canvas.loadFromJSON(JSON.parse(JSON.stringify(page)))
    canvas.getObjects().forEach((item: any) => {
      if (WorkSpaceThumbType.includes(item.id) || item.type === ElementNames.REFERENCELINE) item.visible = false
    })
    const workSpace = canvas.getObjects().find((item: any) => item.id === WorkSpaceDrawType)
    const originX = workSpace?.left ?? 0
    const originY = workSpace?.top ?? 0
    // loadFromJSON gán cả width/height của trang vào canvas, nên phải đặt lại kích thước sau khi nạp.
    canvas.setDimensions(dimensions)
    canvas.setViewportTransform([scale, 0, 0, scale, -originX * scale, -originY * scale])
    canvas.renderAll()
    return {
      canvas,
      element: canvas.lowerCanvasEl,
      ...dimensions,
      originX,
      originY,
      scale,
      dispose: () => { canvas.dispose() },
    }
  } catch (_) {
    canvas.dispose()
    return null
  }
}

/**
 * Ảnh thu nhỏ của một trang (cạnh dài = `size` px), dạng WebP.
 * Trả về null nếu không vẽ được (vd trang có ảnh khác nguồn làm "bẩn" canvas).
 */
export async function renderPageThumbnail(page: Template, size = 480): Promise<Blob | null> {
  const zoom = page.zoom || 1
  const longSide = Math.max(page.width / zoom, page.height / zoom)
  if (!(longSide > 0)) return null
  const rendered = await renderPage(page, size / longSide)
  if (!rendered) return null
  try {
    return await new Promise<Blob | null>((resolve) => {
      try {
        rendered.element.toBlob((blob) => resolve(blob), 'image/webp', 0.85)
      } catch (_) {
        resolve(null)
      }
    })
  } finally {
    rendered.dispose()
  }
}
