<script setup lang="ts">
import AdminPanel from '@/components/admin-panel/admin-panel.vue'
import DialogueFields from '@/features/content-editor/dialogue-fields.vue'
import LexiconFields from '@/features/content-editor/lexicon-fields.vue'
import OcrComparisonLines from '@/features/ocr/ocr-comparison-lines.vue'

import type { SceneContent } from '@/features/content-editor/scene-form'
import type { OcrQuota } from '@/features/ocr/ocr-adapter'
import type { OcrJob } from '@/features/ocr/ocr-model'
import type { OcrGroup, OcrSuggestions } from '@/features/ocr/ocr-suggestions'

defineProps<{
  form: SceneContent
  candidate: SceneContent
  quota: OcrQuota | null
  job: OcrJob | null
  busy: boolean
  disabled: boolean
  candidateReady: boolean
  suggestions: OcrSuggestions | null
  acceptedGroups: string[]
  rawLines: string[]
  imageUrl: string
}>()
const selectedFields = defineModel<string[]>('selectedFields', { required: true })
const emit = defineEmits<{
  start: []
  refresh: []
  assign: [text: string, field: string, lineId: number]
  group: [group: OcrGroup]
  adopt: []
}>()
</script>

<template>
  <!-- eslint-disable vue/no-mutating-props -- 接入约定允许编辑父页持有的候选对象嵌套字段。 -->
  <section class="scene-ocr-panel">
    <AdminPanel class="recognition-card">
      <template #header
        ><h3>原图与 OCR 行位置</h3>
        <p>完整学习图片仅供管理员校对</p></template
      >
      <div class="recognition-grid">
        <div>
          <img v-if="imageUrl" class="original-image" :src="imageUrl" alt="学习原图" />
          <p v-else>暂无可显示的学习原图，请在场景草稿上传原图或刷新图片地址。</p>
        </div>
        <div>
          <ElAlert
            v-if="quota && (!quota.enabled || quota.remaining <= 0)"
            title="OCR 暂不可用"
            type="error"
            :closable="false"
          >
            本月额度不足或识别已关闭。草稿继续保留，可前往内容校对继续人工录入。
          </ElAlert>
          <ElAlert v-else title="调用前确认" type="warning" :closable="false">
            仅生成候选，不自动覆盖草稿；额度、付费状态或服务状态不明时继续人工录入。
          </ElAlert>
          <p>
            本次识别将消耗 1
            次接口调用，成功或失败均计次；重识别是新的调用。上传原图不会启动识别。分组建议无需额外接口。
          </p>
          <p v-if="quota">
            {{ quota.month }} · 剩余 {{ quota.remaining }} / {{ quota.monthly_limit }} ·
            {{ quota.enabled ? '已启用' : '已关闭' }}
          </p>
          <ElButton
            :disabled="!form.original_image_asset_id || disabled || busy"
            :loading="busy"
            @click="emit('start')"
            >保存并识别原图</ElButton
          >
          <template v-if="job">
            <p>
              任务 {{ job.id }} · {{ job.status }} {{ job.errorCode || '' }} · 百度请求编号
              {{ job.providerRequestId || '尚未返回' }}
            </p>
            <ElButton :disabled="disabled || busy" :loading="busy" @click="emit('refresh')"
              >刷新识别状态</ElButton
            >
          </template>
        </div>
      </div>
      <fieldset
        v-if="candidateReady"
        class="candidate-fields source-lines"
        :disabled="disabled || busy"
      >
        <OcrComparisonLines
          v-if="suggestions"
          :suggestions="suggestions"
          :accepted-groups="acceptedGroups"
          @assign="
            (text, field, lineId) => !disabled && !busy && emit('assign', text, field, lineId)
          "
          @group="!disabled && !busy && emit('group', $event)"
        />
        <p v-else>分组建议暂不可用，可手动分配原始识别行并继续校对。</p>
        <div v-for="(line, index) in suggestions ? [] : rawLines" :key="index" class="ocr-line">
          <span>{{ line }}</span>
          <ElDropdown @command="!disabled && !busy && emit('assign', line, $event, index)">
            <ElButton :disabled="disabled || busy">分配候选字段</ElButton>
            <template #dropdown>
              <ElDropdownMenu>
                <ElDropdownItem command="title_en">英文标题</ElDropdownItem>
                <ElDropdownItem command="title_zh">中文标题</ElDropdownItem>
                <ElDropdownItem command="dialogue">对话句子</ElDropdownItem>
                <ElDropdownItem command="vocabulary">词汇</ElDropdownItem>
                <ElDropdownItem command="chunks">语块</ElDropdownItem>
              </ElDropdownMenu>
            </template>
          </ElDropdown>
        </div>
      </fieldset>
    </AdminPanel>
    <AdminPanel class="ocr-comparison">
      <template #header
        ><h3>候选内容人工归类</h3>
        <p>与人工确认字段并排比较</p></template
      >
      <div
        v-if="!candidateReady && job?.status === 'SUCCEEDED' && rawLines.length"
        class="adopted-fields"
      >
        <ElAlert title="已采纳字段对照" type="success" :closable="false">
          选中字段已进入同一场景草稿，可继续内容校对。
        </ElAlert>
        <dl>
          <dt>标题</dt>
          <dd>{{ form.title_en }} / {{ form.title_zh }}</dd>
          <dt>对话</dt>
          <dd v-for="row in form.dialogue" :key="row.id">{{ row.english }} / {{ row.chinese }}</dd>
          <dt>重点词汇</dt>
          <dd>{{ form.vocabulary.map((entry) => entry.english).join(' / ') || '待补充' }}</dd>
          <dt>Useful Chunks</dt>
          <dd>{{ form.chunks.map((entry) => entry.english).join(' / ') || '待补充' }}</dd>
        </dl>
      </div>
      <template v-else-if="!candidateReady">
        <ElEmpty description="暂无待校对候选" />
        <p>
          上传原图后点击“保存并识别原图”，已有任务可点击“刷新识别状态”查看候选。识别失败或额度不足时，可前往内容校对继续手工录入。
        </p>
      </template>
      <fieldset v-else class="candidate-fields" :disabled="disabled || busy">
        <p v-if="!(suggestions ? suggestions.lines.length : rawLines.length)" role="status">
          未识别到可用文字。可对照原图手工填写候选并勾选需要采纳的字段，或前往内容校对继续手工录入。
        </p>
        <div class="comparison-grid">
          <div>
            <h4>当前草稿</h4>
            <p>{{ form.title_en }} / {{ form.title_zh }}</p>
            <p v-for="row in form.dialogue" :key="row.id">
              {{ row.speaker }} · {{ row.english }} / {{ row.chinese }}
            </p>
            <p
              v-for="entry in [...form.vocabulary, ...form.chunks]"
              :key="entry.entry_id + entry.english"
            >
              {{ entry.english }} · {{ entry.chinese }}
            </p>
          </div>
          <div>
            <h4>识别候选（可编辑）</h4>
            <ElCheckboxGroup v-model="selectedFields" :disabled="disabled || busy">
              <ElCheckbox value="title_en">英文标题</ElCheckbox>
              <ElCheckbox value="title_zh">中文标题</ElCheckbox>
              <ElCheckbox value="dialogue">对话</ElCheckbox>
              <ElCheckbox value="vocabulary">词汇</ElCheckbox>
              <ElCheckbox value="chunks">语块</ElCheckbox>
            </ElCheckboxGroup>
            <ElInput
              v-model="candidate.title_en"
              :disabled="disabled || busy"
              aria-label="候选英文标题"
            />
            <ElInput
              v-model="candidate.title_zh"
              :disabled="disabled || busy"
              aria-label="候选中文标题"
            />
            <DialogueFields v-model="candidate.dialogue" />
            <LexiconFields
              v-model="candidate.vocabulary"
              candidate
              entry-type="vocabulary"
              :sentences="candidate.dialogue"
            />
            <LexiconFields
              v-model="candidate.chunks"
              candidate
              entry-type="chunk"
              :sentences="candidate.dialogue"
            />
          </div>
        </div>
        <ElButton
          type="primary"
          :loading="busy"
          :disabled="!selectedFields.length || disabled || busy"
          @click="emit('adopt')"
          >采纳选中字段到当前草稿</ElButton
        >
      </fieldset>
    </AdminPanel>
  </section>
