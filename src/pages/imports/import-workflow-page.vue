<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'

import AppState from '@/components/app-state/app-state.vue'
import { useImportStaging } from '@/composables/use-import-staging'
import { useWordPronunciation } from '@/composables/use-word-pronunciation'
import ImportAssetPicker from '@/features/imports/import-asset-picker.vue'
import ImportReviewList from '@/features/imports/import-review-list.vue'
import ImportSaveStep from '@/features/imports/import-save-step.vue'
import ImportTargetPicker from '@/features/imports/import-target-picker.vue'
import ImportUploadPanel from '@/features/imports/import-upload-panel.vue'
import SceneContentForm from '@/features/scenes/scene-content-form.vue'
import SceneReader from '@/features/scenes/scene-reader.vue'
import { dateText, queryURL } from '@/services/display'
import { api, ApiError } from '@/services/http-client'
import { registerLogoutGuard } from '@/services/logout-guard'
import { loadPronunciation } from '@/services/pronunciation-service'

import type { CardView } from '@/features/scenes/editor-model'
import type { components } from '@/shared/contracts/generated/admin-api'
import type {
  ImportBatch,
  ImportConfirmation,
  ImportEntry,
  ImportItem
} from '@/shared/types/import'
const route = useRoute(),
  router = useRouter()
const batch = ref<ImportBatch | null>(null),
  recent = ref<ImportBatch[]>([]),
  step = ref(1),
  activeId = ref(''),
  loading = ref(true),
  busy = ref(false),
  uploading = ref(false),
  editingMedia = ref(false),
  error = ref(''),
  notice = ref(''),
  polling = ref(false),
  showResults = ref(false),
  showPreview = ref(false),
  targetOpen = ref(false),
  leaveOpen = ref(false)
const limits = ref<components['schemas']['UploadConfiguration'] | null>(null),
  confirmation = ref<ImportConfirmation | null>(null),
  conflictLatest = ref<ImportItem | null>(null)
const staging = useImportStaging(() => batch.value?.id || '')
const stagedSpeech = useWordPronunciation(async (wordId, live) => {
  const entry = active.value,
    id = batch.value?.id
  if (!entry || !id || editingMedia.value || !(await staging.save(entry)))
    throw new Error('请先完成核对暂存后试听')
  if (staging.isDirty(entry) && !(await staging.save(entry)))
    throw new Error('最新修改尚未暂存，请重试')
  if (!live() || active.value?.item.id !== entry.item.id || staging.isDirty(entry))
    throw new Error('资料已变化，请重新点击词汇')
  const path = `/api/admin/v1/imports/${encodeURIComponent(id)}/items/${encodeURIComponent(entry.item.id)}/words/${encodeURIComponent(wordId)}/pronunciation`
  const url = await loadPronunciation(
    {
      active: live,
      pause: () => new Promise((resolve) => setTimeout(resolve, 1000)),
      request: (method, path, reference) =>
        api.request<components['schemas']['SpeechState']>(
          method === 'GET' ? queryURL(path, reference) : path,
          method === 'POST' ? { method, body: reference } : {}
        )
    },
    path,
    { revision: entry.item.revision }
  )
  if (!url.startsWith('/api/admin/v1/')) throw new Error('发音地址暂不可用')
  return (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '') + url
})
const pronunciation = computed(() => ({
  current: stagedSpeech.current.value,
  status: stagedSpeech.status.value,
  error: stagedSpeech.error.value
}))
const entries = computed(
  () =>
    batch.value?.items
      .map((item) => staging.entries[item.id])
      .filter((entry): entry is ImportEntry => !!entry) || []
)
const active = computed(
  () =>
    staging.entries[activeId.value] ||
    entries.value.find((entry) => entry.item.readable) ||
    entries.value[0]
)
const processing = computed(() => !!batch.value?.files.some((file) => file.state === 'processing'))
const savingItems = computed(() => entries.value.some((entry) => entry.item.state === 'saving'))
const selectedCount = computed(
  () =>
    entries.value.filter(
      (entry) =>
        entry.edit.selected &&
        entry.item.readable &&
        !['saved', 'duplicate'].includes(entry.item.state)
    ).length
)
const dirty = computed(() => entries.value.some((entry) => staging.isDirty(entry) || entry.saving))
const counts = computed(() => ({
  saved: entries.value.filter((entry) => entry.item.state === 'saved').length,
  failed: entries.value.filter((entry) => entry.item.state === 'failed').length,
  skipped: entries.value.filter((entry) => entry.item.state === 'duplicate').length,
  excluded: entries.value.filter(
    (entry) => !entry.edit.selected && entry.item.state !== 'duplicate'
  ).length
}))
const exampleURL = `${(import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')}/api/admin/v1/imports/example`
const autosaves = new Map<string, ReturnType<typeof setTimeout>>()
let alive = true,
  pollRun = 0,
  creating: { key: string; mode: 'zip' | 'docx'; unknown: boolean } | null = null,
  saving: { key: string; body: components['schemas']['AcceptSave']; unknown: boolean } | null =
    null,
  pendingLeave: ((allow: boolean) => void) | null = null
