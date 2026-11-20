import { defineStore } from 'pinia'

/**
 * idle: chưa gắn với thiết kế nào trên server ·
 * saved: mọi thay đổi đã được lưu · dirty: có thay đổi chưa lưu · saving: đang gửi ·
 * error: lần lưu gần nhất thất bại (sẽ thử lại) · conflict: thiết kế đã bị sửa ở nơi khác
 */
export type DesignSaveStatus = 'idle' | 'saved' | 'dirty' | 'saving' | 'error' | 'conflict'

export interface DesignState {
  /** id thiết kế trên server; rỗng = tài liệu đang mở chưa được lưu vào tài khoản. */
  id: string
  title: string
  /** revision mà trình duyệt này đã tải về hoặc vừa lưu thành công. */
  revision: number
  status: DesignSaveStatus
  errorMessage: string
  lastSavedAt: number
  loading: boolean
}

export const useDesignStore = defineStore('design', {
  state: (): DesignState => ({
    id: '',
    title: '',
    revision: 0,
    status: 'idle',
    errorMessage: '',
    lastSavedAt: 0,
    loading: false,
  }),

  getters: {
    bound: (state) => state.id !== '',
  },

  actions: {
    bind(design: { id: string, title: string, revision: number }) {
      this.id = design.id
      this.title = design.title
      this.revision = design.revision
      this.status = 'saved'
      this.errorMessage = ''
      this.lastSavedAt = Date.now()
    },
    unbind() {
      this.id = ''
      this.title = ''
      this.revision = 0
      this.status = 'idle'
      this.errorMessage = ''
    },
    setStatus(status: DesignSaveStatus, errorMessage = '') {
      this.status = status
      this.errorMessage = errorMessage
    },
  },
})
