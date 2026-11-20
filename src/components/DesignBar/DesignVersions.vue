<template>
  <el-dialog v-model="dialogVisible" title="Lịch sử phiên bản" width="560px" append-to-body @open="reload">
    <div class="flex items-center justify-between mb-[10px]">
      <span class="text-[12px] text-[#9da3ac]">
        Phiên bản tự động được chụp trong lúc bạn làm việc. Khôi phục một phiên bản không làm mất trạng thái hiện tại.
      </span>
      <el-button size="small" type="primary" plain @click="saveVersion">Lưu phiên bản hiện tại</el-button>
    </div>
    <el-table :data="versions" v-loading="loading" size="small" height="340" empty-text="Chưa có phiên bản nào">
      <el-table-column label="Thời điểm" width="170">
        <template #default="{ row }">{{ formatTime(row.created_at) }}</template>
      </el-table-column>
      <el-table-column label="Tên" min-width="160" show-overflow-tooltip>
        <template #default="{ row }">
          <el-tag v-if="!row.is_auto" size="small" type="success" class="mr-[6px]">Thủ công</el-tag>
          {{ row.label || 'Tự động' }}
        </template>
      </el-table-column>
      <el-table-column prop="page_count" label="Số trang" width="80" align="center" />
      <el-table-column label="" width="100" align="center">
        <template #default="{ row }">
          <el-button link type="primary" size="small" :loading="restoringId === row.id" @click="restore(row)">Khôi phục</el-button>
        </template>
      </el-table-column>
    </el-table>
  </el-dialog>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useDesignStore } from '@/store'
import { createDesignVersion, listDesignVersions } from '@/api/design'
import type { DesignVersion } from '@/api/design/types'
import useDesign from '@/hooks/useDesign'

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

const designStore = useDesignStore()
const { restoreVersion, saveNow } = useDesign()
const versions = ref<DesignVersion[]>([])
const loading = ref(false)
const restoringId = ref('')

const formatTime = (ms: number) => new Date(ms).toLocaleString('vi-VN')

const reload = async () => {
  if (!designStore.bound) return
  loading.value = true
  try {
    const result = await listDesignVersions(designStore.id)
    versions.value = result.data.data.items
  } catch (_) {
    // request.ts đã hiện thông báo lỗi
  } finally {
    loading.value = false
  }
}

const saveVersion = async () => {
  try {
    const { value } = await ElMessageBox.prompt('Đặt tên cho phiên bản này (có thể bỏ trống)', 'Lưu phiên bản', {
      confirmButtonText: 'Lưu',
      cancelButtonText: 'Huỷ',
      inputPlaceholder: 'vd: Bản gửi khách duyệt',
    })
    // Phiên bản chụp nội dung đang nằm trên server, nên phải lưu các thay đổi mới nhất trước.
    if (!(await saveNow())) return
    await createDesignVersion(designStore.id, value || undefined)
    ElMessage.success('Đã lưu phiên bản')
    reload()
  } catch (_) {
    // Người dùng bấm huỷ, hoặc lỗi đã được thông báo.
  }
}

const restore = async (version: DesignVersion) => {
  try {
    await ElMessageBox.confirm(
      `Khôi phục thiết kế về phiên bản lúc ${formatTime(version.created_at)}? Trạng thái hiện tại sẽ được giữ lại thành một phiên bản "Trước khi khôi phục".`,
      'Khôi phục phiên bản',
      { confirmButtonText: 'Khôi phục', cancelButtonText: 'Huỷ', type: 'warning' },
    )
  } catch (_) {
    return
  }
  restoringId.value = version.id
  try {
    await restoreVersion(version.id)
    ElMessage.success('Đã khôi phục phiên bản')
    dialogVisible.value = false
  } catch (_) {
    // request.ts đã hiện thông báo lỗi
  } finally {
    restoringId.value = ''
  }
}
</script>
