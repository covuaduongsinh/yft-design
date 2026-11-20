
import { ref } from 'vue'
import { saveAs } from 'file-saver'
import { storeToRefs } from 'pinia'
import { useFabricStore, useTemplatesStore } from '@/store'
import { WorkSpaceThumbType, WorkSpaceClipType, WorkSpaceCommonType, WorkSpaceSafeType, propertiesToInclude } from '@/configs/canvas'
import { ImageFormat } from 'fabric'
import { ElMessage } from 'element-plus'
import { downloadSVGFile } from '@/utils/download'
import { changeDpiDataUrl } from 'changedpi'
import useCanvas from '@/views/Canvas/useCanvas'
import useCenter from '@/views/Canvas/useCenter'
import { ElementNames } from '@/types/elements'
import { Template } from '@/types/canvas'
import { renderPage } from '@/utils/pageThumbnail'
import { px2mm } from '@/utils/image'

// Giới hạn kích thước canvas mà các trình duyệt phổ biến còn xử lý được ổn định.
const MAX_EXPORT_SIDE = 12000
const MAX_EXPORT_PIXELS = 80_000_000

export default () => {
  
  const Exporting = ref(false)
  const { showClip, showSafe } = storeToRefs(useFabricStore())
  const { currentTemplate, templateCanvas, templates } = storeToRefs(useTemplatesStore())
  // 导出图片
  const exportImage = (format: ImageFormat, quality: number, dpi: number, ignoreClip = true) => {
    Exporting.value = true
    const [ canvas ] = useCanvas()
    const { left, top, width, height } = useCenter()
    const zoom = canvas.getZoom()
    const viewportTransform = canvas.viewportTransform
    const activeObject = canvas.getActiveObject()
    let ignoreObjects = canvas.getObjects().filter(obj => WorkSpaceCommonType.includes(obj.id))
    if (format === 'jpeg') {
      ignoreObjects = canvas.getObjects().filter(obj => WorkSpaceThumbType.includes(obj.id))
    }
    if (ignoreClip) {
      ignoreObjects.map(item => item.set({visible: false}))
      canvas.renderAll()
    }
    if (activeObject) canvas.discardActiveObject()
    canvas.getObjects().filter(item => item.type === ElementNames.REFERENCELINE && item.visible === true).map(item => item.set({visible: false}))
    canvas.set({background: 'rgba(255,255,255,0)'})
    canvas.renderAll()
    let result = canvas.toDataURL({
      multiplier: 1 / zoom,
      // multiplier: 2,
      quality: quality,
      format: format,
      width: width * zoom,
      height: height * zoom,
      left: left * zoom + viewportTransform[4],
      top: top * zoom + viewportTransform[5]
    })
    result = changeDpiDataUrl(result, dpi)
    saveAs(result, `yft-design-${Date.now()}.${format}`)
    Exporting.value = false
    ignoreObjects.map(item => item.set({visible: true}))
    canvas.getObjects().filter(obj => obj.id === WorkSpaceClipType).map(item => item.set({visible: showClip.value}))
    canvas.getObjects().filter(obj => obj.id === WorkSpaceSafeType).map(item => item.set({visible: showSafe.value}))
    if (activeObject) canvas.setActiveObject(activeObject)
    canvas.getObjects().filter(item => item.type === ElementNames.REFERENCELINE && item.visible === false).map(item => item.set({visible: true}))
    canvas.renderAll()
  }

  const getSVGData = () => {
    const [ canvas ] = useCanvas()
    const { left, top, width, height } = useCenter()
    canvas.getObjects().filter(item => item.type === ElementNames.REFERENCELINE && item.visible === true).map(item => item.set({visible: false}))
    canvas.renderAll()
    const data = canvas.toSVG({
      viewBox: {
        x: left,
        y: top,
        width: width,
        height: height,
      },
      width: width + 'px',
      height: height + 'px'
    }, (element) => element)
    canvas.getObjects().filter(item => item.type === ElementNames.REFERENCELINE && item.visible === false).map(item => item.set({visible: true}))
    canvas.renderAll()
    return data
  }

  const getJSONData = () => {
    const [ canvas ] = useCanvas()
    const serializer = canvas.toObject(propertiesToInclude)
    serializer.workSpace = currentTemplate.value.workSpace
    serializer.zoom = currentTemplate.value.zoom
    serializer.width = currentTemplate.value.width
    serializer.height = currentTemplate.value.height
    // console.log(JSON.stringify(serializer));
    
    return serializer
  }

  const exportSVG = () => {
    const [ canvas ] = useCanvas()
    const ignoreObjects = canvas.getObjects().filter(obj => WorkSpaceThumbType.includes(obj.id))
    ignoreObjects.map(item => item.set({visible: false}))
    canvas.renderAll()
    const data = getSVGData()
    downloadSVGFile(data, `yft-design-${Date.now()}.svg`)
    ignoreObjects.map(item => item.set({visible: true}))
    canvas.getObjects().filter(obj => obj.id === WorkSpaceClipType).map(item => item.set({visible: showClip.value}))
    canvas.getObjects().filter(obj => obj.id === WorkSpaceSafeType).map(item => item.set({visible: showSafe.value}))
    canvas.renderAll()
  }

  // Xuất PDF và PSD được làm ngay trong trình duyệt (trước đây gửi SVG lên máy chủ yft.design).
  // Mỗi trang được vẽ lại từ dữ liệu tài liệu trên một canvas ẩn, nên giữ đúng font, hiệu ứng
  // và không phụ thuộc trang nào đang mở.

  /** Tỉ lệ vẽ sao cho ảnh xuất ra không vượt giới hạn canvas của trình duyệt. */
  const exportScale = (page: Template) => {
    const width = page.width / page.zoom
    const height = page.height / page.zoom
    return Math.min(1, MAX_EXPORT_SIDE / Math.max(width, height), Math.sqrt(MAX_EXPORT_PIXELS / (width * height)))
  }

  const reportExportError = (error: unknown) => {
    const tainted = error instanceof DOMException && error.name === 'SecurityError'
    ElMessage.error(tainted
      ? 'Không xuất được vì thiết kế có ảnh từ trang web khác. Hãy lưu thiết kế (ảnh sẽ được đưa về máy chủ) rồi xuất lại.'
      : 'Xuất tệp thất bại')
  }

  // 导出PDF
  /**
   * Mỗi trang thành một trang PDF đúng kích thước in (điểm ảnh của trang tính ở 300 DPI),
   * nội dung là ảnh — chữ trong PDF không chọn/tìm kiếm được.
   */
  const exportPDF = async (rangeType?: string) => {
    Exporting.value = true
    try {
      const { jsPDF } = await import('jspdf')
      const store = useTemplatesStore()
      const all = store.snapshotDocument()
      const pages = rangeType === 'all' ? all : [all[store.templateIndex]]
      let pdf: InstanceType<typeof jsPDF> | undefined
      for (const page of pages) {
        const rendered = await renderPage(page, exportScale(page))
        if (!rendered) continue
        try {
          const widthMM = px2mm(page.width / page.zoom)
          const heightMM = px2mm(page.height / page.zoom)
          const orientation = widthMM > heightMM ? 'landscape' : 'portrait'
          if (!pdf) pdf = new jsPDF({ orientation, unit: 'mm', format: [widthMM, heightMM], compress: true })
          else pdf.addPage([widthMM, heightMM], orientation)
          pdf.addImage(rendered.element.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, widthMM, heightMM)
        } finally {
          rendered.dispose()
        }
      }
      if (!pdf) throw new Error('Không có trang nào để xuất')
      pdf.save(`yft-design-${Date.now()}.pdf`)
    } catch (error) {
      reportExportError(error)
    } finally {
      Exporting.value = false
    }
  }

  // 导出PSD
  /** Xuất trang đang mở thành PSD, mỗi đối tượng là một lớp riêng (dạng ảnh) để chỉnh tiếp trong Photoshop. */
  const exportPSD = async () => {
    Exporting.value = true
    try {
      const { writePsd } = await import('ag-psd')
      const store = useTemplatesStore()
      const page = store.snapshotDocument()[store.templateIndex]
      const rendered = await renderPage(page, exportScale(page))
      if (!rendered) throw new Error('Không vẽ được trang')
      try {
        const { canvas, scale, originX, originY, width, height } = rendered
        const copy = (source: HTMLCanvasElement, x: number, y: number, w: number, h: number) => {
          const target = document.createElement('canvas')
          target.width = w
          target.height = h
          ;(target.getContext('2d') as CanvasRenderingContext2D).drawImage(source, x, y, w, h, 0, 0, w, h)
          return target
        }
        // Ảnh gộp của cả trang (Photoshop và trình xem trước dùng ảnh này).
        const composite = copy(rendered.element, 0, 0, width, height)

        // Vẽ lần lượt từng đối tượng một mình trên nền trong suốt, rồi cắt lấy đúng vùng của nó.
        const objects = canvas.getObjects().filter(item => item.visible)
        canvas.backgroundColor = ''
        const children = []
        for (const object of objects) {
          objects.forEach(item => { item.visible = item === object })
          canvas.renderAll()
          const box = object.getBoundingRect()
          const left = Math.max(0, Math.floor((box.left - originX) * scale))
          const top = Math.max(0, Math.floor((box.top - originY) * scale))
          const right = Math.min(width, Math.ceil((box.left + box.width - originX) * scale))
          const bottom = Math.min(height, Math.ceil((box.top + box.height - originY) * scale))
          if (right <= left || bottom <= top) continue
          children.push({
            name: String((object as any).name || (object as any).text || object.type).slice(0, 60),
            left,
            top,
            canvas: copy(rendered.element, left, top, right - left, bottom - top),
          })
        }
        const buffer = writePsd({ width, height, children, canvas: composite })
        saveAs(new Blob([buffer], { type: 'image/vnd.adobe.photoshop' }), `yft-design-${Date.now()}.psd`)
      } finally {
        rendered.dispose()
      }
    } catch (error) {
      reportExportError(error)
    } finally {
      Exporting.value = false
    }
  }

  // 导出json
  // Xuất cả tài liệu: một trang thì là một đối tượng, nhiều trang thì là một mảng —
  // cả hai dạng đều nhập lại được bằng "Nhập tệp".
  const exportJSON = () => {
    const pages = useTemplatesStore().snapshotDocument()
    const blob = new Blob([JSON.stringify(pages.length === 1 ? pages[0] : pages)])
    saveAs(blob, `yft-design-${Date.now()}.json`)
  }

  return {
    exportImage,
    exportPDF,
    exportPSD,
    exportJSON,
    exportSVG,
    getJSONData,
    getSVGData,
    Exporting
  }
}