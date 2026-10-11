<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  shallowRef,
  watch
} from 'vue'
import { useRoute, useRouter } from 'vue-router'

import AdminPanel from '@/components/admin-panel/admin-panel.vue'
import AppPageActions from '@/components/app-page-actions/app-page-actions.vue'
import { createContentAdapter } from '@/features/content/content-adapter'
import { useAdminApiClient } from '@/services/api/use-admin-api-client'

import type { ImportContentType, PackageUploadContext } from './content-package-model'
import type { ContentSeries } from '@/features/content/content-adapter'
import type { UploadFile } from 'element-plus'

import { createContentPackageAdapter } from './content-package-adapter'
import ContentStageRecoveryPanel from './content-stage-recovery-panel.vue'
import PackageBindingPreview from './package-binding-preview.vue'
import PackageImportResult from './package-import-result.vue'
import PackageValidationTable from './package-validation-table.vue'
import { useContentPackageImport } from './use-content-package-import'

const route = useRoute()
const props = defineProps<{
  initialKind?: 'zip' | 'docx'
  initialSeriesId?: string
  initialContentType?: ImportContentType
}>()
const router = useRouter()
const client = useAdminApiClient()
const adapter = createContentPackageAdapter(client)
const controller = useContentPackageImport(adapter)
const content = createContentAdapter(client)
const context = reactive<PackageUploadContext>({
  seriesId: props.initialSeriesId || '',
  contentType: props.initialContentType || 'dialogue',
  kind: props.initialKind || 'zip'
})
const series = ref<ContentSeries[]>([])
const file = shallowRef<globalThis.File | null>(null)
const limits = ref<{ maxBytes: number; maxItems: number } | null>(null)
const loadingError = ref('')
const recoverId = ref(String(route.query.batch_id ?? ''))
const stageRecovery = ref<InstanceType<typeof ContentStageRecoveryPanel> | null>(null)
const recoveryTools = ref<InstanceType<typeof globalThis.HTMLDetailsElement> | null>(null)
const locked = computed(() => controller.busy.value || !!controller.batch.value)
const steps = computed(() => [
  { id: 'upload', label: context.kind === 'docx' ? '上传 DOCX' : '上传 ZIP' },
  { id: 'validation', label: '校验' },
  { id: 'preview', label: '对应预览' },
  { id: 'result', label: '确认导入' }
])
let disposed = false
watch(
  () => controller.phase.value,
  (phase) => {
    if (!disposed) void router.replace({ query: { ...route.query, import_phase: phase } })
  }
)
const /** 展开恢复工具后定位实际失败阶段 */
  openRecovery = async (): Promise<void> => {
    if (recoveryTools.value) recoveryTools.value.open = true
    await nextTick()
    stageRecovery.value?.focus()
  }
const /** 加载分类与服务端规模策略 */ load = async (): Promise<void> => {
    loadingError.value = ''
    try {
      const result = await content.listSeries()
      if (disposed) return
      series.value = result
      if (adapter.available) limits.value = await adapter.limits()
      if (recoverId.value && adapter.available) await controller.restore(recoverId.value)
    } catch (failure) {
      if (!disposed)
        loadingError.value = failure instanceof Error ? failure.message : '分类加载失败'
    }
  }
const /**
   * 选择导入包并执行服务端规模前置约束
   * @param value - 管理员选择的原始文件
   */ choose = (value: UploadFile): void => {
    if (!value.raw) return
    if (limits.value && value.raw.size > limits.value.maxBytes) {
      loadingError.value = '文件超过当前服务允许的上传规模'
      return
    }
    file.value = value.raw
  }
const /** 上传后将可恢复批次编号保存到地址 */ upload = async (): Promise<void> => {
    if (!file.value || !context.seriesId || !adapter.available) return
    await controller.upload(file.value, { ...context })
    if (controller.batch.value) {
      recoverId.value = controller.batch.value.id
      await router.replace({ query: { ...route.query, batch_id: recoverId.value } })
    }
  }
