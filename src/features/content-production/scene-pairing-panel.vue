<script setup lang="ts">
import { computed, reactive } from 'vue'

import AdminPanel from '@/components/admin-panel/admin-panel.vue'
import DialogueFields from '@/features/content-editor/dialogue-fields.vue'

import type { DialogueRow } from '@/features/content-editor/scene-form'

const rows = defineModel<DialogueRow[]>({ required: true })
const props = defineProps<{ snapshot: Record<string, unknown> | null }>()
const choices = reactive<Record<string, string>>({})
const segments = computed(() => {
  const result: { id: string; text: string; locator: string; role: string }[] = []
  /**
   * 收集解析器实际保留的正文段落，来源位置不从编辑后候选推断
   * @param snapshot - 当前不可变文档或其原始子文档
   * @param prefix - 多文档来源位置
   */
  const append = (snapshot: Record<string, unknown> | null, prefix = ''): void => {
    if (!snapshot) return
    if (Array.isArray(snapshot.documents))
      snapshot.documents.forEach((document, index) =>
        append(document as Record<string, unknown>, `文档 ${index + 1} · `)
      )
    if (!Array.isArray(snapshot.blocks)) return
    for (const block of snapshot.blocks as Record<string, unknown>[])
      if (
        typeof block.id === 'string' &&
        typeof block.text === 'string' &&
        ['english', 'chinese'].includes(String(block.role))
      )
        result.push({
          id: `${prefix}${block.id}`,
          text: block.text,
          role: String(block.role),
          locator: `${prefix}第 ${block.paragraph_index ?? block.id} 段`
        })
  }
  append(props.snapshot)
  return result
})
const chinese = computed(() => segments.value.filter((row) => row.role === 'chinese'))
/**
 * 展示文本相同的保留段落位置，重复文本不猜配唯一来源
 * @param text - 当前候选正文
 * @param role - 原始英文或中文段落类型
 * @returns 已知来源位置或待人工核对说明
 */
const location = (text: string, role: string): string => {
  const matches = segments.value.filter(
    (row) => row.role === role && row.text.trim() === text.trim()
  )
  return matches.length === 1 ? matches[0]!.locator : '来源待人工核对'
}
/**
 * 把管理员明确选择的真实保留段落写入当前句子的中文字段
 * @param row - 当前稳定句子身份及手工候选
 */
const pair = (row: DialogueRow): void => {
  const selected = chinese.value.find((segment) => segment.id === choices[row.id])
  if (selected) row.chinese = selected.text
}
</script>
<template>
  <AdminPanel title="结构化候选 · 可校正" class="scene-pairing-panel">
    <article
      v-for="(row, index) in rows"
      :key="row.id"
      class="pair-row"
      :data-source-sentence="index + 1"
    >
      <h3>英文段落 {{ index + 1 }}</h3>
      <p>{{ row.speaker ? `${row.speaker}: ` : '' }}{{ row.english }}</p>
      <ElForm label-position="top">
        <ElFormItem label="选择对应中文段落">
          <ElSelect
            v-model="choices[row.id]"
            :aria-label="`选择对应中文段落 ${index + 1}`"
            :disabled="!chinese.length"
            placeholder="从保留的原文选择"
          >
            <ElOption
              v-for="segment in chinese"
              :key="segment.id"
              :value="segment.id"
              :label="`${segment.locator} · ${segment.text}`"
            />
          </ElSelect>
        </ElFormItem>
      </ElForm>
      <p>当前中文：{{ row.chinese || '待补充' }}</p>
      <small
        >当前文本对应：{{ location(row.english, 'english') }} →
        {{ location(row.chinese, 'chinese') }}</small
      >
      <ElButton :disabled="!choices[row.id]" @click="pair(row)">确认此处配对</ElButton>
    </article>
    <p v-if="!chinese.length">
      未保留可选择的中文正文段落，请对照原文件手动校对，不从当前候选补造原文。
    </p>
    <details class="manual-edit">
      <summary>手动编辑正文</summary>
      <DialogueFields v-model="rows" />
    </details>
  </AdminPanel>
</template>
<style scoped lang="scss">
.scene-pairing-panel {
  min-width: 0;

  .pair-row {
    display: grid;
    gap: 12px;
    padding: 0 0 20px;
    margin-bottom: 20px;
    border-bottom: 1px solid var(--juya-color-border);

    &[data-source-highlight='true'] {
      outline: 2px solid var(--el-color-primary);
      outline-offset: 3px;
    }

    h3,
    p {
      margin: 0;
      line-height: 1.7;
      overflow-wrap: anywhere;
    }

    h3 {
      font-size: 14px;
    }

    small {
      color: var(--juya-color-text-secondary);
      overflow-wrap: anywhere;
    }

    .el-button {
      justify-self: start;
    }
  }

  .manual-edit {
    summary {
      color: var(--el-color-primary);
      cursor: pointer;
      padding: 12px 0;
    }
  }
}
</style>
