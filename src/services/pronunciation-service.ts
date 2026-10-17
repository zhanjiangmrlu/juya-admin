import type { PronunciationPorts, PronunciationReference } from '@/shared/types/pronunciation'

/** 生成受控词汇后有限查询，切换词汇或离开页面立即停止后续请求
 * @param ports 已鉴权网络端口、等待和当前词汇存活判断
 * @param path 具体卡片和词汇的服务端引用地址
 * @param reference 已保存的发布版本或候选修订
 * @param checks 本次最多查询次数
 * @returns 当前会话可读取的短时音频地址
 */
export const loadPronunciation = async (
  ports: PronunciationPorts,
  path: string,
  reference: PronunciationReference,
  checks = 20
): Promise<string> => {
  if (!ports.active()) throw new Error('试听已取消')
  let value = await ports.request('POST', path, reference)
  for (let count = 0; count < checks && value.state === 'processing'; count++) {
    if (!ports.active()) throw new Error('试听已取消')
    await ports.pause()
    if (!ports.active()) throw new Error('试听已取消')
    value = await ports.request('GET', path, reference)
  }
  if (!ports.active()) throw new Error('试听已取消')
  if (value.state !== 'ready' || !value.url) throw new Error('发音暂不可用，点击重试')
  return value.url
}
