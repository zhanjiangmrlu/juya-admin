<script setup lang="ts">
import { type ComponentPublicInstance, computed, nextTick, onMounted, ref, shallowRef } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'

import AppFilePicker from '@/components/app-file-picker/app-file-picker.vue'
import AppState from '@/components/app-state/app-state.vue'
import ListeningContentForm from '@/features/listening/listening-content-form.vue'
import ListeningImportDifference from '@/features/listening/listening-import-difference.vue'
import ListeningImportTarget from '@/features/listening/listening-import-target.vue'
import {
  candidateSelection,
  importErrorLabels,
  statusLabels,
  topicLabel
} from '@/features/listening/listening-model'
import ListeningPreviewPanel from '@/features/listening/listening-preview-panel.vue'
import ListeningTimeline from '@/features/listening/listening-timeline.vue'
import { api } from '@/services/http-client'
import {
  listeningBase,
  listeningImportMediaBase,
  listeningOperation,
  listeningRecoverableOperation,
  listeningRequest,
  listeningTemplateURL
} from '@/services/listening-service'

import type {
  Article,
  Candidate,
  CandidateEditor,
  ImportBatch,
  ImportPreview,
  ImportResult,
  Page,
  Topic
} from '@/features/listening/listening-types'

const route = useRoute(),
  router = useRouter()
const mode = ref<'zip' | 'docx'>(route.query.mode === 'docx' ? 'docx' : 'zip'),
  batch = ref<ImportBatch | null>(null),
  recoverable = ref<ImportBatch[]>([]),
  topics = ref<Topic[]>([]),
  selected = ref<string[]>([]),
  step = ref(1),
  busy = ref(false),
  error = ref(''),
  uploadText = ref(''),
  uploadPercent = ref<number | null>(null),
  preview = ref<ImportPreview | null>(null),
  result = ref<ImportResult | null>(null),
  submitAction = ref<'draft' | 'publish'>('draft'),
  candidatePreview = ref<Candidate | null>(null),
  removeOpen = ref(false),
  editing = ref<CandidateEditor | null>(null),
  drag = ref(false),
  candidateForm = ref<InstanceType<typeof ListeningContentForm> | null>(null)
const candidates = computed(() => batch.value?.candidates.filter((item) => !item.removed) || []),
  selection = computed(() => candidateSelection(candidates.value, selected.value)),
  selectedCandidates = computed(() =>
    candidates.value.filter((item) => selection.value.remove.includes(item.id))
  )
const pendingUpload = shallowRef<{
  files: File[]
  form: FormData
  key: string
  revision: number
} | null>(null)
const pendingSave = shallowRef<ReturnType<
  typeof listeningRecoverableOperation<ImportResult>
> | null>(null)
/** 持有当前展开的唯一候选表单实例，避免循环模板将引用收集为数组
 * @param value 当前挂载的候选表单实例，卸载时为空
 */
const setCandidateForm = (value: Element | ComponentPublicInstance | null) => {
  candidateForm.value = value as InstanceType<typeof ListeningContentForm> | null
}
/** 接受服务端实际暂存，旧确认令牌在任何变化后失效
 * @param value 已持久化批次
 * @param defaults 是否重新选中所有可保存候选
 */
const accept = (value: ImportBatch, defaults = false) => {
  batch.value = value
  result.value = null
  mode.value = value.mode === 'docx' ? 'docx' : 'zip'
  preview.value = null
  pendingSave.value = null
  selected.value = defaults
    ? value.candidates
        .filter((item) => !item.removed && ['complete', 'incomplete'].includes(item.state))
        .map((item) => item.id)
    : selected.value.filter((id) =>
        value.candidates.some((item) => item.id === id && !item.removed && item.state !== 'saved')
      )
  void router.replace({ query: { ...route.query, batch_id: value.id } })
}
/** 查询真实批次恢复上传、移除及成功草稿，不声称恢复本地未保存编辑
 * @param id 当前管理员拥有的服务端批次编号
 */
const resume = async (id: string) => {
  if (pendingSave.value) {
    await save()
    return
  }
  busy.value = true
  error.value = ''
  try {
    accept(await listeningRequest<ImportBatch>(`/imports/${id}`), true)
    step.value = candidates.value.length ? 2 : 1
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '批次恢复失败'
  } finally {
    busy.value = false
  }
}
/** 仅为尚无批次的操作创建听读独立导入对象
 * @returns 真实持久化批次
 */
