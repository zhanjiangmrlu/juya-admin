<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { computed, onMounted, reactive, ref, shallowRef } from 'vue'
import { useRoute } from 'vue-router'

import { createContentAdapter } from '@/features/content/content-adapter'
import {
  createRevisionController,
  type RevisionController
} from '@/features/content-editor/revision-controller'
import { useAdminApiClient } from '@/services/api/use-admin-api-client'

import type { SceneRevision, SceneSummary } from '@/features/content/content-model'

const route = useRoute()
const sceneId = computed(() => String(route.params.id))
const adapter = createContentAdapter(useAdminApiClient())
const scene = ref<SceneSummary | null>(null)
const revision = ref<SceneRevision | null>(null)
const controller = shallowRef<RevisionController | null>(null)
const currentVersion = computed(() => controller.value?.revision.value ?? 0)
const hasConflict = computed(() => controller.value?.conflict.value ?? false)
const remoteVersion = computed(() => controller.value?.remoteVersion.value ?? null)
const state = ref<'error' | 'loading' | 'ready' | 'saving'>('loading')
const error = ref<string | null>(null)
const form = reactive({ dialogue: '[]', summary: '', tags: '', title: '', vocabulary: '[]' })

/** 加载场景及其当前草稿，并明确替换编辑表单。 */
async function load(): Promise<void> {
  state.value = 'loading'
  error.value = null
  try {
    const loadedScene = await adapter.getScene(sceneId.value)
    if (!loadedScene.draftRevisionId)
      throw new Error('该场景当前没有可编辑草稿，请先在内容列表创建草稿')
    const loadedRevision = await adapter.getRevision(loadedScene.draftRevisionId)
    scene.value = loadedScene
    revision.value = loadedRevision
    controller.value = createRevisionController(loadedRevision.version, loadedRevision.content)
    fillForm(loadedRevision.content)
    state.value = 'ready'
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : '场景草稿加载失败'
    state.value = 'error'
  }
}

/** 保存当前结构化草稿，并在 409 时保留本地输入。 */
async function save(): Promise<void> {
  if (!revision.value || !controller.value) return
  let content: Record<string, unknown>
  try {
    content = buildContent(controller.value.draft.value)
  } catch (failure) {
    ElMessage.warning(failure instanceof Error ? failure.message : '结构化内容格式不正确')
    return
  }
  state.value = 'saving'
  try {
    const saved = await adapter.saveRevision(
      revision.value.id,
      controller.value.revision.value,
      content
    )
    revision.value = saved
    controller.value.acceptSavedVersion(saved.version, saved.content)
    ElMessage.success('草稿已保存')
  } catch (failure) {
    controller.value.handleSaveFailure(failure)
    error.value = failure instanceof Error ? failure.message : '草稿保存失败'
  } finally {
    state.value = 'ready'
  }
}

/**
 * 将版本内容安全填入可编辑字段
 * @param content - 服务端版本内容
 */
function fillForm(content: Record<string, unknown>): void {
  form.title = typeof content.title === 'string' ? content.title : ''
  form.summary = typeof content.summary === 'string' ? content.summary : ''
  form.tags = Array.isArray(content.tags)
    ? content.tags.filter((item): item is string => typeof item === 'string').join(', ')
    : ''
  form.dialogue = JSON.stringify(content.dialogue ?? [], null, 2)
  form.vocabulary = JSON.stringify(content.vocabulary ?? [], null, 2)
}

/**
 * 合并可视表单字段与服务端未展示字段
 * @param base - 服务端原始内容
 * @returns 待保存的完整内容
 */
function buildContent(base: Record<string, unknown>): Record<string, unknown> {
  const dialogue = JSON.parse(form.dialogue) as unknown
  const vocabulary = JSON.parse(form.vocabulary) as unknown
  if (!Array.isArray(dialogue) || !Array.isArray(vocabulary))
    throw new Error('对话与词汇必须使用 JSON 数组')
  return {
    ...base,
    dialogue,
    summary: form.summary.trim(),
    tags: form.tags
      .split(/[,，\n]/)
      .map((item) => item.trim())
      .filter(Boolean),
    title: form.title.trim(),
    vocabulary
  }
}

