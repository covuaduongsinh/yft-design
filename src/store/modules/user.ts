import { defineStore } from 'pinia'
import { localStorage } from '@/utils/storage'
import type { UserResult, YFTUser } from '@/api/oauth/types'

export interface UserState {
  id: number
  uuid: string
  username: string
  nickname: string
  phone: string
  avatar: string
  deptId: number
  email: string
  isMultiLogin: boolean
  isStaff: boolean
  isSuperuser: boolean
  joinTime: string
  lastLoginTime: string
  loginStatus: boolean
  token: string
  /** Bật lên khi server trả 401: nơi chứa hộp đăng nhập sẽ mở hộp rồi tắt cờ này. */
  loginRequired: boolean
}

const emptyState = (): UserState => ({
  id: 0,
  uuid: '',
  username: '',
  nickname: '',
  phone: '',
  avatar: '',
  deptId: 0,
  email: '',
  isMultiLogin: false,
  isStaff: false,
  isSuperuser: false,
  joinTime: '',
  lastLoginTime: '',
  loginStatus: false,
  token: '',
  loginRequired: false,
})

const fromServerUser = (user: Partial<YFTUser> & Record<string, any>, token: string): UserState => ({
  id: user.id || 0,
  uuid: user.uuid || '',
  username: user.username || '',
  nickname: user.nickname || '',
  phone: user.phone || '',
  avatar: user.avatar || '',
  deptId: user.dept_id || user.deptId || 0,
  email: user.email || '',
  isMultiLogin: !!user.is_multi_login,
  isStaff: !!user.is_staff,
  isSuperuser: !!user.is_superuser,
  joinTime: user.join_time || '',
  lastLoginTime: user.last_login_time || '',
  loginStatus: true,
  token,
  loginRequired: false,
})

const getInitialUserState = (): UserState => {
  try {
    const saved = localStorage.get('user_info')
    const token = localStorage.get('access_token')
    if (saved && token) return fromServerUser(saved, token)
  } catch (_) {}
  return emptyState()
}

export const useUserStore = defineStore('user', {
  state: (): UserState => getInitialUserState(),

  actions: {
    setLoginStatus(status: boolean) {
      this.loginStatus = status
    },
    setUserInfo(user: Partial<UserState>) {
      Object.assign(this, user)
    },
    /** Ghi nhận phiên đăng nhập do server trả về (đăng nhập hoặc đăng ký). */
    applySession(session: UserResult) {
      localStorage.set('access_token', session.access_token)
      localStorage.set('user_info', session.user)
      Object.assign(this, fromServerUser(session.user, session.access_token))
    },
    /** Cập nhật thông tin và quyền theo dữ liệu mới nhất từ server. */
    applyUser(user: YFTUser) {
      if (!this.token) return
      localStorage.set('user_info', user)
      Object.assign(this, fromServerUser(user, this.token))
    },
    /** Xoá phiên ở trình duyệt. Muốn thu hồi cả ở server thì dùng useAuth().logout(). */
    clearSession() {
      Object.assign(this, emptyState())
      localStorage.remove('access_token')
      localStorage.remove('user_info')
    },
    logout() {
      this.clearSession()
    },
    requireLogin() {
      this.loginRequired = true
    },
    clearLoginRequired() {
      this.loginRequired = false
    },
  },
})