const ensureBatch = async () => {
  if (!batch.value)
    accept(await listeningOperation<ImportBatch>('POST', '/imports', { mode: mode.value })())
  return batch.value!
}
/** 发送当前上传操作，网络未知时保留同键重试 */
const sendUpload = async () => {
  if (!pendingUpload.value || !batch.value) return
  busy.value = true
  error.value = ''
  try {
    const value = await api.upload<ImportBatch>(
      `${listeningBase}/imports/${batch.value.id}/files?revision=${pendingUpload.value.revision}`,
      pendingUpload.value.form,
      pendingUpload.value.key,
      (progress) => {
        uploadPercent.value = progress.percent
        uploadText.value =
          progress.percent === null
            ? `已传输 ${progress.loaded} 字节`
            : `已传输 ${progress.percent}%${progress.percent === 100 ? '，服务端正在解析及处理素材' : ''}`
      }
    )
    accept(value, true)
    uploadText.value = '资料已在服务端暂存，请核对真实读取结果'
    pendingUpload.value = null
    step.value = candidates.value.length ? 2 : 1
  } catch (reason) {
    error.value =
      reason instanceof Error ? reason.message : '接收结果未知，请查询批次或重试同一上传'
  } finally {
    busy.value = false
  }
}
/** 同批可继续添加多个ZIP或DOCX配套资料
 * @param files 管理员明确选择或拖入的文件
 */
const uploadFiles = async (files: File[]) => {
  if (!files.length || busy.value || pendingSave.value) return
  busy.value = true
  error.value = ''
  try {
    const value = await ensureBatch(),
      form = new FormData()
    for (const file of files) form.append('files', file)
    uploadPercent.value = null
    pendingUpload.value = { files, form, key: crypto.randomUUID(), revision: value.revision }
    await sendUpload()
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '创建批次失败'
  } finally {
    busy.value = false
  }
}
/** 将文件选择事件转换为真实上传，不保留伪恢复状态
 * @param event 原生文件输入事件
 */
const chooseFiles = (event: Event) => {
  const input = event.target as HTMLInputElement
  void uploadFiles([...(input.files || [])])
  input.value = ''
}
/** 接收拖拽文件，仍使用当前批次方式
 * @param event 浏览器拖放事件
 */
const dropFiles = (event: DragEvent) => {
  drag.value = false
  void uploadFiles([...(event.dataTransfer?.files || [])])
}
/** 展开候选独立副本，修改前不覆盖服务端暂存
 * @param candidate 当前候选及素材对应
 */
const editCandidate = async (candidate: Candidate) => {
  if (pendingSave.value) return
  editing.value = {
    candidate,
    payload: JSON.parse(JSON.stringify(candidate.payload)),
    topic: candidate.topic_id || '',
    mode: candidate.target_article_id ? 'update' : 'create',
    target: null,
    targetId: candidate.target_article_id || null,
    targetRevision: candidate.target_revision || null,
    targetError: ''
  }
  preview.value = null
  pendingSave.value = null
  if (candidate.target_article_id) {
    const current = editing.value
    busy.value = true
    try {
      const target = await listeningRequest<Article>(
        `/articles/${encodeURIComponent(candidate.target_article_id)}`
      )
      if (target.status === 'deleted') throw new Error('目标文章已删除，请重新选择目标')
      if (editing.value === current) current.target = target
    } catch (reason) {
      if (editing.value === current)
        current.targetError = reason instanceof Error ? reason.message : '目标读取失败'
    } finally {
      busy.value = false
    }
  }
}
/** 固定本次明确选择的目标身份和当前版本，不写入目标文章
 * @param target 管理员明确选择的真实文章，空值表示改为新建
 */
