export interface YFTUser {
  id: number
  uuid: string
  username: string
  nickname: string
  phone?: string
  avatar?: string
  dept_id?: number
  email: string
  is_multi_login: boolean
  is_staff: boolean
  is_superuser: boolean
  is_active?: boolean
  join_time: string
  last_login_time: string
}

export interface BaseResult {
  code: number
  data: null
  msg: string
}

export interface CaptchaResult {
  captcha_id: string
  image: string
  image_type: string
}

export interface ImageCaptchaResult {
  code: number
  data: CaptchaResult
  msg: string
}

export interface EmailResult {
  msg: string
}

export interface EmailCaptchaResult {
  code: number
  data: EmailResult
  msg: string
}

export interface OauthVerifyData {
  email: string
  password: string
  /** Mã captcha ảnh, hoặc mã OTP email khi server bắt buộc xác minh email lúc đăng ký. */
  captcha: string
  captcha_id?: string
}

export interface EmailData {
  email: string
}

export interface UserResult {
  access_token: string
  access_token_expire_time: string
  access_token_type: string
  user: YFTUser
}

export interface OauthUserResult {
  code: number
  data: UserResult
  msg: string
}

export interface MeResult {
  code: number
  data: { user: YFTUser }
  msg: string
}

export interface PasswordChangeData {
  old_password: string
  new_password: string
}

export interface AppConfig {
  registration_open: boolean
  captcha_enabled: boolean
  email_otp_required: boolean
  password_min_length: number
  max_upload_bytes: number
  max_design_document_bytes: number
  features: {
    stock_pixabay: boolean
    matting: boolean
  }
}

export interface AppConfigResult {
  code: number
  data: AppConfig
  msg: string
}

export interface AdminUserPatch {
  is_staff?: boolean
  is_superuser?: boolean
  is_active?: boolean
  nickname?: string
  password?: string
}

export interface AdminUserListResult {
  code: number
  data: {
    total: number
    page: number
    size: number
    total_pages: number
    items: YFTUser[]
  }
  msg: string
}

export interface AdminUserResult {
  code: number
  data: { user: YFTUser }
  msg: string
}
