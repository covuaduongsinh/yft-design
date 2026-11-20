import CryptoJS from 'crypto-js'
import pako from 'pako'
const CRYPTO_KEY = 'yft-design'

/**
 * 加密
 * @param msg 待加密字符串
 */
export const encrypt = (msg: string) => {
  return CryptoJS.AES.encrypt(msg, CRYPTO_KEY).toString()
}

/**
 * 解密
 * @param ciphertext 待解密字符串
 */
export const decrypt = (ciphertext: string) => {
  const bytes = CryptoJS.AES.decrypt(ciphertext, CRYPTO_KEY)
  return bytes.toString(CryptoJS.enc.Utf8)
}


/**
 * Nén chuỗi (thường là JSON của tài liệu thiết kế) thành base64 của gzip.
 * Chuyển sang chuỗi nhị phân theo từng khúc: gọi `String.fromCharCode.apply` với
 * cả mảng một lần sẽ tràn ngăn xếp khi tài liệu lớn hơn vài trăm KB.
 */
export const zip = (str: string) => {
  const bytes = pako.gzip(str)
  const CHUNK = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK) as unknown as number[])
  }
  return btoa(binary)
}

/** Giải nén chuỗi do `zip` (hoặc server) tạo ra và trả về giá trị JSON bên trong. */
export const unzip = (b64Data: string) => {
  const binary = atob(b64Data)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return JSON.parse(pako.inflate(bytes, { to: 'string' }))
}