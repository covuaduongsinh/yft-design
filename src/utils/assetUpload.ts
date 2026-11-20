import { uploadAsset } from '@/api/design'
import { ApiError } from '@/utils/request'

/** Chuỗi data:/blob: đã tải lên trong phiên này → URL /media/... tương ứng. */
const uploadedUrl = new Map<string, string>()
/** Chuỗi mà server đã từ chối (không phải ảnh, quá lớn...): không thử lại trong phiên này. */
const rejected = new Set<string>()

const CONCURRENCY = 3

const isEmbeddedImage = (value: unknown): value is string =>
  typeof value === 'string'
  // SVG nhúng được giữ nguyên trong tài liệu: server không nhận SVG làm file tải lên.
  && ((value.startsWith('data:image/') && !value.startsWith('data:image/svg')) || value.startsWith('blob:'))

/** Duyệt mọi giá trị trong tài liệu; `visit` trả về chuỗi mới để thay, hoặc undefined để giữ nguyên. */
const walk = (node: any, visit: (value: string) => string | undefined) => {
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      const value = node[i]
      if (typeof value === 'string') {
        const next = visit(value)
        if (next !== undefined) node[i] = next
      }
      else if (value && typeof value === 'object') walk(value, visit)
    }
    return
  }
  for (const key of Object.keys(node)) {
    const value = node[key]
    if (typeof value === 'string') {
      const next = visit(value)
      if (next !== undefined) node[key] = next
    }
    else if (value && typeof value === 'object') walk(value, visit)
  }
}

export interface ExternalizeResult {
  /** Số ảnh vừa được tải lên trong lần gọi này. */
  uploaded: number
  /** Số ảnh vẫn phải nằm nhúng trong tài liệu (server từ chối hoặc lỗi mạng). */
  remaining: number
  /** Thông báo lỗi gần nhất, nếu có. */
  error: string
}

/**
 * "Tách ảnh khi lưu": mọi ảnh nhúng (data URL) hoặc ảnh tạm (blob URL) trong tài liệu được tải
 * lên server và thay bằng URL /media/... — sửa trực tiếp trên `doc`, là bản sao sắp gửi đi.
 * Canvas đang mở không bị đụng tới. Làm ở một chỗ nên bao phủ mọi nguồn ảnh: tải file, dán,
 * kéo thả, mặt nạ, tách nền, mã QR, nền trang, nhập JSON.
 */
export async function externalizeImages(doc: unknown): Promise<ExternalizeResult> {
  const pending = new Set<string>()
  walk(doc, (value) => {
    if (isEmbeddedImage(value) && !uploadedUrl.has(value) && !rejected.has(value)) pending.add(value)
    return undefined
  })

  const result: ExternalizeResult = { uploaded: 0, remaining: 0, error: '' }
  const queue = [...pending]
  let stop = false

  const worker = async () => {
    while (!stop && queue.length > 0) {
      const source = queue.shift() as string
      try {
        const blob = await (await fetch(source)).blob()
        const response = await uploadAsset(blob)
        uploadedUrl.set(source, response.data.data.url)
        result.uploaded += 1
      } catch (error) {
        result.error = error instanceof ApiError ? error.message : 'Không tải được ảnh lên máy chủ'
        const status = error instanceof ApiError ? error.status : 0
        // 400/413: bản thân file này không được nhận, thử lại cũng vô ích.
        if (status === 400 || status === 413) rejected.add(source)
        // Lỗi khác (mất mạng, quá tần suất, hết phiên): dừng đợt này, lần lưu sau thử lại.
        else stop = true
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker))

  walk(doc, (value) => {
    if (!isEmbeddedImage(value)) return undefined
    const url = uploadedUrl.get(value)
    if (!url) result.remaining += 1
    return url
  })
  return result
}
