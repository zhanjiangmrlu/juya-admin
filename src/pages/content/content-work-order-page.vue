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
import { issueAction } from '@/features/content-production/work-order-model'
import WorkOrderOverview from '@/features/content-production/work-order-overview.vue'
import WorkOrderPublication from '@/features/content-production/work-order-publication.vue'
import { publicationItemIds } from '@/features/content-production/work-order-publication-scope'
import { readWorkOrderMembers } from '@/features/content-production/work-order-range'
import {
  sampleIdentity,
  sampleResources
} from '@/features/content-production/work-order-sample-media'
import WorkOrderSampling from '@/features/content-production/work-order-sampling.vue'
import WorkOrderTasks from '@/features/content-production/work-order-tasks.vue'
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
const { order, items, sampling, publication, busy, error } = model
const list = shallowRef<S['OrderPage'] | null>(null)
const listPage = ref(1)
const legacyRange = ref(false)
const preview = shallowRef<S['ImportPreview'] | null>(null)
const groups = ref<CandidateGroup[]>([])
const candidateDetails = ref<WorkItemDetail[]>([])
const usage = shallowRef<S['WorkOrderUsage'] | null>(null)
const phases = shallowRef<S['WorkOrderPhases'] | null>(null)
const tasksView = ref<InstanceType<typeof WorkOrderTasks> | null>(null)
const allItems = ref<WorkItem[]>([])
const membersReady = ref(false)
const preparationItems = computed(() =>
  allItems.value.filter(
    (item) =>
      item.current_draft &&
      item.production_status !== 'published' &&
      item.issues?.some((issue) => issue.code === 'CONTENT_PREPARATION_REQUIRED')
  )
)
const preparationBlocked = computed(
  () =>
    !!order.value?.pending_commands?.length ||
    preparationItems.value.some(
      (item) =>
        !Array.isArray(item.tasks) ||
        item.tasks.some(
          (task) =>
            task.current &&
            (['PENDING', 'QUEUED', 'RUNNING', 'RETRY', 'UNKNOWN', 'FAILED'].includes(task.status) ||
              task.error_code === 'PROVIDER_OUTCOME_UNKNOWN')
        )
    )
)
const canPrepare = computed(
  () =>
    membersReady.value &&
    !preparationBlocked.value &&
    !!order.value?.available_actions.includes('organize') &&
    !!preparationItems.value.length
)
const canStartSampling = computed(
  () =>
    !busy.value &&
    membersReady.value &&
    !preparationBlocked.value &&
    (preparationItems.value.length
      ? canPrepare.value
      : !!order.value?.counts.normal && !!order.value.available_actions.includes('sampling'))
)
const sampleDetail = shallowRef<WorkItemDetail | null>(null)
const sampleMedia = ref<SampleResource[]>([])
const selected = ref<string[]>([])
const tab = computed(() =>
  String(
    route.query.view ||
      (route.name === 'content-jobs'
        ? 'jobs'
        : route.name === 'content-proofreading'
          ? 'sampling'
          : 'overview')
  )
)
const importPhase = computed(() => String(route.query.import_phase || 'validation'))
const id = computed(() => String(route.params.id || route.query.work_order_id || ''))
const types = { dialogue: '场景对话', word_card: '原词汇卡', short_reading: '短文阅读' }
let generation = 0
let sampleGeneration = 0
let originalAbort: globalThis.AbortController | null = null
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
  originalAbort?.abort()
  sampleGeneration++
  generation++
  model.invalidate()
})
const /** 切换当前工作单视图并保留地址上下文
   * @param view - 当前业务视图
   * @param phase - 导入校验、对应预览或结果阶段
   */
  go = (view: string, phase?: string): void => {
    void router.replace({
      name: 'content-work-order',
      params: { id: id.value },
      query: { view, ...(phase ? { import_phase: phase } : {}) }
    })
  }
