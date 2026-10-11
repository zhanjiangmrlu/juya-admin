<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { createSceneMediaAdapter } from '@/features/content-editor/scene-media-adapter'
import ProofreadingSetPanel from '@/features/proofreading/proofreading-set-panel.vue'
import { createShortReadingAdapter } from '@/features/short-reading/short-reading-adapter'
import ShortReadingEditorFields from '@/features/short-reading/short-reading-editor-fields.vue'
import { normalizeShortReading } from '@/features/short-reading/short-reading-model'
import ShortReadingPreview from '@/features/short-reading/short-reading-preview.vue'
import { createIdempotencyKey } from '@/services/api/api-client'
import { useAdminApiClient } from '@/services/api/use-admin-api-client'
import { ApiError } from '@/shared/errors/api-error'

import type { ShortReadingSnapshot } from '@/features/short-reading/short-reading-model'
import type { UploadFile } from 'element-plus'

const route = useRoute()
const router = useRouter()
const id = computed(() => String(route.params.id))
const client = useAdminApiClient()
const adapter = createShortReadingAdapter(client)
const media = createSceneMediaAdapter(client)
const snapshot = shallowRef<ShortReadingSnapshot | null>(null)
const form = ref(normalizeShortReading({}))
const state = ref<'loading' | 'ready' | 'error'>('loading')
const busy = ref(false)
const error = ref('')
const conflict = ref(false)
const coverUrl = ref('')
const audioUrl = ref('')
const previewOpened = ref(false)
const publishOpened = ref(false)
const publishVersion = ref<number | null>(null)
const trialEnabled = ref<boolean | null>(null)
const dirty = computed(
  () => !!snapshot.value && JSON.stringify(form.value) !== JSON.stringify(snapshot.value.content)
)
const editable = computed(() => !snapshot.value || snapshot.value.status === 'DRAFT')
let saveSignature = ''
let saveKey = ''
let generation = 0
let disposed = false
let createKey = createIdempotencyKey()
let publishKey = ''
const /**
   * 显示安全错误并区分版本冲突
   * @param failure - 当前操作异常
   * @returns 当前操作结果或完成状态
   */ fail = (failure: unknown): void => {
    error.value = failure instanceof Error ? failure.message : '操作失败'
    conflict.value = failure instanceof ApiError && failure.status === 409
    publishVersion.value = null
  }
const /** 刷新受控素材 URL 并忽略离页返回
   * @returns 当前操作结果或完成状态
   */ refreshResources = async (): Promise<void> => {
    const current = generation
    const cover = form.value.cover_asset_id
    const asset = form.value.audio?.asset_id
    coverUrl.value = ''
    audioUrl.value = ''
    const results = await Promise.allSettled([
      cover ? media.signedUrl(cover) : Promise.resolve(null),
      asset ? media.signedUrl(asset) : Promise.resolve(null)
    ])
    if (disposed || current !== generation) return
    coverUrl.value = results[0].status === 'fulfilled' ? (results[0].value?.url ?? '') : ''
    audioUrl.value = results[1].status === 'fulfilled' ? (results[1].value?.url ?? '') : ''
    if (results.some((result) => result.status === 'rejected'))
      error.value = '部分素材暂不可试听，请刷新'
  }
const /** 加载独立短文当前草稿
   * @returns 当前操作结果或完成状态
   */ load = async (): Promise<void> => {
    const current = ++generation
    snapshot.value = null
    busy.value = false
    publishOpened.value = false
    form.value = normalizeShortReading({})
    error.value = ''
    conflict.value = false
    state.value = 'loading'
    if (!adapter.available) {
      state.value = 'ready'
      return
    }
    if (id.value === 'new') {
      state.value = 'ready'
      return
    }
    try {
      const result = await adapter.load(id.value)
      if (disposed || current !== generation) return
      snapshot.value = result
      form.value = normalizeShortReading({ ...result.content })
      trialEnabled.value = result.trialEnabled
      state.value = 'ready'
      await refreshResources()
    } catch (failure) {
      if (!disposed && current === generation) {
        fail(failure)
        state.value = 'error'
      }
    }
  }
const /** 保存当前纯阅读草稿，冲突保留所有输入
   * @returns 当前操作结果或完成状态
   */ save = async (): Promise<boolean> => {
    if (!adapter.available || busy.value || conflict.value || !editable.value) return false
    const current = generation
    busy.value = true
    error.value = ''
    try {
      const signature = JSON.stringify([
        snapshot.value?.revisionId,
        snapshot.value?.editVersion,
        form.value
      ])
      if (saveSignature !== signature) {
        saveSignature = signature
        saveKey = createIdempotencyKey()
      }
      const result = snapshot.value
        ? await adapter.save(snapshot.value, form.value, saveKey)
        : await adapter.create(String(route.query.series_id ?? ''), form.value, createKey)
      if (disposed || current !== generation) return false
      snapshot.value = result
      form.value = normalizeShortReading({ ...result.content })
      publishVersion.value = null
      if (id.value === 'new') {
        createKey = createIdempotencyKey()
        await router.replace({ name: 'content-short-reading-edit', params: { id: result.id } })
      }
      ElMessage.success('短文草稿已保存')
      return true
    } catch (failure) {
      if (!disposed && current === generation) fail(failure)
      return false
    } finally {
      if (current === generation) busy.value = false
    }
  }