const /** 恢复指定服务端批次 */ restore = async (): Promise<void> => {
    if (recoverId.value.trim()) await controller.restore(recoverId.value.trim())
  }
onMounted(load)
onBeforeUnmount(() => {
  disposed = true
  file.value = null
  controller.dispose()
})
</script>
<template>
  <div class="package-workflow">
    <div class="steps" aria-label="导入阶段">
      <div
        v-for="step in steps"
        :key="step.id"
        :class="{ active: controller.phase.value === step.id }"
        :aria-current="controller.phase.value === step.id ? 'step' : undefined"
      >
        {{ step.label }}
      </div>
    </div>
    <ElAlert
      v-if="!adapter.available"
      title="统一 ZIP / DOCX / 词汇图包导入能力等待后端装配"
      description="当前服务未提供已装配的导入接口，请更新服务后重试。"
      type="warning"
      :closable="false"
    />
    <ElAlert
      v-if="loadingError || controller.error.value"
      :title="loadingError || controller.error.value"
      type="error"
      :closable="false"
      ><ElButton v-if="controller.stale.value" @click="controller.preview"
        >保留选择并刷新对应预览</ElButton
      ><ElButton v-else @click="load">重新加载</ElButton></ElAlert
    >
    <AdminPanel
      v-if="controller.phase.value === 'upload'"
      :title="context.kind === 'docx' ? '中英文正文，按标题分篇' : '相关资料，放进同一个 ZIP'"
    >
      <p>
        一次选择分类与模板。包内正文、封面、图片和音频按明确清单绑定；单词图可缺省，语块不接受图片，短文只保留纯阅读字段。
      </p>
      <ElForm label-position="top" class="context-form" :disabled="locked">
        <ElFormItem label="内容分类" required
          ><ElSelect v-model="context.seriesId" placeholder="选择分类"
            ><ElOption
              v-for="item in series"
              :key="item.id"
              :value="item.id"
              :label="item.title" /></ElSelect
        ></ElFormItem>
        <ElFormItem label="内容类型" required
          ><ElSelect v-model="context.contentType"
            ><ElOption label="场景对话" value="dialogue" /><ElOption
              label="原词汇卡"
              value="word_card" /><ElOption label="独立短文阅读" value="short_reading" /></ElSelect
        ></ElFormItem>
        <ElFormItem label="导入来源"
          ><ElSelect v-model="context.kind"
            ><ElOption label="统一 ZIP 包（推荐）" value="zip" /><ElOption
              label="DOCX 正文"
              value="docx" /></ElSelect
        ></ElFormItem>
      </ElForm>
      <ElUpload
        :auto-upload="false"
        :limit="1"
        :disabled="locked || !adapter.available"
        :accept="context.kind === 'docx' ? '.docx' : '.zip'"
        drag
        @change="choose"
        ><strong>选择或拖入 {{ context.kind === 'docx' ? 'DOCX 文件' : 'ZIP 导入包' }}</strong>
        <p v-if="!limits">动态规模策略尚未公开；上传由服务端执行实际大小与篇数校验</p>
        <p v-if="limits">
          服务允许 {{ Math.floor(limits.maxBytes / 1024 / 1024) }} MB · 逻辑批次最多
          {{ limits.maxItems }} 篇
        </p></ElUpload
      >
      <ElProgress v-if="controller.busy.value" :percentage="controller.uploadProgress.value" />
      <AppPageActions>
        <ElButton @click="router.push({ name: 'content-import' })">返回批量导入</ElButton>
        <ElButton
          type="primary"
          :loading="controller.busy.value"
          :disabled="
            !adapter.available || context.kind === 'word_images' || !file || !context.seriesId
          "
          @click="upload"
          >上传并校验</ElButton
        ><span>上传进度与后台逐篇处理进度分别显示</span>
      </AppPageActions>
      <details class="recovery">
        <summary>恢复已有导入批次</summary>
        <ElInput
          v-model="recoverId"
          placeholder="导入批次编号"
          aria-label="恢复导入批次"
        /><ElButton :disabled="!adapter.available || !recoverId.trim()" @click="restore"
          >恢复已有批次</ElButton
        >
      </details>
    </AdminPanel>
    <AdminPanel v-if="controller.phase.value === 'upload'" title="按稳定导入标识对应资料">
      <table class="mapping-guide">
        <thead>
          <tr>
            <th>文件 / 标识</th>
            <th>保存资料</th>
            <th>绑定方式</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>内容表 · 内容导入 ID</td>
            <td>双语文档、封面、整段 / 全文音频</td>
            <td>每篇一个 DOCX，使用包内相对路径</td>
          </tr>
          <tr>
            <td>词汇表 · 条目 ID</td>
            <td>英文、本篇释义、音标、解释与来源</td>
            <td>关联内容 ID；词汇可配图，语块无图片</td>
          </tr>
          <tr>
            <td>documents/ · images/ · audio/</td>
            <td>正文文件、素材与音频</td>
            <td>不按行号、标题或文件顺序猜配</td>
          </tr>
        </tbody>
      </table>
    </AdminPanel>
    <ElAlert
      v-if="controller.phase.value === 'upload'"
      title="短文仍为纯阅读"
      type="info"
      :closable="false"
      >短文只整理完整中英文、元信息、可选封面和全文音频，不生成词汇、语块或讲解。原 DOCX
      与词汇图包入口保留。</ElAlert
    >
    <PackageValidationTable
      v-if="controller.phase.value === 'validation' && controller.batch.value"
      v-model:excluded="controller.excluded.value"
      :batch="controller.batch.value"
      :busy="controller.busy.value"
      @validate="controller.validate"
      @preview="controller.preview"
    />
    <PackageBindingPreview
      v-if="controller.phase.value === 'preview' && controller.previewResult.value"
      v-model:selected="controller.selected.value"
      v-model:defaults="controller.defaultConfirmations.value"
      v-model:diffs="controller.diffConfirmations.value"
      :preview="controller.previewResult.value"
      :batch-id="controller.batch.value?.id || ''"
      :busy="controller.busy.value"
      :can-confirm="controller.canConfirm.value"
      @confirm="controller.confirm"
      @back="controller.phase.value = 'validation'"
    />
    <PackageImportResult
      v-if="controller.phase.value === 'result' && controller.batch.value"
      :batch="controller.batch.value"
      :busy="controller.busy.value"
      @retry="openRecovery"
      @refresh="controller.restore(controller.batch.value!.id)"
      @cancel="controller.cancel"
    />
    <details ref="recoveryTools" class="recovery-tools">
      <summary>恢复已有批次与失败阶段</summary>
      <ContentStageRecoveryPanel ref="stageRecovery" :batch-id="controller.batch.value?.id" />
    </details>
  </div>