const /** 读取当前工作单全部成员，仅用于完整抽样和发布选择
   * @param orderId - 本次读取的工作单
   * @param current - 本次读取是否仍有效
   */
  loadMembers = async (orderId: string, current: () => boolean): Promise<void> => {
    membersReady.value = false
    allItems.value = []
    if (!order.value || order.value.work_order_id !== orderId) return
    const rows = await readWorkOrderMembers(adapter, order.value, current)
    if (current() && rows) {
      allItems.value = rows
      membersReady.value = true
    }
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
    membersReady.value = false
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
            params: { id: restored.work_order_id },
            query: { view }
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
      if (['sampling', 'publication', 'overview', 'jobs'].includes(view))
        await loadMembers(orderId, current)
      if (view === 'jobs') {
        const [result, stages] = await Promise.all([
          adapter.usage(orderId),
          adapter.phases(orderId)
        ])
        if (current()) {
          usage.value = result
          phases.value = stages
        }
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
const /** 续办原服务端回执后重读当前视图的完整分区
   * @param commandId - 当前工作单实际挂起的原命令编号
   */ resume = async (commandId: string): Promise<void> => {
    if (
      busy.value ||
      !order.value ||
      order.value.work_order_id !== id.value ||
      !order.value.pending_commands?.some((pending) => pending.command_id === commandId)
    )
      return
    const orderId = id.value,
      path = route.fullPath,
      token = generation
    error.value = ''
    await model.resume(commandId)
    if (token !== generation || orderId !== id.value || path !== route.fullPath) return
    const receiptError = error.value
    const refreshedGeneration = generation + 1
    busy.value = true
    try {
      await load()
      if (
        generation === refreshedGeneration &&
        orderId === id.value &&
        path === route.fullPath &&
        receiptError &&
        !error.value
      )
        error.value = receiptError
    } finally {
      if (generation === refreshedGeneration && orderId === id.value && path === route.fullPath)
        busy.value = false
    }
  }
const /** 自动整理本批，推荐由管理员独立选择
   * @param recommendations - 是否包含可选推荐
   * @returns 是否已接受当前整理操作
   */
  organize = async (recommendations = false): Promise<boolean> => {
    const token = generation
    if (recommendations)
      try {
        await ElMessageBox.confirm(
          '对本批符合条件且尚无词表的篇目生成可选推荐，可能产生实际调用用量。',
          '生成可选词条推荐',
          { confirmButtonText: '生成推荐', cancelButtonText: '返回' }
        )
      } catch {
        return false
      }
    if (token !== generation) return false
    return run('organize', { include_recommendations: recommendations })
  }
const /** 从已保存草稿的设计入口继续必要整理，失败时保留原范围 */ enterProofreading =
    async (): Promise<void> => {
      if (
        order.value?.pending_commands?.length ||
        !order.value?.available_actions.includes('organize')
      )
        return
      if (await organize()) go('overview')
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
const /** 续办真实待准备成员，或从已准备正常集合建立服务端抽样
   */
  startSampling = async (): Promise<void> => {
    if (!canStartSampling.value) return
    if (preparationItems.value.length) {
      if (!canPrepare.value) return
      const prepared = await run('organize', {
        scope: 'selected',
        selected_item_ids: preparationItems.value.map((item) => item.item_id),
        include_recommendations: false
      })
      if (prepared)
        error.value =
          '已提交当前候选的必要准备。请查看实际进度，准备完成后再点击开始校对；尚未创建抽样集合'
      return
    }
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
    if (!publication.value || !order.value) return
    try {
      if (!membersReady.value) throw new Error('成员范围读取不完整，请刷新权威状态并重新预览')
      const selectedItemIds = publicationItemIds(
        order.value,
        publication.value,
        allItems.value,
        retry
      )
      await run(retry ? 'publication-retry' : 'publication-confirm', {
        scope: 'selected',
        selected_item_ids: selectedItemIds,
        publication_token: publication.value.token,
        range_version: publication.value.version,
        collection_hash: publication.value.collection_hash,
        manual_confirmed: true
      })
    } catch (failure) {
      error.value = failure instanceof Error ? failure.message : '请刷新权威状态并重新预览'
    }
  }
const /** 重试真正失败且可重试的原阶段
   * @param item - 失败阶段所属篇目
   * @param task - 服务端当前阶段事实
   */
  retry = async (item: WorkItem, task: S['WorkTask']): Promise<void> => {
    if (
      busy.value ||
      !task.current ||
      task.status !== 'FAILED' ||
      task.error_code === 'PROVIDER_OUTCOME_UNKNOWN' ||
      !task.retryable
    )
      return
    if (task.stage.startsWith('PUBLICATION_RANGE_')) {
      go('publication')
      return
    }
    if (!item.revision_id || !item.edit_version) {
      go('import', 'validation')
      return
    }
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
const /** 确认草稿写入后进入持久导入结果
   * @param fields - 明确选择、缺省确认和固定预览版本
   * @param retryOnly - 是否只重试失败行
   */ confirmImport = async (
    fields: WorkCommandFields<'import-confirm'>,
    retryOnly = false
  ): Promise<void> => {
    if (await run(retryOnly ? 'import-retry' : 'import-confirm', fields)) go('import', 'result')
  }
const /** 明确排除尚未保存的导入行
   * @param itemId - 当前批次真实成员身份
   */ excludeImport = async (itemId: string): Promise<void> => {
    const token = generation
    try {
      await ElMessageBox.confirm('此行将明确排除，成功草稿保持原样。', '排除本批导入行', {
        confirmButtonText: '确认排除',
        cancelButtonText: '返回'
      })
    } catch {
      return
    }
    if (token === generation)
      await run('cancel', { scope: 'selected', selected_item_ids: [itemId] })
  }
const /** 下载当前工作单真实上传字节，离开后不产生下载 */ downloadOriginal =
    async (): Promise<void> => {
      const token = generation,
        orderId = id.value
      try {
        originalAbort?.abort()
        originalAbort = new globalThis.AbortController()
        const blob = await adapter.originalFile(orderId, originalAbort.signal)
        if (token !== generation || orderId !== id.value) return
        const url = globalThis.URL.createObjectURL(blob),
          link = globalThis.document.createElement('a')
        link.href = url
        link.download = order.value?.source_mode === 'DOCX' ? 'original.docx' : 'original.zip'
        link.click()
        globalThis.URL.revokeObjectURL(url)
      } catch (failure) {
        if (token === generation)
          error.value = failure instanceof Error ? failure.message : '原文件下载失败'
      }
    }
watch(
  () => [id.value, tab.value, route.fullPath],
  () => {
    generation++
    originalAbort?.abort()
    model.invalidate()
    list.value = null
    preview.value = null
    groups.value = []
    candidateDetails.value = []
    allItems.value = []
    membersReady.value = false
    usage.value = null
    phases.value = null
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
      ><AdminPanel :title="tab === 'jobs' ? '导入批次' : '选择内容批次'"
        ><p>选择真实批次，恢复原范围的处理与结果。</p>
        <ElTable :data="list?.items || []"
          ><ElTableColumn prop="import_batch_id" label="批次 ID" min-width="220" />
          <ElTableColumn label="分类 / 类型" min-width="240"
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
                  router.push({
                    name: 'content-work-order',
                    params: { id: row.work_order_id },
                    query: { view: tab }
                  })
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
          <p>
            {{ order.series_title }} · {{ types[order.content_type] }} · 本次
            {{ order.counts.total }} 篇
          </p>
        </div>
        <ElButton :loading="busy" @click="load">刷新进度</ElButton>
      </div>
      <div v-if="tab === 'import'" class="import-steps" aria-label="导入阶段">
        <span>上传 ZIP</span><span :class="{ active: importPhase === 'validation' }">校验</span
        ><span :class="{ active: importPhase === 'preview' }">对应预览</span
        ><span :class="{ active: importPhase === 'result' }">确认导入</span>
      </div>
      <template v-if="tab === 'overview'"
        ><WorkOrderOverview
          :order="order"
          :items="allItems"
          :busy="busy || !membersReady"
          @edit="edit"
          @resume="resume"
        />
      </template>
      <WorkOrderTasks
        v-else-if="tab === 'jobs'"
        ref="tasksView"
        :order="order"
        :phases="phases"
        :usage="usage"
        :items="allItems"
        :busy="busy || !membersReady"
        @retry="retry"
        @resume="resume"
      />
      <WorkOrderImport
        v-else-if="tab === 'import' && preview"
        :preview="preview"
        :busy="busy"
        :phase="importPhase"
        :content-type="order.content_type"
        @confirm="confirmImport($event)"
        @retry="confirmImport($event, true)"
        @exclude="excludeImport"
        @edit="editById"
        @preview-failed="go('import', 'preview')"
        @previous="go('import', 'validation')"
      />
      <AdminPanel v-if="tab === 'import' && order.pending_commands?.length" title="仍在处理的操作"
        ><ElButton
          v-for="pending in order.pending_commands"
          :key="pending.command_id"
          :disabled="busy || Date.parse(pending.retry_at) > Date.now()"
          @click="resume(pending.command_id)"
          >继续核实结果</ElButton
        ></AdminPanel
      >
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
          <ElButton :disabled="!canStartSampling" @click="startSampling"
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
          <ElButton :disabled="!canStartSampling" type="primary" @click="startSampling"
            >建立本批抽样</ElButton
          ></AdminPanel
        ></template
      >
      <template v-else-if="tab === 'publication'"
        ><WorkOrderPublication
          v-if="publication"
          :state="publication"
          :items="allItems"
          :busy="busy || !membersReady"
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
      <AppPageActions v-if="!(tab === 'import' && importPhase === 'preview')">
        <template v-if="tab === 'overview'"
          ><ElButton v-if="order.import_batch_id" @click="downloadOriginal">查看原文件</ElButton
          ><ElButton :disabled="!canStartSampling" type="primary" @click="startSampling"
            >开始校对</ElButton
          ></template
        >
        <template v-else-if="tab === 'jobs'"
          ><ElButton :disabled="busy" @click="run('cancel', { scope: 'all' })"
            >取消未开始项目</ElButton
          ><ElButton
            :disabled="busy || !membersReady"
            type="primary"
            @click="tasksView && (tasksView.failedOpened = true)"
            >重试失败阶段</ElButton
          ></template
        >
        <template v-else-if="tab === 'import' && importPhase === 'validation'"
          ><ElButton @click="router.push({ name: 'content-import' })">上一步</ElButton
          ><ElButton
            :disabled="
              busy ||
              !preview?.items.length ||
              !!preview.batch_issues.some((issue) => issue.severity === 'ERROR')
            "
            type="primary"
            @click="go('import', 'preview')"
            >查看合格预览</ElButton
          ></template
        >
        <template v-else-if="tab === 'import' && importPhase === 'preview'"
          ><ElButton :disabled="busy" @click="go('import', 'validation')"
            >上一步</ElButton
          ></template
        >
        <template v-else-if="tab === 'import' && importPhase === 'result'"
          ><ElButton @click="router.push({ name: 'content-import' })">再次上传</ElButton
          ><ElButton
            type="primary"
            :disabled="busy || !!order.pending_commands?.length"
            @click="enterProofreading"
            >进入校对发布</ElButton
          ></template
        >
        <template v-else-if="tab === 'candidates'"
          ><ElButton :disabled="busy" @click="organize(true)">生成可选推荐</ElButton
          ><ElButton @click="go('overview')">返回整理结果</ElButton></template
        >
        <template v-else
          ><ElButton @click="go('overview')">返回整理结果</ElButton
          ><ElButton @click="go('jobs')">查看批量任务</ElButton></template
        >
      </AppPageActions>
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
}
</style>
