export interface DesignSummary {
  id: string
  title: string
  width: number
  height: number
  page_count: number
  /** Đường dẫn ảnh thu nhỏ (/media/...), rỗng nếu chưa có. */
  thumbnail: string
  starred: boolean
  /** Tăng 1 sau mỗi lần lưu tài liệu; gửi lại làm base_revision khi lưu. */
  revision: number
  trashed_at: number | null
  created_at: number
  updated_at: number
}

export interface DesignDetail extends DesignSummary {
  /** base64 của gzip của JSON { schema, pages, meta }. */
  data: string
}

export interface DesignListParams {
  q?: string
  starred?: 0 | 1
  trashed?: 0 | 1
  page?: number
  size?: number
  ordering?: string
}

export interface DesignListResult {
  code: number
  data: {
    total: number
    page: number
    size: number
    total_pages: number
    items: DesignSummary[]
  }
  msg: string
}

export interface DesignResult {
  code: number
  data: DesignSummary
  msg: string
}

export interface DesignDetailResult {
  code: number
  data: DesignDetail
  msg: string
}

export interface DesignUpdateData {
  title?: string
  starred?: boolean
  data?: string
  base_revision?: number
}

export interface DesignVersion {
  id: string
  label: string
  is_auto: boolean
  page_count: number
  revision: number
  created_at: number
}

export interface DesignVersionListResult {
  code: number
  data: { items: DesignVersion[] }
  msg: string
}

export interface DesignVersionResult {
  code: number
  data: DesignVersion
  msg: string
}
