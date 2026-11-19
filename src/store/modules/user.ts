import { defineStore } from 'pinia'
import { localStorage } from '@/utils/storage'

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
}

const getInitialUserState = (): UserState => {
  try {
    const saved = localStorage.get('user_info')
    const token = localStorage.get('access_token')
    if (saved && token) {
      return {
        id: saved.id || 0,
        uuid: saved.uuid || '',
        username: saved.username || '',
        nickname: saved.nickname || '',
        phone: saved.phone || '',
        avatar: saved.avatar || '',
        deptId: saved.dept_id || saved.deptId || 0,
        email: saved.email || '',
        isMultiLogin: !!saved.is_multi_login,
        isStaff: !!saved.is_staff,
        isSuperuser: !!saved.is_superuser,
        joinTime: saved.join_time || '',
        lastLoginTime: saved.last_login_time || '',
        loginStatus: true,
        token: token
      }
    }
  } catch (_) {}

  return {
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
    token: ''
  }
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
    logout() {
      this.id = 0
      this.uuid = ''
      this.username = ''
      this.nickname = ''
      this.phone = ''
      this.avatar = ''
      this.deptId = 0
      this.email = ''
      this.isMultiLogin = false
      this.isStaff = false
      this.isSuperuser = false
      this.joinTime = ''
      this.lastLoginTime = ''
      this.loginStatus = false
      this.token = ''
      localStorage.remove('access_token')
      localStorage.remove('user_info')
    }
  },
})