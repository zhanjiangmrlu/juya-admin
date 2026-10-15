<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import AdminPanel from '@/components/admin-panel/admin-panel.vue'
import AppPageActions from '@/components/app-page-actions/app-page-actions.vue'
import ImportResourcePreview from '@/features/content-import/import-resource-preview.vue'

import type { ProductionSchema as S } from './work-order-model'

import WorkOrderImportResult from './work-order-import-result.vue'
import WorkOrderImportValidation from './work-order-import-validation.vue'
import { originalParagraphs } from './work-order-model'
import WorkOrderSourceIssues from './work-order-source-issues.vue'
const props = withDefaults(
  defineProps<{
    preview: S['ImportPreview']
    busy: boolean
    phase?: string
    contentType?: string
  }>(),
  { phase: 'preview', contentType: 'dialogue' }
)
const emit = defineEmits<{
  confirm: [fields: Omit<S['ImportConfirmRequest'], 'expected_version'>]
  retry: [fields: Omit<S['ImportConfirmRequest'], 'expected_version'>]
  exclude: [id: string]
  edit: [id: string]
  previewFailed: []
  previous: []
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
/**
 * 读取素材路径，保持上传包内真实映射
 * @param value - 服务端资源描述
 * @returns 可预览的包内路径
 */
const resourcePath = (value: unknown): string =>
  value && typeof value === 'object' ? String((value as Record<string, unknown>).path || '') : ''
/**
 * 提交明确选择与原预览版本
 * @param retry - 是否仅重试失败行
 */
const confirm = (retry = false): void => {
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
        !row.issues.some((issue) => issue.severity === 'ERROR') &&
        (!row.issues.length || compared.value.includes(row.item_id))
    )
)
/** 汇总已选篇目的差异确认项，保留逐篇确认状态 */
const differenceRows = computed(() => rows.value.filter((row) => row.issues.length))
/**
 * 展示原有默认素材确认项的名称
 * @param value - 服务端返回的默认素材标识
 * @returns 与原有确认控件一致的文案
 */
const defaultLabel = (value: string): string =>
  value.includes('cover')
    ? '确认使用默认封面'
    : value.includes('audio')
      ? '确认不配全文音频'
      : '确认此单词无图片'
/** 解释现有禁用条件，仅用于提示，不参与保存校验 */
const saveDisabledReasons = computed(() => {
  const reasons: string[] = []
  if (props.busy) reasons.push('正在处理，请稍候再保存')
  if (!rows.value.length) reasons.push('请先在上方表格选择需要保存的篇目')
  for (const row of rows.value) {
    const title = row.candidate.title_zh || row.candidate.title_en || row.import_content_id
    const errors = row.issues.filter((issue) => issue.severity === 'ERROR')
    if (errors.length)
      reasons.push(
        `${title}：存在阻断问题（${errors.map((issue) => issue.message).join('；')}），请补充或修正源文件`
      )
    const missingDefaults = row.defaults.filter((value) => !defaults.value.includes(value))
    if (missingDefaults.length)
      reasons.push(`${title}：尚未确认默认素材：${missingDefaults.map(defaultLabel).join('、')}`)
    if (row.issues.length && !compared.value.includes(row.item_id))
      reasons.push(`${title}：尚未确认原文与表格差异`)
  }
  return reasons
})
/**
 * 统计导入资料中已提供的词汇或语块
 * @param entries - 此篇真实词表记录
 * @param kind - 需要统计的词汇或语块类型
 * @returns 本次词表记录数
 */
const entryCount = (entries: S['ImportPreviewItem']['entries'], kind: string): number =>
  entries.filter((entry) => entry.entry_type === kind).length