const selectTarget = (target: Article | null) => {
  if (!editing.value) return
  editing.value.target = target
  editing.value.targetId = target?.id || null
  editing.value.targetRevision = target?.revision || null
  editing.value.targetError = ''
}
/** 将人工核对资料持久化到本批暂存，成功后方可继续 */
const saveCandidate = async () => {
  if (!editing.value || !batch.value) return
  if (
    editing.value.mode === 'update' &&
    (!editing.value.target ||
      editing.value.target.revision !== editing.value.targetRevision ||
      editing.value.targetError)
  ) {
    error.value = '请明确选择目标当前草稿并核对前后差异后暂存'
    return
  }
  if (candidateForm.value?.meaningError) {
    error.value = '请先修正本篇词义格式'
    return
  }
  busy.value = true
  error.value = ''
  try {
    accept(
      await listeningOperation<ImportBatch>(
        'PUT',
        `/imports/${batch.value.id}/candidates/${editing.value.candidate.id}`,
        {
          revision: batch.value.revision,
          topic_id: editing.value.topic || null,
          target_article_id: editing.value.mode === 'update' ? editing.value.targetId : null,
          target_revision: editing.value.mode === 'update' ? editing.value.targetRevision : null,
          payload: JSON.parse(JSON.stringify(editing.value.payload))
        }
      )()
    )
    editing.value = null
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '暂存失败，修改仍保留'
  } finally {
    busy.value = false
  }
}
/** 仅移除明确确认的本批未保存候选，已存文章不删除 */
const removeCandidates = async () => {
  if (!batch.value || !selection.value.remove.length) return
  busy.value = true
  error.value = ''
  try {
    accept(
      await listeningOperation<ImportBatch>('POST', `/imports/${batch.value.id}/remove`, {
        revision: batch.value.revision,
        candidate_ids: selection.value.remove
      })()
    )
    removeOpen.value = false
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '移除结果未知，请查询批次后确认'
    removeOpen.value = false
  } finally {
    busy.value = false
  }
}
/** 固定当前勾选中的可提交对象，核对快照后直接执行管理员选择的动作
 * @param action 保存草稿或明确发布
 */
