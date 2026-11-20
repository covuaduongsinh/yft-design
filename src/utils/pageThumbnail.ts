import { StaticCanvas } from 'fabric'
import { Template } from '@/types/canvas'
import { WorkSpaceDrawType, WorkSpaceThumbType } from '@/configs/canvas'
import { ElementNames } from '@/types/elements'

/**
 * Vẽ một trang ra canvas ẩn và trả về ảnh thu nhỏ (cạnh dài = `size` px).
 * Không đụng tới canvas đang chỉnh sửa nên không làm mất vùng chọn hay nháy màn hình.
 * Trả về null nếu không vẽ được (vd trang có ảnh khác nguồn làm "bẩn" canvas).
 */
export async function renderPageThumbnail(page: Template, size = 480): Promise<Blob | null> {
  const zoom = page.zoom || 1
  const pageWidth = page.width / zoom
  const pageHeight = page.height / zoom
  if (!(pageWidth > 0) || !(pageHeight > 0)) return null
  const scale = size / Math.max(pageWidth, pageHeight)
  const dimensions = { width: Math.round(pageWidth * scale), height: Math.round(pageHeight * scale) }

  const canvas = new StaticCanvas(undefined, { ...dimensions, enableRetinaScaling: false, backgroundColor: '#fff' })
  try {
    await canvas.loadFromJSON(JSON.parse(JSON.stringify(page)))
    canvas.getObjects().forEach((item: any) => {
      if (WorkSpaceThumbType.includes(item.id) || item.type === ElementNames.REFERENCELINE) item.visible = false
    })
    const workSpace = canvas.getObjects().find((item: any) => item.id === WorkSpaceDrawType)
    // loadFromJSON gán cả width/height của trang vào canvas, nên phải đặt lại kích thước sau khi nạp.
    canvas.setDimensions(dimensions)
    canvas.setViewportTransform([scale, 0, 0, scale, -(workSpace?.left ?? 0) * scale, -(workSpace?.top ?? 0) * scale])
    canvas.renderAll()
    const element = canvas.lowerCanvasEl
    return await new Promise<Blob | null>((resolve) => {
      try {
        element.toBlob((blob) => resolve(blob), 'image/webp', 0.85)
      } catch (_) {
        resolve(null)
      }
    })
  } catch (_) {
    return null
  } finally {
    canvas.dispose()
  }
}
