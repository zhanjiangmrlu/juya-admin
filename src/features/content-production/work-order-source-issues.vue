<script setup lang="ts">
import { computed, ref } from 'vue'

import type { ProductionSchema as S } from './work-order-model'

import { originalParagraphs } from './work-order-model'

const props = withDefaults(
  defineProps<{
    issues: S['WorkIssue'][]
    snapshot?: Record<string, unknown> | null
    sentences?: Record<string, unknown>[]
    editable?: boolean
    itemId?: string
    sourceVisible?: boolean
  }>(),
  { snapshot: null, sentences: () => [], editable: false, itemId: '', sourceVisible: true }
)
const emit = defineEmits<{ edit: [] }>()
const root = ref<globalThis.HTMLElement | null>(null)
const groups = computed(() => {
  const result = new Map<string, S['WorkIssue'][]>()
  for (const issue of props.issues) {
    const key = `${issue.code || 'UNKNOWN'}:${issue.message}`
    result.set(key, [...(result.get(key) || []), issue])
  }
  return [...result].map(([code, issues]) => ({ code, issues, message: issues[0]!.message }))
})
/**
 * 展示来源词条类型与真实名称
 * @param issue - 服务端保留的来源问题和诊断证据
 * @returns 带有词条类型与名称的问题标题
 */
const title = (issue: S['WorkIssue']): string => {
  const diagnostic = issue.source_diagnostic
  if (!diagnostic?.entry_text) return issue.message
  const kind = ['chunk', 'CHUNK', 'PHRASE'].includes(diagnostic.entry_type || '')
    ? '语块'
    : ['word', 'WORD', 'vocabulary', 'VOCABULARY'].includes(diagnostic.entry_type || '')
      ? '词汇'
      : '条目'
  return `${kind}「${diagnostic.entry_text}」：${issue.message}`
}
/**
 * 标出两侧不同的文本范围，始终通过文本插值转义
 * @param text - 当前一侧原始文本
 * @param other - 对照一侧原始文本
 * @returns 相同前后文与中间差异文本
 */
const difference = (text: string | null | undefined, other: string | null | undefined) => {
  const value = text ?? '',
    compared = other ?? ''
  let start = 0,
    end = value.length,
    otherEnd = compared.length
  while (start < Math.min(end, otherEnd) && value[start] === compared[start]) start++
  while (end > start && otherEnd > start && value[end - 1] === compared[otherEnd - 1]) {
    end--
    otherEnd--
  }
  return {
    before: value.slice(0, start),
    changed: value.slice(start, end),
    after: value.slice(end)
  }
}
/**
 * 只使用快照中真实存在的位置建立原文导航
 * @param locations - 解析器原文标识或词表坐标
 * @returns 在当前快照中唯一存在的位置
 */
const sourceTargets = (locations: string[] | undefined): string[] => {
  if (!props.sourceVisible) return []
  const paragraphs = originalParagraphs(props.snapshot)
  return (locations || []).filter(
    (location) =>
      paragraphs.filter(
        (paragraph) =>
          (paragraph.sourceKey || paragraph.locator) === location ||
          paragraph.sourceAliases?.includes(location)
      ).length === 1
  )
}
/**
 * 将解析器稳定标识翻译为快照中真实的段落或表格坐标
 * @param locations - 问题诊断保留的原文件定位
 * @returns 原始段落或表格坐标文案
 */
const sourceLabels = (locations: string[]): string => {
  const paragraphs = originalParagraphs(props.snapshot)
  return locations
    .map(
      (location) =>
        paragraphs.find(
          (paragraph) =>
            paragraph.sourceKey === location || paragraph.sourceAliases?.includes(location)
        )?.locator || location
    )
    .join('、')
}
/**
 * 判断问题是否属于另一份导入记录，避免导航到当前篇目
 * @param issue - 记录原始工作项身份的问题
 * @returns 是否需要回原工作项对照
 */
const foreignIssue = (issue: S['WorkIssue']): boolean =>
  !!props.itemId && !!issue.origin_work_item_id && issue.origin_work_item_id !== props.itemId
/**
 * 仅在稳定身份和原始英文均吻合时导航当前正文
 * @param issue - 带有原始句子身份的来源问题
 * @returns 当前正文句子序号或空
 */