const next = async (action: 'draft' | 'publish') => {
  if (!batch.value || editing.value || busy.value || pendingSave.value) return
  const ids = action === 'publish' ? selection.value.publish : selection.value.save
  if (!ids.length) return
  busy.value = true
  error.value = ''
  result.value = null
  submitAction.value = action
  try {
    preview.value = await listeningOperation<ImportPreview>(
      'POST',
      `/imports/${batch.value.id}/preview`,
      {
        revision: batch.value.revision,
        candidate_ids: [...ids],
        submit_action: action
      }
    )()
    pendingSave.value = listeningRecoverableOperation<ImportResult>(
      'POST',
      `/imports/${batch.value.id}/save`,
      {
        preview_token: preview.value.preview_token,
        submit_action: action
      }
    )
    await save()
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '核对范围失败，未提交保存或发布'
  } finally {
    busy.value = false
  }
}
/** 恢复原提交回执，全部成功返回列表，部分失败保留真实结果 */
const save = async () => {
  if (!pendingSave.value) return
  busy.value = true
  error.value = ''
  try {
    const value = await pendingSave.value.run()
    pendingSave.value = null
    accept(value.batch)
    result.value = value
    if (!value.items.some((item) => item.status === 'failed')) {
      await router.push(String(route.query.back || '/listening'))
    } else {
      step.value = 2
      await nextTick()
      document.querySelector('[data-submission-results]')?.scrollIntoView?.({ block: 'start' })
    }
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '提交结果未确认，请重试'
    if (!pendingSave.value?.unknown) pendingSave.value = null
  } finally {
    busy.value = false
  }
}
/** 先查询成功结果，仅将原失败候选重新放入确认范围 */
const retryFailed = async () => {
  if (!batch.value || !result.value) return
  const failedIds = result.value.items
    .filter((item) => item.status === 'failed')
    .map((item) => item.candidate_id)
  await resume(batch.value.id)
  selected.value = candidates.value
    .filter(
      (item) => failedIds.includes(item.id) && ['complete', 'incomplete'].includes(item.state)
    )
    .map((item) => item.id)
  step.value = 2
}
/** 返回核对后使旧保存确认失效 */
const backToReview = () => {
  if (pendingSave.value) return
  step.value = 2
  preview.value = null
  result.value = null
  error.value = ''
}
/** 清空勾选但保留当前核对位置 */
const clearSelection = () => {
  if (pendingSave.value) return
  selected.value = []
  preview.value = null
}
onBeforeRouteLeave(
  () => !editing.value || window.confirm('当前候选修改尚未暂存，离开将放弃这部分修改，是否继续？')
)
onMounted(async () => {
  busy.value = true
  try {
    topics.value = (await listeningRequest<{ items: Topic[] }>('/topics')).items
    const pending: ImportBatch[] = []
    let page = 1,
      total = 0
    do {
      const batches = await listeningRequest<Page<ImportBatch>>(
        `/imports?unfinished=true&page=${page}&limit=50`
      )
      pending.push(...batches.items)
      total = batches.total
      if (!batches.items.length) break
      page++
    } while (pending.length < total)
    recoverable.value = pending
    if (route.query.batch_id) await resume(String(route.query.batch_id))
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '导入资料读取失败'
  } finally {
    busy.value = false
  }
})
</script>
<template>
  <div class="listening-import">
    <div class="page-heading between">
      <div>
        <h1>听读批量导入</h1>
        <p>独立听读批次 · 核对后可直接发布或保存草稿</p>
      </div>
      <RouterLink class="button-link" to="/listening">返回文章管理</RouterLink>
    </div>
    <ol class="steps">
      <li :class="{ active: step >= 1 }"><span>1</span> 上传资料</li>
      <li :class="{ active: step >= 2 }"><span>2</span> 核对文章</li>
      <li :class="{ active: step >= 3 }"><span>3</span> 发布或保存草稿</li>
    </ol>
    <AppState :error="error" @retry="batch ? resume(batch.id) : undefined" />
    <button v-if="pendingSave" :disabled="busy" @click="save">查询并恢复本次提交</button>
    <div v-if="step === 1" class="upload-layout">
      <section class="panel upload-panel">
        <a :href="listeningTemplateURL" download="listening-template.docx">下载填写示例</a>
        <h2>上传听读资料</h2>
        <div v-if="!batch" class="row mode-options">
          <label><input v-model="mode" type="radio" value="zip" /> 上传ZIP</label
          ><label><input v-model="mode" type="radio" value="docx" /> DOCX及配套资料</label>
        </div>
        <p v-else class="notice">当前批次：{{ batch.id }} · {{ batch.mode.toUpperCase() }}</p>
        <div
          class="upload-zone"
          :class="{ drag }"
          @dragover.prevent="drag = true"
          @dragleave.prevent="drag = false"
          @drop.prevent="dropFiles"
        >
          <h3>
            {{ mode === 'zip' ? '选择或拖入单个 / 多个ZIP' : '选择DOCX、完整英文音频及可选原图' }}
          </h3>
          <p>自动识别资料，缺失字段由管理员补充，不根据文件名猜标题</p>
          <AppFilePicker
            class="file-picker"
            :label="mode === 'zip' ? '选择ZIP文件' : '选择DOCX及配套资料'"
            :accept="mode === 'zip' ? '.zip' : '.docx,.mp3,.m4a,.wav,.aac,.png,.jpg,.jpeg,.webp'"
            multiple
            :disabled="busy || Boolean(pendingSave)"
            @change="chooseFiles"
          />
        </div>
        <p v-if="uploadText" role="status">{{ uploadText }}</p>
        <div v-if="pendingUpload" class="row">
          <button :disabled="busy || Boolean(pendingSave)" @click="sendUpload">
            以原操作重试上传</button
          ><button v-if="batch" :disabled="busy || Boolean(pendingSave)" @click="resume(batch.id)">
            查询实际批次
          </button>
        </div>
        <div v-if="pendingUpload" class="package-queue">
          <div
            v-for="file in pendingUpload.files"
            :key="`${file.name}:${file.size}`"
            class="package-row"
          >
            <div class="between">
              <strong>{{ file.name }}</strong
              ><span>{{ busy ? '正在传输 / 读取' : '结果待确认' }}</span>
            </div>
            <p class="muted small">
              {{ (file.size / 1024 / 1024).toFixed(2) }} MB · 本次合并传输
              {{ uploadPercent === null ? '进度由浏览器实时回传' : `${uploadPercent}%` }}
            </p>
            <progress v-if="uploadPercent !== null" :value="uploadPercent" max="100" />
            <p class="muted small">{{ uploadText }}</p>
          </div>
        </div>
        <div v-if="batch?.packages.length" class="package-queue">
          <h3>已暂存资料包</h3>
          <div v-for="(item, index) in batch.packages" :key="item.id || index" class="package-row">
            <div class="between">
              <strong>{{ item.name || item.id }}</strong
              ><span class="badge">{{ statusLabels[item.state] || item.state }}</span>
            </div>
            <p class="muted small">
              {{ (item.size / 1024 / 1024).toFixed(2) }} MB · 上传完成 ·
              {{ candidates.filter((candidate) => candidate.package_id === item.id).length }} 篇候选
            </p>
            <p v-if="item.error" class="notice error">
              {{ importErrorLabels[item.error] || item.error }}
            </p>
          </div>
        </div>
        <button
          v-if="candidates.length"
          class="primary"
          :disabled="busy || Boolean(pendingSave)"
          @click="step = 2"
        >
          继续核对 {{ candidates.length }} 项
        </button>
      </section>
      <aside class="panel format-guide">
        <h2>按文章文件夹打包</h2>
        <div class="folder-example">
          <strong>听读资料.zip</strong>
          <p>文章文件夹／</p>
          <p>内容.docx</p>
          <p>完整音频.m4a</p>
          <p>原图.png（选填）</p>
          <p>另一篇文章／</p>
          <p>内容.docx</p>
          <p>完整音频.mp3</p>
        </div>
        <h3>DOCX填写内容</h3>
        <ul>
          <li>中文标题、英文标题、英文正文</li>
          <li>全文中文译文，保留自然段</li>
          <li>5组语块、中文释义与替换例句</li>
          <li>分类及主题可在核对时选择</li>
        </ul>
        <p class="muted small">完整音频支持MP3／M4A／WAV／AAC。原图选填，缺图不影响发布</p>
        <p class="muted small">同目录资料优先对应；有多个候选时请人工选择，不自动混配</p>
        <p class="notice">资料缺项可保存待补充草稿；无法读取项单独列出</p>
      </aside>
    </div>
    <section v-if="step === 1 && !batch && recoverable.length" class="panel resume-panel">
      <h2>服务端未完成批次</h2>
      <div v-for="item in recoverable" :key="item.id" class="between">
        <span>{{ item.id }} · {{ item.mode.toUpperCase() }} · {{ item.status }}</span
        ><button :disabled="busy || Boolean(pendingSave)" @click="resume(item.id)">继续处理</button>
      </div>
    </section>
    <template v-if="step === 2 && batch"
      ><div class="between">
        <div>
          <h2>核对本批文章</h2>
          <p class="muted">
            包 {{ batch.packages.length }} 个 · 有效候选 {{ candidates.length }} 项 · 已勾选
            {{ selection.selected.length }} · 可保存 {{ selection.save.length }} · 排除
            {{ selection.excluded }}
          </p>
        </div>
        <button :disabled="busy || Boolean(pendingSave)" @click="step = 1">继续添加资料</button>
      </div>
      <p class="notice">重复资料自动跳过；无法读取项可以移除，不能保存。修改须先成功暂存</p>
      <p class="muted small">
        资料完整 {{ batch.counts.complete ?? 0 }} · 待补充 {{ batch.counts.incomplete ?? 0 }} ·
        自动跳过 {{ batch.counts.duplicate ?? 0 }} · 无法读取 {{ batch.counts.unreadable ?? 0 }} ·
        已保存 {{ batch.counts.saved ?? 0 }} · 已移除 {{ batch.counts.removed ?? 0 }}
      </p>
      <div class="row review-actions">
        <button
          :disabled="busy || Boolean(pendingSave)"
          @click="
            selected = candidates.filter((item) => item.state !== 'saved').map((item) => item.id)
          "
        >
          勾选当前未保存项</button
        ><button :disabled="busy || Boolean(pendingSave)" @click="clearSelection">取消选择</button
        ><button
          class="danger"
          :disabled="busy || !selection.remove.length || Boolean(editing)"
          @click="removeOpen = true"
        >
          批量删除导入项（{{ selection.remove.length }}）
        </button>
      </div>
      <div class="table-wrap review-table">
        <table>
          <colgroup>
            <col class="select-col" />
            <col />
            <col />
            <col />
            <col />
            <col class="action-col" />
          </colgroup>
          <thead>
            <tr>
              <th>选择</th>
              <th>文章</th>
              <th>来源 / 读取结果</th>
              <th>状态</th>
              <th>问题提示</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="item in candidates" :key="item.id"
              ><tr class="candidate" :class="{ expanded: editing?.candidate.id === item.id }">
                <td>
                  <input
                    v-model="selected"
                    type="checkbox"
                    :value="item.id"
                    :disabled="busy || Boolean(pendingSave) || item.state === 'saved'"
                    :aria-label="`选择${item.payload.title_zh || item.path}`"
                  />
                </td>
                <td>
                  <strong>{{ item.payload.title_zh || '标题待补充' }}</strong>
                  <p class="muted small">{{ item.payload.title_en || '英文标题待补充' }}</p>
                  <small class="muted">{{
                    topics.find((topic) => topic.id === item.topic_id)
                      ? topicLabel(topics.find((topic) => topic.id === item.topic_id)!)
                      : '主题待确认'
                  }}</small>
                </td>
                <td>
                  <p>{{ batch.packages.find((source) => source.id === item.package_id)?.name }}</p>
                  <p class="muted small">{{ item.path }}</p>
                  <small
                    >{{ item.payload.body_en ? '英文正文已读取' : '正文待补充' }} · 表达{{
                      item.payload.expressions.length
                    }}组</small
                  >
                </td>
                <td>
                  <span class="badge" :class="item.state">{{
                    statusLabels[item.state] || item.state
                  }}</span>
                </td>
                <td>
                  <p v-if="item.parse_error" class="issue-text">
                    {{ item.parse_error.stage }} · {{ item.parse_error.field }}：{{
                      item.parse_error.message
                    }}
                  </p>
                  <p v-for="issue in item.errors" :key="issue" class="issue-text">
                    {{ importErrorLabels[issue] || issue }}
                  </p>
                  <p v-if="item.duplicate_of" class="muted small">
                    与 {{ item.duplicate_of }} 重复，自动跳过
                  </p>
                  <p v-if="item.target_article_id" class="muted small">
                    更新已有文章 · {{ item.target_article_id }} · 草稿版本
                    {{ item.target_revision }}
                  </p>
                  <details
                    v-if="
                      item.resources && Object.values(item.resources).some((items) => items.length)
                    "
                  >
                    <summary>配套素材与未使用文件</summary>
                    <template v-for="(resources, kind) in item.resources" :key="kind"
                      ><p
                        v-for="resource in resources"
                        :key="`${resource.id}:${resource.name}`"
                        class="muted small"
                      >
                        {{ resource.name }} · {{ statusLabels[resource.state] || resource.state }} ·
                        {{
                          resource.id &&
                          [item.payload.audio_id, item.payload.image_id].includes(resource.id)
                            ? '已选用'
                            : '未使用'
                        }}
                        {{ resource.error }}
                      </p></template
                    >
                  </details>
                </td>
                <td>
                  <RouterLink v-if="item.article_id" :to="`/listening/${item.article_id}`">{{
                    item.published_version_id ? '查看已发布文章' : '查看已保存草稿'
                  }}</RouterLink
                  ><template v-else-if="['complete', 'incomplete'].includes(item.state)"
                    ><button
                      class="text"
                      :disabled="busy || Boolean(pendingSave) || Boolean(editing)"
                      @click="editCandidate(item)"
                    >
                      核对 / 补充资料</button
                    ><button
                      type="button"
                      class="text"
                      :disabled="busy || Boolean(pendingSave) || Boolean(editing)"
                      @click="candidatePreview = item"
                    >
                      预览与试听（可选）
                    </button></template
                  >
                </td>
              </tr>
              <tr v-if="editing?.candidate.id === item.id" class="expanded-row">
                <td colspan="6">
                  <div v-if="editing" class="candidate-editor">
                    <h2>核对资料 · {{ editing.candidate.path }}</h2>
                    <ListeningImportTarget
                      v-model="editing.mode"
                      :target="editing.target"
                      :target-revision="editing.targetRevision"
                      :target-error="editing.targetError"
                      :disabled="busy || Boolean(pendingSave)"
                      @select="selectTarget"
                    />
                    <label class="field"
                      >完整音频对应<select
                        v-model="editing.payload.audio_id"
                        aria-label="完整音频对应"
                      >
                        <option :value="null">未选择音频</option>
                        <option
                          v-if="editing.mode === 'update' && editing.target?.payload.audio_id"
                          :value="editing.target.payload.audio_id"
                        >
                          保留目标现有音频
                        </option>
                        <option
                          v-for="resource in editing.candidate.resources?.audio || []"
                          :key="`${resource.id}:${resource.name}`"
                          :value="resource.id"
                          :disabled="resource.state !== 'ready'"
                        >
                          {{ resource.name }} · {{ statusLabels[resource.state] || resource.state }}
                        </option>
                      </select></label
                    >
                    <label class="field"
                      >原图对应（选填）<select
                        v-model="editing.payload.image_id"
                        aria-label="原图对应"
                      >
                        <option :value="null">无原图</option>
                        <option
                          v-if="editing.mode === 'update' && editing.target?.payload.image_id"
                          :value="editing.target.payload.image_id"
                        >
                          保留目标现有配图
                        </option>
                        <option
                          v-for="resource in editing.candidate.resources?.image || []"
                          :key="`${resource.id}:${resource.name}`"
                          :value="resource.id"
                          :disabled="resource.state !== 'ready'"
                        >
                          {{ resource.name }} · {{ statusLabels[resource.state] || resource.state }}
                        </option>
                      </select></label
                    >
                    <p v-if="!topics.length" class="notice">
                      当前没有可选主题，请先到<RouterLink to="/listening/topics"
                        >主题管理</RouterLink
                      >创建主题，再返回本批选择所属主题
                    </p>
                    <ListeningContentForm
                      :ref="setCandidateForm"
                      v-model="editing.payload"
                      v-model:topic="editing.topic"
                      :topics="topics"
                      compact
                      :disabled="busy || Boolean(pendingSave)"
                    />
                    <section
                      v-if="editing.mode === 'update' && editing.target"
                      class="target-difference"
                    >
                      <h3>更新前后差异核对</h3>
                      <ListeningImportDifference
                        :before="{
                          topic_id: editing.target.topic_id,
                          payload: editing.target.payload
                        }"
                        :after="{ topic_id: editing.topic || null, payload: editing.payload }"
                        :topics="topics"
                      />
                    </section>
                    <div class="row">
                      <button :disabled="busy || Boolean(pendingSave)" @click="editing = null">
                        放弃本次修改</button
                      ><button
                        class="primary"
                        :disabled="busy || Boolean(pendingSave)"
                        @click="saveCandidate"
                      >
                        保存到本批暂存
                      </button>
                    </div>
                  </div>
                </td>
              </tr></template
            >
          </tbody>
        </table>
      </div>
      <p v-if="!candidates.length" class="notice">本批没有可保存候选，可继续添加资料</p>
      <div class="review-footer">
        <span class="muted"
          >已勾选{{ selection.selected.length }}项，可存草稿{{ selection.save.length }}篇，可发布{{
            selection.publish.length
          }}篇</span
        >
        <div class="row">
          <button
            :disabled="busy || !selection.save.length || Boolean(editing) || Boolean(pendingSave)"
            @click="next('draft')"
          >
            保存为草稿</button
          ><button
            class="primary"
            :disabled="
              busy || !selection.publish.length || Boolean(editing) || Boolean(pendingSave)
            "
            @click="next('publish')"
          >
            发布所选合格文章（{{ selection.publish.length }}篇）
          </button>
        </div>
      </div></template
    >
    <section v-if="result && batch" class="panel submission-results" data-submission-results>
      <h2>{{ submitAction === 'publish' ? '本次发布结果' : '本次保存结果' }}</h2>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>文章</th>
              <th>结果 / 问题</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="item in result.items"
              :key="item.candidate_id"
              :class="{ 'failed-row': item.status === 'failed' }"
            >
              <td>
                {{
                  batch.candidates.find((candidate) => candidate.id === item.candidate_id)?.payload
                    .title_zh || item.candidate_id
                }}
              </td>
              <td>
                {{
                  item.status === 'success'
                    ? submitAction === 'publish'
                      ? '已发布'
                      : '已保存草稿'
                    : item.status === 'skipped'
                      ? '已跳过相同资料'
                      : '失败'
                }}
                {{ item.error ? importErrorLabels[item.error] || item.error : '' }}
              </td>
              <td>
                <RouterLink v-if="item.article_id" :to="`/listening/${item.article_id}`"
                  >查看文章</RouterLink
                >
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="row">
        <RouterLink class="button-link" to="/listening">返回文章管理</RouterLink
        ><button
          v-if="result.items.some((item) => item.status === 'failed')"
          :disabled="busy || Boolean(pendingSave)"
          @click="retryFailed"
        >
          查询并仅核对原失败项</button
        ><button :disabled="busy || Boolean(pendingSave)" @click="backToReview">返回核对</button>
      </div>
    </section>
    <ElDialog
      v-model="removeOpen"
      :title="`确认删除${selection.remove.length}个导入候选`"
      width="680px"
      :close-on-click-modal="false"
      :show-close="!busy"
      ><p class="notice warning">
        只移除本批未保存候选，不删除源ZIP或已入库文章；移除后旧保存确认失效
      </p>
      <div class="confirmation-objects">
        <div v-for="item in selectedCandidates" :key="item.id" class="object-card">
          {{ item.payload?.title_zh || item.path }} · {{ statusLabels[item.state] }}
        </div>
      </div>
      <template #footer
        ><button :disabled="busy || Boolean(pendingSave)" @click="removeOpen = false">取消</button
        ><button class="danger" :disabled="busy || Boolean(pendingSave)" @click="removeCandidates">
          确认删除{{ selection.remove.length }}项
        </button></template
      ></ElDialog
    >
    <ElDialog
      :model-value="Boolean(candidatePreview)"
      title="本批候选只读预览"
      width="1180px"
      class="candidate-preview"
      body-class="preview-body"
      destroy-on-close
      @update:model-value="candidatePreview = null"
      ><template v-if="candidatePreview && batch"
        ><ListeningTimeline
          :batch-id="batch.id"
          :candidate-id="candidatePreview.id"
          :revision="batch.revision"
          @changed="candidatePreview.timeline = $event" /><ListeningPreviewPanel
          :article="candidatePreview"
          :media-base="listeningImportMediaBase(batch.id)" /></template
    ></ElDialog>
  </div>
