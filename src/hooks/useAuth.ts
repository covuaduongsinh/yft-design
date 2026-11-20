import { ref } from 'vue'
import { oauthLogout, oauthMe, getAppConfig } from '@/api/oauth'
import { useUserStore } from '@/store'
import type { AppConfig } from '@/api/oauth/types'

// Cấu hình server dùng chung cho cả ứng dụng, chỉ tải một lần.
const appConfig = ref<AppConfig | null>(null)
let configLoading: Promise<AppConfig | null> | null = null

export default () => {
  const userStore = useUserStore()

  /** Thu hồi token ở server rồi xoá phiên ở trình duyệt. */
  const logout = async () => {
    try {
      await oauthLogout()
    } catch (_) {
      // Server không phản hồi vẫn phải đăng xuất được ở máy này.
    }
    userStore.clearSession()
    userStore.clearLoginRequired()
  }

  /** Lấy lại thông tin và quyền từ server; token hết hạn thì âm thầm xoá phiên. */
  const refreshUser = async () => {
    if (!userStore.token) return
    try {
      const result = await oauthMe()
      userStore.applyUser(result.data.data.user)
    } catch (_) {
      // 401 đã được interceptor xử lý; lúc khởi động không bật hộp đăng nhập.
      userStore.clearLoginRequired()
    }
  }

  const loadAppConfig = () => {
    if (appConfig.value) return Promise.resolve(appConfig.value)
    if (!configLoading) {
      configLoading = getAppConfig()
        .then((result) => {
          appConfig.value = result.data.data
          return appConfig.value
        })
        .catch(() => {
          configLoading = null
          return null
        })
    }
    return configLoading
  }

  return { appConfig, logout, refreshUser, loadAppConfig }
}
