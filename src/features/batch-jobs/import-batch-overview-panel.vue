<script setup lang="ts">
/* global AbortController */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import AdminPanel from '@/components/admin-panel/admin-panel.vue'
import AppPageActions from '@/components/app-page-actions/app-page-actions.vue'
import ContentStageRecoveryPanel from '@/features/content-import/content-stage-recovery-panel.vue'
import { useAdminApiClient } from '@/services/api/use-admin-api-client'

import {
  createImportBatchOverviewAdapter,
  type ImportBatchOverview
} from './import-batch-overview-model'

const route = useRoute(),
  router = useRouter()
const client = useAdminApiClient()
const adapter = createImportBatchOverviewAdapter(client)
const identifier = ref(String(route.query.batch_id || ''))
const batch = ref<ImportBatchOverview | null>(null),
  busy = ref(false),
  error = ref('')
const view = ref<'task' | 'result'>(route.query.view === 'result' ? 'result' : 'task'),
  problemFilter = ref<'all' | 'review' | 'failed'>('all')
const recoveryVisible = ref(false)
const cancelBusy = ref(false)
let request: AbortController | null = null
let generation = 0
const problems = computed(
  () =>
    batch.value?.problems.filter(
      (item) =>
        problemFilter.value === 'all' ||
        (problemFilter.value === 'failed' ? item.failed : !item.failed)
    ) ?? []
)
const metrics = computed(() =>
  view.value === 'task'
    ? [
        { label: '总篇数', value: batch.value?.counts.total },
        { label: '正常', value: batch.value?.counts.normal },
        { label: '需校对', value: batch.value?.counts.proofreading },
        { label: '处理失败', value: batch.value?.counts.failed }
      ]
    : [
        { label: '正常', value: batch.value?.counts.normal },
        { label: '需校对', value: batch.value?.counts.proofreading },
        { label: '处理失败', value: batch.value?.counts.failed },
        { label: '待发布', value: batch.value?.counts.publishable }
      ]
)
const stageRows = computed(() => [
  {
    label: '分篇 / 中英文配对',
    result:
      batch.value?.counts.total == null ? '尚无解析结果' : `${batch.value.counts.total}篇已解析`,
    status: batch.value?.status === 'UPLOADED' ? '待处理' : '查看整理结果'
  },
  { label: '素材与词库匹配', result: '按逐篇校验问题与对应内容查看', status: '查看异常篇目' },
  {
    label: '音频对齐与单句文件',
    result: '按真实阶段记录查看执行和失败原因',
    status: '查看处理阶段'
  },
  { label: '校对与发布', result: '正常抽样与异常修正完成后，进入范围确认', status: '待人工确认' }
])
const /** 从持久化批次恢复结果，切换批次或离页使旧请求失效 * @returns 当前操作结果或完成状态
   */ load = async (): Promise<void> => {
    request?.abort()
    request = new AbortController()
    const current = ++generation
    busy.value = true
    error.value = ''
    batch.value = null
    try {
      const next = await adapter.load(identifier.value.trim(), request.signal)
      if (current === generation) batch.value = next
    } catch (failure) {
      if (current === generation && !request.signal.aborted)
        error.value = failure instanceof Error ? failure.message : '导入批次读取失败'
    } finally {
      if (current === generation) busy.value = false
    }
  }
const /** 将批次编号保存在地址，离开页面后可继续恢复查看 * @returns 当前操作结果或完成状态
   */ resume = async (): Promise<void> => {
    if (!identifier.value.trim()) return
    await router.replace({ query: { ...route.query, batch_id: identifier.value.trim() } })
    await load()
  }
const /** 进入当前批次实际导入流程，保留原文件预览与逐篇修正入口 * @returns 当前操作结果或完成状态
   */ openImport = (): void => {
    void router.push({ path: '/content/import', query: { batch_id: identifier.value.trim() } })
  }