const /**
   * 上传选填安全封面
   * @param file - 管理员选择的封面图
   * @returns 当前操作结果或完成状态
   */ uploadCover = async (file: UploadFile): Promise<void> => {
    if (!file.raw || busy.value || !adapter.available) return
    busy.value = true
    const current = generation
    try {
      const asset = await media.uploadImage(file.raw)
      if (disposed || current !== generation) return
      form.value.cover_asset_id = asset.id
      await refreshResources()
    } catch (failure) {
      if (!disposed && current === generation) fail(failure)
    } finally {
      if (current === generation) busy.value = false
    }
  }
const /**
   * 上传可选全文音频到当前独立短文
   * @param file - 管理员选择的完整音频
   * @returns 当前操作结果或完成状态
   */ uploadAudio = async (file: UploadFile): Promise<void> => {
    if (!file.raw || !snapshot.value || busy.value) {
      error.value = '请先保存短文草稿再上传音频'
      return
    }
    busy.value = true
    const current = generation
    try {
      const result = await adapter.uploadAudio(snapshot.value.id, file.raw, createIdempotencyKey())
      if (disposed || current !== generation) return
      form.value.audio = result
      await refreshResources()
    } catch (failure) {
      if (!disposed && current === generation) fail(failure)
    } finally {
      if (current === generation) busy.value = false
    }
  }
const /** 保存逐篇试读，不套用场景数量规则
   * @returns 当前操作结果或完成状态
   */ saveTrial = async (): Promise<void> => {
    if (!snapshot.value || trialEnabled.value === null || busy.value || !adapter.available) return
    busy.value = true
    const current = generation
    try {
      const result = await adapter.trial(
        snapshot.value.id,
        trialEnabled.value,
        snapshot.value.trialVersion
      )
      if (disposed || current !== generation || !snapshot.value) return
      snapshot.value = {
        ...snapshot.value,
        version: result.version,
        trialEnabled: result.enabled,
        trialVersion: result.version
      }
      ElMessage.success('本篇试读配置已保存')
    } catch (failure) {
      if (!disposed && current === generation) fail(failure)
    } finally {
      if (current === generation) busy.value = false
    }
  }
const /** 保存并检查这篇固定候选版本
   * @returns 当前操作结果或完成状态
   */ checkPublish = async (): Promise<void> => {
    if (!snapshot.value || (dirty.value && !(await save()))) return
    const current = generation
    busy.value = true
    try {
      const result = await adapter.check(snapshot.value.revisionId)
      if (disposed || current !== generation) return
      if (!result.ready) {
        error.value = result.errors.join('；')
        return
      }
      publishVersion.value = result.version
      publishKey = createIdempotencyKey()
      publishOpened.value = true
    } catch (failure) {
      if (!disposed && current === generation) fail(failure)
    } finally {
      if (current === generation) busy.value = false
    }
  }
const /** 发布已通过检查的这篇固定版本
   * @returns 当前操作结果或完成状态
   */ publish = async (): Promise<void> => {
    if (!snapshot.value || publishVersion.value === null || busy.value) return
    const current = generation
    busy.value = true
    try {
      const result = await adapter.publish(
        snapshot.value.revisionId,
        publishVersion.value,
        publishKey
      )
      if (disposed || current !== generation) return
      snapshot.value = result
      publishOpened.value = false
      publishVersion.value = null
      ElMessage.success('短文版本已发布')
    } catch (failure) {
      if (!disposed && current === generation) fail(failure)
    } finally {
      if (current === generation) busy.value = false
    }
  }
const /** 从已发布版本建立可编辑的新候选
   * @returns 当前操作结果或完成状态
   */ createDraft = async (): Promise<void> => {
    if (!snapshot.value || busy.value) return
    const current = generation
    busy.value = true
    try {
      const result = await adapter.createRevision(snapshot.value, createKey)
      if (disposed || current !== generation) return
      snapshot.value = result
      form.value = normalizeShortReading({ ...result.content })
      createKey = createIdempotencyKey()
    } catch (failure) {
      if (!disposed && current === generation) fail(failure)
    } finally {
      if (current === generation) busy.value = false
    }
  }
