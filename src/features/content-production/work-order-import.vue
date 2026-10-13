<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import AdminPanel from '@/components/admin-panel/admin-panel.vue'
import ImportResourcePreview from '@/features/content-import/import-resource-preview.vue'

import type { ProductionSchema as S } from './work-order-model'

import { originalParagraphs } from './work-order-model'
const props = defineProps<{ preview: S['ImportPreview']; busy: boolean }>()
const emit = defineEmits<{
  confirm: [fields: Omit<S['ImportConfirmRequest'], 'expected_version'>]
  retry: [fields: Omit<S['ImportConfirmRequest'], 'expected_version'>]
}>()
const selected = ref<string[]>([])
const defaults = ref<string[]>([])
const compared = ref<string[]>([])
watch(
  () => [props.preview.preview_hash, props.preview.preview_version],
  () => {
    selected.value = []
    defaults.value = []
    compared.value = []
  }
)
const rows = computed(() =>
  props.preview.items.filter((row) => selected.value.includes(row.item_id))
)
const /** 读取素材路径，保持上传包内真实映射
   * @param value - 服务端资源描述
   * @returns 可预览的包内路径
   */
  resourcePath = (value: unknown): string =>
    value && typeof value === 'object' ? String((value as Record<string, unknown>).path || '') : ''
const /** 提交明确选择与原预览版本
   * @param retry - 是否仅重试失败行
   */
  confirm = (retry = false): void => {
    const targets = retry ? rows.value.filter((row) => row.status === 'FAILED') : rows.value
    const fields: Omit<S['ImportConfirmRequest'], 'expected_version'> = {
      scope: 'selected',
      selected_item_ids: targets.map((row) => row.item_id),
      preview_hash: props.preview.preview_hash,
      preview_version: props.preview.preview_version,
      acknowledged_defaults: defaults.value,
      confirmed_conflicts: targets
        .filter((row) => compared.value.includes(row.item_id))
        .flatMap((row) =>
          row.issues.flatMap((issue) =>
            (issue.location || []).map((field) => `${row.import_item_id}:${field}`)
          )
        )
    }
    if (retry) emit('retry', fields)
    else emit('confirm', fields)
  }
const ready = computed(
  () =>
    rows.value.length > 0 &&
    rows.value.every(
      (row) =>
        row.defaults.every((value) => defaults.value.includes(value)) &&
        (!row.issues.length || compared.value.includes(row.item_id))
    )
)
const resourceLabels: Record<string, string> = {
  cover_path: '封面',
  audio_path: '整段音频',
  full_audio_path: '全文音频',
  learning_image_path: '学习图片'
}
</script>
<template>
  <div class="import-preview">
    <ElAlert
      title="校验与对应预览"
      description="逐篇核对完整双语正文、上传原文与素材对应。确认仅保存选中草稿，未选中项目仍保留在本批。"
      type="info"
      :closable="false"
    />
    <ElAlert
      v-for="issue in preview.batch_issues"
      :key="issue.id"
      :title="issue.message"
      type="warning"
      :closable="false"
    />
    <ElEmpty v-if="!preview.items.length" description="文件正在解析，请刷新查看校验结果" />
    <ElCheckboxGroup v-model="selected">
      <AdminPanel
        v-for="row in preview.items"
        :key="row.item_id"
        :title="String(row.candidate.title_en || row.candidate.title_zh || row.import_content_id)"
      >
        <ElCheckbox
          :value="row.item_id"
          :disabled="busy || ['SUCCESS', 'SKIPPED', 'CANCELLED'].includes(row.status)"
          >选中此篇 · 文件标识 {{ row.import_content_id }} · 表格第 {{ row.row_no }} 行</ElCheckbox
        >
        <ElAlert
          v-for="issue in row.issues"
          :key="issue.id"
          :title="issue.message"
          type="warning"
          :closable="false"
        />
        <div class="comparison">
          <div>
            <h4>原始文档 · 只读</h4>
            <p v-if="!row.source_snapshot">未保留可验证的原始正文，请补充源文件后核对。</p>
            <div v-for="(paragraph, index) in originalParagraphs(row.source_snapshot)" :key="index">
              <small>{{ paragraph.locator }}</small>
              <p>{{ paragraph.text }}</p>
            </div>
          </div>
          <div>
            <h4>将保存的正文与译文</h4>
            <template v-if="Array.isArray(row.candidate.dialogue)"
              ><p
                v-for="(sentence, index) in row.candidate.dialogue as Record<string, unknown>[]"
                :key="index"
              >
                {{ sentence.speaker }}: {{ sentence.english }}<br />{{ sentence.chinese }}
              </p></template
            ><template v-else
              ><p
                v-for="(paragraph, index) in (row.candidate.paragraphs_en as string[]) || []"
                :key="index"
              >
                {{ paragraph }}
              </p>
              <p>{{ row.candidate.translation_zh }}</p></template
            >
            <p>
              {{ row.candidate.source || row.candidate.copyright_source }}
              {{ row.candidate.copyright }}
            </p>
          </div>
        </div>
        <h4>素材与词表对应</h4>
        <div v-for="(value, key) in row.resources" :key="key">
          <template v-if="resourcePath(value)"
            ><span>{{ resourceLabels[key] || '资料' }} · {{ resourcePath(value) }}</span
            ><ImportResourcePreview
              :batch-id="preview.batch_id"
              :path="resourcePath(value)"
              :disabled="busy"
          /></template>
        </div>
        <div v-for="(entry, index) in row.entries" :key="index" class="entry">
          <strong>{{ entry.english }}</strong> · {{ entry.meaning_zh || entry.chinese }}
          <p>{{ entry.source_sentence }}</p>
          <ImportResourcePreview
            v-if="
              entry.image_path && !['PHRASE', 'CHUNK', 'chunk'].includes(String(entry.entry_type))
            "
            :batch-id="preview.batch_id"
            :path="String(entry.image_path)"
            :disabled="busy"
          />
        </div>
        <ElCheckboxGroup v-model="defaults"
          ><ElCheckbox v-for="value in row.defaults" :key="value" :value="value">{{
            value.includes('cover')
              ? '确认使用默认封面'
              : value.includes('audio')
                ? '确认不配全文音频'
                : '确认此单词无图片'
          }}</ElCheckbox></ElCheckboxGroup
        >
        <ElCheckboxGroup v-model="compared"
          ><ElCheckbox v-if="row.issues.length" :value="row.item_id"
            >已核对原文与表格的差异，按预览值保存；阻断问题仍需补充源文件</ElCheckbox
          ></ElCheckboxGroup
        >
      </AdminPanel>
    </ElCheckboxGroup>
    <div class="actions">
      <ElButton :disabled="busy || !ready" type="primary" @click="confirm()"
        >确认保存选中 {{ selected.length }} 篇草稿</ElButton
      ><ElButton
        v-if="rows.some((row) => row.status === 'FAILED')"
        :disabled="busy || !ready"
        @click="confirm(true)"
        >仅重试选中失败篇目</ElButton
      >
    </div>
  </div>
</template>
<style scoped lang="scss">
.import-preview {
  display: grid;
  gap: 20px;

  .comparison {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 24px;

    p {
      white-space: pre-wrap;
      line-height: 1.8;
    }

    small {
      color: var(--juya-color-text-regular);
    }
  }

  .entry {
    padding: 12px 0;
    border-bottom: 1px solid var(--juya-color-border);
  }

  .actions {
    display: flex;
    gap: 12px;
    justify-content: flex-end;
  }

  @media (width <= 800px) {
    .comparison {
      grid-template-columns: 1fr;
    }
  }
}
</style>
