import { watch } from 'vue'
import { storeToRefs } from 'pinia'
import { debounce } from 'lodash-es'
import { Canvas, FabricObject, Textbox, Group, Point, IText, Line, ModifiedEvent } from 'fabric'
import { WorkSpaceThumbType, WorkSpaceDrawType, propertiesToInclude } from "@/configs/canvas"
import { useFabricStore } from '@/store/modules/fabric'
import { useElementBounding } from '@vueuse/core'
import { FabricTool } from '@/app/fabricTool'
import { FabricGuide } from '@/app/fabricGuide'
import { HoverBorders } from '@/app/hoverBorders'
import { WheelScroll } from '@/app/wheelScroll'
import { FabricRuler } from '@/app/fabricRuler'
import { FabricTouch } from '@/app/fabricTouch'
import { isMobile } from '@/utils/common'
import { FabricCanvas } from '@/app/fabricCanvas'
import { Keybinding } from '@/app/keybinding'
import { defaultControls, textboxControls } from '@/app/fabricControls'
import { getObjectsBoundingBox } from '@/extension/util/common'
import { useTemplatesStore } from '@/store'
import useCommon from './useCommon'
import { SnapshotType, Snapshot } from '@/types/history'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'




let canvas: null | FabricCanvas = null

// 初始化配置
const initConf = () => {
  FabricObject.ownDefaults.objectCaching = false
  FabricObject.ownDefaults.borderColor = 'blue'
  FabricObject.ownDefaults.cornerColor = 'white'
  FabricObject.ownDefaults.cornerStrokeColor = '#c0c0c0'
  FabricObject.ownDefaults.borderOpacityWhenMoving = 1
  FabricObject.ownDefaults.borderScaleFactor = 1
  FabricObject.ownDefaults.cornerSize = 8
  FabricObject.ownDefaults.cornerStyle = 'rect'
  FabricObject.ownDefaults.centeredScaling = false
  FabricObject.ownDefaults.centeredRotation = true
  FabricObject.ownDefaults.transparentCorners = false
  // FabricObject.ownDefaults.rotatingPointOffset = 1
  // FabricObject.ownDefaults.lockUniScaling = true
  // FabricObject.ownDefaults.hasRotatingPoint = false
  FabricObject.ownDefaults.controls = defaultControls()

  Object.assign(Textbox.ownDefaults, { controls: textboxControls() })
  Object.assign(IText.ownDefaults, { controls: textboxControls() })

  const mixin = {
    getWidthHeight(noFixed = false): Point {
      const objScale = (this as FabricObject).getObjectScaling()
      const point = (this as FabricObject)._getTransformedDimensions({
        scaleX: objScale.x,
        scaleY: objScale.y,
      })
      if (!noFixed) {
        point.setX(point.x)
        point.setY(point.y)
      }
      return point
    },
    getHeight() {
      return this.getWidthHeight().y
    },
    getWidth() {
      return this.getWidthHeight().x
    },
  }

  Object.assign(FabricObject.prototype, mixin)
}

// 更新视图区长宽
const setCanvasTransform = () => {
  if (!canvas) return
  const fabricStore = useFabricStore()
  const { zoom, wrapperRef, scalePercentage } = storeToRefs(fabricStore)
  const { width, height } = useElementBounding(wrapperRef.value)
  canvas.setDimensions({width: width.value, height: height.value})
  const objects = canvas.getObjects().filter(ele => !WorkSpaceThumbType.includes(ele.id))
  const boundingBox = getObjectsBoundingBox(objects)
  if (!boundingBox) return
  let boxWidth = boundingBox.width, boxHeight = boundingBox.height
  let centerX = boundingBox.centerX, centerY = boundingBox.centerY
  const workSpaceDraw = canvas.getObjects().filter(item => item.id === WorkSpaceDrawType)[0]
  if (workSpaceDraw) {
    boxWidth = workSpaceDraw.width
    boxHeight = workSpaceDraw.height
    centerX = workSpaceDraw.left + workSpaceDraw.width / 2
    centerY = workSpaceDraw.top + workSpaceDraw.height / 2 
  }
  zoom.value = Math.min(canvas.getWidth() / boxWidth, canvas.getHeight() / boxHeight) * scalePercentage.value / 100
  canvas.setZoom(zoom.value)
  canvas.absolutePan(new Point(centerX, centerY).scalarMultiply(zoom.value).subtract(canvas.getCenterPoint()), true)
}

