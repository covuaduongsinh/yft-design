import { AxiosPromise } from 'axios'
import request from '@/utils/request'
import { PageParams, TemplateResult, TemplateInfo, TemplateCreateData, TemplateUpdateData, TemplateMetaResult } from "./types"


export const getTemplateInfoPages = (params: PageParams): AxiosPromise<TemplateResult> => {
  return request({
    url: '/api/design/template/info/pages',
    method: 'get',
    params,
  })
}

export const getTemplateDetailPages = (params: PageParams): AxiosPromise<TemplateResult> => {
  return request({
    url: '/api/design/template/detail/pages',
    method: 'get',
    params,
  })
}

/** Lấy một template kèm tài liệu (`data`) để mở trong trình chỉnh sửa. */
export const getTemplateData = (pk: number): AxiosPromise<TemplateInfo> => {
  return request({
    url: `/api/design/template/data/${pk}`,
    method: 'get',
    silent: true,
  })
}

// ---- Quản lý template: chỉ staff gọi được ----

export const createTemplate = (data: TemplateCreateData): AxiosPromise<TemplateMetaResult> => {
  return request({
    url: '/api/design/template',
    method: 'post',
    data,
  })
}

export const updateTemplate = (pk: number, data: TemplateUpdateData): AxiosPromise<TemplateMetaResult> => {
  return request({
    url: `/api/design/template/${pk}`,
    method: 'patch',
    data,
  })
}

export const uploadTemplatePreview = (pk: number, image: Blob): AxiosPromise<TemplateMetaResult> => {
  const formData = new FormData()
  formData.append('image', image, 'preview')
  return request({
    url: `/api/design/template/${pk}/preview`,
    method: 'put',
    data: formData,
    headers: { 'Content-Type': 'multipart/form-data' },
    silent: true,
  })
}

export const deleteTemplate = (pk: number) => {
  return request({
    url: `/api/design/template/${pk}`,
    method: 'delete',
  })
}
