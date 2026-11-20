import request from '@/utils/request'
import { AxiosPromise } from 'axios'
import {
  DesignListParams,
  DesignListResult,
  DesignResult,
  DesignDetailResult,
  DesignUpdateData,
  DesignVersionListResult,
  DesignVersionResult,
  AssetResult,
} from './types'

const BASE = '/api/design/designs'

export function listDesigns(params: DesignListParams): AxiosPromise<DesignListResult> {
  return request({ url: BASE, method: 'get', params })
}

export function createDesign(data: { title?: string, data: string }): AxiosPromise<DesignResult> {
  return request({ url: BASE, method: 'post', data, silent: true })
}

export function getDesign(id: string): AxiosPromise<DesignDetailResult> {
  return request({ url: `${BASE}/${id}`, method: 'get', silent: true })
}

/** Lưu tài liệu phải kèm base_revision; server trả 409 nếu thiết kế đã bị sửa ở nơi khác. */
export function updateDesign(id: string, data: DesignUpdateData, silent = true): AxiosPromise<DesignResult> {
  return request({ url: `${BASE}/${id}`, method: 'patch', data, silent })
}

export function trashDesign(id: string) {
  return request({ url: `${BASE}/${id}`, method: 'delete' })
}

export function deleteDesignPermanently(id: string) {
  return request({ url: `${BASE}/${id}`, method: 'delete', params: { permanent: 1 } })
}

export function emptyDesignTrash() {
  return request({ url: `${BASE}/trash`, method: 'delete' })
}

export function restoreDesign(id: string): AxiosPromise<DesignResult> {
  return request({ url: `${BASE}/${id}/restore`, method: 'post' })
}

export function duplicateDesign(id: string): AxiosPromise<DesignResult> {
  return request({ url: `${BASE}/${id}/duplicate`, method: 'post' })
}

export function uploadDesignThumbnail(id: string, image: Blob) {
  const formData = new FormData()
  formData.append('image', image, 'thumbnail')
  return request({
    url: `${BASE}/${id}/thumbnail`,
    method: 'put',
    data: formData,
    headers: { 'Content-Type': 'multipart/form-data' },
    silent: true,
  })
}

/** Tải một ảnh lên kho của tài khoản; gửi lại đúng file cũ thì nhận lại ảnh đã có. */
export function uploadAsset(file: Blob, name?: string): AxiosPromise<AssetResult> {
  const formData = new FormData()
  formData.append('file', file, name || 'image')
  return request({
    url: '/api/design/assets',
    method: 'post',
    data: formData,
    headers: { 'Content-Type': 'multipart/form-data' },
    silent: true,
  })
}

export function listDesignVersions(id: string): AxiosPromise<DesignVersionListResult> {
  return request({ url: `${BASE}/${id}/versions`, method: 'get' })
}

export function createDesignVersion(id: string, label?: string): AxiosPromise<DesignVersionResult> {
  return request({ url: `${BASE}/${id}/versions`, method: 'post', data: { label } })
}

export function restoreDesignVersion(id: string, versionId: string): AxiosPromise<DesignDetailResult> {
  return request({ url: `${BASE}/${id}/versions/${versionId}/restore`, method: 'post' })
}
