/** 为局域网 HTTP 页面补齐安全随机编号，保留浏览器原生实现
 * @param provider 当前页面的浏览器密码学接口
 */
export const ensureRandomUUID = (provider: Crypto = globalThis.crypto) => {
  if (typeof provider.randomUUID === 'function') return
  provider.randomUUID = () => {
    const bytes = provider.getRandomValues(new Uint8Array(16))
    bytes[6] = (bytes[6]! & 0x0f) | 0x40
    bytes[8] = (bytes[8]! & 0x3f) | 0x80
    const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}` as ReturnType<
      Crypto['randomUUID']
    >
  }
}
