<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { onMounted, reactive } from 'vue'

import {
  createDiscoveryAdapter,
  type DiscoveryConfigDraft
} from '@/features/discovery/discovery-adapter'
import {
  validateLearningModules,
  validateOpenScenes,
  validatePreviewScenes
} from '@/features/discovery/discovery-model'
import { useDiscoveryConfig } from '@/features/discovery/use-discovery-config'
import { useAdminApiClient } from '@/services/api/use-admin-api-client'

interface PreviewRow {
  sceneIds: string
  seriesId: string
}

interface ReadonlyDiscoveryDraft {
  readonly learningModules: Readonly<Record<string, boolean>>
  readonly openSceneIds: readonly string[]
  readonly previewBySeries: Readonly<Record<string, readonly string[]>>
}

const controller = useDiscoveryConfig(createDiscoveryAdapter(useAdminApiClient()))
const form = reactive<{
  learningModules: Record<string, boolean>
  openScenes: string[]
  previews: PreviewRow[]
}>({
  learningModules: {},
  openScenes: ['', '', ''],
  previews: []
})

/** 加载统一配置，并明确覆盖本地表单。 */
async function load(): Promise<void> {
  try {
    await controller.load()
    if (controller.draft.value) applyDraft(controller.draft.value)
  } catch {
    // 控制器提供错误状态和可重试入口
  }
}

/**
 * 校验并以乐观锁保存完整发现页配置
 * @returns 保存流程完成后的 Promise
 */
async function save(): Promise<void> {
  const draft = createDraft()
  const openValidation = validateOpenScenes(draft.openSceneIds)
  if (!openValidation.valid) {
    ElMessage.warning(openValidation.message)
    return
  }
  for (const sceneIds of Object.values(draft.previewBySeries)) {
    const validation = validatePreviewScenes(sceneIds, draft.openSceneIds)
    if (!validation.valid) {
      ElMessage.warning(validation.message)
      return
    }
  }
  const moduleValidation = validateLearningModules(
    Object.entries(draft.learningModules).map(([type, enabled]) => ({ enabled, type }))
  )
  if (!moduleValidation.valid) {
    ElMessage.warning(moduleValidation.message)
    return
  }
  try {
    await controller.save(draft)
    if (controller.draft.value) applyDraft(controller.draft.value)
    ElMessage.success('发现页配置已保存')
  } catch {
    if (controller.conflict.value) ElMessage.warning('远端配置已变化，本地输入已保留')
  }
}

/**
 * 将配置草稿映射到页面表单
 * @param draft - 待展示的配置草稿
 */
function applyDraft(draft: ReadonlyDiscoveryDraft): void {
  form.openScenes.splice(0, form.openScenes.length, ...draft.openSceneIds)
  while (form.openScenes.length < 3) form.openScenes.push('')
  form.learningModules = { ...draft.learningModules }
  form.previews.splice(
    0,
    form.previews.length,
    ...Object.entries(draft.previewBySeries).map(([seriesId, sceneIds]) => ({
      sceneIds: sceneIds.join(', '),
      seriesId
    }))
  )
}

/**
 * 从页面表单构造完整配置草稿
 * @returns 完整配置草稿
 */
function createDraft(): DiscoveryConfigDraft {
  return {
    learningModules: { ...form.learningModules },
    openSceneIds: form.openScenes.map((id) => id.trim()),
    previewBySeries: Object.fromEntries(
      form.previews
        .filter((row) => row.seriesId.trim())
        .map((row) => [row.seriesId.trim(), splitIds(row.sceneIds)])
    )
  }
}

/**
 * 将逗号或换行分隔的编号转换为数组
 * @param value - 用户输入的编号文本
 * @returns 清理后的编号数组
 */
function splitIds(value: string): string[] {
  return value
    .split(/[,，\n]/)
    .map((id) => id.trim())
    .filter(Boolean)
}

/** 在表单中新增一个空系列预览项。 */
function addPreview(): void {
  form.previews.push({ sceneIds: '', seriesId: '' })
}

onMounted(load)
</script>