const /** 取消当前批次尚未开始的项目，已完成内容由服务端保留
   * @returns 取消后刷新批次的完成状态
   */ cancelUnstarted = async (): Promise<void> => {
    if (!batch.value || cancelBusy.value) return
    cancelBusy.value = true
    error.value = ''
    try {
      await client.request({
        method: 'POST',
        path: `/api/v1/admin/content-imports/${encodeURIComponent(batch.value.id)}/cancel`
      })
      await load()
    } catch (failure) {
      error.value = failure instanceof Error ? failure.message : '取消未开始项目失败'
    } finally {
      cancelBusy.value = false
    }
  }
watch(
  () => route.query.batch_id,
  (id) => {
    identifier.value = String(id || '')
    if (identifier.value) void load()
  },
  { immediate: true }
)
onBeforeUnmount(() => {
  generation++
  request?.abort()
  batch.value = null
})
</script>

<template>
  <section class="import-overview">
    <ElForm v-if="!batch" class="resume-bar" inline @submit.prevent="resume">
      <ElFormItem label="恢复导入批次"
        ><ElInput v-model="identifier" aria-label="导入批次编号" placeholder="输入已有导入批次编号"
      /></ElFormItem>
      <ElFormItem
        ><ElButton :loading="busy" :disabled="!identifier.trim()" native-type="submit"
          >恢复查看</ElButton
        ></ElFormItem
      >
    </ElForm>
    <ElAlert v-if="error" :title="error" type="error" :closable="false" />
    <ElSkeleton v-if="busy" :rows="6" animated />
    <template v-else-if="batch">
      <div v-if="view === 'result'" class="result-heading">
        <ElButton link type="primary" @click="view = 'task'">返回批量任务</ElButton>
      </div>
      <div class="batch-metrics">
        <div v-for="metric in metrics" :key="metric.label" class="metric">
          <strong>{{ metric.value ?? '—' }}</strong
          ><span>{{ metric.label }}</span>
        </div>
      </div>
      <template v-if="view === 'task'">
        <AdminPanel title="导入任务" class="overview-card">
          <ElTable :data="stageRows"
            ><ElTableColumn label="阶段" prop="label" min-width="200" /><ElTableColumn
              label="结果"
              prop="result"
              min-width="250"
            /><ElTableColumn label="状态" min-width="150"
              ><template #default="{ row, $index }"
                ><ElButton
                  link
                  type="primary"
                  @click="$index === 2 ? (recoveryVisible = true) : (view = 'result')"
                  >{{ row.status }}</ElButton
                ></template
              ></ElTableColumn
            ></ElTable
          >
          <div class="additional-counts">
            <span>处理中 {{ batch.counts.processing ?? '—' }}</span
            ><span>已确认 {{ batch.counts.confirmed ?? '—' }}</span
            ><span>可发布 {{ batch.counts.publishable ?? '—' }}</span
            ><span>已发布 {{ batch.counts.published ?? '—' }}</span
            ><span>取消 {{ batch.counts.cancelled ?? '—' }}</span>
          </div>
        </AdminPanel>
        <AdminPanel title="本批用量记录" class="usage-card"
          ><p>当前接口尚未返回本批输入、输出token和音频用量记录。</p>
          <p>已导入草稿不等于已发布；未返回的派生统计显示为“—”。</p>
          <RouterLink to="/analytics">查看每日导入与云端用量汇总</RouterLink
          ><small>调用费用按集中配置记录；切片计算、存储及下载流量分别核验。</small></AdminPanel
        >
      </template>
      <template v-else>
        <ElRadioGroup v-model="problemFilter" aria-label="整理问题筛选"
          ><ElRadioButton value="review">需校对</ElRadioButton
          ><ElRadioButton value="all">全部问题</ElRadioButton
          ><ElRadioButton value="failed">处理失败</ElRadioButton></ElRadioGroup
        >
        <AdminPanel title="异常篇目" class="overview-card"
          ><ElTable :data="problems" empty-text="当前筛选没有异常篇目"
            ><ElTableColumn label="篇目" prop="title" min-width="170" /><ElTableColumn
              label="问题位置"
              prop="location"
              min-width="145"
            /><ElTableColumn label="问题" prop="message" min-width="220" /><ElTableColumn
              label="修正入口"
              min-width="150"
              ><template #default="{ row }"
                ><RouterLink :to="row.destination">{{
                  row.failed ? '查看失败篇目' : '对照原文校对'
                }}</RouterLink></template
              ></ElTableColumn
            ></ElTable
          ></AdminPanel
        >
        <aside class="condition-note">
          <strong>待发布条件</strong>
          <p>
            正常篇目完成实际抽样后确认，异常篇目逐项修正；处理失败可按阶段单独恢复。发布前仍需确认版权、试听与候选版本。
          </p>
        </aside>
      </template>
      <ContentStageRecoveryPanel v-if="recoveryVisible" :batch-id="batch.id" />
      <AppPageActions
        ><ElButton
          v-if="view === 'task'"
          :disabled="batch.status === 'CANCELLED'"
          :loading="cancelBusy"
          @click="cancelUnstarted"
          >取消未开始项目</ElButton
        >
        <ElButton v-else @click="openImport">查看原文件</ElButton
        ><ElButton v-if="view === 'result'" type="primary" @click="openImport">开始校对</ElButton
        ><ElButton v-else type="primary" @click="recoveryVisible = true"
          >查看失败阶段</ElButton
        ></AppPageActions
      >
    </template>
  </section>