const resourceLabels: Record<string, string> = {
  cover_path: '封面',
  audio_path: '整段音频',
  full_audio_path: '全文音频',
  learning_image_path: '学习图片'
}
</script>
<template>
  <WorkOrderImportValidation
    v-if="phase === 'validation'"
    :preview="preview"
    :busy="busy"
    @exclude="emit('exclude', $event)"
  />
  <WorkOrderImportResult
    v-else-if="phase === 'result'"
    :preview="preview"
    :busy="busy"
    @edit="emit('edit', $event)"
    @retry="emit('previewFailed')"
  />
  <div v-else class="import-preview">
    <ElAlert
      title="核对本次图文音频对应范围"
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
      <AdminPanel title="本次正文与素材对应"
        ><ElTable :data="preview.items"
          ><ElTableColumn label="内容 / 导入 ID" min-width="240"
            ><template #default="{ row }"
              ><ElCheckbox
                :value="row.item_id"
                :disabled="
                  busy ||
                  ['SUCCESS', 'CANCELLED'].includes(row.status) ||
                  row.issues.some((issue: S['WorkIssue']) => issue.severity === 'ERROR')
                "
                >{{
                  row.candidate.title_zh || row.candidate.title_en || row.import_content_id
                }}</ElCheckbox
              ><small>{{ row.import_content_id }}</small></template
            ></ElTableColumn
          ><ElTableColumn label="正文与译文" min-width="200"
            ><template #default="{ row }"
              >{{
                row.issues.some(
                  (issue: S['WorkIssue']) =>
                    issue.correction_target === 'content' || issue.correction_target === 'source'
                )
                  ? '有待核对问题'
                  : '查看下方完整正文'
              }}<small v-if="contentType !== 'short_reading'"
                >词汇 {{ entryCount(row.entries, 'word') }} · 语块
                {{ entryCount(row.entries, 'chunk') }}</small
              ></template
            ></ElTableColumn
          ><ElTableColumn label="封面" min-width="170"
            ><template #default="{ row }">{{
              resourcePath(row.resources.cover_path) || '默认安全封面（需确认）'
            }}</template></ElTableColumn
          ><ElTableColumn label="音频" min-width="180"
            ><template #default="{ row }">{{
              resourcePath(row.resources.audio_path) || '未提供，按模板检查'
            }}</template></ElTableColumn
          ><ElTableColumn label="本次操作" min-width="150"
            ><template #default="{ row }">{{
              row.operation === 'CREATE'
                ? '新增草稿'
                : row.operation === 'UPDATE_DRAFT'
                  ? '候选版本更新'
                  : row.operation === 'SKIP'
                    ? '相同资料跳过'
                    : '待核实'
            }}</template></ElTableColumn
          ></ElTable
        ></AdminPanel
      >
      <details
        v-for="row in preview.items"
        :key="row.item_id"
        class="content-detail"
        data-source-scope
      >
        <summary>
          查看正文、译文、图片角色与音频 ·
          {{ row.candidate.title_zh || row.candidate.title_en || row.import_content_id }}
        </summary>
        <AdminPanel
          :title="String(row.candidate.title_en || row.candidate.title_zh || row.import_content_id)"
        >
          <ElCheckbox
            :value="row.item_id"
            :disabled="
              busy ||
              ['SUCCESS', 'SKIPPED', 'CANCELLED'].includes(row.status) ||
              row.issues.some((issue) => issue.severity === 'ERROR')
            "
            >选中此篇 · 文件标识 {{ row.import_content_id }} · 表格第
            {{ row.row_no }} 行</ElCheckbox
          >
          <WorkOrderSourceIssues
            :issues="row.issues"
            :item-id="row.item_id"
            :snapshot="row.source_snapshot"
            :sentences="
              Array.isArray(row.candidate.dialogue)
                ? (row.candidate.dialogue as Record<string, unknown>[])
                : []
            "
          />
          <div class="comparison">
            <div>
              <h4>原始文档 · 只读</h4>
              <p v-if="!row.source_snapshot">未保留可验证的原始正文，请补充源文件后核对。</p>
              <div
                v-for="(paragraph, index) in originalParagraphs(row.source_snapshot)"
                :key="index"
                :data-source-location="paragraph.sourceKey || paragraph.locator"
                :data-source-aliases="paragraph.sourceAliases?.join(' ')"
              >
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
                  :data-source-sentence="Number(index) + 1"
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
          <h4>{{ contentType === 'short_reading' ? '素材对应' : '素材与词表对应' }}</h4>
          <div v-for="(value, key) in row.resources" :key="key">
            <template v-if="resourcePath(value)"
              ><span>{{ resourceLabels[key] || '资料' }} · {{ resourcePath(value) }}</span
              ><ImportResourcePreview
                :batch-id="preview.batch_id"
                :path="resourcePath(value)"
                :disabled="busy"
            /></template>
          </div>
          <div
            v-for="(entry, index) in contentType === 'short_reading' ? [] : row.entries"
            :key="index"
            class="entry"
          >
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
              defaultLabel(value)
            }}</ElCheckbox></ElCheckboxGroup
          >
        </AdminPanel>
      </details>
    </ElCheckboxGroup>
    <AppPageActions>
      <section class="save-review" aria-label="保存前确认">
        <div class="save-checks">
          <ElCheckboxGroup
            v-if="differenceRows.length"
            v-model="compared"
            class="difference-checks"
            aria-label="差异核对确认"
          >
            <ElCheckbox v-for="row in differenceRows" :key="row.item_id" :value="row.item_id">
              <span class="difference-title">{{
                row.candidate.title_zh || row.candidate.title_en || row.import_content_id
              }}</span>
              <span>已核对原文与表格的差异，按预览值保存；阻断问题仍需补充源文件</span>
            </ElCheckbox>
          </ElCheckboxGroup>
          <div
            v-if="saveDisabledReasons.length"
            id="import-save-reasons"
            class="save-reasons"
            role="status"
            aria-live="polite"
          >
            <span>暂不能保存：</span>
            <ul>
              <li v-for="reason in saveDisabledReasons" :key="reason">{{ reason }}</li>
            </ul>
          </div>
        </div>
        <div class="save-buttons">
          <ElButton :disabled="busy" @click="emit('previous')">上一步</ElButton>
          <ElButton
            :disabled="busy || !ready"
            :aria-describedby="saveDisabledReasons.length ? 'import-save-reasons' : undefined"
            type="primary"
            @click="confirm()"
            >确认保存选中 {{ selected.length }} 篇草稿</ElButton
          ><ElButton
            v-if="rows.some((row) => row.status === 'FAILED')"
            :disabled="busy || !ready"
            :aria-describedby="saveDisabledReasons.length ? 'import-save-reasons' : undefined"
            @click="confirm(true)"
            >仅重试选中失败篇目</ElButton
          >
        </div>
      </section>
    </AppPageActions>
  </div>
