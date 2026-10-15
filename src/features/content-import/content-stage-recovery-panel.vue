<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import AdminPanel from '@/components/admin-panel/admin-panel.vue'
import { useAdminApiClient } from '@/services/api/use-admin-api-client'

import { type ContentStage, createContentStageAdapter } from './content-stage-adapter'
import { useContentStage } from './use-content-stage'

const route = useRoute()
const props = defineProps<{ batchId?: string; stageId?: string; expectedEditVersion?: number }>()
const emit = defineEmits<{ retried: [] }>()
const stages = ref<ContentStage[]>([])
const listingError = ref('')
const listingBusy = ref(false)
const anchor = ref<globalThis.HTMLElement | null>(null)
let listingGeneration = 0
const identifier = ref(props.stageId ?? String(route.query.stage_id || ''))
const adapter = createContentStageAdapter(useAdminApiClient())
const controller = useContentStage(adapter)
let synchronizing = false
/** 恢复后显示服务端返回的新阶段编号 */
const retry = async (): Promise<void> => {
  await controller.retry()
  if (controller.stage.value) {
    synchronizing = true
    identifier.value = controller.stage.value.public_id
    synchronizing = false
    if (!controller.error.value && controller.stage.value.status !== 'FAILED') emit('retried')
  }
}
watch(
  identifier,
  () => {
    if (!synchronizing) controller.invalidate()
  },
  { flush: 'sync' }
)
watch(
  () => [props.stageId, props.expectedEditVersion],
  () => {
    if (props.stageId === undefined) return
    controller.invalidate()
    identifier.value = props.stageId
    controller.editVersion.value = props.expectedEditVersion ?? null
  },
  { immediate: true }
)
/** 从当前批次实际关联加载阶段选择列表 */
const listStages = async (): Promise<void> => {
  const token = ++listingGeneration
  stages.value = []
  listingError.value = ''
  if (!props.batchId || !adapter.batchAvailable) return
  listingBusy.value = true
  try {
    const result = await adapter.forBatch(props.batchId)
    if (token === listingGeneration) stages.value = result
  } catch (failure) {
    if (token === listingGeneration)
      listingError.value = failure instanceof Error ? failure.message : '阶段关联加载失败'
  } finally {
    if (token === listingGeneration) listingBusy.value = false
  }
}
watch(
  () => props.batchId,
  () => {
    controller.invalidate()
    void listStages()
  },
  { immediate: true }
)
/** 从结果页进入当前批次的实际阶段选择 */
const focus = (): void => {
  anchor.value?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  void listStages()
}
defineExpose({ focus })
const labels: Record<string, string> = {
  VALIDATE: '内容包校验',
  CONFIRM: '保存草稿',
  MATERIAL_VALIDATE: '素材包校验',
  SENTENCE_SLICE: '实际句切片',
  AI_LEXICON: '词条候选',
  ASR_BOUNDARY: '音文对齐',
  AUTO_AUDIO: '自动音频调度',
  ASR_POLL: '转录结果核对',
  FAILED: '阶段失败',
  QUEUED: '已排队',
  RUNNING: '处理中',
  SUCCEEDED: '阶段成功',
  UNKNOWN: '收费结果待核验，禁止盲目重试',
  CANCELLED: '已取消'
}
onBeforeUnmount(() => {
  listingGeneration++
  stages.value = []
  controller.dispose()
})
</script>
<template>
  <AdminPanel title="失败阶段恢复" class="content-stage-recovery-panel">
    <p ref="anchor">
      只恢复明确的失败阶段；已经保存的草稿和成功步骤继续复用。收费结果未知时禁止重复请求。
    </p>
    <div class="actions">
      <ElSelect
        v-if="batchId && adapter.batchAvailable"
        v-model="identifier"
        :disabled="controller.busy.value || listingBusy"
        aria-label="当前批次处理阶段"
        placeholder="明确选择当前批次失败阶段"
        ><ElOption
          v-for="stage in stages"
          :key="stage.public_id"
          :value="stage.public_id"
          :label="`${labels[stage.stage] || '素材处理'} · ${labels[stage.status] || stage.status} · 第 ${stage.attempt} 次`"
      /></ElSelect>
      <ElInput
        v-model="identifier"
        :disabled="controller.busy.value"
        aria-label="失败阶段编号"
        placeholder="服务端处理阶段编号"
      /><ElButton
        :disabled="!adapter.available || !identifier.trim()"
        :loading="controller.busy.value"
        @click="controller.load(identifier)"
        >读取阶段状态</ElButton
      >
    </div>
    <ElAlert v-if="listingError" :title="listingError" type="error" :closable="false" />
    <ElAlert
      v-if="controller.error.value"
      :title="controller.error.value"
      type="error"
      :closable="false"
    />
    <template v-if="controller.stage.value">
      <p>
        {{
          labels[controller.stage.value.stage] ||
          (controller.stage.value.stage.startsWith('MATERIAL_BIND_')
            ? '素材绑定'
            : '发布或其他处理')
        }}
        · {{ labels[controller.stage.value.status] || controller.stage.value.status }} · 已尝试
        {{ controller.stage.value.attempt }} 次
      </p>
      <ElAlert
        v-if="controller.stage.value.stage.startsWith('PUBLICATION_RANGE_')"
        title="发布阶段请进入抽样校对页，恢复冻结范围后明确选择失败项；不直接重跑整批"
        type="info"
        :closable="false"
      />
      <ElInputNumber
        v-if="controller.needsVersion.value"
        v-model="controller.editVersion.value"
        :min="1"
        :precision="0"
        aria-label="当前草稿编辑版本"
      />
      <ElCheckbox v-model="controller.confirmed.value" :disabled="controller.busy.value"
        >明确重试这个失败阶段</ElCheckbox
      >
      <ElCheckbox
        v-if="controller.charged.value"
        v-model="controller.chargedAcknowledged.value"
        :disabled="controller.busy.value"
        >已核对历史费用与预算，明确允许该失败候选阶段再次调用；未知结果不能重试</ElCheckbox
      >
      <ElButton
        type="primary"
        :disabled="!controller.canRetry.value"
        :loading="controller.busy.value"
        @click="retry"
        >恢复明确失败阶段</ElButton
      >
      <p v-if="controller.stale.value">阶段或依赖已经变化，请重新读取并确认</p>
    </template>
  </AdminPanel>
</template>
<style scoped lang="scss">
.content-stage-recovery-panel {
  min-width: 0;

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 12px 0;
  }

  .el-input {
    max-width: 320px;
  }

  p {
    color: var(--juya-color-text-secondary);
    font-size: 13px;
  }

  .el-checkbox {
    white-space: normal;
    height: auto;
    margin: 12px 0;
  }
}
</style>
