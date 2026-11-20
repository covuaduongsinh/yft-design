import { nanoid } from 'nanoid'
import { Template } from '@/types/canvas'
import { WorkSpaceDrawData } from '@/configs/canvas'

// Nhập file PSD, PDF và AI ngay trong trình duyệt (trước đây gửi lên máy chủ yft.design).
// Thư viện xử lý khá nặng nên chỉ được tải về khi người dùng thật sự nhập loại file đó.

const MAX_PDF_PAGES = 50
const MAX_PSD_LAYERS = 300
/** Cạnh dài tối đa (px) của ảnh tạo ra từ một trang PDF. */
const MAX_PAGE_SIDE = 5000
/** Trang trong tài liệu dùng đơn vị điểm ảnh ở 300 DPI; PDF dùng điểm (72 mỗi inch). */
const PDF_SCALE = 300 / 72

const blankPage = (width: number, height: number, objects: any[]): Template => ({
  id: nanoid(10),
  version: '6.12',
  zoom: 1,
  width,
  height,
  clip: 2,
  objects: [{ ...WorkSpaceDrawData, width, height }, ...objects] as any,
  workSpace: { fillType: 0, left: 0, top: 0, angle: 0, scaleX: 1, scaleY: 1 },
})

const imageObject = (src: string, left: number, top: number, width: number, height: number, extra: Record<string, unknown> = {}) => ({
  type: 'Image',
  id: nanoid(10),
  left,
  top,
  width,
  height,
  scaleX: 1,
  scaleY: 1,
  originX: 'left',
  originY: 'top',
  crossOrigin: null,
  filters: [],
  src,
  ...extra,
})

/** Mỗi lớp của file PSD thành một ảnh riêng, giữ đúng vị trí, thứ tự và độ trong suốt. */
async function psdToTemplates(file: File): Promise<Template[]> {
  const { readPsd } = await import('ag-psd')
  const psd = readPsd(await file.arrayBuffer(), { skipThumbnail: true, skipCompositeImageData: true })

  const objects: any[] = []
  const visit = (layers: any[] | undefined, parentHidden: boolean, parentOpacity: number) => {
    for (const layer of layers || []) {
      if (objects.length >= MAX_PSD_LAYERS) return
      const hidden = parentHidden || !!layer.hidden
      const opacity = parentOpacity * (typeof layer.opacity === 'number' ? layer.opacity : 1)
      if (layer.children) {
        visit(layer.children, hidden, opacity)
        continue
      }
      const canvas = layer.canvas as HTMLCanvasElement | undefined
      if (!canvas || canvas.width === 0 || canvas.height === 0) continue
      objects.push(imageObject(canvas.toDataURL('image/png'), layer.left || 0, layer.top || 0, canvas.width, canvas.height, {
        name: layer.name || 'Lớp',
        opacity,
        visible: !hidden,
      }))
    }
  }
  visit(psd.children, false, 1)

  // File chỉ có ảnh gộp (không có lớp): dùng luôn ảnh gộp làm một lớp.
  if (objects.length === 0) {
    const flat = readPsd(await file.arrayBuffer(), { skipThumbnail: true, skipLayerImageData: true })
    if (flat.canvas) objects.push(imageObject(flat.canvas.toDataURL('image/png'), 0, 0, flat.width, flat.height))
  }
  if (objects.length === 0) throw new Error('Không đọc được lớp nào trong file PSD này')
  return [blankPage(psd.width, psd.height, objects)]
}

/** Mỗi trang PDF thành một trang thiết kế chứa ảnh của trang đó (300 DPI). */
async function pdfToTemplates(file: File): Promise<Template[]> {
  const buffer = await file.arrayBuffer()
  const head = new TextDecoder('latin1').decode(new Uint8Array(buffer, 0, Math.min(1024, buffer.byteLength)))
  if (!head.includes('%PDF-')) {
    throw new Error('File này không ở định dạng PDF. File AI chỉ nhập được khi được lưu kèm tuỳ chọn tương thích PDF.')
  }

  // Bản "legacy" của pdf.js dành cho công cụ build và trình duyệt cũ hơn.
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const workerUrl = (await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

  const loadingTask = pdfjs.getDocument({ data: buffer })
  const pdf = await loadingTask.promise
  const pages: Template[] = []
  try {
    const count = Math.min(pdf.numPages, MAX_PDF_PAGES)
    for (let index = 1; index <= count; index++) {
      const page = await pdf.getPage(index)
      const base = page.getViewport({ scale: 1 })
      const scale = Math.min(PDF_SCALE, MAX_PAGE_SIDE / Math.max(base.width, base.height))
      const viewport = page.getViewport({ scale })
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(viewport.width)
      canvas.height = Math.round(viewport.height)
      const context = canvas.getContext('2d') as CanvasRenderingContext2D
      context.fillStyle = '#fff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      await page.render({ canvasContext: context, viewport, canvas } as any).promise
      pages.push(blankPage(canvas.width, canvas.height, [
        imageObject(canvas.toDataURL('image/jpeg', 0.92), 0, 0, canvas.width, canvas.height, { name: `Trang ${index}` }),
      ]))
      page.cleanup()
    }
  } finally {
    // Giải phóng worker và bộ nhớ của tài liệu PDF.
    await loadingTask.destroy()
  }
  if (pages.length === 0) throw new Error('File PDF không có trang nào')
  return pages
}

/**
 * Chuyển một file thiết kế thành các trang để thêm vào tài liệu.
 * Trả về null nếu phần mở rộng không thuộc loại xử lý ở đây (ảnh, SVG, JSON... do nơi gọi tự lo).
 * Ném Error kèm thông báo tiếng Việt nếu file thuộc loại này nhưng không nhập được.
 */
export async function importDesignFile(file: File): Promise<Template[] | null> {
  const extension = (file.name.split('.').pop() || '').toLowerCase()
  if (extension === 'psd') return psdToTemplates(file)
  if (extension === 'pdf' || extension === 'ai') return pdfToTemplates(file)
  if (extension === 'cdr') throw new Error('Chưa hỗ trợ nhập file CDR. Hãy xuất sang PDF hoặc SVG rồi nhập lại.')
  return null
}