const initCanvas = () => {
  const fabricStore = useFabricStore()
  const { canvasRef } = storeToRefs(fabricStore)
  const fabricWidth = fabricStore.getWidth()
  const fabricHeight = fabricStore.getHeight()
  if (!canvasRef.value) return
  canvas = new FabricCanvas(canvasRef.value, {
    width: fabricWidth,
    height: fabricHeight
  })
  // const keybinding = new Keybinding()
  new FabricTool(canvas)
  new FabricGuide(canvas)
  new HoverBorders(canvas)
  new WheelScroll(canvas)
  new FabricRuler(canvas)
  new FabricTouch(canvas)
  canvas.preserveObjectStacking = true
  canvas.renderAll()
}

const initEvent = () => {
  if (!canvas) return
  const templatesStore = useTemplatesStore()
  const { templateId } = storeToRefs(templatesStore)
  // Một số đối tượng tự phát 'object:modified' không kèm dữ liệu (ArcText, ReferenceLine),
  // nên không được giả định sự kiện luôn có `transform`.
  canvas.on('object:modified', (e?: Partial<ModifiedEvent>) => {
    const target = canvas?._activeObject?.toObject(propertiesToInclude)
    if (!target) return
    const index = canvas?._objects.findIndex(item => item.id === target.id) ?? -1
    // index 0 là khung vùng làm việc, không ghi lịch sử cho nó.
    if (index <= 0) return
    const data: Snapshot = {
      type: SnapshotType.MODIFY,
      index,
      target,
      transform: e?.transform,
      action: e?.action,
      tid: templateId.value
    };
    const { addHistorySnapshot } = useHistorySnapshot()
    addHistorySnapshot(data)
  })

  // Ghi chỉnh sửa trên canvas về store khi canvas đã "yên": mọi thay đổi nhìn thấy được
  // đều đi qua một lần render, kể cả những thay đổi không phát sự kiện 'object:modified'
  // (bảng thuộc tính, thứ tự lớp, nền, hoàn tác...).
  const commitWhenIdle = debounce(() => templatesStore.commitCurrentPage(), 500, { maxWait: 3000 })
  canvas.on('after:render', commitWhenIdle)
}

// 初始化模板
const initTemplate = async (skipDefault?: boolean) => {
  if (!canvas) return
  const { initCommon } = useCommon()
  const templatesStore = useTemplatesStore()
  const { currentTemplate } = storeToRefs(templatesStore)
  // Sẽ mở một template/thiết kế từ server: không vẽ tài liệu mẫu mặc định.
  if (skipDefault) return
  await templatesStore.withCanvasLoading(async (target) => {
    await target.loadFromJSON(currentTemplate.value)
    setCanvasTransform()
    initCommon()
  })
}

/**
 * @param skipDefault true khi trang sẽ tự nạp một tài liệu khác ngay sau đó
 */
export const initEditor = async (skipDefault?: boolean) => {
  const fabricStore = useFabricStore()
  const { wrapperRef } = storeToRefs(fabricStore)
  initConf()
  initCanvas()
  useTemplatesStore().resetCanvasBinding()
  if (import.meta.env.DEV) {
    // Chỉ có ở bản dev: cho phép kiểm thử tự động đọc canvas và store từ console.
    (window as any).__yftDebug = { canvas: () => canvas, templates: () => useTemplatesStore() }
  }
  // Đăng ký sự kiện ngay khi có canvas; trước đây bị bỏ qua nếu mở bằng ?template=...
  initEvent()
  initTemplate(skipDefault)
  const { width, height } = useElementBounding(wrapperRef.value)
  watch([width, height], () => {
    setCanvasTransform()
  })
}

export default (): [FabricCanvas] => [canvas as FabricCanvas]