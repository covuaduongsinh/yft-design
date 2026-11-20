<template>
  <div 
    ref="wrapperRef" 
    @mousedown="addDrawAreaFocus"
    v-contextmenu="contextMenus" 
    v-click-outside="remDrawAreaFocus"
  >
    <canvas ref="canvasRef" class="background-grid"></canvas>
  </div>
</template>

<script lang="ts" setup>
import { storeToRefs } from 'pinia'
import { onMounted, onUnmounted } from 'vue'
import { useFabricStore, useMainStore, useTemplatesStore } from '@/store'
import { useRouter } from 'vue-router'
import { unzip } from "@/utils/crypto"
import { getTemplateData } from '@/api/template'
import { contextMenus } from '@/configs/contextMenu'
import { initEditor } from '@/views/Canvas/useCanvas'
import { ElMessage, ElLoading } from 'element-plus'
import useCanvasHotkey from '@/hooks/useCanvasHotkey'
import useDesign from '@/hooks/useDesign'
const { openDesign, detach, startWatching, loadDocument } = useDesign()
const fabricStore = useFabricStore()
const mainStore = useMainStore()
const router = useRouter()
const templatesStore = useTemplatesStore()
const { wrapperRef, canvasRef } = storeToRefs(fabricStore)
const { drawAreaFocus } = storeToRefs(mainStore)
const { keydownListener, keyupListener, pasteListener } = useCanvasHotkey()


const addDrawAreaFocus = () => {
  if (!drawAreaFocus.value) mainStore.setDrawAreaFocus(true)
}

const remDrawAreaFocus = () => {
  if (drawAreaFocus.value) mainStore.setDrawAreaFocus(false)
}

const getTemplateDetail = async (pk: number) => {
  try {
    const result = await getTemplateData(pk)
    router.push(`${router.currentRoute.value.path}?template=${pk}`)
    // Mở một template là bắt đầu một tài liệu mới, chưa thuộc thiết kế nào trong tài khoản.
    await loadDocument(unzip(result.data.data.data))
  }
  catch (error) {
    ElMessage({
      type: 'error',
      message: 'Tải mẫu thất bại, vui lòng liên hệ quản trị viên',
    })
  }
}

const initRouter = async (templateId?: number) => {
  if (templateId) {
    templatesStore.setTemplateId(templateId)
    const loadingInstance = ElLoading.service({ fullscreen: true, background: 'rgba(122, 122, 122, 0.5)' })
    await getTemplateDetail(templateId)
    nextTick(() => loadingInstance.close())
  }
}

onMounted(async () => {
  const query = router.currentRoute.value.query
  const designId = typeof query.design === 'string' ? query.design : ''
  const templateId = Number(query.template) > 0 ? Number(query.template) : 0
  detach()
  startWatching()
  mainStore.getOnlineFonts()
  // Sắp nạp một thiết kế/template từ server thì không vẽ tài liệu mẫu mặc định trước.
  initEditor(!!designId || templateId > 0)
  if (designId) {
    const opened = await openDesign(designId)
    // Không mở được (đã xoá, sai tài khoản...): hiện tài liệu mặc định thay vì canvas trống.
    if (!opened) await templatesStore.renderTemplate()
  }
  else if (templateId) {
    initRouter(templateId)
  }
  document.addEventListener('keydown', keydownListener)
  document.addEventListener('keyup', keyupListener)
  window.addEventListener('blur', keyupListener)
  window.addEventListener('paste', pasteListener as any)
})

onUnmounted(() => {
  document.removeEventListener('keydown', keydownListener)
  document.removeEventListener('keyup', keyupListener)
  window.removeEventListener('blur', keyupListener)
  window.removeEventListener('paste', pasteListener as any)
})

</script>

<style lang="scss" scoped>
.full-size {
  height: 100%;
  width: 100%;
}
.background-grid {
  --offsetX: 0px;
  --offsetY: 0px;
  --size: 8px;
  --color: #dedcdc;
  background-image: 
    linear-gradient(45deg, var(--color) 25%, transparent 0, transparent 75%, var(--color) 0), 
    linear-gradient(45deg, var(--color) 25%, transparent 0, transparent 75%, var(--color) 0);
  background-position: var(--offsetX) var(--offsetY), calc(var(--size) + var(--offsetX)) calc(var(--size) + var(--offsetY));
  background-size: calc(var(--size) * 2) calc(var(--size) * 2);
}
</style>