const sentenceTarget = (issue: S['WorkIssue']): number | null => {
  const diagnostic = issue.source_diagnostic
  const index = props.sentences.findIndex(
    (sentence) =>
      !!diagnostic?.actual_sentence_id &&
      sentence.id === diagnostic.actual_sentence_id &&
      sentence.english === diagnostic.actual_text
  )
  return index < 0 ? null : index + 1
}
/**
 * 展示服务端原始定位值，不改写定位契约
 * @param value - 上传词表中填写的来源定位
 * @returns 原始定位文本或 JSON
 */
const locator = (value: unknown): string =>
  typeof value === 'string' ? value : JSON.stringify(value)
/**
 * 定位当前篇目中确实存在的正文或原文，突出并转移键盘焦点
 * @param kind - 目标属于候选正文还是不可变原文
 * @param value - 已验证的句子序号或原文稳定坐标
 */
const navigate = (kind: 'sentence' | 'location', value: string | number): void => {
  const scope = root.value?.closest('[data-source-scope]')
  const target = [
    ...(scope?.querySelectorAll<globalThis.HTMLElement>(`[data-source-${kind}]`) || [])
  ].find(
    (element) =>
      element.getAttribute(`data-source-${kind}`) === String(value) ||
      (kind === 'location' && element.dataset.sourceAliases?.split(' ').includes(String(value)))
  )
  if (!target) return
  scope
    ?.querySelectorAll('[data-source-highlight]')
    .forEach((element) => element.removeAttribute('data-source-highlight'))
  target.setAttribute('data-source-highlight', 'true')
  target.setAttribute('tabindex', '-1')
  target.scrollIntoView({ block: 'center', behavior: 'smooth' })
  target.focus({ preventScroll: true })
}
</script>
<template>
  <section v-if="issues.length" ref="root" class="source-issues" aria-label="问题详情">
    <h3>{{ issues.length }} 项问题</h3>
    <p v-if="issues.some((issue) => issue.source_diagnostic)" class="source-location">
      正文句子序号按导入时的英文句子计算，与原文件段落序号不同。
    </p>
    <details v-for="group in groups" :key="group.code" open class="issue-group">
      <summary>{{ group.message }} · {{ group.issues.length }} 项</summary>
      <article
        v-for="(issue, index) in group.issues"
        :key="`${issue.id}:${index}`"
        class="source-issue"
      >
        <h4>{{ title(issue) }}</h4>
        <p v-if="foreignIssue(issue)" class="remedy">
          此问题来自另一份导入记录，请回到原工作单对照处理。
        </p>
        <template v-if="issue.source_diagnostic">
          <p v-if="issue.source_diagnostic.source_locations?.length" class="source-location">
            源文件位置：{{ sourceLabels(issue.source_diagnostic.source_locations) }}
          </p>
          <p v-if="issue.source_diagnostic.declared_locator != null">
            填写的来源位置：{{ locator(issue.source_diagnostic.declared_locator) }}
          </p>
          <div
            v-if="
              issue.source_diagnostic.declared_text != null ||
              issue.source_diagnostic.actual_text != null
            "
            class="text-comparison"
          >
            <div>
              <strong>词表填写的来源原句</strong>
              <p v-if="issue.source_diagnostic.declared_text != null">
                <template
                  v-for="(part, key) in difference(
                    issue.source_diagnostic.declared_text,
                    issue.source_diagnostic.actual_text
                  )"
                  :key="key"
                  ><mark v-if="key === 'changed' && part">{{ part }}</mark
                  ><template v-else>{{ part }}</template></template
                >
              </p>
              <p v-else>未填写来源原句</p>
              <small v-if="issue.source_diagnostic.declared_speaker"
                >填写的说话者：{{ issue.source_diagnostic.declared_speaker }}</small
              >
            </div>
            <div>
              <strong>{{
                issue.source_diagnostic.actual_sentence_number
                  ? `指定的正文第 ${issue.source_diagnostic.actual_sentence_number} 句`
                  : '对应正文'
              }}</strong>
              <p v-if="issue.source_diagnostic.actual_text != null">
                <template
                  v-for="(part, key) in difference(
                    issue.source_diagnostic.actual_text,
                    issue.source_diagnostic.declared_text
                  )"
                  :key="key"
                  ><mark v-if="key === 'changed' && part">{{ part }}</mark
                  ><template v-else>{{ part }}</template></template
                >
              </p>
              <p v-else>没有可靠的对应句，请检查来源位置是否属于本篇正文</p>
              <small v-if="issue.source_diagnostic.actual_speaker"
                >正文说话者：{{ issue.source_diagnostic.actual_speaker }}</small
              >
            </div>
          </div>
          <p v-if="issue.code === 'SOURCE_LOCATOR_INVALID'">
            <template v-if="issue.source_diagnostic.unsupported_fields?.length"
              >不支持的字段：{{ issue.source_diagnostic.unsupported_fields.join('、') }}。</template
            >来源位置可填写从 1 开始的正文句子序号，或使用
            sentence_id、sentence_number、paragraph_number 的 JSON 对象；旧格式需完整包含
            turn、speaker、source_sentence 三个字段。
          </p>
          <p
            v-if="
              issue.code === 'SOURCE_AMBIGUOUS' &&
              issue.source_diagnostic.matched_sentence_numbers?.length
            "
          >
            相同原句出现在正文第
            {{ issue.source_diagnostic.matched_sentence_numbers.join('、') }}
            句，请明确其中一处的来源位置。
          </p>
          <p v-if="!foreignIssue(issue)" class="remedy">
            处理方法：{{
              editable
                ? '到本篇词条资料展开“编辑文字资料”，核对“来源句子”和“本篇来源原句”，修正可修改的内容后保存。上传文件中的来源定位格式或说话者有误时，请修正源文件后重新导入。'
                : '核对词表的来源位置、引用原句及说话者，在源文件中修正有误的一项，再重新导入。'
            }}
          </p>
          <div v-if="!foreignIssue(issue)" class="issue-actions">
            <ElButton v-if="editable" size="small" @click="emit('edit')">核对本篇词条</ElButton>
            <ElButton
              v-for="location in sourceTargets(issue.source_diagnostic.source_locations)"
              :key="location"
              size="small"
              @click="navigate('location', location)"
              >查看词表位置</ElButton
            >
            <ElButton
              v-if="sentenceTarget(issue) !== null"
              size="small"
              @click="navigate('sentence', sentenceTarget(issue)!)"
              >查看对应正文</ElButton
            >
            <ElButton
              v-for="location in sourceTargets(issue.source_diagnostic.actual_source_locations)"
              v-else
              :key="location"
              size="small"
              @click="navigate('location', location)"
              >查看原文对应段落</ElButton
            >
          </div>
        </template>
        <p v-else-if="issue.code?.startsWith('SOURCE_')" class="remedy">
          旧记录缺少详细定位，请修正源文件后重新导入查看完整诊断
        </p>
        <p v-else class="remedy">
          {{
            editable
              ? '修正后保存，系统将按当前内容重新校验'
              : '请对照上传文件中的问题，修正后重新导入'
          }}
        </p>
      </article>
    </details>
  </section>
</template>
<style scoped lang="scss">
.source-issues {
  min-width: 0;
  line-height: 1.7;
  overflow-wrap: anywhere;

  h3 {
    font-size: 16px;
    margin: 16px 0 8px;
  }

  .issue-group {
    border-bottom: 1px solid var(--juya-color-border);
  }

  summary {
    cursor: pointer;
    padding: 12px 0;
    font-weight: 600;
  }

  .source-issue {
    padding: 12px 0 20px;
    border-top: 1px solid var(--juya-color-border);
  }

  h4 {
    font-size: 14px;
    margin: 0 0 8px;
  }

  p {
    margin: 6px 0;
    white-space: pre-wrap;
  }

  .source-location,
  small {
    color: var(--juya-color-text-regular);
  }

  .text-comparison {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 20px;
    padding: 12px;
    background: var(--juya-color-page);
    border-radius: 6px;
  }

  mark {
    color: var(--el-color-warning-dark-2);
    background: var(--el-color-warning-light-9);
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  .remedy {
    max-width: 80ch;
  }

  .issue-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 12px;

    .el-button {
      margin: 0;
    }
  }

  @media (width <= 800px) {
    .text-comparison {
      grid-template-columns: 1fr;
      gap: 12px;
    }
  }
}
</style>
