import { nextTick, watch } from 'vue'
import { debounce } from 'lodash-es'
import { ElLoading, ElMessage, ElMessageBox } from 'element-plus'
import router from '@/router'
import { useDesignStore, useFabricStore, useMainStore, useTemplatesStore, useUserStore } from '@/store'
import { ApiError } from '@/utils/request'
import { zip, unzip } from '@/utils/crypto'
import { renderPageThumbnail } from '@/utils/pageThumbnail'
import { Template } from '@/types/canvas'
import {
  createDesign,
  createDesignVersion,
  getDesign,
  restoreDesignVersion,
  updateDesign,
  uploadDesignThumbnail,
} from '@/api/design'

/** Tài liệu thiết kế như được lưu trên server. */
export interface DesignDocument {
  schema: 1
  pages: Template[]
  meta: {
    clip?: number
    safe?: number
    unitMode?: number
    sizeMode?: number
  }
}

export const DEFAULT_DESIGN_TITLE = 'Thiết kế chưa đặt tên'

const AUTOSAVE_DELAY = 2500
const AUTOSAVE_MAX_WAIT = 20000
const RETRY_DELAY = 15000
const THUMBNAIL_INTERVAL = 30000

// Trạng thái dùng chung cho cả ứng dụng (một trình chỉnh sửa, một tài liệu đang mở).
/** JSON của tài liệu ở lần lưu/tải gần nhất, để không gửi lại nội dung y hệt. */
let lastSavedJson = ''
/** Tăng mỗi khi tài liệu trong store thay đổi. */
let changeSeq = 0
/** Giá trị changeSeq tại thời điểm nội dung đã nằm trên server. */
let savedSeq = 0
/** Lớn hơn 0 khi đang nạp tài liệu: thay đổi lúc này không phải do người dùng. */
let loadingDepth = 0
let savePromise: Promise<boolean> | null = null
let watching = false
let lastThumbnailAt = 0
let retryTimer: number | undefined

const buildDocument = (): DesignDocument => {
  const fabricStore = useFabricStore()
  const mainStore = useMainStore()
  return {
    schema: 1,
    pages: useTemplatesStore().snapshotDocument(),
    meta: {
      clip: fabricStore.clip,
      safe: fabricStore.safe,
      unitMode: mainStore.unitMode,
      sizeMode: mainStore.sizeMode,
    },
  }
}

/** Nạp một tài liệu vào trình chỉnh sửa mà không bị coi là người dùng vừa sửa. */
const loadDocument = async (input: unknown) => {
  const doc = normalizeDocument(input)
  const fabricStore = useFabricStore()
  const mainStore = useMainStore()
  loadingDepth += 1
  try {
    if (typeof doc.meta.clip === 'number') fabricStore.clip = doc.meta.clip
    if (typeof doc.meta.safe === 'number') fabricStore.safe = doc.meta.safe
    if (typeof doc.meta.unitMode === 'number') mainStore.unitMode = doc.meta.unitMode
    if (typeof doc.meta.sizeMode === 'number') mainStore.sizeMode = doc.meta.sizeMode
    await useTemplatesStore().changeTemplate(doc.pages)
    // Watcher của Vue chạy sau một nhịp; chờ nó xong rồi mới tính lại thay đổi của người dùng.
    await nextTick()
  } finally {
    loadingDepth -= 1
  }
}

const normalizeDocument = (input: any): DesignDocument => {
  if (Array.isArray(input)) return { schema: 1, pages: input, meta: {} }
  if (input && Array.isArray(input.pages)) return { schema: 1, pages: input.pages, meta: input.meta || {} }
  return { schema: 1, pages: [input], meta: {} }
}

const markClean = () => {
  lastSavedJson = JSON.stringify(buildDocument())
  savedSeq = changeSeq
}