/** 合并持久状态而不覆盖未暂存输入
 * @param value 最新批次
 */
const accept = (value: ImportBatch) => {
  batch.value = value
  staging.merge(value)
  if (!activeId.value)
    activeId.value = value.items.find((item) => item.readable)?.id || value.items[0]?.id || ''
}
/** 有限读取文件与逐卡保存状态，离开只停止本地查询 */
const poll = async () => {
  if (!batch.value) return
  const id = batch.value.id,
    run = ++pollRun
  polling.value = true
  try {
    for (let count = 0; count < 20 && alive && run === pollRun; count++) {
      const value = await api.request<ImportBatch>(`/api/admin/v1/imports/${id}`)
      if (!alive || run !== pollRun || batch.value?.id !== id) return
      accept(value)
      if (!processing.value && !savingItems.value) return
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
    if (alive && run === pollRun) notice.value = '已接收的资料仍在处理，可稍后刷新或离开后恢复'
  } catch (reason) {
    if (alive && run === pollRun)
      error.value = reason instanceof Error ? reason.message : '结果暂未获取'
  } finally {
    if (alive && run === pollRun) polling.value = false
  }
}
/** 载入最近批次和本环境上传配置 */
const load = async () => {
  loading.value = true
  error.value = ''
  try {
    const [values, configuration] = await Promise.all([
      api.request<ImportBatch[]>('/api/admin/v1/imports'),
      api.request<components['schemas']['UploadConfiguration']>('/api/admin/v1/media/configuration')
    ])
    if (!alive) return
    recent.value = values
    limits.value = configuration
    const id = String(route.query.batch || '')
    if (id) await resume(id)
  } catch (reason) {
    if (alive) error.value = reason instanceof Error ? reason.message : '导入记录暂未获取'
  } finally {
    if (alive) loading.value = false
  }
}
/** 恢复已接收文件与逐卡暂存
 * @param id 选择恢复的批次
 */
const resume = async (id: string) => {
  busy.value = true
  error.value = ''
  try {
    const value = await api.request<ImportBatch>(`/api/admin/v1/imports/${id}`)
    if (!alive) return
    accept(value)
    showResults.value = value.items.some((item) =>
      ['saved', 'saving', 'failed'].includes(item.state)
    )
    step.value = showResults.value ? 3 : value.items.some((item) => item.readable) ? 2 : 1
    await router.replace({ query: { batch: id } })
    void poll()
  } catch (reason) {
    if (alive) error.value = reason instanceof Error ? reason.message : '恢复失败，请重试'
  } finally {
    if (alive) busy.value = false
  }
}
/** 明确选择一种新批次上传方式，未知结果复用原创建操作
 * @param mode ZIP或独立DOCX方式
 */
const create = async (mode: 'zip' | 'docx') => {
  if (busy.value) return
  if (creating && creating.mode !== mode) {
    error.value = '请先确认上次创建结果再切换上传方式'
    return
  }
  busy.value = true
  error.value = ''
  creating ||= { key: crypto.randomUUID(), mode, unknown: false }
  try {
    let value: ImportBatch | null = null
    if (creating.unknown) {
      try {
        const receipt = await api.request<components['schemas']['OperationResponse']>(
          `/api/admin/v1/operations/${creating.key}`
        )
        value = receipt.result as ImportBatch
      } catch (reason) {
        if (!(reason instanceof ApiError) || reason.status !== 404) throw reason
      }
    }
    value ||= await api.request<ImportBatch>('/api/admin/v1/imports', {
      method: 'POST',
      key: creating.key,
      body: { mode }
    })
    if (!alive) return
    accept(value)
    creating = null
    await router.replace({ query: { batch: value.id } })
  } catch (reason) {
    if (creating) creating.unknown = true
    if (alive)
      error.value = reason instanceof Error ? reason.message : '创建结果待确认，请重试原方式'
  } finally {
    if (alive) busy.value = false
  }
}
/** 清除本地状态后开始新批次，旧结果继续留在服务器 */
const startNew = async () => {
  if (!(await confirmLeaving())) return
  pollRun++
  polling.value = false
  for (const timer of autosaves.values()) clearTimeout(timer)
  autosaves.clear()
  batch.value = null
  staging.clear()
  activeId.value = ''
  confirmation.value = null
  saving = null
  showResults.value = false
  step.value = 1
  await router.replace({ query: {} })
}
/** 延迟暂存某一资料，切换查看其他卡片不会丢失该记录
 * @param entry 被修改的独立导入资料
 */
const schedule = (entry: ImportEntry) => {
  const old = autosaves.get(entry.item.id)
  if (old) clearTimeout(old)
  if (!staging.isDirty(entry) || entry.conflict || !entry.item.readable) return
  confirmation.value = null
  saving = null
  const timer = setTimeout(async () => {
    autosaves.delete(entry.item.id)
    if (!alive) return
    if (editingMedia.value && activeId.value === entry.item.id) {
      schedule(entry)
      return
    }
    if (await staging.save(entry)) {
      if (staging.isDirty(entry)) schedule(entry)
    }
  }, 600)
  autosaves.set(entry.item.id, timer)
}
watch(
  () => active.value?.edit,
  () => {
    if (active.value) {
      if (staging.isDirty(active.value)) stagedSpeech.stop()
      schedule(active.value)
    }
  },
  { deep: true }
)
watch(activeId, () => stagedSpeech.stop())
watch(editingMedia, (value) => {
  if (!value && active.value) schedule(active.value)
})
/** 显式改变待保存范围后写入导入暂存
 * @param entry 该行资料
 * @param event 复选框操作
 */
const selectEntry = (entry: ImportEntry, event: Event) => {
  entry.edit.selected = (event.target as HTMLInputElement).checked
  schedule(entry)
}
/** 保留各卡编辑值，上传进行中要求先完成或取消
 * @param id 将展开的资料编号
 */
const switchEntry = (id: string) => {
  if (editingMedia.value) {
    ElMessage.info('请先等待或取消当前素材上传')
    return
  }
  activeId.value = id
}
/** 上传处理完成后形成明确名称的素材候选，再进入核对 */
const review = async () => {
  if (!batch.value || busy.value || uploading.value || editingMedia.value || processing.value)
    return
  busy.value = true
  error.value = ''
  try {
    if (!(await staging.flush())) throw new Error('请先保存或处理未暂存的修改')
    const value = await api.request<ImportBatch>(
      `/api/admin/v1/imports/${batch.value.id}/resolve`,
      { method: 'POST' }
    )
    if (!alive) return
    accept(value)
    if (!value.items.some((item) => item.readable))
      throw new Error('没有读到可恢复卡片，请检查文件及修正建议')
    step.value = 2
  } catch (reason) {
    if (alive) error.value = reason instanceof Error ? reason.message : '暂未完成核对准备'
  } finally {
    if (alive) busy.value = false
  }
}
/** 所有核对修改落盘后生成绑定当前版本的确认范围 */
const next = async () => {
  if (!batch.value || busy.value || editingMedia.value || uploading.value) return
  busy.value = true
  error.value = ''
  try {
    for (const timer of autosaves.values()) clearTimeout(timer)
    autosaves.clear()
    if (!(await staging.flush())) throw new Error('部分修改尚未暂存，请保留输入并重试或处理冲突')
    const value = await api.request<ImportConfirmation>(
      `/api/admin/v1/imports/${batch.value.id}/confirmation`
    )
    if (!alive) return
    confirmation.value = value
    saving = null
    showResults.value = false
    step.value = 3
  } catch (reason) {
    if (alive) error.value = reason instanceof Error ? reason.message : '暂未获取保存范围'
  } finally {
    if (alive) busy.value = false
  }
}
/** 只提交管理员确认的冻结范围，成功项在服务端自动跳过 */
const save = async () => {
  if (!batch.value || !confirmation.value?.count || busy.value) return
  busy.value = true
  error.value = ''
  saving ||= {
    key: crypto.randomUUID(),
    body: { version: confirmation.value.version, confirmed: true },
    unknown: false
  }
  try {
    let value: ImportBatch | null = null
    if (saving.unknown) {
      try {
        const receipt = await api.request<components['schemas']['OperationResponse']>(
          `/api/admin/v1/operations/${saving.key}`
        )
        value = receipt.result as ImportBatch
      } catch (reason) {
        if (!(reason instanceof ApiError) || reason.status !== 404) throw reason
      }
    }
    value ||= await api.request<ImportBatch>(`/api/admin/v1/imports/${batch.value.id}/save`, {
      method: 'POST',
      key: saving.key,
      body: saving.body
    })
    if (!alive) return
    accept(value)
    saving = null
    showResults.value = true
    confirmation.value = null
    void poll()
  } catch (reason) {
    if (saving)
      saving.unknown =
        !(reason instanceof ApiError) ||
        !reason.status ||
        reason.status >= 500 ||
        reason.code === 'response_unknown'
    if (reason instanceof ApiError && reason.status === 409) {
      confirmation.value = null
      saving = null
    }
    if (alive)
      error.value = reason instanceof Error ? reason.message : '保存接收结果待确认，请重试原操作'
  } finally {
    if (alive) busy.value = false
  }
}
/** 确认更新目标后，绑定最新目标修订并重新暂存
 * @param card 管理员已比较并确认的目标候选
 */
const target = (card: CardView) => {
  if (!active.value) return
  active.value.reviewedContent = JSON.stringify(active.value.edit.content)
  active.value.edit.target_card_id = card.id
  active.value.edit.target_revision = card.draft_revision
  active.value.edit.update_confirmed = true
  targetOpen.value = false
  schedule(active.value)
}
/** 再次查看已经保存的逐卡结果 */
const showSavedResults = () => {
  showResults.value = true
  step.value = 3
}
/** 撤销当前更新目标，不按名称合并 */
const clearTarget = () => {
  if (!active.value) return
  active.value.edit.target_card_id = null
  active.value.edit.target_revision = null
  active.value.edit.update_confirmed = false
}
/** 返回同批核对，原保存范围确认失效 */
const backToReview = () => {
  step.value = 2
  confirmation.value = null
}
/** 获取冲突版本供管理员明确选择，保留现有本地输入 */
const inspectConflict = async () => {
  if (!batch.value || !active.value) return
  error.value = ''
  try {
    const value = await api.request<ImportBatch>(`/api/admin/v1/imports/${batch.value.id}`)
    conflictLatest.value = value.items.find((item) => item.id === active.value?.item.id) || null
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '最新核对资料暂不可读'
  }
}
/** 冲突比较后采用管理员明确选择
 * @param keepLocal 是否以最新修订重新保存本地资料
 */
const resolveConflict = (keepLocal: boolean) => {
  if (!conflictLatest.value) return
  staging.resolveConflict(conflictLatest.value, keepLocal)
  conflictLatest.value = null
  if (active.value && keepLocal) schedule(active.value)
}
/** 导航与注销共用暂存保护，已落盘资料无需再次确认
 * @returns 是否可以离开
 */
const confirmLeaving = (): Promise<boolean> => {
  if (uploading.value || editingMedia.value || busy.value) {
    ElMessage.info('请先完成或取消当前操作')
    return Promise.resolve(false)
  }
  if (!dirty.value) return Promise.resolve(true)
  leaveOpen.value = true
  return new Promise((resolve) => {
    pendingLeave = resolve
  })
}
/** 处理未落盘资料的三个选择
 * @param choice 继续核对、保存暂存后离开或放弃未落盘输入
 */
const leave = async (choice: 'continue' | 'save' | 'discard') => {
  if (choice === 'save') {
    busy.value = true
    const saved = await staging.flush()
    busy.value = false
    if (!saved) return
  }
  if (choice === 'discard') for (const timer of autosaves.values()) clearTimeout(timer)
  leaveOpen.value = false
  pendingLeave?.(choice !== 'continue')
  pendingLeave = null
}
/** 浏览器关闭时提示尚未落盘的修改
 * @param event 原生离开事件
 */
const beforeUnload = (event: BeforeUnloadEvent) => {
  if (dirty.value || uploading.value || editingMedia.value) {
    event.preventDefault()
    event.returnValue = ''
  }
}
const releaseLogout = registerLogoutGuard(confirmLeaving)
onBeforeRouteLeave((to) => (to.path === '/login' ? true : confirmLeaving()))
onMounted(() => {
  void load()
  window.addEventListener('beforeunload', beforeUnload)
})
onBeforeUnmount(() => {
  alive = false
  pollRun++
  releaseLogout()
  for (const timer of autosaves.values()) clearTimeout(timer)
  window.removeEventListener('beforeunload', beforeUnload)
  pendingLeave?.(false)
})
</script>
<template>
  <div class="import-page">
    <div class="page-heading between">
      <div>
        <h1>批量导入</h1>
        <p>导入只保存草稿，发布需在卡片管理中确认</p>
      </div>
      <button
        v-if="batch"
        type="button"
        :disabled="busy || uploading || editingMedia"
        @click="startNew"
      >
        开始新的导入
      </button>
    </div>
    <ol class="import-steps">
      <li
        v-for="(label, index) in ['上传资料', '核对卡片', '保存草稿']"
        :key="label"
        :class="{ active: step === index + 1 }"
      >
        <span>{{ index + 1 }}</span
        >{{ label }}
      </li>
    </ol>
    <AppState :busy="loading" />
    <p v-if="error" class="notice error" role="alert">
      {{ error }}<button v-if="!batch" class="text" @click="load">重新获取</button>
    </p>
    <p v-if="notice" class="notice">{{ notice }}</p>
    <template v-if="!loading">
      <template v-if="!batch">
        <div v-if="recent.length" class="notice between">
          <span>有未完成导入或已有结果 · {{ dateText(recent[0]?.created_at) }}</span>
          <div class="row">
            <button
              type="button"
              data-action="resume-import"
              :disabled="busy"
              @click="resume(recent[0]!.id)"
            >
              继续处理</button
            ><button type="button" class="text" @click="recent = []">开始新的导入</button>
          </div>
        </div>
        <details v-if="recent.length > 1" class="panel">
          <summary>其他最近导入</summary>
          <div v-for="value in recent.slice(1)" :key="value.id" class="between">
            <span class="small"
              >{{ dateText(value.created_at) }} ·
              {{ value.mode === 'zip' ? 'ZIP资料' : 'DOCX资料' }} · {{ value.items.length }}张</span
            ><button type="button" class="text" :disabled="busy" @click="resume(value.id)">
              恢复这次导入
            </button>
          </div>
        </details>
        <section class="panel">
          <a :href="exampleURL" class="text example-link" download>下载填写示例</a>
          <h2>选择本批上传方式</h2>
          <div class="mode-options">
            <button type="button" :disabled="busy" @click="create('zip')">
              <strong>上传ZIP</strong
              ><span>一张卡片一个文件夹，包含内容、场景图和完整音频</span></button
            ><button type="button" :disabled="busy" @click="create('docx')">
              <strong>上传DOCX及配套资料</strong><span>一份或多份DOCX，另选图片与完整音频</span>
            </button>
          </div>
          <p class="small muted">
            完整音频支持 MP3 / M4A / WAV / AAC，ZIP 内也可直接放入 WAV 文件。
          </p>
        </section>
      </template>
      <template v-else>
        <div v-show="step === 1">
          <a :href="exampleURL" class="text example-link" download>下载填写示例</a
          ><ImportUploadPanel
            :key="batch.id"
            :batch="batch"
            :disabled="busy"
            @refresh="poll"
            @uploading="uploading = $event"
          />
          <footer class="editor-actions">
            <span class="small muted">{{
              processing
                ? '正在读取资料，可稍后刷新'
                : batch.items.some((item) => item.readable)
                  ? '已读取的资料可进入核对'
                  : '请先上传可读取的DOCX或ZIP'
            }}</span
            ><button type="button" :disabled="polling" @click="poll">刷新处理结果</button
            ><button
              type="button"
              class="primary"
              :disabled="
                busy || uploading || processing || !batch.items.some((item) => item.readable)
              "
              @click="review"
            >
              进入核对
            </button>
          </footer>
        </div>
        <section v-if="step === 2" class="review-step">
          <div class="between review-heading">
            <span
              >共{{ entries.length }}张 · 资料完整{{
                entries.filter(
                  (entry) =>
                    entry.item.readable &&
                    !entry.item.issues.length &&
                    entry.item.state !== 'duplicate'
                ).length
              }}
              · 待补充{{
                entries.filter(
                  (entry) =>
                    entry.item.readable &&
                    entry.item.issues.length &&
                    entry.item.state !== 'duplicate'
                ).length
              }}
              · 重复{{ counts.skipped }} · 无法读取{{
                entries.filter((entry) => !entry.item.readable).length
              }}</span
            ><button type="button" :disabled="editingMedia || busy" @click="step = 1">
              返回补充文件
            </button>
          </div>
          <div class="review-layout">
            <ImportReviewList
              :entries="entries"
              :active-id="active?.item.id"
              :busy="busy"
              :dirty-ids="
                entries.filter((entry) => staging.isDirty(entry)).map((entry) => entry.item.id)
              "
              @select="selectEntry"
              @expand="switchEntry"
            />
            <div v-if="active" class="review-detail">
              <template v-if="active.item.readable"
                ><div class="panel between">
                  <div>
                    <h2>{{ active.edit.content.name || '核对资料' }}</h2>
                    <p class="small muted">
                      {{
                        active.edit.target_card_id
                          ? '已明确选择更新已有卡片草稿'
                          : active.item.suggested_target_id
                            ? '此资料已有对应卡片，请明确核对是否更新'
                            : '新增草稿；名称相同不会自动合并'
                      }}
                    </p>
                  </div>
                  <div class="row">
                    <button
                      type="button"
                      :disabled="busy || editingMedia"
                      @click="targetOpen = true"
                    >
                      选择更新目标／核对差异</button
                    ><button
                      v-if="active.edit.target_card_id"
                      type="button"
                      class="text"
                      @click="clearTarget"
                    >
                      改为新增</button
                    ><button
                      type="button"
                      :disabled="busy || editingMedia || dirty"
                      @click="showPreview = true"
                    >
                      预览核对
                    </button>
                  </div>
                </div>
                <p v-if="active.error" class="notice error" role="alert">
                  {{ active.error
                  }}<button
                    v-if="active.conflict"
                    type="button"
                    class="text"
                    @click="inspectConflict"
                  >
                    核对最新暂存</button
                  ><button
                    v-else
                    type="button"
                    class="text"
                    :disabled="active.saving"
                    @click="staging.save(active)"
                  >
                    重试暂存
                  </button>
                </p>
                <ImportAssetPicker
                  v-model="active.edit.content"
                  :batch="batch"
                  :item-id="active.item.id"
                  :disabled="busy"
                />
                <SceneContentForm
                  :key="active.item.id"
                  v-model="active.edit.content"
                  :limits="limits"
                  :pronunciation="pronunciation"
                  :pronunciation-disabled="busy || editingMedia"
                  :save-before-pronounce="staging.isDirty(active)"
                  save-before-pronounce-label="暂存并试听"
                  :disabled="busy || active.item.state === 'saving'"
                  @pronounce="stagedSpeech.play"
                  @uploading="editingMedia = $event"
                />
              </template>
              <div v-else class="panel notice error">
                <h2>此资料无法读取</h2>
                <p v-for="issue in active.item.issues" :key="issue.code">{{ issue.message }}</p>
                <p>请返回上一步上传修正文件；其他可读资料可以继续保存。</p>
              </div>
            </div>
          </div>
          <footer class="editor-actions">
            <span class="small muted"
              >已选{{ selectedCount }}张 ·
              {{
                dirty ? '核对改动正在暂存，失败输入会保留' : '核对改动已暂存，可离开后恢复'
              }}</span
            ><button
              v-if="entries.some((entry) => entry.item.saved_card_id)"
              type="button"
              :disabled="busy || dirty || editingMedia"
              @click="showSavedResults"
            >
              查看保存结果</button
            ><button
              type="button"
              class="primary"
              data-action="review-next"
              :disabled="busy || editingMedia || !selectedCount"
              @click="next"
            >
              核对完成，下一步
            </button>
          </footer>
        </section>
        <ImportSaveStep
          v-if="step === 3"
          :entries="entries"
          :batch-id="batch.id"
          :confirmation="confirmation"
          :show-results="showResults"
          :busy="busy"
          :saving="savingItems"
          :polling="polling"
          @back="backToReview"
          @save="save"
          @refresh="poll"
          @retry="next"
        />
      </template>
    </template>
    <ImportTargetPicker
      v-if="targetOpen && active"
      :content="active.edit.content"
      :suggested-id="active.edit.target_card_id || active.item.suggested_target_id"
      @close="targetOpen = false"
      @confirm="target"
    />
    <ElDialog
      v-if="showPreview && active"
      :model-value="true"
      title="导入核对预览 · 尚未保存为卡片草稿"
      width="430px"
      @close="showPreview = false"
      ><SceneReader
        :content="active.edit.content"
        :pronunciation="
          batch
            ? {
                import: { batchId: batch.id, itemId: active.item.id },
                reference: { revision: active.item.revision }
              }
            : undefined
        "
      /><template #footer
        ><button type="button" @click="showPreview = false">返回核对</button></template
      ></ElDialog
    >
    <ElDialog
      v-if="conflictLatest && active"
      :model-value="true"
      title="核对暂存版本冲突"
      width="min(1000px,95vw)"
      @close="conflictLatest = null"
      ><p>请比较后明确选择。本地未提交输入仍保留。</p>
      <div class="conflict-content">
        <section>
          <h3>服务器最新暂存</h3>
          <SceneReader :content="conflictLatest.content" />
        </section>
        <section>
          <h3>本地待保存输入</h3>
          <SceneReader :content="active.edit.content" />
        </section>
      </div>
      <template #footer
        ><button @click="conflictLatest = null">继续核对</button
        ><button @click="resolveConflict(false)">采用服务器暂存</button
        ><button class="primary" @click="resolveConflict(true)">
          保留本地，重新暂存
        </button></template
      ></ElDialog
    >
    <ElDialog
      v-model="leaveOpen"
      title="部分核对修改尚未暂存"
      width="510px"
      :show-close="false"
      :close-on-click-modal="false"
      :close-on-press-escape="false"
      ><p>已暂存的资料和已接受任务可恢复。尚未落盘的输入离开后会丢失；放弃不会撤回已提交的保存。</p>
      <template #footer
        ><button :disabled="busy" @click="leave('continue')">继续核对</button
        ><button :disabled="busy" @click="leave('discard')">放弃未暂存修改</button
        ><button class="primary" :disabled="busy" @click="leave('save')">
          暂存后离开
        </button></template
      ></ElDialog
    >
  </div>
</template>
<style scoped lang="scss">
.import-steps {
  display: flex;
  list-style: none;
  padding: 20px 0 26px;
  gap: 70px;

  li {
    display: flex;
    align-items: center;
    gap: 12px;
    color: var(--muted);

    span {
      display: grid;
      place-items: center;
      border: 1px solid var(--line);
      width: 28px;
      height: 28px;
      border-radius: 50%;
    }

    &.active {
      color: var(--green);
      font-weight: 600;

      span {
        color: white;
        background: var(--green);
        border-color: var(--green);
      }
    }
  }
}

.example-link {
  display: inline-block;
  margin-bottom: 22px;
}

.mode-options {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
  margin-top: 26px;

  > button {
    text-align: left;
    padding: 24px;

    strong {
      display: block;
      margin-bottom: 10px;
      font-size: 16px;
    }

    span {
      font-size: 12px;
      color: var(--muted);
      line-height: 1.8;
    }
  }
}

.review-heading {
  font-size: 12px;
  margin-bottom: 18px;
}

.review-layout {
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr);
  gap: 22px;
  align-items: start;
}

.review-detail {
  min-width: 0;

  > .panel > div > p {
    margin-top: 10px;
  }

  > .between {
    align-items: start;
    gap: 16px;

    .row {
      flex-wrap: wrap;
      justify-content: flex-end;
    }
  }
}

.editor-actions {
  align-items: center;

  > span {
    margin-right: auto;
  }
}

.conflict-content {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 18px;
  max-height: 60vh;
  overflow: auto;

  h3 {
    font-size: 13px;
    padding: 14px;
    background: var(--soft);
  }
}
</style>
