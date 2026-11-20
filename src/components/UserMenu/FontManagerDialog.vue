<template>
  <el-dialog v-model="dialogVisible" title="Quản lý font dùng chung" width="520px" append-to-body @open="reload">
    <div class="flex items-center justify-between mb-[10px]">
      <span class="text-[12px] text-[#9da3ac]">Font tải lên ở đây hiện trong danh sách font của mọi người dùng.</span>
      <el-button size="small" type="primary" :loading="uploading" @click="fileInput?.click()">Thêm font</el-button>
      <input ref="fileInput" type="file" accept=".ttf,.otf,.woff,.woff2" class="hidden" @change="handleFile">
    </div>
    <el-table :data="fonts" v-loading="loading" size="small" height="320" empty-text="Chưa có font nào">
      <el-table-column label="Tên font" min-width="200">
        <template #default="{ row }">
          <span :style="{ fontFamily: `'${row.fontname}'` }">{{ row.fontname }} — Tiếng Việt có dấu</span>
        </template>
      </el-table-column>
      <el-table-column label="Dung lượng" width="110" align="right">
        <template #default="{ row }">{{ Math.round((row.size || 0) / 1024) }} KB</template>
      </el-table-column>
      <el-table-column label="" width="70" align="center">
        <template #default="{ row }">
          <el-button link type="danger" size="small" @click="remove(row)">Xoá</el-button>
        </template>
      </el-table-column>
    </el-table>
  </el-dialog>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue'
import * as opentype from 'opentype.js'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useMainStore } from '@/store'
import { deleteFont, getFontInfo, uploadFont } from '@/api/static/font'
import type { FontInfo } from '@/api/static/types'

const props = defineProps({
  visible: {
    type: Boolean,
    required: true,
  },
})
const emit = defineEmits<{
  (event: 'update:visible', payload: boolean): void
}>()

const dialogVisible = computed({
  get: () => props.visible,
  set: (value: boolean) => emit('update:visible', value),
})

const mainStore = useMainStore()
const fonts = ref<FontInfo[]>([])
const loading = ref(false)
const uploading = ref(false)
const fileInput = ref<HTMLInputElement>()

const reload = async () => {
  loading.value = true
  try {
    fonts.value = (await getFontInfo()).data.data
    // Cập nhật luôn danh sách font của trình chỉnh sửa.
    await mainStore.getOnlineFonts(true)
  } catch (_) {
    ElMessage.error('Không tải được danh sách font')
  } finally {
    loading.value = false
  }
}

/** Đọc tên họ font từ chính file (TTF/OTF/WOFF); không đọc được thì lấy tên file. */
const guessFontName = async (file: File) => {
  const fallback = file.name.replace(/\.[^.]+$/, '').replace(/[^\p{L}\p{N} ._-]/gu, ' ').trim()
  try {
    const font = opentype.parse(await file.arrayBuffer())
    const names = font.names.fontFamily || {}
    return (names.vi || names.en || Object.values(names)[0] || fallback) as string
  } catch (_) {
    return fallback
  }
}

const handleFile = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  try {
    const { value } = await ElMessageBox.prompt('Tên hiển thị trong danh sách font', 'Thêm font', {
      confirmButtonText: 'Tải lên',
      cancelButtonText: 'Huỷ',
      inputValue: await guessFontName(file),
      inputValidator: (input: string) => (!!input && input.trim().length > 0) || 'Tên font không được để trống',
    })
    uploading.value = true
    await uploadFont(file, value.trim())
    ElMessage.success('Đã thêm font')
    await reload()
  } catch (_) {
    // Người dùng bấm huỷ, hoặc lỗi đã được thông báo.
  } finally {
    uploading.value = false
  }
}

const remove = async (font: FontInfo) => {
  try {
    await ElMessageBox.confirm(`Xoá font "${font.fontname}"? Thiết kế đang dùng font này sẽ hiển thị bằng font thay thế.`, 'Xoá font', {
      confirmButtonText: 'Xoá',
      cancelButtonText: 'Huỷ',
      type: 'warning',
    })
    await deleteFont(font.id)
    ElMessage.success('Đã xoá font')
    await reload()
  } catch (_) {
    // Người dùng bấm huỷ, hoặc lỗi đã được thông báo.
  }
}
</script>
