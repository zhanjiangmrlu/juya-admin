<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import AdminPanel from '@/components/admin-panel/admin-panel.vue'
import AppPageActions from '@/components/app-page-actions/app-page-actions.vue'
import { useAdminApiClient } from '@/services/api/use-admin-api-client'

import type { ProofreadingCandidate } from '@/features/proofreading/proofreading-adapter'

import {
  createPublicationRangeAdapter,
  type PublicationPrepared
} from './publication-range-adapter'
import { publishCheckLabel } from './publish-check-labels'
import { usePublicationRange } from './use-publication-range'

const props = defineProps<{ candidates: ProofreadingCandidate[] }>()
const route = useRoute()
const router = useRouter()
const adapter = createPublicationRangeAdapter(useAdminApiClient())
const controller = usePublicationRange(adapter)
const prepared = shallowRef<PublicationPrepared[]>([])
const warnings = ref<string[]>([])
const preparationBusy = ref(false)
const error = ref('')
const recoveryToken = ref(String(route.query.range_token || ''))
let generation = 0
const labels: Record<string, string> = {
  PREVIEW: '已冻结，待明确发布',
  QUEUED: '发布已排队',
  RUNNING: '逐项发布中',
  COMPLETED: '本次选中范围执行完成',
  PARTIAL: '部分项目失败',
  SUCCEEDED: '已发布',
  FAILED: '失败，仍为草稿',
  UNKNOWN: '结果待恢复核验'
}
const resultRows = computed(
  () =>
    controller.range.value?.candidates.map((candidate) => ({
      ...candidate,
      result: controller.range.value!.results.items[candidate.revision_id]
    })) ?? []
)
const publishedCount = computed(
  () => resultRows.value.filter((row) => row.result?.status === 'SUCCEEDED').length
)
const failedCount = computed(
  () => resultRows.value.filter((row) => row.result?.status === 'FAILED').length
)
const resultPhase = computed(
  () => !!controller.range.value && controller.range.value.status !== 'PREVIEW'
)
const title = computed(() => (resultPhase.value ? '发布结果' : '确认发布范围'))
const canFreeze = computed(
  () =>
    prepared.value.length > 0 &&
    !preparationBusy.value &&
    !controller.busy.value &&
    prepared.value.every(
      (item) =>
        !item.errorCodes.length &&
        item.warningCodes.every((code) =>
          warnings.value.includes(`${item.candidate.revision_id}:${code}`)
        )
    )
)
const /** 重新读取所有已校对候选的实际双版本与警告 */ prepare = async (): Promise<void> => {
    if (
      preparationBusy.value ||
      controller.busy.value ||
      !props.candidates.length ||
      !adapter.available
    )
      return
    const token = ++generation
    preparationBusy.value = true
    prepared.value = []
    warnings.value = []
    error.value = ''
    controller.invalidate()
    try {
      const result = await adapter.prepare(props.candidates)
      if (token === generation) prepared.value = result
    } catch (failure) {
      if (token === generation)
        error.value = failure instanceof Error ? failure.message : '发布范围检查失败'
    } finally {
      if (token === generation) preparationBusy.value = false
    }
  }
const /** 明确警告后冻结范围，恢复编号只存 URL 不保存敏感正文 */ freeze =
    async (): Promise<void> => {
      if (!canFreeze.value) return
      await controller.freeze(
        prepared.value.map((item) => ({ ...item.candidate, warning_codes: item.warningCodes }))
      )
      if (controller.range.value) {
        recoveryToken.value = controller.range.value.token
        await router.replace({ query: { ...route.query, range_token: recoveryToken.value } })
      }
    }
