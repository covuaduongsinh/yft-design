import request from '@/utils/request'
import { AxiosPromise } from 'axios'
import {
  ImageCaptchaResult,
  EmailCaptchaResult,
  OauthVerifyData,
  EmailData,
  OauthUserResult,
  MeResult,
  PasswordChangeData,
  AppConfigResult,
  AdminUserListResult,
  AdminUserPatch,
  AdminUserResult,
  BaseResult,
} from './types'


export function imageCaptcha(): AxiosPromise<ImageCaptchaResult> {
  return request({
    url: '/api/oauth/captcha/image',
    method: 'get',
  })
}

export function emailCaptcha(data: EmailData): AxiosPromise<EmailCaptchaResult> {
  return request({
    url: '/api/oauth/captcha/email',
    method: 'post',
    data
  })
}

/** Đăng ký trả về luôn phiên đăng nhập, giống hệt oauthLogin. */
export function oauthRegister(data: OauthVerifyData): AxiosPromise<OauthUserResult> {
  return request({
    url: '/api/oauth/register',
    method: 'post',
    data,
    silent: true,
  })
}

export function oauthLogin(data: OauthVerifyData): AxiosPromise<OauthUserResult> {
  return request({
    url: '/api/oauth/login',
    method: 'post',
    data,
    silent: true,
  })
}

/** Thu hồi token hiện tại ở server. */
export function oauthLogout(): AxiosPromise<BaseResult> {
  return request({
    url: '/api/oauth/logout',
    method: 'post',
    silent: true,
  })
}

export function oauthMe(): AxiosPromise<MeResult> {
  return request({
    url: '/api/oauth/me',
    method: 'get',
    silent: true,
  })
}

export function changePassword(data: PasswordChangeData): AxiosPromise<BaseResult> {
  return request({
    url: '/api/oauth/password/change',
    method: 'post',
    data,
    silent: true,
  })
}

/** Cấu hình công khai của server: tính năng nào đang bật. */
export function getAppConfig(): AxiosPromise<AppConfigResult> {
  return request({
    url: '/api/design/config',
    method: 'get',
    silent: true,
  })
}

export function adminListUsers(params: { q?: string, page?: number, size?: number }): AxiosPromise<AdminUserListResult> {
  return request({
    url: '/api/admin/users',
    method: 'get',
    params,
  })
}

export function adminUpdateUser(id: number, data: AdminUserPatch): AxiosPromise<AdminUserResult> {
  return request({
    url: `/api/admin/users/${id}`,
    method: 'patch',
    data,
  })
}