</template>
<style scoped lang="scss">
.save-review {
  display: flex;
  align-items: flex-end;
  gap: 20px;
  min-width: 0;
  max-width: 100%;

  .save-checks {
    display: grid;
    gap: 8px;
    min-width: 0;
    max-width: 680px;
  }

  .difference-checks {
    display: grid;
    gap: 6px;
    max-height: 144px;
    overflow-y: auto;

    :deep(.el-checkbox) {
      height: auto;
      align-items: flex-start;
      max-width: 100%;
      margin: 0;
    }

    :deep([class~='el-checkbox__input']) {
      margin-top: 3px;
    }

    :deep([class~='el-checkbox__label']) {
      white-space: normal;
      overflow-wrap: anywhere;
      font-size: 13px;
      line-height: 1.5;
    }

    .difference-title {
      display: block;
      font-weight: 600;
    }
  }

  .save-reasons {
    max-height: 96px;
    overflow-y: auto;
    color: var(--juya-color-text-regular);
    font-size: 12px;
    line-height: 1.5;
    overflow-wrap: anywhere;

    ul {
      margin: 0;
      padding-inline-start: 18px;
    }
  }

  .save-buttons {
    display: flex;
    flex-shrink: 0;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 12px;
  }

  @media (width <= 1100px) {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;

    .save-checks {
      max-width: none;
    }

    .save-buttons {
      gap: 8px;
    }
  }
}

.import-preview {
  display: grid;
  gap: 20px;

  small {
    display: block;
    color: var(--juya-color-text-secondary);
  }

  .content-detail {
    font-size: 14px;
    line-height: 22px;
    margin-top: 12px;

    summary {
      cursor: pointer;
      padding: 12px 16px;
      border-radius: 12px;
      background: var(--juya-color-surface);
      line-height: 22px;
    }
  }

  .comparison {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 24px;

    [data-source-highlight='true'] {
      outline: 2px solid var(--el-color-primary);
      outline-offset: 3px;
    }

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