</template>
<style scoped lang="scss">
.listening-import {
  .candidate-preview :deep(.preview-body) {
    max-height: 72vh;
    overflow: auto;
  }

  .steps {
    display: flex;
    gap: 24px;
    list-style: none;
    padding: 0 0 24px;
    border-bottom: 1px solid var(--line);
    margin-bottom: 24px;

    li {
      color: var(--muted);
      display: flex;
      align-items: center;
      gap: 9px;
      flex: 1;

      span {
        display: grid;
        place-items: center;
        width: 28px;
        height: 28px;
        border: 1px solid var(--line);
        border-radius: 50%;
        background: var(--paper);
      }
    }

    :where(.active) {
      font-weight: 600;
      color: var(--green);

      span {
        background: var(--action);
        border-color: var(--action);
      }
    }
  }

  .mode-options {
    margin: 20px 0;

    label {
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }

    input {
      min-height: 0;
      width: 18px;
    }
  }

  .upload-layout {
    display: grid;
    grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr);
    gap: 22px;
    align-items: start;
  }

  .format-guide {
    padding: 22px;

    h2 {
      font-size: 17px;
    }

    h3 {
      font-size: 14px;
      margin: 20px 0 12px;
    }

    ul {
      padding-left: 20px;
      font-size: 12px;
      line-height: 2;
    }

    > p {
      margin-top: 16px;
    }
  }

  .folder-example {
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 16px;
    margin-top: 20px;
    font-size: 12px;
    line-height: 1.9;
  }

  .package-row {
    padding: 16px 0;
    border-bottom: 1px solid var(--line);

    p {
      margin-top: 8px;
    }

    progress {
      width: 100%;
      accent-color: var(--green);
    }
  }

  .review-table {
    table {
      table-layout: fixed;
    }

    th {
      font-size: 12px;
    }

    th:where(:first-child) {
      width: 56px;
    }

    th:where(:nth-child(2)) {
      width: 21%;
    }

    th:where(:nth-child(3)) {
      width: 22%;
    }

    th:where(:nth-child(4)) {
      width: 95px;
    }

    th:where(:last-child) {
      width: 145px;
    }

    td {
      vertical-align: top;
      overflow-wrap: anywhere;
    }

    :where(.expanded-row) > td {
      padding: 22px;
      background: var(--bg);
    }
  }

  .issue-text {
    color: #946742;
    font-size: 12px;
  }

  .object-card {
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 18px;
    margin: 14px 0;
  }

  .warning {
    background: #fff4d8;
    color: #826036;
    border: 1px solid #ecd6a4;
  }

  .failed-row {
    background: #fff1e8;
  }

  @media (width <= 1000px) {
    .upload-layout {
      grid-template-columns: 1fr;
    }
  }

  .upload-zone {
    text-align: center;
    border: 1px dashed var(--line);
    border-radius: 10px;
    padding: 48px 24px;
    margin: 24px 0;
    background: var(--bg);

    &.drag {
      background: var(--soft);
    }

    p {
      margin: 12px 0;
      color: var(--muted);
    }
  }

  .file-picker {
    display: block;
    max-width: 360px;
    margin: 20px auto 0;
  }

  .resume-panel {
    margin-top: 24px;

    .between {
      margin-top: 16px;
    }
  }

  .review-actions {
    margin: 20px 0;
    flex-wrap: wrap;
  }

  .candidate {
    margin: 16px 0;

    p {
      margin: 10px 0;
    }
  }

  .candidate-heading {
    display: flex;
    gap: 14px;
    align-items: center;

    small {
      display: block;
      color: var(--muted);
    }
  }

  .candidate-editor {
    margin: 24px 0;
  }

  .review-table {
    isolation: isolate;

    table {
      min-width: 1180px;
      table-layout: fixed;
    }

    .select-col {
      width: 46px;
    }

    .action-col {
      width: 180px;
    }

    :where(th:last-child),
    :where(tr:not(.expanded-row) td:last-child) {
      position: sticky;
      right: 0;
      z-index: 2;
      box-shadow: -1px 0 var(--line);
    }

    :where(tr:not(.expanded-row) td:last-child) {
      background: var(--paper);
    }

    td {
      overflow-wrap: anywhere;
    }
  }

  .review-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    position: sticky;
    bottom: 0;
    padding: 18px 0;
    background: var(--bg);
  }
}
</style>