<template>
  <section class="discovery-config-page">
    <div class="page-heading">
      <div>
        <p class="page-description">开放场景自由学习；系列预览使用安全封面和专用片段。</p>
      </div>
      <div class="heading-actions">
        <ElTag effect="plain">配置 v{{ controller.version.value }}</ElTag
        ><ElButton :loading="controller.state.value === 'saving'" type="primary" @click="save"
          >保存全部配置</ElButton
        >
      </div>
    </div>
    <ElSkeleton v-if="controller.state.value === 'loading'" :rows="10" animated />
    <ElAlert
      v-else-if="controller.state.value === 'error' && !controller.draft.value"
      :closable="false"
      :title="controller.error.value || '配置加载失败'"
      type="error"
      show-icon
      ><template #default
        ><ElButton link type="primary" @click="load">重新加载</ElButton></template
      ></ElAlert
    >
    <template v-else>
      <ElAlert
        v-if="controller.conflict.value"
        class="conflict-alert"
        :closable="false"
        :title="`远端已更新到 v${controller.conflict.value.remoteVersion}，本地表单未被覆盖`"
        type="warning"
        show-icon
        ><template #default
          ><ElButton link type="primary" @click="load">放弃本地修改并载入远端</ElButton></template
        ></ElAlert
      >
      <ElAlert
        v-else-if="controller.error.value"
        class="conflict-alert"
        :closable="false"
        :title="controller.error.value"
        type="error"
        show-icon
      />
      <div class="config-grid">
        <ElCard shadow="never" class="open-scenes-panel"
          ><template #header
            ><h3>开放学习场景</h3>
            <p class="field-help">固定选择 3 个已发布场景，自由学习顺序</p></template
          ><ElForm label-position="top">
            <ElFormItem
              v-for="(_id, index) in form.openScenes.slice(0, 3)"
              :key="index"
              :label="`开放场景 ${index + 1}`"
              required
              ><ElInput v-model="form.openScenes[index]"
            /></ElFormItem>
          </ElForm>
          <dl class="open-scene-notes">
            <dt>场景替换</dt>
            <dd>先替换，再下线当前开放场景</dd>
            <dt>历史记录</dt>
            <dd>替换后保留进度、收藏与来源句</dd>
          </dl></ElCard
        >
        <ElCard shadow="never"
          ><template #header
            ><div class="card-heading">
              <h3>系列预览</h3>
              <ElButton link type="primary" @click="addPreview">新增系列</ElButton>
            </div></template
          >
          <ElEmpty v-if="form.previews.length === 0" description="尚未配置系列预览" />
          <div v-for="(row, index) in form.previews" :key="index" class="preview-row">
            <ElInput v-model="row.seriesId" aria-label="系列编号" placeholder="系列编号" />
            <ElInput
              v-model="row.sceneIds"
              aria-label="预览场景编号"
              placeholder="3–6 个场景编号，以逗号分隔"
              type="textarea"
              :rows="3"
            />
            <ElButton link type="danger" @click="form.previews.splice(index, 1)">移除</ElButton>
          </div>
        </ElCard>
        <ElCard shadow="never"
          ><template #header><h3>学习模块</h3></template>
          <ElEmpty
            v-if="Object.keys(form.learningModules).length === 0"
            description="暂无学习模块配置"
          />
          <div
            v-for="(_enabled, moduleName) in form.learningModules"
            :key="moduleName"
            class="module-row"
          >
            <span>{{ moduleName }}</span
            ><ElSwitch
              v-model="form.learningModules[moduleName]"
              :disabled="moduleName !== 'scene_learning'"
            />
          </div>
          <p class="field-help">V1.3 仅允许启用场景学习；其他模块只读展示。</p>
        </ElCard>
      </div>
    </template>
  </section>
</template>

<style scoped lang="scss">
/* stylelint-disable selector-class-pattern -- Element Plus 组件类名 */
.page-heading,
.card-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}

.page-heading {
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

.config-grid {
  display: grid;
  grid-template-columns: minmax(0, 690fr) minmax(0, 452fr);
  align-items: start;
  gap: 18px;
}

.open-scenes-panel {
  grid-row: 1 / 3;
  min-height: 630px;
  background: #eaf2e3;
}

.config-grid {
  grid-template-rows: auto 1fr;
}

.discovery-config-page :deep(.el-card__header) {
  padding: 18px 20px 0;
  border-bottom: 0;
}

.discovery-config-page :deep(.el-form-item) {
  margin-bottom: 24px;
}

.open-scene-notes dt {
  margin: 24px 0 8px;
  color: var(--juya-color-text-regular);
  font-size: 13px;
}

.open-scene-notes dd {
  margin: 0;
  padding: 12px;
  border: 1px solid var(--juya-color-border);
  border-radius: 10px;
  background: var(--juya-color-surface);
  font-size: 14px;
}

.page-description {
  margin: 0;
  color: var(--juya-color-text-regular);
  font-size: 13px;
}

h3 {
  margin: 0;
  color: var(--juya-color-sidebar);
  font-size: 20px;
}

.preview-row {
  display: grid;
  gap: 8px;
  padding: 12px 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.module-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.field-help {
  color: var(--juya-color-text-secondary);
  font-size: 12px;
}

@media (width <= 1100px) {
  .config-grid {
    grid-template-columns: 1fr;
    grid-template-rows: auto;
  }

  .open-scenes-panel {
    grid-row: auto;
  }
}
</style>
