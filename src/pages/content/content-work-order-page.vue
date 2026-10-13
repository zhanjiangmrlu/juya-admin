<script setup lang="ts">
import { ElMessageBox } from 'element-plus'
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import AdminPanel from '@/components/admin-panel/admin-panel.vue'
import AppPageActions from '@/components/app-page-actions/app-page-actions.vue'
import AppPagination from '@/components/app-pagination/app-pagination.vue'
import { createContentAdapter } from '@/features/content/content-adapter'
import { createSceneMediaAdapter } from '@/features/content-editor/scene-media-adapter'
import { useWorkOrder } from '@/features/content-production/use-work-order'
import {
  createWorkOrderAdapter,
  type WorkCommand,
  type WorkCommandFields
} from '@/features/content-production/work-order-adapter'
import WorkOrderCandidates from '@/features/content-production/work-order-candidates.vue'
import { findWorkOrderRange } from '@/features/content-production/work-order-context'
import WorkOrderImport from '@/features/content-production/work-order-import.vue'
import { issueAction, productionLabels } from '@/features/content-production/work-order-model'
import WorkOrderOverview from '@/features/content-production/work-order-overview.vue'
import WorkOrderPublication from '@/features/content-production/work-order-publication.vue'
import {
  sampleIdentity,
  sampleResources
} from '@/features/content-production/work-order-sample-media'
import WorkOrderSampling from '@/features/content-production/work-order-sampling.vue'
import PublicationRangePanel from '@/features/publishing/publication-range-panel.vue'
import { useAdminApiClient } from '@/services/api/use-admin-api-client'

import type {
  CandidateDecision,
  CandidateGroup,
  ProductionSchema as S,
  WorkItem,
  WorkItemDetail
} from '@/features/content-production/work-order-model'
import type { SampleResource } from '@/features/content-production/work-order-sample-media'
const route = useRoute(),
  router = useRouter()
const client = useAdminApiClient(),
  adapter = createWorkOrderAdapter(client),
  media = createSceneMediaAdapter(client),
  contentAdapter = createContentAdapter(client)
const model = useWorkOrder(adapter)
const { order, items, sampling, publication, busy, error, page, pageSize, status } = model
const list = shallowRef<S['OrderPage'] | null>(null)
const listPage = ref(1)
const legacyRange = ref(false)
const preview = shallowRef<S['ImportPreview'] | null>(null)
const groups = ref<CandidateGroup[]>([])
const candidateDetails = ref<WorkItemDetail[]>([])
const usage = shallowRef<S['WorkOrderUsage'] | null>(null)
const allItems = ref<WorkItem[]>([])
const sampleDetail = shallowRef<WorkItemDetail | null>(null)
const sampleMedia = ref<SampleResource[]>([])
const selected = ref<string[]>([])
const tab = computed(() => String(route.query.view || 'overview'))
const id = computed(() => String(route.params.id || route.query.work_order_id || ''))
const types = { dialogue: '场景对话', word_card: '原词汇卡', short_reading: '短文阅读' }
let generation = 0
let sampleGeneration = 0
watch(
  () => [id.value, tab.value, route.fullPath],
  () => {
    sampleGeneration++
    sampleDetail.value = null
    sampleMedia.value = []
  },
  { flush: 'sync' }
)
onBeforeUnmount(() => {
  sampleGeneration++
  generation++
  model.invalidate()
})
const /** 切换当前工作单视图并保留地址上下文
   * @param view - 当前业务视图
   */
  go = (view: string): void => {
    void router.replace({ name: 'content-work-order', params: { id: id.value }, query: { view } })
  }
const /** 读取当前工作单全部成员，仅用于完整抽样和发布选择
   * @param orderId - 本次读取的工作单
   * @param current - 本次读取是否仍有效
   */
  loadMembers = async (orderId: string, current: () => boolean): Promise<void> => {
    const result = await adapter.items(orderId, 1, 100)
    if (!current()) return
    const rows = [...result.items]
    for (let next = 2; rows.length < result.total; next++) {
      const more = await adapter.items(orderId, next, 100)
      if (!current()) return
      if (!more.items.length) break
      rows.push(...more.items)
    }
    if (current()) allItems.value = rows
  }