onMounted(load)
</script>

<template>
  <section class="scene-editor-page">
    <div class="page-heading">
      <div>
        <span>A20</span>
        <h2>结构化场景编辑 · {{ scene?.title || sceneId }}</h2>
      </div>
      <div class="heading-actions">
        <ElTag v-if="revision" effect="plain" type="warning">草稿 v{{ currentVersion }}</ElTag
        ><ElButton :loading="state === 'saving'" type="primary" @click="save">保存草稿</ElButton>
      </div>
    </div>
    <ElSkeleton v-if="state === 'loading'" :rows="10" animated />
    <ElAlert
      v-else-if="state === 'error'"
      :closable="false"
      :title="error || '加载失败'"
      type="error"
      show-icon
      ><template #default
        ><ElButton link type="primary" @click="load">重新加载</ElButton></template
      ></ElAlert
    >
    <template v-else>
      <ElAlert
        v-if="hasConflict"
        class="conflict-alert"
        :closable="false"
        :title="`远端已更新到 v${remoteVersion ?? '未知'}，本地输入已保留且自动保存已停止`"
        type="warning"
        show-icon
        ><template #default
          ><ElButton link type="primary" @click="load"
            >明确放弃本地内容并重新加载</ElButton
          ></template
        ></ElAlert
      >
      <ElAlert
        v-else-if="error"
        class="conflict-alert"
        :closable="false"
        :title="error"
        type="error"
        show-icon
      />
      <div class="editor-grid">
        <ElCard shadow="never"
          ><template #header><h3>基础信息</h3></template
          ><ElForm label-position="top">
            <ElFormItem label="场景标题" required
              ><ElInput v-model="form.title" maxlength="120" show-word-limit
            /></ElFormItem>
            <ElFormItem label="所属系列"
              ><ElInput :model-value="scene?.seriesTitle" disabled
            /></ElFormItem>
            <ElFormItem label="场景说明"
              ><ElInput v-model="form.summary" type="textarea" :rows="5"
            /></ElFormItem>
            <ElFormItem label="内容标签"
              ><ElInput v-model="form.tags" placeholder="使用逗号分隔"
            /></ElFormItem> </ElForm
        ></ElCard>
        <div class="structured-stack">
          <ElCard shadow="never"
            ><template #header><h3>对话条目</h3></template>
            <p class="field-help">以 JSON 数组维护条目，保存时保留服务端未展示字段。</p>
            <ElInput v-model="form.dialogue" aria-label="对话条目 JSON" type="textarea" :rows="12"
          /></ElCard>
          <ElCard shadow="never"
            ><template #header><h3>词汇条目</h3></template
            ><ElInput
              v-model="form.vocabulary"
              aria-label="词汇条目 JSON"
              type="textarea"
              :rows="8"
          /></ElCard>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped lang="scss">
.page-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 14px;
}

.page-heading span {
  color: var(--juya-color-text-primary);
  font-size: 11px;
  font-weight: 700;
}

.page-heading h2 {
  margin: 3px 0 0;
  color: var(--juya-color-sidebar);
  font-size: 18px;
}

.heading-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.conflict-alert {
  margin-bottom: 14px;
}

.editor-grid {
  display: grid;
  grid-template-columns: minmax(320px, 2fr) minmax(420px, 3fr);
  gap: 14px;
}

.structured-stack {
  display: grid;
  gap: 14px;
}

h3 {
  margin: 0;
  color: var(--juya-color-sidebar);
  font-size: 15px;
}

.field-help {
  margin: 0 0 10px;
  color: var(--juya-color-text-secondary);
  font-size: 12px;
}

@media (width <= 1050px) {
  .editor-grid {
    grid-template-columns: 1fr;
  }
}
</style>