const uploadThumbnail = async (id: string, page: Template | undefined, force = false) => {
  if (!page) return
  const now = Date.now()
  if (!force && now - lastThumbnailAt < THUMBNAIL_INTERVAL) return
  lastThumbnailAt = now
  try {
    const blob = await renderPageThumbnail(page)
    if (blob && useDesignStore().id === id) await uploadDesignThumbnail(id, blob)
  } catch (_) {
    // Thiếu ảnh thu nhỏ không ảnh hưởng tới dữ liệu thiết kế.
  }
}

const setQuery = (query: Record<string, string>) => {
  const current = router.currentRoute.value
  router.replace({ path: current.path, query }).catch(() => undefined)
}

/**
 * Lưu tài liệu đang mở lên thiết kế đã gắn. Trả về true nếu nội dung trên server đã khớp.
 * Nếu đang có lần lưu khác chạy dở thì chờ nó xong rồi lưu tiếp phần thay đổi sau đó.
 */
const save = async (options: { thumbnail?: boolean } = {}): Promise<boolean> => {
  if (savePromise) {
    await savePromise
    if (changeSeq === savedSeq && !options.thumbnail) return true
  }
  savePromise = doSave(options).finally(() => { savePromise = null })
  return savePromise
}

const doSave = async (options: { thumbnail?: boolean }): Promise<boolean> => {
  const designStore = useDesignStore()
  const id = designStore.id
  if (!id) return false
  window.clearTimeout(retryTimer)

  // Ghi canvas về store trước, chờ watcher đếm xong, rồi mới chốt mốc thay đổi của lần lưu này.
  useTemplatesStore().commitCurrentPage()
  await nextTick()
  const seqAtStart = changeSeq
  const doc = buildDocument()
  const json = JSON.stringify(doc)

  if (json === lastSavedJson) {
    savedSeq = seqAtStart
    if (designStore.status !== 'conflict') designStore.setStatus('saved')
    if (options.thumbnail) uploadThumbnail(id, doc.pages[0], true)
    return true
  }

  designStore.setStatus('saving')
  try {
    const result = await updateDesign(id, { data: zip(json), base_revision: designStore.revision })
    if (designStore.id !== id) return false // người dùng đã mở thiết kế khác trong lúc chờ
    designStore.revision = result.data.data.revision
    designStore.lastSavedAt = Date.now()
    lastSavedJson = json
    savedSeq = seqAtStart
    designStore.setStatus(changeSeq === savedSeq ? 'saved' : 'dirty')
    if (changeSeq !== savedSeq) scheduleSave()
    uploadThumbnail(id, doc.pages[0], options.thumbnail)
    return true
  } catch (error) {
    if (designStore.id !== id) return false
    const apiError = error instanceof ApiError ? error : null
    if (apiError?.error === 'revision_conflict') {
      designStore.setStatus('conflict', apiError.message)
      resolveConflict()
    } else if (apiError?.status === 404) {
      // Thiết kế đã bị xoá hẳn hoặc thuộc tài khoản khác: tách ra để không mất nội dung đang mở.
      designStore.unbind()
      setQuery({})
      ElMessage.warning('Thiết kế này không còn trên máy chủ. Bấm "Lưu" để lưu thành thiết kế mới.')
    } else {
      designStore.setStatus('error', apiError?.message || 'Không lưu được thiết kế')
      // Mất mạng hoặc server bận: tự thử lại. Lỗi 401 thì chờ người dùng đăng nhập lại.
      if (apiError?.status !== 401) retryTimer = window.setTimeout(() => save(), RETRY_DELAY)
    }
    return false
  }
}

const scheduleSave = debounce(() => {
  const designStore = useDesignStore()
  if (designStore.bound && designStore.status !== 'conflict' && useUserStore().loginStatus) save()
}, AUTOSAVE_DELAY, { maxWait: AUTOSAVE_MAX_WAIT })

