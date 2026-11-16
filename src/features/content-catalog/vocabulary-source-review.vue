<script setup lang="ts">
import { ElButton, ElCheckbox, ElTable, ElTableColumn } from 'element-plus'
import { computed, onBeforeUnmount, ref, watch } from 'vue'

import { api } from '@/services/http-client'

import type { components } from '@/shared/contracts/generated/admin-api'

import { sourceReasonLabels } from './content-catalog-model'
type Word = components['schemas']['Vocabulary'] | components['schemas']['VocabularyWord']
type Content = components['schemas']['SceneContent'] | components['schemas']['ListeningPayload']
const props = defineProps<{ module: 'scene' | 'listening'; content: Content; disabled?: boolean }>()
const emit = defineEmits<{
  matched: [words: Word[]]
  exceptions: [only: boolean]
  repair: [id: string]
  remove: [id: string]
}>()
const fresh = ref(false)
const busy = ref(false),
  error = ref(''),
  onlyErrors = ref(false)
const words = computed(() => props.content.vocabulary || [])
const passed = computed(() =>
  fresh.value ? words.value.filter((word) => word.source && !word.source_reason).length : 0
)
const manualCount = computed(() =>
  fresh.value
    ? words.value.filter((word) => word.source?.manual_english && !word.source_reason).length
    : 0
)
/** 为仍待人工补充的词条提供醒目的异常行样式
 * @param context 表格当前行及其来源核对状态
 * @param context.row 当前词条和已保存来源
 * @returns 待核对行的样式名称
 */
const rowClass = ({ row }: { row: Word }) =>
  !row.source || row.source_reason ? 'requires-review' : ''
const visible = computed(() =>
  onlyErrors.value ? words.value.filter((word) => !word.source || word.source_reason) : words.value
)
/** 为正文、词条及人工来源生成核对依据，忽略服务端派生的异常说明
 * @param content 待核对的完整正文与独立词条
 * @returns 当前模块的来源匹配指纹
 */
const signature = (content: Content) =>
  JSON.stringify({ module: props.module, content }, (key, value: unknown) =>
    key === 'source_reason' ? undefined : value
  )
const fingerprint = computed(() => signature(props.content))
let generation = 0,
  timer: ReturnType<typeof setTimeout> | null = null,
  matchedFingerprint = ''
/** 调用与保存、导入一致的匹配规则，过期响应不覆盖当前编辑 */
const match = async () => {
  if (props.disabled || !words.value.length) return
  const run = ++generation,
    current = fingerprint.value
  busy.value = true
  error.value = ''
  try {
    const result = await api.request<
      components['schemas']['SceneMatchResult'] | components['schemas']['ListeningMatchResult']
    >('/api/admin/v1/vocabulary/sources/preview', {
      method: 'POST',
      body: { module: props.module, content: JSON.parse(JSON.stringify(props.content)) }
    })
    if (run === generation && current === fingerprint.value) {
      matchedFingerprint = signature({ ...props.content, vocabulary: result.vocabulary } as Content)
      fresh.value = true
      emit('matched', result.vocabulary)
    }
  } catch (reason) {
    if (run === generation) error.value = (reason as Error).message
  } finally {
    if (run === generation) busy.value = false
  }
}
/** 展示原始正文中的真实词形，不以原形替代
 * @param word 保留资料词及服务端来源的独立词条
 * @returns 正文实际词形
 */
const actual = (word: Word) =>
  word.source ? ('word' in word.source ? word.source.word : word.source.quote) : '—'
/** 展示匹配对应的真实正文原句
 * @param word 服务端已匹配或待修正词条
 * @returns 原句或待核对原因
 */
const sentence = (word: Word) => {
  const source = word.source
  if (!source) return sourceReasonLabels[word.source_reason || ''] || '待重新匹配'
  if ('line_id' in source && 'dialogue' in props.content)
    return props.content.dialogue?.find((line) => line.id === source.line_id)?.english || ''
  return 'quote' in source ? source.quote : ''
}
watch(
  () => [fingerprint.value, props.disabled],
  () => {
    if (fingerprint.value === matchedFingerprint) {
      fresh.value = true
      return
    }
    generation++
    fresh.value = false
    busy.value = false
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      void match()
    }, 350)
  },
  { immediate: true }
)
onBeforeUnmount(() => {
  generation++
  if (timer) clearTimeout(timer)
})
</script>
<template>
  <section v-if="words.length" class="source-review">
    <div class="between">
      <strong>词汇来源自动匹配 · {{ words.length }} 个词汇</strong
      ><ElButton :disabled="disabled || busy" @click="match">{{
        busy ? '正在匹配…' : '重新匹配'
      }}</ElButton>
    </div>
    <p>
      自动通过 {{ passed - manualCount }} · 人工已确认 {{ manualCount }} · 待核对
      {{ words.length - passed }}
      <ElCheckbox v-model="onlyErrors" @change="emit('exceptions', onlyErrors)"
        >仅异常核对</ElCheckbox
      >
    </p>
    <p v-if="error" class="error" role="alert">
      来源匹配未刷新：{{ error }}，保存和发布仍由服务端重新校验
    </p>
    <ElTable :data="visible" row-key="id" :row-class-name="rowClass"
      ><ElTableColumn prop="english" label="资料词汇" /><ElTableColumn label="正文词形"
        ><template #default="{ row }">{{ actual(row as Word) }}</template></ElTableColumn
      ><!-- @vue-generic {Word} --><ElTableColumn label="对应正文原句" min-width="220"
        ><template #default="{ row }">{{ sentence(row as Word) }}</template></ElTableColumn
      ><ElTableColumn label="匹配结果"
        ><template #default="{ row }"
          ><span class="badge" :class="{ draft: !row.source || row.source_reason }">{{
            fresh && row.source && !row.source_reason
              ? row.source.manual_english
                ? '人工已确认'
                : '自动通过'
              : '待人工补充'
          }}</span
          ><small>{{
            fresh && row.source && !row.source_reason
              ? row.source.manual_english
                ? '已保留人工选择'
                : '无需手动确认'
              : sourceReasonLabels[row.source_reason] || '待重新匹配'
          }}</small></template
        ></ElTableColumn
      ><ElTableColumn label="操作"
        ><template #default="{ row }"
          ><template v-if="!row.source || row.source_reason"
            ><ElButton link :disabled="disabled" @click="emit('repair', row.id || '')"
              >修正此条</ElButton
            ><ElButton link :disabled="disabled" @click="emit('remove', row.id || '')"
              >移除此条</ElButton
            ></template
          ><small v-else>{{
            row.source.manual_english ? '人工已确认' : '无需手动确认'
          }}</small></template
        ></ElTableColumn
      ></ElTable
    ><small class="muted"
      >资料中的释义保持原样；可靠词形由服务端统一匹配，仅异常条目需要核对。</small
    >
  </section>
</template>
<style scoped lang="scss">
.source-review {
  margin: 24px 0;

  :deep(.requires-review) {
    --el-table-tr-bg-color: #fff3f0;
    --el-table-row-hover-bg-color: #ffe9e2;

    color: var(--red);

    .badge,
    .el-button {
      color: var(--red);
      font-weight: 600;
    }
  }

  .between {
    gap: 12px;
    flex-wrap: wrap;
  }

  p {
    margin: 12px 0;
  }

  small {
    display: block;
    margin-top: 6px;
  }
}
</style>