const /** 按地址读取工作单，每个异步分区均绑定本次路由与读取代次 */
  load = async (): Promise<void> => {
    const token = ++generation,
      orderId = id.value,
      view = tab.value
    const range = route.query.range_token,
      batch = route.query.batch_id
    const /** 判断异步操作仍属于当前页面身份
       * @returns 当前操作是否有效
       */ current = (): boolean =>
        token === generation && orderId === id.value && view === tab.value
    error.value = ''
    try {
      if (!orderId) {
        if (range) {
          const restored = await findWorkOrderRange(adapter, String(range))
          if (!current()) return
          if (restored)
            await router.replace({
              name: 'content-work-order',
              params: { id: restored.work_order_id },
              query: { view: 'publication' }
            })
          else legacyRange.value = true
          return
        }
        if (batch) {
          const restored = await adapter.fromBatch(String(batch))
          if (!current()) return
          await router.replace({
            name: 'content-work-order',
            params: { id: restored.work_order_id }
          })
          return
        }
        const result = await adapter.list(listPage.value, 20)
        if (current()) list.value = result
        return
      }
      await model.load(orderId)
      if (!current() || !order.value) return
      if (view === 'import') {
        const result = await adapter.preview(orderId)
        if (current()) preview.value = result
      }
      if (view === 'candidates') {
        const result = await adapter.candidates(orderId)
        if (!current()) return
        const details = await Promise.all(
          [...new Set(result.groups.map((group) => group.item_id))].map((itemId) =>
            adapter.detail(orderId, itemId)
          )
        )
        if (!current()) return
        groups.value = result.groups
        candidateDetails.value = details
      }
      if (view === 'sampling' || view === 'publication') await loadMembers(orderId, current)
      if (view === 'overview') {
        const result = await adapter.usage(orderId)
        if (current()) usage.value = result
      }
    } catch (failure) {
      if (current()) error.value = failure instanceof Error ? failure.message : '加载失败，请刷新'
    }
  }
const /** 打开本批篇目的正确修正分区
   * @param item - 当前工作单成员
   * @param issue - 可选的具体待修正问题
   */
  edit = (item: WorkItem, issue?: S['WorkIssue']): void => {
    void router.push({
      name: 'content-work-item',
      params: { id: id.value, itemId: item.item_id },
      query: {
        section: issueAction(issue?.correction_target || 'content').section,
        issue: issue?.id
      }
    })
  }
const /** 通过服务端成员打开编辑，不使用全库回退
   * @param itemId - 当前组或样本成员编号
   */
  editById = (itemId: string): void => {
    void router.push({ name: 'content-work-item', params: { id: id.value, itemId } })
  }
const /** 执行命令并更新当前步骤
   * @param action - 当前业务命令
   * @param fields - 明确范围与确认信息
   * @returns 是否执行成功
   */
  run = async <K extends WorkCommand>(
    action: K,
    fields: WorkCommandFields<K>
  ): Promise<boolean> => {
    const orderId = id.value,
      view = tab.value,
      token = generation
    const ok = await model.run(action, fields)
    if (orderId !== id.value || view !== tab.value || token !== generation) return false
    const refreshedGeneration = generation + 1
    if (ok) await load()
    return ok && generation === refreshedGeneration && orderId === id.value && view === tab.value
  }
const /** 自动整理本批，推荐由管理员独立选择
   * @param recommendations - 是否包含可选推荐
   */
  organize = async (recommendations = false): Promise<void> => {
    const token = generation
    if (recommendations)
      try {
        await ElMessageBox.confirm(
          '对本批符合条件且尚无词表的篇目生成可选推荐，可能产生实际调用用量。',
          '生成可选词条推荐',
          { confirmButtonText: '生成推荐', cancelButtonText: '返回' }
        )
      } catch {
        return
      }
    if (token !== generation) return
    await run('organize', { include_recommendations: recommendations })
  }
const /** 决定单个候选组，保存后重读版本和完整绑定
   * @param group - 当前篇目的候选组
   * @param decisions - 明确的逐结果选择
   */
  decide = async (group: CandidateGroup, decisions: CandidateDecision[]): Promise<void> => {
    if (!decisions.length) return
    if (
      await run('candidate-decisions', {
        scope: 'selected',
        selected_item_ids: [group.item_id],
        candidate_id: group.candidate_id,
        expected_edit_version: group.expected_edit_version,
        decisions
      })
    )
      return
  }
