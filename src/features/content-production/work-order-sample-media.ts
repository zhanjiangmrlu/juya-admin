import type { WorkItemDetail } from './work-order-model'

export interface SampleResource {
  key: string
  resourceId: string
  kind: 'audio' | 'image'
  label: string
  identity: string
  url?: string
  error?: string
}
/**
 * 固定当前抽样篇目与候选身份
 * @param detail - 当前服务端候选
 * @returns 媒体回执所属的精确候选身份
 */
export const sampleIdentity = (detail: WorkItemDetail): string =>
  `${detail.item_id}:${detail.revision_id}:${detail.candidate_hash}`
/**
 * 收集当前候选全部必检媒体，不将词汇卡等同于整段音频
 * @param detail - 已冻结身份的样本详情
 * @returns 图片与固定音频版本的核对清单
 */
export const sampleResources = (detail: WorkItemDetail): SampleResource[] => {
  const content = detail.current?.content
  if (!content) return []
  const result: SampleResource[] = []
  const identity = sampleIdentity(detail)
  /**
   * 加入实际引用且去重的资源
   * @param resourceId - 当前候选引用的资源
   * @param kind - 图片或固定音频
   * @param label - 管理员核对的业务名称
   * @param key - 固定音频版本或素材身份
   */
  const add = (
    resourceId: string | null | undefined,
    kind: SampleResource['kind'],
    label: string,
    key = resourceId
  ): void => {
    if (resourceId && key && !result.some((row) => row.key === key))
      result.push({ resourceId, key, kind, label, identity })
  }
  add(content.cover_asset_id, 'image', '本篇封面')
  add(content.audio?.asset_id, 'audio', '本篇整段音频', content.audio?.version_id)
  if (detail.current?.template !== 'short_reading') {
    const scene = content as import('./work-order-model').ProductionSchema['SceneContent']
    add(scene.original_image_asset_id, 'image', '学习原图')
    for (const entry of scene.vocabulary || []) {
      add(entry.icon_asset_id, 'image', `${entry.english} 图片`)
      add(entry.audio_version_id, 'audio', `${entry.english} 固定发音`)
    }
    for (const entry of scene.chunks || [])
      add(entry.audio_version_id, 'audio', `${entry.english} 固定发音`)
  }
  return result
}
