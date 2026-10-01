import type { AudioTarget } from './audio-version-model'

/**
 * 文件名去扩展名后只精确匹配稳定编号或目标编号，不猜测相似教学文本。
 * @param filename - 原始音频文件名
 * @param targets - 场景稳定音频目标
 * @returns 唯一匹配的目标编号或空值
 */
export function matchAudioTarget(filename: string, targets: readonly AudioTarget[]): string | null {
  const key = filename.replace(/\.[^.]+$/, '')
  const matches = targets.filter((target) => target.stableKey === key || target.id === key)
  return matches.length === 1 ? matches[0]!.id : null
}