const /** 放弃可选推荐并保留真实供应商状态
   * @param group - 管理员放弃的可选推荐组
   */
  dismiss = async (group: CandidateGroup): Promise<void> => {
    await run('candidate-dismissals', {
      scope: 'selected',
      selected_item_ids: [group.item_id],
      candidate_id: group.candidate_id,
      expected_edit_version: group.expected_edit_version,
      reason: '管理员选择放弃本次可选推荐'
    })
  }
const /** 读取实际样本及其签名媒体
   * @param itemId - 本批成员编号
   */
  inspect = async (itemId: string): Promise<void> => {
    const request = ++sampleGeneration
    const orderId = id.value
    const collectionHash = sampling.value?.collection_hash
    sampleDetail.value = null
    sampleMedia.value = []
    error.value = ''
    const /** 验证请求仍属于当前工作单和集合
       * @returns 是否允许写回本次请求
       */ current = (): boolean =>
        request === sampleGeneration &&
        orderId === id.value &&
        collectionHash === sampling.value?.collection_hash
    try {
      const detail = await adapter.detail(orderId, itemId)
      if (!current()) return
      if (
        detail.item_id !== itemId ||
        !sampling.value?.candidates.some(
          (row) =>
            row.revision_id === detail.revision_id && row.candidate_hash === detail.candidate_hash
        )
      )
        throw new Error('样本候选已变化，请刷新本批范围后重新检查')
      sampleDetail.value = detail
      const identity = sampleIdentity(detail)
      const resources = await Promise.all(
        sampleResources(detail).map(async (resource) => {
          try {
            const signed =
              detail.current?.template === 'short_reading'
                ? await media.signedUrl(resource.resourceId)
                : await contentAdapter.signedResource(detail.revision_id!, resource.resourceId)
            return { ...resource, url: signed.url }
          } catch (failure) {
            return {
              ...resource,
              error: failure instanceof Error ? failure.message : '资源签名暂不可用'
            }
          }
        })
      )
      if (current() && sampleDetail.value && sampleIdentity(sampleDetail.value) === identity)
        sampleMedia.value = resources
    } catch (failure) {
      if (current()) error.value = failure instanceof Error ? failure.message : '样本资源加载失败'
    }
  }
const /** 完成本篇检查后刷新精确样本哈希
   * @param fields - 管理员明确检查动作
   */
  sampleAction = async (fields: WorkCommandFields<'sample-actions'>): Promise<void> => {
    if (await run('sample-actions', fields)) {
      if (fields.operation === 'complete') {
        go('publication')
        return
      }
      if (sampleDetail.value) await inspect(sampleDetail.value.item_id)
    }
  }
const /** 创建服务端抽样集合
   */
  startSampling = async (): Promise<void> => {
    sampleGeneration++
    sampleDetail.value = null
    sampleMedia.value = []
    selected.value = []
    if (!(await run('sampling', { scope: 'all' }))) return
    go('sampling')
  }
const /** 预览选中的合格子集，未选异常保持草稿
   */
  previewPublication = async (): Promise<void> => {
    if (
      await run('publication-preview', {
        scope: 'publishable',
        ...(selected.value.length ? { selected_item_ids: selected.value } : {})
      })
    )
      go('publication')
  }
const /** 发布精确预览范围或仅重试原失败项
   * @param retry - 是否重试失败子集
   */
  publish = async (retry: boolean): Promise<void> => {
    if (!publication.value) return
    await run(retry ? 'publication-retry' : 'publication-confirm', {
      publication_token: publication.value.token,
      range_version: publication.value.version,
      collection_hash: publication.value.collection_hash,
      manual_confirmed: true
    })
  }
const /** 重试真正失败且可重试的原阶段
   * @param item - 失败阶段所属篇目
   * @param task - 服务端当前阶段事实
   */
  retry = async (item: WorkItem, task: S['WorkTask']): Promise<void> => {
    const token = generation
    try {
      await ElMessageBox.confirm(
        '重试此失败步骤。涉及云端调用时可能产生额外用量，成功步骤将复用。',
        '重试失败步骤',
        { confirmButtonText: '确认重试', cancelButtonText: '返回' }
      )
    } catch {
      return
    }
    if (token !== generation) return
    await run('stage-retry', {
      scope: 'selected',
      selected_item_ids: [item.item_id],
      stage_id: task.stage_id,
      expected_edit_version: item.edit_version || 1,
      expected_fence: task.fencing_version,
      input_hash: task.input_hash,
      config_version: task.config_version,
      manual_confirmed: true,
      acknowledged_charged_retry: true
    })
  }
