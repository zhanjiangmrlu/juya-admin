<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import AdminPanel from '@/components/admin-panel/admin-panel.vue'
import AppPageActions from '@/components/app-page-actions/app-page-actions.vue'
import { type ContentSeries, createContentAdapter } from '@/features/content/content-adapter'
import ContentMaterialsPanel from '@/features/content-import/content-materials-panel.vue'
import { createWorkOrderAdapter } from '@/features/content-production/work-order-adapter'
import WorkOrderUpload from '@/features/content-production/work-order-upload.vue'
import { useAdminApiClient } from '@/services/api/use-admin-api-client'

import type { ImportContentType } from '@/features/content-import/content-package-model'

const route = useRoute()
const router = useRouter()
const api = useAdminApiClient()
const content = createContentAdapter(api)
const series = ref<ContentSeries[]>([])
const error = ref('')
const context = reactive({
  seriesId: String(route.query.series_id || ''),
  contentType: (route.query.content_type || 'dialogue') as ImportContentType
})
const source = computed(() =>
  String(route.query.source || (route.query.batch_id ? 'zip' : 'entry'))
)
let generation = 0
onBeforeUnmount(() => {
  generation++
})
const /** 加载真实分类，导入来源之间保持管理员选择 */
  load = async (): Promise<void> => {
    const token = ++generation,
      batchId = route.query.batch_id,
      importPhase = String(route.query.import_phase || 'validation')
    const seriesId = route.query.series_id
    if (typeof seriesId === 'string') context.seriesId = seriesId
    if (['dialogue', 'word_card', 'short_reading'].includes(String(route.query.content_type)))
      context.contentType = route.query.content_type as ImportContentType
    try {
      if (batchId && source.value !== 'materials') {
        const order = await createWorkOrderAdapter(api).fromBatch(String(batchId))
        if (token !== generation) return
        await router.replace({
          name: 'content-work-order',
          params: { id: order.work_order_id },
          query: { view: 'import', import_phase: importPhase }
        })
        return
      }
      const result = await content.listSeries()
      if (token === generation) series.value = result
    } catch (failure) {
      if (token === generation)
        error.value = failure instanceof Error ? failure.message : '分类加载失败'
    }
  }
const /**
   * 进入所选导入来源，内容包、DOCX 和独立素材分别走正式契约
   * @param next - 管理员选择的来源
   */
  selectSource = async (next: string): Promise<void> => {
    await router.push({
      name: 'content-import',
      query: {
        source: next,
        series_id: context.seriesId || undefined,
        content_type: context.contentType
      }
    })
  }
watch(() => route.fullPath, load, { immediate: true })
</script>
<template>
  <section class="content-import-page">
    <template v-if="source === 'entry'">
      <ElAlert v-if="error" :title="error" type="error" :closable="false"
        ><ElButton @click="load">重新加载</ElButton></ElAlert
      >
      <AdminPanel title="分类与内容类型">
        <ElForm label-position="top" class="classification">
          <ElFormItem label="内容分类"
            ><ElSelect v-model="context.seriesId" placeholder="选择分类"
              ><ElOption
                v-for="row in series"
                :key="row.id"
                :label="row.title"
                :value="row.id" /></ElSelect
          ></ElFormItem>
          <ElFormItem label="内容类型"
            ><ElSelect v-model="context.contentType"
              ><ElOption label="场景对话" value="dialogue" /><ElOption
                label="原词汇卡"
                value="word_card" /><ElOption
                label="独立短文阅读"
                value="short_reading" /></ElSelect
          ></ElFormItem>
        </ElForm>
      </AdminPanel>
      <div class="entry-row">
        <div>
          <strong>统一内容 ZIP · 推荐</strong>
          <p>正文、译文、封面、词汇图片和音频一起上传，按 ID 校验并预览对应。</p>
        </div>
        <ElButton @click="selectSource('zip')">上传内容 ZIP</ElButton>
      </div>
      <div class="source-grid">
        <AdminPanel title="中英文文档 · 必填"
          ><p>用独立标题段落分篇，中英文可逐段交替或整篇对应。</p>
          <ElButton @click="selectSource('docx')">选择 DOCX</ElButton></AdminPanel
        >
        <AdminPanel title="整段音频与选填图片"
          ><p>为已经保存的草稿补充素材；标题匹配是建议，绑定前需核对固定草稿、角色和稳定条目。</p>
          <ElButton @click="selectSource('materials')">添加音频或图片</ElButton></AdminPanel
        >
      </div>
      <ElAlert title="本次整理范围" type="info" :closable="false"
        >ZIP 按内容 ID 和条目 ID 绑定资料；DOCX
        按标题提出匹配。短文纯阅读；场景另做词义确认和音频切句。1000 篇逻辑批次由系统处理。</ElAlert
      >
      <div class="entry-row">
        <div>
          <strong>词汇图包 · 可选</strong>
          <p>一个 ZIP 上传词汇表和图片，按条目 ID 校验并预览图文。</p>
        </div>
        <ElButton @click="selectSource('materials')">导入词汇图包</ElButton>
      </div>
      <AppPageActions
        ><ElButton @click="router.push({ name: 'content-scenes' })">返回内容生产</ElButton
        ><ElButton type="primary" @click="selectSource('zip')">开始导入</ElButton></AppPageActions
      >
    </template>
    <template v-else>
      <div v-if="source === 'zip'" class="import-steps" aria-label="导入阶段">
        <span class="active">上传 ZIP</span><span>校验</span><span>对应预览</span
        ><span>确认导入</span>
      </div>
      <ElButton
        v-if="source !== 'materials'"
        class="back-entry"
        link
        type="primary"
        @click="selectSource('entry')"
        >返回批量导入入口</ElButton
      >
      <ContentMaterialsPanel
        v-if="source === 'materials'"
        :initial-series-id="context.seriesId"
        :initial-content-type="context.contentType"
      />
      <WorkOrderUpload
        v-else
        :key="source"
        :kind="source === 'docx' ? 'docx' : 'zip'"
        :series-id="context.seriesId"
        :content-type="context.contentType"
      />
    </template>
  </section>
</template>
<style scoped lang="scss">
/* stylelint-disable selector-class-pattern -- Element Plus 组件类名 */
.content-import-page {
  display: grid;
  gap: 20px;
  min-width: 0;

  .import-steps {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;

    span {
      padding: 12px;
      border-radius: 12px;
      background: var(--juya-color-surface);
      color: var(--juya-color-text-secondary);
    }

    .active {
      background: var(--juya-color-primary-soft);
      color: var(--juya-color-primary);
    }
  }

  .classification,
  .source-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
  }

  .entry-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 12px 16px;
    background: var(--juya-color-surface);
    border: 1px solid var(--juya-color-border);
    border-radius: 14px;
  }

  p {
    margin-block: 6px 16px;
    color: var(--juya-color-text-regular);
    line-height: 22px;
  }

  .entry-row p {
    margin-bottom: 0;
    font-size: 13px;
  }

  .back-entry {
    justify-self: start;
  }

  :deep(.admin-panel-title) {
    font-size: 18px;
    line-height: 29px;
  }

  :deep(.el-card__header) {
    padding: 24px 24px 0;
  }

  :deep(.el-card__body) {
    padding: 16px 24px 24px;
  }

  @media (width <= 800px) {
    .classification,
    .source-grid {
      grid-template-columns: minmax(0, 1fr);
    }

    .entry-row {
      align-items: flex-start;
      flex-direction: column;
    }
  }
}
</style>