watch(
  () => JSON.stringify(props.candidates),
  () => {
    generation++
    preparationBusy.value = false
    prepared.value = []
    warnings.value = []
    controller.invalidate()
  }
)
onBeforeUnmount(() => {
  generation++
  controller.dispose()
  prepared.value = []
})
</script>
<template>
  <section class="publication-range-panel">
    <div v-if="controller.range.value" class="range-metrics">
      <div>
        <strong>{{
          resultPhase ? publishedCount : controller.range.value.candidates.length
        }}</strong
        ><span>{{ resultPhase ? '已发布' : '本次可发布' }}</span>
      </div>
      <div>
        <strong>{{ failedCount }}</strong
        ><span>发布失败</span>
      </div>
      <div>
        <strong>{{ controller.selected.value.length }}</strong
        ><span>本次明确选中</span>
      </div>
      <div>
        <strong>{{ resultRows.length - publishedCount - failedCount }}</strong
        ><span>待发布 / 仍保留草稿</span>
      </div>
    </div>
    <AdminPanel :title="title">
      <p>仅对已校对合格候选冻结完整版本。明确勾选发布子集后异步逐篇发布，成功项不会重跑。</p>
      <ElAlert
        v-if="!adapter.available"
        title="范围发布服务等待最终装配"
        type="info"
        :closable="false"
      />
      <ElAlert
        v-if="error || controller.error.value"
        :title="error || controller.error.value"
        type="error"
        :closable="false"
      />
      <div class="actions">
        <ElButton
          :disabled="!adapter.available || !candidates.length || controller.busy.value"
          :loading="preparationBusy"
          @click="prepare"
          >读取已批准候选并检查范围</ElButton
        >
        <ElButton :disabled="!canFreeze" @click="freeze">冻结已核对范围</ElButton>
        <ElInput
          v-model="recoveryToken"
          aria-label="发布范围恢复编号"
          placeholder="已保存的范围编号"
        />
        <ElButton
          :disabled="!adapter.available || !recoveryToken.trim() || preparationBusy"
          :loading="controller.busy.value"
          @click="controller.restore(recoveryToken)"
          >恢复发布范围</ElButton
        >
      </div>
      <div v-for="item in prepared" :key="item.candidate.revision_id" class="prepared-row">
        <strong
          >{{ item.candidate.content_id }} · 候选版本 {{ item.candidate.expected_version
          }}<template v-if="item.candidate.expected_edit_version">
            / 编辑版本 {{ item.candidate.expected_edit_version }}</template
          ></strong
        >
        <p v-for="code in item.errorCodes" :key="code">{{ publishCheckLabel(code) }}</p>
        <ElCheckboxGroup v-model="warnings"
          ><ElCheckbox
            v-for="code in item.warningCodes"
            :key="code"
            :value="`${item.candidate.revision_id}:${code}`"
            >已明确核对：{{ publishCheckLabel(code) }}</ElCheckbox
          ></ElCheckboxGroup
        >
      </div>
      <template v-if="controller.range.value">
        <p>
          范围 {{ controller.range.value.token }} ·
          {{ labels[controller.range.value.status] || controller.range.value.status }} · 版本
          {{ controller.range.value.version }}
        </p>
        <ElCheckboxGroup v-model="controller.selected.value">
          <div
            v-for="candidate in controller.range.value.candidates"
            :key="candidate.revision_id"
            class="range-item"
          >
            <ElCheckbox
              :value="candidate.revision_id"
              :disabled="
                controller.busy.value ||
                controller.range.value.status === 'QUEUED' ||
                controller.range.value.results.items[candidate.revision_id]?.status === 'SUCCEEDED'
              "
              >{{ candidate.content_id }} ·
              {{
                candidate.content_type === 'short_reading'
                  ? '短文阅读'
                  : candidate.content_type === 'word_card'
                    ? '原词汇卡'
                    : '场景对话'
              }}</ElCheckbox
            >
            <span>{{
              labels[controller.range.value.results.items[candidate.revision_id]?.status || ''] ||
              '未选择或等待处理'
            }}</span>
            <small v-if="controller.range.value.results.items[candidate.revision_id]?.error_code">{{
              publishCheckLabel(
                controller.range.value.results.items[candidate.revision_id]!.error_code!
              ) || '该候选发布未完成，请重新检查版本与确认状态'
            }}</small>
          </div>
        </ElCheckboxGroup>
        <ElCheckbox v-model="controller.acknowledged.value" :disabled="controller.busy.value"
          >已核对本次选中的固定候选，明确确认发布；其余内容继续保持原状态</ElCheckbox
        >
        <AppPageActions>
          <ElButton
            v-if="resultPhase && failedCount"
            :disabled="controller.busy.value"
            @click="controller.selectFailed"
            >仅选择 {{ failedCount }} 篇发布失败</ElButton
          >
          <ElButton
            type="primary"
            :disabled="!controller.canConfirm.value"
            :loading="controller.busy.value"
            @click="controller.confirm"
            >发布明确选中 {{ controller.selected.value.length }} 篇</ElButton
          ><ElButton :disabled="controller.busy.value" @click="controller.refresh"
            >刷新逐项发布结果</ElButton
          >
        </AppPageActions>
        <p v-if="controller.stale.value">
          当前预览已失效；保留的选择不代表可继续发布，需重新校对并冻结当前候选
        </p>
      </template>
    </AdminPanel>
    <ElAlert v-if="resultPhase" title="成功步骤会复用" :closable="false" type="success"
      >重试只处理失败篇目及其必要阶段。已经成功的内容不会回滚，也不会重复创建有效内容版本；未选中或尚未解决的篇目继续保持原状态。</ElAlert
    >
  </section>
</template>
<style scoped lang="scss">
.publication-range-panel {
  min-width: 0;
  display: grid;
  gap: 20px;

  .range-metrics {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 16px;

    > div {
      padding: 18px 20px;
      background: var(--juya-color-surface);
      border-radius: 20px;
    }

    strong {
      display: block;
      font-size: 26px;
      line-height: 39px;
    }

    span {
      display: block;
      margin-top: 8px;
      font-size: 11px;
      color: var(--juya-color-text-secondary);
    }

    @media (width <= 650px) {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  .actions,
  .range-item {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    margin: 12px 0;
  }

  .actions .el-input {
    width: 260px;
    max-width: 100%;
  }

  .prepared-row {
    padding: 12px 0;
    border-bottom: 1px solid var(--juya-color-border);
  }

  p,
  small {
    color: var(--juya-color-text-secondary);
    overflow-wrap: anywhere;
  }
}
</style>
