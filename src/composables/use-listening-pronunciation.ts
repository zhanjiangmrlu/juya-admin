import { type MaybeRefOrGetter, toValue } from 'vue'

import { queryURL } from '@/services/display'
import { api } from '@/services/http-client'
import { loadPronunciation } from '@/services/pronunciation-service'

import type { components } from '@/shared/contracts/generated/admin-api'
import type { PronunciationReference } from '@/shared/types/pronunciation'

import { useWordPronunciation } from './use-word-pronunciation'
export interface ListeningPronunciationContext {
  path: string
  reference: PronunciationReference
}
/** 复用统一音频焦点与受控发音服务，不接受自由英文文本
 * @param context 当前已保存文章或候选及其版本引用
 * @returns 可停止并排除旧请求的词汇播放器
 */
export const useListeningPronunciation = (
  context: MaybeRefOrGetter<ListeningPronunciationContext | undefined>
) =>
  useWordPronunciation(async (id, active) => {
    const saved = toValue(context)
    if (!saved) throw new Error('请先保存当前修改后试听')
    const path = `${saved.path}/words/${encodeURIComponent(id)}/pronunciation`
    const url = await loadPronunciation(
      {
        active,
        pause: () => new Promise((resolve) => setTimeout(resolve, 1000)),
        request: (method, url, reference) =>
          api.request<components['schemas']['SpeechState']>(
            method === 'GET' ? queryURL(url, reference) : url,
            method === 'POST' ? { method, body: reference } : {}
          )
      },
      path,
      saved.reference
    )
    if (!url.startsWith('/api/admin/v1/')) throw new Error('发音地址暂不可用')
    return (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '') + url
  })