const /** 切换服务端过滤条件
   */
  filter = (): void => {
    page.value = 1
    void load()
  }
watch(
  () => [id.value, tab.value, route.fullPath],
  () => {
    generation++
    model.invalidate()
    list.value = null
    preview.value = null
    groups.value = []
    candidateDetails.value = []
    allItems.value = []
    usage.value = null
    selected.value = []
    legacyRange.value = false
    void load()
  },
  { immediate: true, flush: 'sync' }
)
</script>
<template>
  <section class="work-order-page">
    <ElAlert v-if="error" :title="error" type="error" :closable="false"
      ><ElButton @click="load">刷新权威状态</ElButton></ElAlert
    >
    <template v-if="legacyRange && !id"
      ><ElAlert
        title="历史范围（从旧链接恢复）"
        description="继续核对和处理原有固定范围与发布回执"
        type="info"
        :closable="false" /><PublicationRangePanel :candidates="[]" contextual
    /></template>
    <template v-else-if="!id"
      ><AdminPanel title="内容生产工作单"
        ><p>选择本次工作单，继续查看导入、校对与发布结果。</p>
        <ElTable :data="list?.items || []"
          ><ElTableColumn label="分类 / 类型" min-width="240"
            ><template #default="{ row }"
              >{{ row.series_title }} ·
              {{ types[row.content_type as keyof typeof types] }}</template
            ></ElTableColumn
          ><ElTableColumn label="范围"
            ><template #default="{ row }">{{ row.counts.total }} 篇</template></ElTableColumn
          ><ElTableColumn label="进度"
            ><template #default="{ row }"
              >正常 {{ row.counts.normal }} · 需校对 {{ row.counts.review_required }} · 失败
              {{ row.counts.failed }}</template
            ></ElTableColumn
          ><ElTableColumn label="操作"
            ><template #default="{ row }"
              ><ElButton
                link
                type="primary"
                @click="
                  router.push({ name: 'content-work-order', params: { id: row.work_order_id } })
                "
                >继续处理</ElButton
              ></template
            ></ElTableColumn
          ></ElTable
        ><AppPagination
          v-model:current-page="listPage"
          :total="list?.total || 0"
          :page-size="20"
          @change="load" /></AdminPanel
      ><AppPageActions
        ><ElButton @click="router.push({ name: 'content-scenes' })">返回内容列表</ElButton
        ><ElButton type="primary" @click="router.push({ name: 'content-import' })"
          >批量导入</ElButton
        ></AppPageActions
      ></template
    >
    <template v-else-if="order"
      ><div class="context">
        <div>
          <h2>{{ order.series_title }} · {{ types[order.content_type] }}</h2>
          <p>本次 {{ order.counts.total }} 篇 · 离开后可从工作单继续处理</p>
        </div>
        <ElButton :loading="busy" @click="load">刷新进度</ElButton>
      </div>
      <nav class="tabs">
        <ElButton
          v-for="(label, view) in {
            overview: '整理结果',
            ...(order.import_batch_id && order.source_mode !== 'MATERIAL_ZIP'
              ? { import: '原文件与对应预览' }
              : {}),
            ...(order.content_type !== 'short_reading' ? { candidates: '词表与中央定义' } : {}),
            sampling: '正常抽样',
            publication: '发布范围与结果'
          }"
          :key="view"
          :type="tab === view ? 'primary' : 'default'"
          @click="go(view)"
          >{{ label }}</ElButton
        >
      </nav>
      <template v-if="tab === 'overview'"
        ><ElSelect v-model="status" aria-label="篇目状态筛选" @change="filter"
          ><ElOption label="全部篇目" value="" /><ElOption
            v-for="key in [
              'processing',
              'normal',
              'review_required',
              'failed',
              'published',
              'cancelled'
            ]"
            :key="key"
            :value="key"
            :label="productionLabels[key]" /></ElSelect
        ><WorkOrderOverview
          :order="order"
          :items="items?.items || []"
          :busy="busy"
          :usage="usage"
          @edit="edit"
          @resume="model.resume"
          @retry="retry" /><AppPagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :total="items?.total || 0"
          @change="load"
      /></template>
      <WorkOrderImport
        v-else-if="tab === 'import' && preview"
        :preview="preview"
        :busy="busy"
        @confirm="run('import-confirm', $event)"
        @retry="run('import-retry', $event)"
      />
      <WorkOrderCandidates
        v-else-if="tab === 'candidates' && order.content_type !== 'short_reading'"
        :groups="groups"
        :details="candidateDetails"
        :items="items?.items || []"
        :busy="busy"
        @decide="decide"
        @dismiss="dismiss"
        @edit="editById"
      />
      <template v-else-if="tab === 'sampling'"
        ><AdminPanel v-if="sampling" title="修正后重新抽样">
          <p>
            原集合固定保留。正文、词义或音频变化后，请按当前草稿重新建立抽样；旧检查和试听不沿用。
          </p>
          <ElButton :disabled="busy" @click="startSampling"
            >按当前草稿重新建立抽样</ElButton
          > </AdminPanel
        ><WorkOrderSampling
          v-if="sampling"
          :key="sampling?.proofreading_set_id"
          :state="sampling"
          :items="allItems"
          :busy="busy"
          :detail="sampleDetail"
          :resources="sampleMedia"
          @inspect="inspect"
          @action="sampleAction"
          @edit="editById"
        /><AdminPanel v-else title="开始本批正常抽样"
          ><p>当前正常 {{ order.counts.normal }} 篇。服务端按当前正常集合选取所需样本。</p>
          <ElButton :disabled="busy || !order.counts.normal" type="primary" @click="startSampling"
            >建立本批抽样</ElButton
          ></AdminPanel
        ></template
      >
      <template v-else-if="tab === 'publication'"
        ><WorkOrderPublication
          v-if="publication"
          :state="publication"
          :items="allItems"
          :busy="busy"
          :held="
            Math.max(
              0,
              order.counts.total -
                allItems.filter(
                  (item) =>
                    item.published ||
                    publication?.candidates.some(
                      (candidate) => candidate.revision_id === item.revision_id
                    )
                ).length
            )
          "
          @confirm="publish"
        /><AdminPanel title="选择当前合格子集"
          ><p>
            已合格 {{ order.counts.publishable || 0 }} 篇；其他内容继续保留草稿。可选择更小范围。
          </p>
          <ElCheckboxGroup v-model="selected"
            ><ElCheckbox
              v-for="item in allItems.filter((row) => row.publishable && row.current_draft)"
              :key="item.item_id"
              :value="item.item_id"
              >{{ item.title_en || item.title_zh }}</ElCheckbox
            ></ElCheckboxGroup
          ><ElButton :disabled="busy || !order.counts.publishable" @click="previewPublication">{{
            selected.length ? `预览选中 ${selected.length} 篇` : '预览全部合格篇目'
          }}</ElButton></AdminPanel
        ></template
      >
      <AppPageActions
        ><ElButton @click="router.push({ name: 'content-jobs' })">全部工作单</ElButton
        ><ElButton v-if="tab === 'overview'" :disabled="busy" @click="organize()"
          >自动整理本批</ElButton
        ><ElButton v-if="tab === 'candidates'" :disabled="busy" @click="organize(true)"
          >生成可选推荐</ElButton
        ><ElButton
          v-if="tab === 'overview'"
          :disabled="busy"
          @click="run('cancel', { scope: 'all' })"
          >取消未开始项目</ElButton
        ><ElButton
          v-if="tab === 'overview'"
          :disabled="busy || !order.counts.normal"
          type="primary"
          @click="startSampling"
          >开始正常抽样</ElButton
        ></AppPageActions
      >
    </template>
  </section>
</template>
<style scoped lang="scss">
.work-order-page {
  display: grid;
  gap: 20px;
  min-width: 0;

  .context {
    display: flex;
    justify-content: space-between;
    align-items: center;

    h2 {
      margin: 0;
      font-size: 20px;
      color: var(--juya-color-sidebar);
    }

    p {
      margin: 6px 0 0;
      color: var(--juya-color-text-regular);
    }
  }

  .tabs {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
}
</style>
