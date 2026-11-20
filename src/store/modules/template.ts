import { defineStore } from 'pinia'
import { Templates } from '@/mocks/templates'
import { Template, CanvasElement, ImageElement, GroupElement, RectElement } from '@/types/canvas'
import { FabricObject, SerializedImageProps, FabricImage, Group, StaticCanvas } from 'fabric'
import { WorkSpaceDrawType, propertiesToInclude } from '@/configs/canvas'
import { nanoid } from 'nanoid'
import { useMainStore } from './main'
import { useFabricStore } from './fabric'
import { useSnapshotStore } from './snapshot'
import { ElementNames } from '@/types/elements'
import { ElLoading } from 'element-plus'
import { Snapshot, SnapshotType } from '@/types/history'
import useCanvasScale from '@/hooks/useCanvasScale'
import useCanvas from '@/views/Canvas/useCanvas'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'
import useCommon from '@/views/Canvas/useCommon'


interface UpdateElementData {
  id: string | string[]
  left?: number
  top?: number
  props: Partial<CanvasElement>
}

export interface TemplatesState {
  templateId: string
  templates: Template[]
  templateIndex: number
  templateCanvas: Map<string, StaticCanvas>
}

// ---------------------------------------------------------------------------
// Đồng bộ canvas -> store.
//
// Canvas fabric là nơi người dùng thực sự chỉnh sửa, còn `templates` trong store
// là dữ liệu của cả tài liệu (mọi trang). Trước đây canvas KHÔNG được ghi ngược về
// store, nên mỗi lần `renderTemplate()` vẽ lại từ store (đổi trang, thêm trang...)
// là mất chỉnh sửa của trang đang mở. Ba biến dưới đây theo dõi canvas đang hiển
// thị trang nào và nội dung nào đã được ghi về store.
// ---------------------------------------------------------------------------

/** id của trang mà canvas đang hiển thị; '' nếu chưa vẽ trang nào. */
let renderedPageId = ''
/** Số lần `loadFromJSON` đang chạy dở; lớn hơn 0 thì canvas chưa ở trạng thái đọc được. */
let renderDepth = 0
/** Nội dung canvas (dạng chuỗi JSON) ở lần đồng bộ gần nhất. */
let syncedContent = ''

const serializeCanvasContent = (canvas: FabricCanvasLike) => {
  const serialized = canvas.toObject(propertiesToInclude)
  return JSON.stringify({
    objects: serialized.objects,
    background: serialized.background,
    backgroundImage: serialized.backgroundImage,
  })
}

type FabricCanvasLike = ReturnType<typeof useCanvas>[0]

/** Mỗi trang phải có id duy nhất: thumbnail, phím tắt và việc đồng bộ đều tìm trang theo id. */
const ensurePageIds = (templates: Template[]) => {
  const seen = new Set<string>()
  templates.forEach((template) => {
    if (!template.id || seen.has(template.id)) template.id = nanoid(10)
    seen.add(template.id)
  })
  return templates
}

