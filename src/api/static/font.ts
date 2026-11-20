import request from '@/utils/request'
import { QueryFont, FontInfoResult, FontResult } from './types'
import { AxiosPromise } from 'axios'

/** Danh sách font dùng chung do staff tải lên. */
export const getFontInfo = (params?: QueryFont): AxiosPromise<FontInfoResult> => {
  return request({
    url: '/api/design/font/info',
    method: 'get',
    params,
    silent: true,
  });
}

/** Thêm một font (chỉ staff). `fontname` là tên sẽ hiện trong danh sách font của trình chỉnh sửa. */
export const uploadFont = (file: Blob, fontname: string): AxiosPromise<FontResult> => {
  const formData = new FormData()
  formData.append('file', file, 'font')
  formData.append('fontname', fontname)
  return request({
    url: '/api/design/font',
    method: 'post',
    data: formData,
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

export const deleteFont = (id: number) => {
  return request({
    url: `/api/design/font/${id}`,
    method: 'delete',
  })
}
