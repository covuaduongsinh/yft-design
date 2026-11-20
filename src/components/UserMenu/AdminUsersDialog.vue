<template>
  <el-dialog v-model="dialogVisible" title="Quản lý người dùng" width="820px" append-to-body @open="reload">
    <div class="flex items-center gap-2 mb-[10px]">
      <el-input v-model="query.q" placeholder="Tìm theo email hoặc tên" clearable style="width: 260px" @keyup.enter="search" @clear="search" />
      <el-button @click="search">Tìm</el-button>
      <span class="text-[12px] text-[#9da3ac] ml-auto">Tổng: {{ total }} tài khoản</span>
    </div>
    <el-table :data="users" v-loading="loading" size="small" height="380">
      <el-table-column prop="email" label="Email" min-width="200" show-overflow-tooltip />
      <el-table-column prop="username" label="Tên" min-width="120" show-overflow-tooltip />
      <el-table-column label="Staff" width="70" align="center">
        <template #default="{ row }">
          <el-switch :model-value="row.is_staff" size="small" @change="(value: any) => update(row, { is_staff: !!value })" />
        </template>
      </el-table-column>
      <el-table-column label="Admin" width="70" align="center">
        <template #default="{ row }">
          <el-switch :model-value="row.is_superuser" size="small" @change="(value: any) => update(row, { is_superuser: !!value })" />
        </template>
      </el-table-column>
      <el-table-column label="Hoạt động" width="90" align="center">
        <template #default="{ row }">
          <el-switch :model-value="row.is_active" size="small" @change="(value: any) => update(row, { is_active: !!value })" />
        </template>
      </el-table-column>
      <el-table-column prop="last_login_time" label="Đăng nhập cuối" width="150" />
      <el-table-column label="" width="110" align="center">
        <template #default="{ row }">
          <el-button link type="primary" size="small" @click="resetPassword(row)">Đặt lại MK</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-pagination
      class="mt-[10px] justify-end"
      layout="prev, pager, next"
      :total="total"
      :page-size="query.size"
      v-model:current-page="query.page"
      @current-change="reload"
    />
  </el-dialog>
</template>

<script lang="ts" setup>
import { computed, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { adminListUsers, adminUpdateUser } from '@/api/oauth'
import type { AdminUserPatch, YFTUser } from '@/api/oauth/types'

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

const loading = ref(false)
const users = ref<YFTUser[]>([])
const total = ref(0)
const query = reactive({ q: '', page: 1, size: 20 })

const reload = async () => {
  loading.value = true
  try {
    const result = await adminListUsers({ ...query })
    users.value = result.data.data.items
    total.value = result.data.data.total
  } catch (_) {
    // request.ts đã hiện thông báo lỗi
  } finally {
    loading.value = false
  }
}

const search = () => {
  query.page = 1
  reload()
}

const update = async (user: YFTUser, patch: AdminUserPatch) => {
  try {
    const result = await adminUpdateUser(user.id, patch)
    Object.assign(user, result.data.data.user)
    ElMessage.success('Đã cập nhật')
  } catch (_) {
    // Lỗi (vd hạ quyền quản trị viên cuối cùng) đã được hiện; công tắc giữ nguyên giá trị cũ.
  }
}

const resetPassword = async (user: YFTUser) => {
  try {
    const { value } = await ElMessageBox.prompt(`Nhập mật khẩu mới cho ${user.email}`, 'Đặt lại mật khẩu', {
      confirmButtonText: 'Đặt lại',
      cancelButtonText: 'Huỷ',
      inputType: 'password',
      inputValidator: (input: string) => (input && input.length >= 8) || 'Mật khẩu phải có ít nhất 8 ký tự',
    })
    await adminUpdateUser(user.id, { password: value })
    ElMessage.success('Đã đặt lại mật khẩu; người dùng bị đăng xuất khỏi mọi thiết bị')
  } catch (_) {
    // Người dùng bấm huỷ, hoặc lỗi đã được hiện.
  }
}
</script>
