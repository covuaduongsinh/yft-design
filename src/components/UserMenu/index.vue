<template>
  <div class="user-menu">
    <el-dropdown v-if="userStore.loginStatus" trigger="click">
      <span class="cursor-pointer flex items-center gap-2 select-none user-dropdown-trigger">
        <el-tag :type="roleType" :effect="compact ? 'plain' : 'dark'" size="small">
          {{ compact ? userStore.username : roleLabel }}
        </el-tag>
        <span v-if="!compact" class="font-semibold text-[#333]">{{ userStore.username }}</span>
      </span>
      <template #dropdown>
        <el-dropdown-menu>
          <el-dropdown-item disabled>
            <span class="text-xs text-gray-500">{{ userStore.email }} ({{ roleLabel }})</span>
          </el-dropdown-item>
          <slot name="items" />
          <el-dropdown-item v-if="userStore.isSuperuser" divided @click="adminVisible = true">
            Quản lý người dùng
          </el-dropdown-item>
          <el-dropdown-item :divided="!userStore.isSuperuser" @click="passwordVisible = true">
            Đổi mật khẩu
          </el-dropdown-item>
          <el-dropdown-item divided class="btn-logout" @click="handleLogout">
            Đăng xuất
          </el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>
    <el-button v-else-if="compact" size="small" text type="primary" @click="loginVisible = true">Đăng nhập</el-button>
    <el-button v-else type="primary" @click="loginVisible = true">Đăng nhập / Đăng ký</el-button>

    <LoginDialog :visible="loginVisible" @close="loginVisible = false" />
    <ChangePasswordDialog v-model:visible="passwordVisible" />
    <AdminUsersDialog v-if="userStore.isSuperuser" v-model:visible="adminVisible" />
  </div>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useUserStore } from '@/store'
import useAuth from '@/hooks/useAuth'
import LoginDialog from '@/components/LoginDialog/index.vue'
import ChangePasswordDialog from './ChangePasswordDialog.vue'
import AdminUsersDialog from './AdminUsersDialog.vue'

defineProps({
  /** Dạng thu gọn dùng trên thanh công cụ của trình chỉnh sửa. */
  compact: {
    type: Boolean,
    default: false,
  },
})

const userStore = useUserStore()
const { logout, refreshUser } = useAuth()
const loginVisible = ref(false)
const passwordVisible = ref(false)
const adminVisible = ref(false)

const roleLabel = computed(() => userStore.isSuperuser ? 'Admin' : (userStore.isStaff ? 'Staff' : 'User'))
const roleType = computed(() => userStore.isSuperuser ? 'danger' : (userStore.isStaff ? 'warning' : 'info'))

// Server trả 401 ở bất kỳ đâu thì mở lại hộp đăng nhập ngay tại chỗ, không tải lại trang.
watch(() => userStore.loginRequired, (required) => {
  if (!required) return
  loginVisible.value = true
  userStore.clearLoginRequired()
})

const handleLogout = async () => {
  await logout()
  ElMessage.success('Đã đăng xuất tài khoản')
}

// Quyền hiển thị lấy từ server, không tin dữ liệu đã lưu trong trình duyệt.
onMounted(refreshUser)

defineExpose({ openLogin: () => { loginVisible.value = true } })
</script>

<style lang="scss" scoped>
.user-menu {
  display: flex;
  align-items: center;
}
</style>
