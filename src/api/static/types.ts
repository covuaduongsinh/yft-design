export interface QueryFont {
  size?: number
  page?: number
}

export interface FontInfo {
  id: number
  url: string
  fontname: string
  format?: string
  size?: number
}

export interface FontInfoResult {
  code: number
  msg: string
  data: FontInfo[]
}

export interface FontResult {
  code: number
  msg: string
  data: FontInfo
}


export interface QueryPgaes {
  t: string
  page: number
}

export interface QueryCategory {
  t: string
}

export enum ImageType {
  photo,
  illustration,
  vector,
}

export interface StockItemResult {
  code: number
  msg: string
  data: ImageHit
}

export interface ImageHit {
  /** Ảnh thu nhỏ và kích thước của nó (giao diện tab Ảnh đọc ba trường này). */
  preview: string
  width: number
  height: number
  /** 'local' = kho của máy chủ này, 'pixabay' = kho ngoài. */
  source?: 'local' | 'pixabay'
  /** true = phải nhập về máy chủ trước khi chèn vào thiết kế. */
  needsImport?: boolean
  id: number
  pageURL: string
  type: ImageType
  tags: string
  previewURL: string
  previewWidth: number
  previewHeight: number
  webformatURL: string
  webformatWidth: number
  webformatHeight: number
  largeImageURL: string
  imageWidth: number
  imageHeight: number
  imageSize: number
  views: number
  downloads: number
  collections: number
  likes: number
  comments: number
  user_id: number
  user: string
  userImageURL: string
}

export interface ImagePage {
  total: number
  totalHits: number
  hits: ImageHit[]
}

export interface ImagePageResult {
  code: number
  msg: string
  data: ImageHit[]
}

export interface ImageCategoryResult {
  code: number
  msg: string
  data: ImageHit[]
}