export const useTemplatesStore = defineStore('Templates', {
  state: (): TemplatesState => ({
    // theme: theme, // 主题样式
    templateId: '',
    templates: ensurePageIds(Templates), // 页面页面数据
    templateIndex: 0, // 当前页面索引
    templateCanvas: new Map()
    // fixedRatio: false, // 固定比例
    // slideUnit: 'mm', // 尺寸单位
    // slideName: '', // 模板名称
    // slideId: '', // 模板id
  }),

  getters: {
    currentTemplate(state) {
      return state.templates[state.templateIndex] as Template
    },

    currentTemplateWidth(state) {
      const currentTemplate = state.templates[state.templateIndex]
      return currentTemplate.width / currentTemplate.zoom
    },

    currentTemplateHeight(state) {
      const currentTemplate = state.templates[state.templateIndex]
      return currentTemplate.height / currentTemplate.zoom
    },

    // currentTemplateElement(state) {
    //   const currentTemplate = state.templates[state.templateIndex]
    //   const [ canvas ] = useCanvas()
    //   const activeObject = canvas.getActiveObject() as CanvasElement
    //   return currentTemplate.objects.filter(ele => ele.id === activeObject.id)[0]
    // }
  },

  actions: {
    /**
     * Ghi nội dung trang đang hiển thị trên canvas về store.
     * Phải gọi trước mọi thao tác vẽ lại canvas từ store hoặc đọc `templates` để lưu/xuất.
     * @returns true nếu store thực sự thay đổi
     */
    commitCurrentPage(): boolean {
      const [ canvas ] = useCanvas()
      if (!canvas || renderDepth > 0 || !renderedPageId) return false
      // Đang kéo/đổi kích thước hoặc đang cắt ảnh: trạng thái trung gian, chờ thao tác xong.
      if ((canvas as any)._currentTransform || useFabricStore().isCropping) return false
      const index = this.templates.findIndex(item => item.id === renderedPageId)
      if (index < 0) return false

      const content = serializeCanvasContent(canvas)
      if (content === syncedContent) return false
      syncedContent = content
      // JSON.parse cho ra bản sao thuần, không dính đối tượng fabric hay proxy của Vue.
      const plain = JSON.parse(content)
      const current = this.templates[index]
      this.templates[index] = {
        ...current,
        objects: plain.objects,
        background: plain.background ?? current.background,
        backgroundImage: plain.backgroundImage,
      }
      return true
    },

    /** Bản sao đầy đủ của tài liệu (mọi trang), đã gồm chỉnh sửa mới nhất trên canvas. */
    snapshotDocument(): Template[] {
      this.commitCurrentPage()
      return JSON.parse(JSON.stringify(this.templates))
    },

    /** Gọi khi tạo canvas mới: canvas trống chưa hiển thị trang nào nên chưa được ghi về store. */
    resetCanvasBinding() {
      renderedPageId = ''
      syncedContent = ''
    },

    /** Bọc mọi lần nạp JSON vào canvas: trong lúc nạp, canvas không được ghi ngược về store. */
    async withCanvasLoading(load: (canvas: FabricCanvasLike) => Promise<void> | void) {
      const [ canvas ] = useCanvas()
      if (!canvas) return
      renderDepth += 1
      try {
        await load(canvas)
        // Lấy mốc so sánh ngay sau khi nạp, để việc fabric chuẩn hoá dữ liệu
        // (thêm thuộc tính mặc định) không bị coi là người dùng vừa chỉnh sửa.
        renderedPageId = this.currentTemplate?.id || ''
        syncedContent = serializeCanvasContent(canvas)
      } finally {
        renderDepth -= 1
      }
    },

    async renderTemplate() {
      const { initCommon } = useCommon()
      const { setCanvasSize } = useCanvasScale()
      await this.withCanvasLoading(async (canvas) => {
        await canvas.loadFromJSON(this.currentTemplate)
        setCanvasSize()
        initCommon()
      })
    },

    async renderElement() {
      const { initCommon } = useCommon()
      const { setCanvasSize } = useCanvasScale()
      const mainStore = useMainStore()
      await this.withCanvasLoading(async (canvas) => {
        canvas.discardActiveObject()
        mainStore.setCanvasObject(undefined)
        await canvas.loadFromJSON(this.currentTemplate)
        setCanvasSize()
        initCommon()
      })
    },

    modifedElement(target: FabricObject, options: Record<string, any>,) {
      const [ canvas ] = useCanvas()
      const { addHistorySnapshot } = useHistorySnapshot()
      const index = canvas._objects.findIndex(item => item.id === target.id)
      const data: Snapshot = {
        type: SnapshotType.MODIFY,
        index,
        target: target.toObject(propertiesToInclude),
        tid: this.templateId
      }
      const proxyEl: any = this.currentTemplate.objects.find(i => i.id === target.id)
      addHistorySnapshot(data)
      target.set({...options});
      // 更新target同时更新template的对象
      if (proxyEl) {
        Object.keys(options).forEach((key) => {
          if (key in proxyEl) {
            proxyEl[key] = options[key]
          }
        })
      }
      if (options.filters) {
        (target as FabricImage).applyFilters();
      }
      canvas.setActiveObject(target)
      canvas.renderAll()
    },

    addElement(target: FabricObject) {
      const [ canvas ] = useCanvas()
      const { addHistorySnapshot } = useHistorySnapshot()
      const data: Snapshot = {
        type: SnapshotType.ADD,
        index: canvas._objects.indexOf(target),
        target: target.toObject(propertiesToInclude),
        tid: this.templateId
      }
      addHistorySnapshot(data)
    },

    groupElement(target: FabricObject, objects: FabricObject[]) {
      const [ canvas ] = useCanvas()
      const { addHistorySnapshot } = useHistorySnapshot()
      const data: Snapshot = {
        type: SnapshotType.GROUP,
        index: canvas._objects.indexOf(target),
        target: target.toObject(propertiesToInclude),
        objects: objects.map(item => item.toObject(propertiesToInclude)),
        tid: this.templateId
      }
      addHistorySnapshot(data)
    },

    ungroupElement() {

    },

    deleteElement(target: FabricObject) {
      const [ canvas ] = useCanvas()
      const { addHistorySnapshot } = useHistorySnapshot()
      const data: Snapshot = {
        type: SnapshotType.DELETE,
        index: canvas._objects.indexOf(target),
        target: target.toObject(propertiesToInclude),
        tid: this.templateId
      }
      canvas.remove(target)
      canvas.renderAll()
      addHistorySnapshot(data)
    },

    setClip(clip: number) {
      const { addHistorySnapshot } = useHistorySnapshot()
      this.commitCurrentPage()
      this.templates.forEach(template => {
        template.clip = clip
      })
      // addHistorySnapshot()
    },

    setSize(width: number, height: number, zoom: number) {
      const { initCommon } = useCommon()
      const { addHistorySnapshot } = useHistorySnapshot()
      this.commitCurrentPage()
      this.templates.forEach(template => {
        template.width = width
        template.height = height
        template.zoom = zoom
        template.objects.filter(item => item.id === WorkSpaceDrawType).map(ele => {
          ele.width = width / zoom
          ele.height = height / zoom
        })
      })
      initCommon()
      // addHistorySnapshot()
    },

    // Bộ lọc/mặt nạ ảnh bằng Pixi (web worker) đã bị gỡ ở bản gốc: `usePixi.ts` chỉ còn
    // toàn chú thích. Giữ lại ba hàm này dưới dạng không làm gì để nơi gọi cũ không lỗi;
    // trước đây chúng gọi `usePixi()` không tồn tại và làm hỏng việc mở trang có `pixiFilters`.
    setObjectFilter(_objects: CanvasElement[]) {},
    setImageFilter(_image: ImageElement) {},
    setImageMask(_image: ImageElement) {},

    /** Thay toàn bộ tài liệu đang mở (mở template, mở thiết kế đã lưu). */
    async changeTemplate(template: Template | Template[]) {
      const { setCanvasTransform } = useCanvasScale()
      const templates = Array.isArray(template) ? template : [template]
      this.templates = ensurePageIds(templates)
      this.templateIndex = 0
      useSnapshotStore().clear()
      await this.renderTemplate()
      setCanvasTransform()
    },

    setTemplates(templates: Template[]) {
      this.templates = ensurePageIds(templates)
    },

    setTemplateId(templateId: string) {
      this.templateId = templateId
    },

    setTemplateIndex(index: number) {
      if (index === this.templateIndex) return
      // Sắp chuyển sang trang khác: giữ lại chỉnh sửa của trang đang mở, và xoá lịch sử
      // hoàn tác vì các bước hoàn tác chỉ đúng với trang chúng được ghi nhận.
      this.commitCurrentPage()
      useSnapshotStore().clear()
      this.templateIndex = index
    },

    async addTemplate(template: Template | Template[]) {
      const templates = Array.isArray(template) ? template : [template]
      this.commitCurrentPage()
      const addIndex = this.templateIndex + 1
      this.templates.splice(addIndex, 0, ...templates)
      ensurePageIds(this.templates)
      this.templateIndex = addIndex
      useSnapshotStore().clear()
      await this.renderTemplate()
    },

    updateTemplate(props: Partial<Template>) {
      const { addHistorySnapshot } = useHistorySnapshot()
      const templateIndex = this.templateIndex
      this.templates[templateIndex] = { ...this.templates[templateIndex], ...props }
      // addHistorySnapshot()
    },

    async deleteTemplate(templateId: string | string[]) {
      const { addHistorySnapshot } = useHistorySnapshot()
      const templateIds = Array.isArray(templateId) ? templateId : [templateId]
      // Trang đang mở có thể không nằm trong danh sách xoá: giữ lại chỉnh sửa của nó.
      this.commitCurrentPage()

      const deleteTemplatesIndex = []
      for (let i = 0; i < templateIds.length; i++) {
        const index = this.templates.findIndex(item => item.id === templateIds[i])
        deleteTemplatesIndex.push(index)
      }
      let newIndex = Math.min(...deleteTemplatesIndex)

      const maxIndex = this.templates.length - templateIds.length - 1
      if (newIndex > maxIndex) newIndex = maxIndex

      this.templateIndex = newIndex
      this.templates = this.templates.filter(item => !templateIds.includes(item.id))
      useSnapshotStore().clear()
      // Canvas đang hiển thị trang vừa bị xoá: phải vẽ lại trang hiện tại mới.
      await this.renderTemplate()
      // addHistorySnapshot()
    },

    clearTemplate() {
      const objects = this.templates[this.templateIndex].objects.filter(item => item.id === WorkSpaceDrawType)
      this.templates[this.templateIndex].objects = objects
      this.renderTemplate()
    },

    updateWorkSpace(props: Partial<Template>) {
      const templateIndex = this.templateIndex
      this.templates[templateIndex] = { ...this.templates[templateIndex], ...props }
    },

    updateElement(data: UpdateElementData) {
      const { addHistorySnapshot } = useHistorySnapshot()
      const { id, props } = data
      const elementIds = typeof id === 'string' ? [id] : id
      if (!elementIds) return
      const template = this.templates[this.templateIndex]
      const elements = template.objects.map(el => elementIds.includes(el.id) ? { ...el, ...props }: el)
      this.templates[this.templateIndex].objects = elements as FabricObject[]
      // addHistorySnapshot()
    },

    // addElement(element: FabricObject | FabricObject[]) {
    //   const { addHistorySnapshot } = useHistorySnapshot()
    //   const elements = Array.isArray(element) ? element : [element]
    //   const currentTemplateElements = this.templates[this.templateIndex].objects
    //   const newElements = [...currentTemplateElements, ...elements]
    //   this.templates[this.templateIndex].objects = newElements as FabricObject[]
    //   addHistorySnapshot()
    // },

    // deleteElement(elementId: string | string[]) {
    //   const { addHistorySnapshot } = useHistorySnapshot()
    //   const elementIds = Array.isArray(elementId) ? elementId : [elementId]
    //   const currentTemplateElements = this.templates[this.templateIndex].objects
    //   const newElements = currentTemplateElements.filter(item => !elementIds.includes(item.id))
    //   this.templates[this.templateIndex].objects = newElements
    //   addHistorySnapshot()
    // },

    setBackgroundImage(props: SerializedImageProps) {
      this.currentTemplate.backgroundImage = props
    },

  }
})