let conflictDialogOpen = false
const resolveConflict = async () => {
  if (conflictDialogOpen) return
  conflictDialogOpen = true
  const designStore = useDesignStore()
  try {
    await ElMessageBox.confirm(
      'Thiết kế này đã được sửa ở một tab hoặc thiết bị khác. Bạn muốn tải lại bản mới nhất (bỏ các thay đổi ở đây), hay giữ các thay đổi ở đây bằng cách lưu thành một bản sao?',
      'Thiết kế đã thay đổi ở nơi khác',
      {
        confirmButtonText: 'Tải lại bản mới nhất',
        cancelButtonText: 'Lưu thành bản sao',
        distinguishCancelAndClose: true,
        closeOnClickModal: false,
        type: 'warning',
      },
    )
    await openDesign(designStore.id)
  } catch (action) {
    // 'cancel' = nút "Lưu thành bản sao"; 'close' = đóng hộp thoại, giữ nguyên trạng thái xung đột.
    if (action === 'cancel') await saveAsCopy()
  } finally {
    conflictDialogOpen = false
  }
}

/** Mở một thiết kế đã lưu. Chỉ khi tải xong mới gắn id, nên lỗi tải không bao giờ dẫn tới ghi đè. */
const openDesign = async (id: string): Promise<boolean> => {
  const designStore = useDesignStore()
  const loading = ElLoading.service({ fullscreen: true, background: 'rgba(122, 122, 122, 0.5)' })
  designStore.loading = true
  scheduleSave.cancel()
  window.clearTimeout(retryTimer)
  try {
    const result = await getDesign(id)
    const design = result.data.data
    designStore.unbind()
    await loadDocument(unzip(design.data))
    designStore.bind(design)
    markClean()
    setQuery({ design: design.id })
    return true
  } catch (error) {
    designStore.unbind()
    const message = error instanceof ApiError && error.status === 404
      ? 'Không tìm thấy thiết kế, hoặc thiết kế không thuộc tài khoản đang đăng nhập'
      : (error instanceof ApiError && error.status === 401 ? 'Vui lòng đăng nhập để mở thiết kế này' : 'Không mở được thiết kế')
    ElMessage.error(message)
    return false
  } finally {
    designStore.loading = false
    nextTick(() => loading.close())
  }
}

/** Lưu tài liệu đang mở thành một thiết kế mới trong tài khoản và gắn trình chỉnh sửa vào nó. */
const saveAsNew = async (title?: string): Promise<boolean> => {
  const userStore = useUserStore()
  const designStore = useDesignStore()
  if (!userStore.loginStatus) {
    userStore.requireLogin()
    ElMessage.info('Đăng nhập để lưu thiết kế vào tài khoản của bạn')
    return false
  }
  useTemplatesStore().commitCurrentPage()
  await nextTick()
  const seqAtStart = changeSeq
  const doc = buildDocument()
  const json = JSON.stringify(doc)
  designStore.setStatus('saving')
  try {
    const result = await createDesign({ title: title || designStore.title || DEFAULT_DESIGN_TITLE, data: zip(json) })
    designStore.bind(result.data.data)
    lastSavedJson = json
    savedSeq = seqAtStart
    if (changeSeq !== savedSeq) designStore.setStatus('dirty')
    setQuery({ design: result.data.data.id })
    uploadThumbnail(result.data.data.id, doc.pages[0], true)
    return true
  } catch (error) {
    designStore.setStatus(designStore.bound ? 'error' : 'idle', error instanceof ApiError ? error.message : '')
    ElMessage.error(error instanceof ApiError ? error.message : 'Không lưu được thiết kế')
    return false
  }
}

const saveAsCopy = async () => {
  const designStore = useDesignStore()
  const title = `${designStore.title || DEFAULT_DESIGN_TITLE} (bản sao)`.slice(0, 200)
  designStore.unbind()
  const ok = await saveAsNew(title)
  if (ok) ElMessage.success('Đã lưu các thay đổi thành một bản sao')
  return ok
}

