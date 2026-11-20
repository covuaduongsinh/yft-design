<template>
  <div class="design-bar">
    <el-tooltip placement="bottom" :hide-after="0" content="Bấm để đổi tên">
      <span class="design-title" @click="handleRename">{{ designStore.title || DEFAULT_DESIGN_TITLE }}</span>
    </el-tooltip>
    <span class="design-status" :class="designStore.status" :title="designStore.errorMessage">{{ statusText }}</span>
    <el-button size="small" type="primary" plain :loading="designStore.status === 'saving'" @click="saveNow">Lưu</el-button>
    <el-button v-if="designStore.bound" size="small" text @click="versionsVisible = true">Lịch sử</el-button>
    <el-button v-if="canPublish" size="small" text @click="publishVisible = true">Đăng mẫu</el-button>
    <DesignVersions v-if="designStore.bound" v-model:visible="versionsVisible" />
    <PublishTemplate v-if="canPublish" v-model:visible="publishVisible" />
  </div>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue'
import { ElMessageBox } from 'element-plus'
import { useDesignStore, useUserStore } from '@/store'
import useDesign, { DEFAULT_DESIGN_TITLE } from '@/hooks/useDesign'
import DesignVersions from './DesignVersions.vue'
import PublishTemplate from './PublishTemplate.vue'

const designStore = useDesignStore()
const userStore = useUserStore()
const { saveNow, rename } = useDesign()
const versionsVisible = ref(false)
const publishVisible = ref(false)
// Nút chỉ để tiện cho staff; quyền thật do server kiểm tra khi đăng.
const canPublish = computed(() => userStore.loginStatus && (userStore.isStaff || userStore.isSuperuser))

const statusText = computed(() => {
  switch (designStore.status) {
    case 'saved': return 'Đã lưu'
    case 'dirty': return 'Có thay đổi chưa lưu'
    case 'saving': return 'Đang lưu...'
    case 'error': return 'Lưu thất bại, sẽ thử lại'
    case 'conflict': return 'Đã bị sửa ở nơi khác'
    default: return 'Chưa lưu vào tài khoản'
  }
})

const handleRename = async () => {
  try {
    const { value } = await ElMessageBox.prompt('Tên thiết kế', 'Đổi tên', {
      confirmButtonText: 'Lưu',
      cancelButtonText: 'Huỷ',
      inputValue: designStore.title || DEFAULT_DESIGN_TITLE,
      inputValidator: (input: string) => (!!input && input.trim().length > 0) || 'Tên không được để trống',
    })
    await rename(value)
  } catch (_) {
    // Người dùng bấm huỷ, hoặc lỗi đã được thông báo.
  }
}
</script>

<style lang="scss" scoped>
.design-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  margin: 0 12px;
}
.design-title {
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
  cursor: pointer;
  &:hover {
    color: $themeColor;
  }
}
.design-status {
  font-size: 12px;
  color: #9da3ac;
  white-space: nowrap;
  &.dirty { color: #b88230; }
  &.error, &.conflict { color: #d03050; }
}
.design-bar .el-button + .el-button {
  margin-left: 0;
}
</style>
