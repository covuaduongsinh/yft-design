import axios, { AxiosError, AxiosResponse } from 'axios';
import { ElMessage } from 'element-plus';
import { localStorage } from '@/utils/storage';
import { useUserStore } from '@/store';

declare module 'axios' {
  export interface AxiosRequestConfig {
    /** Không tự hiện thông báo lỗi; nơi gọi tự xử lý ApiError. */
    silent?: boolean
  }
}

/** Lỗi có cấu trúc của mọi lời gọi API: nơi gọi đọc được mã HTTP, mã lỗi và dữ liệu kèm theo. */
export class ApiError extends Error {
  /** Mã HTTP; 0 nếu không kết nối được máy chủ. */
  status: number
  /** Trường `code` trong vỏ phản hồi. */
  code: number
  /** Mã lỗi máy đọc được, vd 'revision_conflict'. */
  error: string
  data: any

  constructor(status: number, code: number, error: string, message: string, data?: any) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.error = error
    this.data = data
  }
}

const service = axios.create({
  baseURL: import.meta.env.VITE_APP_BASE_API,
  timeout: 500000,
  headers: { 'Content-Type': 'application/json;charset=utf-8' },
});

service.interceptors.request.use((config) => {
  const token = localStorage.get('access_token')
  const isRelative = !config.url || !/^(?:https?:)?\/\//i.test(config.url)
  if (token && isRelative) {
    config.headers = config.headers || {}
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
});

const reject = (error: ApiError, silent?: boolean) => {
  if (error.status === 401 || error.code === 401) {
    // Phiên hết hạn hoặc bị thu hồi: xoá phiên cục bộ và mời đăng nhập lại,
    // KHÔNG tải lại trang để không làm mất thiết kế đang mở.
    const userStore = useUserStore()
    userStore.clearSession()
    userStore.requireLogin()
  }
  if (!silent) ElMessage({ message: error.message, type: 'error' })
  return Promise.reject(error)
}

service.interceptors.response.use(
  (response: AxiosResponse) => {
    const body = response.data
    // File tĩnh, mảng và dữ liệu nhị phân không dùng vỏ { code, msg, data }.
    const enveloped = body !== null && typeof body === 'object' && !Array.isArray(body)
      && !(body instanceof ArrayBuffer) && !(body instanceof Blob) && 'code' in body
    if (!enveloped || body.code === 200) return response
    return reject(
      new ApiError(response.status, body.code, body.error || '', body.msg || 'Lỗi hệ thống', body.data),
      response.config.silent,
    )
  },
  (error: AxiosError<any>) => {
    const response = error.response
    const body = response && typeof response.data === 'object' && response.data !== null ? response.data : {}
    const status = response ? response.status : 0
    const message = body.msg || body.detail || (response ? 'Lỗi hệ thống' : 'Không kết nối được máy chủ')
    return reject(
      new ApiError(status, body.code ?? status, body.error || '', message, body.data),
      error.config?.silent,
    )
  }
);

export default service;