/** Nút "Lưu": thiết kế đã gắn thì lưu ngay, chưa gắn thì tạo thiết kế mới. */
const saveNow = async (): Promise<boolean> => {
  const designStore = useDesignStore()
  scheduleSave.cancel()
  if (!designStore.bound) {
    const ok = await saveAsNew()
    if (ok) ElMessage.success('Đã lưu thiết kế vào tài khoản')
    return ok
  }
  if (designStore.status === 'conflict') {
    resolveConflict()
    return false
  }
  const ok = await save({ thumbnail: true })
  if (ok) ElMessage.success('Đã lưu')
  else if (designStore.status === 'error') ElMessage.error(designStore.errorMessage || 'Không lưu được thiết kế')
  return ok
}

const rename = async (title: string) => {
  const designStore = useDesignStore()
  const clean = title.trim().slice(0, 200)
  if (!clean) return
  if (!designStore.bound) {
    designStore.title = clean
    return
  }
  const result = await updateDesign(designStore.id, { title: clean }, false)
  designStore.title = result.data.data.title
}

/**
 * Gọi trước khi thay toàn bộ tài liệu của một thiết kế đã gắn (vd áp một template):
 * lưu trạng thái hiện tại và ghi lại một phiên bản để người dùng quay về được.
 */
const checkpoint = async (label: string) => {
  const designStore = useDesignStore()
  if (!designStore.bound) return
  scheduleSave.cancel()
  if (await save()) {
    try {
      await createDesignVersion(designStore.id, label)
    } catch (_) {
      // Đã đạt số phiên bản thủ công tối đa: vẫn cho áp template, phiên bản tự động vẫn còn.
    }
  }
}

const restoreVersion = async (versionId: string) => {
  const designStore = useDesignStore()
  if (!designStore.bound) return false
  scheduleSave.cancel()
  await save()
  const result = await restoreDesignVersion(designStore.id, versionId)
  const design = result.data.data
  await loadDocument(unzip(design.data))
  designStore.bind(design)
  markClean()
  uploadThumbnail(design.id, useTemplatesStore().templates[0], true)
  return true
}

/** Tách trình chỉnh sửa khỏi thiết kế đang gắn (vd mở một template mới). */
const detach = () => {
  scheduleSave.cancel()
  window.clearTimeout(retryTimer)
  useDesignStore().unbind()
  savedSeq = changeSeq
}

/** Còn thay đổi chưa nằm trên server (dùng cho cảnh báo khi rời trang). */
const hasUnsavedChanges = () => changeSeq !== savedSeq

/** Bật theo dõi thay đổi của tài liệu. Gọi một lần khi trình chỉnh sửa khởi động. */
const startWatching = () => {
  if (watching) return
  watching = true
  const templatesStore = useTemplatesStore()
  const designStore = useDesignStore()
  const userStore = useUserStore()

  watch(() => templatesStore.templates, () => {
    if (loadingDepth > 0) return
    changeSeq += 1
    if (!designStore.bound) return
    if (designStore.status === 'saved' || designStore.status === 'error') designStore.setStatus('dirty')
    scheduleSave()
  }, { deep: true })

  watch(() => userStore.loginStatus, (loggedIn) => {
    if (!loggedIn) return
    // Vừa đăng nhập lại sau khi phiên hết hạn: lưu nốt phần đang chờ.
    if (designStore.bound) {
      if (hasUnsavedChanges()) save()
      return
    }
    // Mở link ?design=... khi chưa đăng nhập: đăng nhập xong thì mở thiết kế đó.
    const pending = router.currentRoute.value.query.design
    if (typeof pending === 'string' && pending && !hasUnsavedChanges()) openDesign(pending)
  })

  // Chuyển tab hoặc thu nhỏ cửa sổ: lưu ngay thay vì chờ hết thời gian trễ.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) scheduleSave.flush()
  })
}

export default () => ({
  openDesign,
  saveNow,
  saveAsNew,
  saveAsCopy,
  rename,
  checkpoint,
  restoreVersion,
  detach,
  hasUnsavedChanges,
  startWatching,
  loadDocument,
})
