/**
 * 计算文件内容的 SHA-256 十六进制摘要
 *
 * @param file - 需要计算摘要的二进制文件
 * @returns 64 位小写十六进制摘要
 */
export async function hashFile(file: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}
