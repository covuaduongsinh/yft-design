import request from '@/utils/request'
import { QueryPgaes, QueryCategory, ImagePageResult, ImageCategoryResult, ImageHit, StockItemResult } from './types'
import { AxiosPromise } from 'axios'
import type { AssetResult } from '@/api/design/types'
import { useUserStore } from '@/store'
import { ElMessage } from 'element-plus'

export function getImagePages(params?: QueryPgaes): AxiosPromise<ImagePageResult> {
  return request({
    url: '/api/design/image/page',
    method: 'get',
    params,
  });
}

export function getImageCategory(params?: QueryCategory): AxiosPromise<ImageCategoryResult> {
  return request({
    url: '/api/design/image/category',
    method: 'get',
    params
  });
}

export function getIllustrationPages(params?: QueryPgaes): AxiosPromise<ImagePageResult> {
  return request({
    url: '/api/design/illustration/page',
    method: 'get',
    params,
  });
}

export function getIllustrationCategory(params?: QueryCategory): AxiosPromise<ImageCategoryResult> {
  return request({
    url: '/api/design/illustration/category',
    method: 'get',
    params
  });
}

/** Nhập một ảnh của kho ngoài (Pixabay) về kho ảnh của tài khoản. */
export function importStockImage(url: string): AxiosPromise<AssetResult> {
  return request({
    url: '/api/design/stock/import',
    method: 'post',
    data: { url },
  })
}

/** Thêm một ảnh vào kho dùng chung (chỉ staff). */
export function addStockItem(file: Blob, kind: 'image' | 'illustration', category: string, tags = ''): AxiosPromise<StockItemResult> {
  const formData = new FormData()
  formData.append('file', file, 'image')
  formData.append('kind', kind)
  formData.append('category', category)
  formData.append('tags', tags)
  return request({
    url: '/api/design/stock',
    method: 'post',
    data: formData,
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

export function deleteStockItem(id: number | string) {
  return request({
    url: `/api/design/stock/${id}`,
    method: 'delete',
  })
}

/**
 * Địa chỉ ảnh để chèn vào thiết kế. Ảnh của kho nội bộ dùng được ngay; ảnh từ kho ngoài phải
 * được nhập về máy chủ trước (địa chỉ của kho ngoài chỉ tồn tại 24 giờ), việc này cần đăng nhập.
 * Trả về chuỗi rỗng nếu không lấy được.
 */
export async function resolveStockImageUrl(item: ImageHit): Promise<string> {
  if (!item.needsImport) return item.largeImageURL
  const userStore = useUserStore()
  if (!userStore.loginStatus) {
    userStore.requireLogin()
    ElMessage.info('Đăng nhập để dùng ảnh từ kho ảnh trực tuyến')
    return ''
  }
  try {
    const result = await importStockImage(item.largeImageURL)
    return result.data.data.url
  } catch (_) {
    return '' // request.ts đã hiện thông báo lỗi
  }
}
