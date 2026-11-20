<template>
  <span v-if="isStaff" class="stock-upload">
    <el-button size="small" text type="primary" :loading="busy" @click="input?.click()">+ Thêm vào kho</el-button>
    <input ref="input" type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple class="hidden" @change="onFiles">
  </span>
</template>

<script lang="ts" setup>
import { computed, ref, type PropType } from 'vue'
import { ElMessage } from 'element-plus'
import { useUserStore } from '@/store'
import { addStockItem } from '@/api/static/image'

// Nút dành cho staff: thêm ảnh vào kho dùng chung của một danh mục.
// Chỉ ẩn/hiện ở giao diện; quyền thật do server kiểm tra.
const props = defineProps({
  kind: {
    type: String as PropType<'image' | 'illustration'>,
    required: true,
  },
  category: {
    type: String,
    required: true,
  },
})
const emit = defineEmits<{
  (event: 'added'): void
}>()

const userStore = useUserStore()
const isStaff = computed(() => userStore.loginStatus && (userStore.isStaff || userStore.isSuperuser))
const input = ref<HTMLInputElement>()
const busy = ref(false)

const onFiles = async (event: Event) => {
  const target = event.target as HTMLInputElement
  const files = Array.from(target.files || [])
  target.value = ''
  if (files.length === 0) return
  busy.value = true
  let added = 0
  for (const file of files) {
    try {
      await addStockItem(file, props.kind, props.category, file.name.replace(/\.[^.]+$/, ''))
      added += 1
    } catch (_) {
      // request.ts đã hiện thông báo lỗi cho từng file
    }
  }
  busy.value = false
  if (added > 0) {
    ElMessage.success(`Đã thêm ${added} ảnh vào kho`)
    emit('added')
  }
}
</script>