const /** 明确移除选填音频并撤销固定文件试听事实 */ removeAudio = (): void => {
    form.value.audio = null
    audioUrl.value = ''
  }
watch(
  () => JSON.stringify([snapshot.value?.version, form.value]),
  () => {
    publishVersion.value = null
    publishOpened.value = false
  }
)
watch(id, load, { immediate: true })
onBeforeUnmount(() => {
  disposed = true
  generation++
  snapshot.value = null
  coverUrl.value = ''
  audioUrl.value = ''
})
</script>
<template>
  <section class="short-reading-editor-page">
    <div class="page-heading">
      <div>
        <h2>独立短文阅读</h2>
        <p>完整英文与全文中文；封面和全文音频选填</p>
      </div>
      <div class="actions">
        <RouterLink :to="{ name: 'content-scenes' }">返回内容列表</RouterLink
        ><ElButton :disabled="busy" @click="previewOpened = true">预览当前输入</ElButton
        ><ElButton
          :disabled="!adapter.available || conflict || !editable"
          :loading="busy"
          type="primary"
          @click="save"
          >保存草稿</ElButton
        ><ElButton
          :disabled="!adapter.available || conflict || !editable"
          :loading="busy"
          @click="checkPublish"
          >检查本篇发布</ElButton
        >
      </div>
    </div>
    <ElAlert
      v-if="!adapter.available"
      title="独立短文服务等待后端装配，当前无法保存或发布"
      type="warning"
      :closable="false"
    />
    <ElAlert v-if="error" :title="error" type="error" :closable="false"
      ><ElButton v-if="conflict || state === 'error'" @click="load"
        >明确放弃本地输入并加载最新草稿</ElButton
      ></ElAlert
    >
    <ElAlert
      v-if="snapshot && !editable"
      title="当前为已发布快照，创建新候选后修改"
      type="info"
      :closable="false"
      ><ElButton :loading="busy" @click="createDraft">创建新候选</ElButton></ElAlert
    >
    <ElSkeleton v-if="state === 'loading'" :rows="10" animated />
    <ShortReadingEditorFields
      v-else
      v-model="form"
      :busy="busy"
      :disabled="!adapter.available || conflict || !editable"
      :audio-disabled="!adapter.audioAvailable"
      :cover-url="coverUrl"
      :audio-url="audioUrl"
      @cover="uploadCover"
      @audio="uploadAudio"
      @refresh="refreshResources"
      @remove-audio="removeAudio"
    />
    <ProofreadingSetPanel
      v-if="snapshot && editable"
      :candidates="[
        {
          contentType: 'short_reading',
          contentId: snapshot.id,
          revisionId: snapshot.revisionId,
          content: { ...snapshot.content },
          contentHash: snapshot.contentHash,
          title: snapshot.content.title_zh || snapshot.content.title_en
        }
      ]"
    />
    <div v-if="snapshot" class="trial">
      <ElRadioGroup v-model="trialEnabled" :disabled="busy"
        ><ElRadio :value="true">允许本篇试读</ElRadio
        ><ElRadio :value="false">关闭本篇试读</ElRadio></ElRadioGroup
      ><small v-if="trialEnabled === null">服务暂未返回当前试读状态，请明确选择目标状态</small
      ><ElButton :disabled="busy" @click="saveTrial">保存试读配置</ElButton
      ><small>逐篇配置，没有场景预览篇数限制</small>
    </div>
    <ElDialog v-model="previewOpened" title="当前输入预览（尚未发布）" width="min(860px, 94vw)"
      ><ShortReadingPreview
        v-if="previewOpened"
        :content="form"
        :cover-url="coverUrl"
        :audio-url="audioUrl"
    /></ElDialog>
    <ElDialog v-model="publishOpened" title="确认发布这篇短文" width="min(560px, 94vw)"
      ><p>{{ form.title_zh }} · {{ form.title_en }}</p>
      <p>仅发布已检查候选版本 v{{ publishVersion }}，不包含其他内容。</p>
      <ElAlert v-if="error" :title="error" type="error" :closable="false" /><template #footer
        ><ElButton :disabled="busy" @click="publishOpened = false">返回修改</ElButton
        ><ElButton
          type="primary"
          :disabled="publishVersion === null"
          :loading="busy"
          @click="publish"
          >确认发布本篇</ElButton
        ></template
      ></ElDialog
    >
  </section>
</template>
<style scoped lang="scss">
.short-reading-editor-page {
  display: grid;
  gap: 18px;
  min-width: 0;

  .page-heading {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: center;
    gap: 16px;

    h2 {
      margin: 0;
      font-size: 22px;
    }

    p {
      color: var(--juya-color-text-secondary);
    }
  }

  .actions,
  .trial {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
  }
}
</style>
