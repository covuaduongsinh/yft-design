export interface ItemInfo {
  id: number
  title: string
  text: string
  /** 图片路径 */
  photo: string
  /** 图片的宽度，前端获取图片信息之后设置 */
  width?: number
  /** 图片的高度，前端获取图片信息之后设置 */
  height?: number
  /** 
   * 当前节点的所在列的高度
   * - 非列的总高度，只是调试用
   */
  currentColumnHeight?: number
}

export type ItemList = Array<ItemInfo>;

export interface PageParams {
  page: number
  size: number
  q?: string
  /** Staff gửi 1 để thấy cả template đang ẩn. */
  all?: 0 | 1
}

export interface infoParams {
  pk: number
}

export interface TemplateItem {
  id: number
  preview: string
  width: number
  height: number
  /** base64 của gzip của tài liệu; chỉ có khi lấy bằng getTemplateData. */
  data: string
  title: string
  text: string
  images?: string
  category?: string
  page_count?: number
  is_published?: boolean
  use_count?: number
}

export interface TemplateCreateData {
  title: string
  text?: string
  category?: string
  is_published?: boolean
  data: string
}

export interface TemplateUpdateData {
  title?: string
  text?: string
  category?: string
  is_published?: boolean
}

export interface TemplateMetaResult {
  code: number
  data: TemplateItem
  msg: string
}

export interface PageResult {
  total: number
  page: number
  total_pages: number
  size: number
  pages: number
  items: TemplateItem[]
}

export interface TemplateResult {
  code: number
  data: PageResult
  msg: string
}

export interface TemplateInfo {
  code: number
  data: TemplateItem
  msg: string
}