</template>

<style scoped lang="scss">
.import-overview {
  display: grid;
  gap: 20px;
  min-width: 0;

  .resume-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
  }

  .resume-bar :deep([class~='el-form-item']) {
    margin: 0;
  }

  .batch-metrics {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 16px;
  }

  .metric {
    display: grid;
    gap: 8px;
    min-height: 100px;
    padding: 12px 20px;
    border-radius: 18px;
    background: var(--juya-color-surface);

    strong {
      font-size: 26px;
      line-height: 39px;
    }

    span {
      font-size: 11px;
      line-height: 18px;
      color: var(--juya-color-text-secondary);
    }
  }

  .overview-card,
  .usage-card {
    border-radius: 14px;

    --juya-panel-title-size: 18px;
    --juya-panel-title-line-height: 29px;
  }

  .overview-card :deep([class~='el-card__header']),
  .usage-card :deep([class~='el-card__header']) {
    padding: 24px 24px 16px;
    border-bottom: 0;
  }

  .overview-card :deep([class~='el-card__body']),
  .usage-card :deep([class~='el-card__body']) {
    padding: 0 24px 24px;
  }

  :deep(.el-table) {
    --el-table-header-bg-color: var(--juya-color-primary-soft);
    --el-table-tr-bg-color: var(--juya-color-surface);

    font-size: 14px;
  }

  :deep(th) {
    color: var(--juya-color-primary);
  }

  :deep(td),
  :deep(th) {
    height: 46px;
  }

  .additional-counts {
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
    margin-top: 16px;
    font-size: 12px;
    color: var(--juya-color-text-secondary);
  }

  .usage-card {
    p {
      margin: 0 0 8px;
      font-size: 14px;
      line-height: 22px;
    }

    a {
      font-size: 14px;
      color: var(--juya-color-primary);
    }

    small {
      display: block;
      margin-top: 8px;
      color: var(--juya-color-text-secondary);
      font-size: 11px;
      line-height: 18px;
    }
  }

  .condition-note {
    padding: 16px;
    border-radius: 16px;
    background: var(--juya-color-primary-soft);
    font-size: 14px;
    line-height: 22px;

    strong {
      color: var(--juya-color-primary);
      font-weight: 500;
    }

    p {
      margin: 8px 0 0;
    }
  }

  @media (width <= 800px) {
    .batch-metrics {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
}
</style>