</template>

<style scoped lang="scss">
/* stylelint-disable selector-class-pattern -- Element Plus 组件类名 */
h3 {
  margin: 0;
  color: var(--juya-color-sidebar);
  font-size: 20px;
}

.scene-ocr-panel {
  display: grid;
  grid-template-columns: minmax(0, 490fr) minmax(0, 650fr);
  align-items: start;
  gap: 20px;
}

.scene-ocr-panel > :deep(.el-card) {
  min-width: 0;
  min-height: 626px;
}

.scene-ocr-panel :deep(.el-card__header) {
  padding: 18px 20px 0;
  border-bottom: 0;
}

.scene-ocr-panel :deep(.el-card__header p) {
  margin: 8px 0 0;
}

.recognition-card {
  background: #eaf2e3;
}

p {
  color: var(--juya-color-text-secondary);
  font-size: 13px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}

.recognition-grid,
.comparison-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 20px;
}

.recognition-grid > div,
.comparison-grid > div {
  min-width: 0;
}

.original-image {
  width: 100%;
  max-height: 295px;
  object-fit: contain;
  border-radius: 12px;
}

.ocr-comparison {
  margin-top: 0;
}

.adopted-fields dt {
  margin: 24px 0 8px;
  color: var(--juya-color-text-regular);
  font-size: 13px;
}

.adopted-fields dd {
  margin: 0 0 8px;
  padding: 12px;
  border: 1px solid var(--juya-color-border);
  border-radius: 10px;
  font-size: 14px;
  overflow-wrap: anywhere;
}

.comparison-grid > div:first-child {
  order: 2;
  padding: 16px;
  border-radius: 12px;
  background: #eaf2e3;
}

.source-lines {
  margin-top: 24px;
}

.comparison-grid :deep(.el-input) {
  margin-bottom: 12px;
}

.candidate-fields {
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}

.ocr-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
  overflow-wrap: anywhere;
}

.comparison-grid {
  margin: 16px 0;
}

@media (width <= 1050px) {
  .scene-ocr-panel,
  .recognition-grid,
  .comparison-grid {
    grid-template-columns: 1fr;
  }
}
</style>