</template>
<style scoped lang="scss">
.package-workflow {
  display: grid;
  gap: 18px;
  min-width: 0;

  .steps {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;

    > div {
      padding: 14px;
      border-radius: 12px;
      background: var(--juya-color-surface);
      color: var(--juya-color-text-secondary);
    }

    .active {
      color: var(--el-color-primary);
      font-weight: 600;
      background: var(--el-color-primary-light-9);
    }
  }

  .context-form {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 16px;
  }

  p {
    color: var(--juya-color-text-secondary);
    line-height: 1.7;
  }

  .mapping-guide {
    width: 100%;
    border-collapse: collapse;
    color: var(--juya-color-text-primary);
    font-size: 14px;

    th,
    td {
      padding: 12px;
      text-align: left;
      border-bottom: 1px solid var(--juya-color-border-light);
    }

    th {
      background: var(--juya-color-primary-soft);
      font-weight: 500;
    }
  }

  .actions,
  .recovery {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
    margin-top: 20px;
  }

  .recovery {
    max-width: 600px;

    .el-input {
      flex: 1;
      min-width: 160px;
    }
  }
}

@media (width <= 900px) {
  .package-workflow {
    .steps {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .context-form {
      grid-template-columns: minmax(0, 1fr);
    }
  }
}
</style>
