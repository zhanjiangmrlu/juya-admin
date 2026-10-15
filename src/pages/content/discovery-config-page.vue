<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue'

import AdminPanel from '@/components/admin-panel/admin-panel.vue'
import AppPageActions from '@/components/app-page-actions/app-page-actions.vue'
import { type ContentSeries, createContentAdapter } from '@/features/content/content-adapter'
import { createDiscoveryAdapter } from '@/features/discovery/discovery-adapter'
import { validateOpenScenes, validatePreviewScenes } from '@/features/discovery/discovery-model'
import ShortReadingTrialsPanel from '@/features/discovery/short-reading-trials-panel.vue'
import { useDiscoveryConfig } from '@/features/discovery/use-discovery-config'
import { createLearningFeaturesAdapter } from '@/features/learning-features/learning-features-adapter'
import { useLearningFeatures } from '@/features/learning-features/use-learning-features'
import { useAdminApiClient } from '@/services/api/use-admin-api-client'

import type { SceneSummary } from '@/features/content/content-model'

const client = useAdminApiClient()
const controller = useDiscoveryConfig(createDiscoveryAdapter(client))
const content = createContentAdapter(client)
const learning = useLearningFeatures(createLearningFeaturesAdapter(client))
const scenes = ref<SceneSummary[]>([])
const series = ref<ContentSeries[]>([])
const optionError = ref('')
const form = reactive<{
  openScenes: string[]
  previews: { seriesId: string; sceneIds: string[] }[]
}>({ openScenes: ['', '', ''], previews: [] })
let generation = 0
let disposed = false
/** 加载权威配置与已发布内容选项，明确放弃本地未保存输入 */
const load = async (): Promise<void> => {
  const token = ++generation
  optionError.value = ''
  try {
    await controller.load()
    if (disposed || token !== generation || !controller.draft.value) return
    form.openScenes = [...controller.draft.value.openSceneIds]
    form.previews = Object.entries(controller.draft.value.previewBySeries).map(
      ([seriesId, sceneIds]) => ({ seriesId, sceneIds: [...sceneIds] })
    )
    const [categories, first] = await Promise.all([
      content.listSeries(),
      content.listScenes({
        page: 1,
        pageSize: 100,
        query: '',
        seriesId: '',
        status: 'PUBLISHED'
      })
    ])
    const all = [...first.items]
    for (let page = 2; all.length < first.total; page++) {
      const next = await content.listScenes({
        page,
        pageSize: 100,
        query: '',
        seriesId: '',
        status: 'PUBLISHED'
      })
      if (!next.items.length) break
      all.push(...next.items)
    }
    if (disposed || token !== generation) return
    scenes.value = all
    series.value = categories
    await learning.load()
  } catch (failure) {
    if (!disposed && token === generation)
      optionError.value = failure instanceof Error ? failure.message : '配置读取失败，请重试'
  }
}
/** 校验实际场景选择并保存配置，错误或冲突保留输入 */
const save = async (): Promise<void> => {
  if (!controller.draft.value || controller.state.value === 'saving' || learning.busy.value) return
  const open = validateOpenScenes(form.openScenes)
  if (!open.valid) {
    ElMessage.warning(open.message)
    return
  }
  if (
    new Set(form.previews.map((row) => row.seriesId)).size !== form.previews.length ||
    form.previews.some((row) => !row.seriesId)
  ) {
    ElMessage.warning('请选择不重复的内容系列')
    return
  }
  for (const row of form.previews) {
    const checked = validatePreviewScenes(row.sceneIds, form.openScenes)
    if (!checked.valid) {
      ElMessage.warning(checked.message)
      return
    }
    if (
      row.sceneIds.some(
        (id) => scenes.value.find((scene) => scene.id === id)?.seriesId !== row.seriesId
      )
    ) {
      ElMessage.warning('预览场景必须属于所选系列')
      return
    }
  }
  try {
    await controller.save({
      learningModules: { ...controller.draft.value.learningModules },
      openSceneIds: [...form.openScenes],
      previewBySeries: Object.fromEntries(
        form.previews.map((row) => [row.seriesId, [...row.sceneIds]])
      )
    })
    if (
      learning.snapshot.value &&
      learning.profileEnabled.value !== learning.snapshot.value.profileCompletionEnabled
    ) {
      await learning.save()
      if (learning.error.value) return
    }
    ElMessage.success('开放与预览配置已保存')
  } catch {
    /* 控制器显示真实错误并保留表单 */
  }
}
/** 添加待选择的系列预览，不生成内部编号 */
const addPreview = (): void => {
  form.previews.push({ seriesId: '', sceneIds: [] })
}
onMounted(() => void load())
onBeforeUnmount(() => {
  disposed = true
  generation++
  learning.dispose()
})
</script>
<template>
  <section class="discovery-config-page">
    <ElAlert
      v-if="optionError || controller.error.value || learning.error.value"
      :title="optionError || controller.error.value || learning.error.value || ''"
      type="error"
      :closable="false"
      ><ElButton @click="load">重新读取配置</ElButton></ElAlert
    >
    <ElAlert
      v-if="controller.conflict.value || learning.conflict.value"
      title="配置已变化，本地输入已保留。请重新读取后核对。"
      type="warning"
      :closable="false"
    />
    <ElSkeleton v-if="controller.state.value === 'loading'" :rows="8" animated />
    <template v-else-if="controller.draft.value">
      <AdminPanel :title="`开放学习场景 · 已选${form.openScenes.filter(Boolean).length} / 3`"
        ><ElForm label-position="top" class="open-scenes-grid">
          <ElFormItem v-for="index in 3" :key="index" :label="`开放场景 ${index}`"
            ><ElSelect
              v-model="form.openScenes[index - 1]"
              filterable
              :aria-label="`开放场景 ${index}`"
              placeholder="按标题选择已发布场景"
              ><ElOption
                v-if="
                  form.openScenes[index - 1] &&
                  !scenes.some((scene) => scene.id === form.openScenes[index - 1])
                "
                :value="form.openScenes[index - 1]"
                label="所选场景暂不可读取"
                disabled /><ElOption
                v-for="scene in scenes"
                :key="scene.id"
                :label="scene.title"
                :value="scene.id"
                :disabled="
                  form.openScenes.includes(scene.id) && form.openScenes[index - 1] !== scene.id
                " /></ElSelect
            ><small>{{
              scenes.find((scene) => scene.id === form.openScenes[index - 1])?.seriesTitle ||
              '选择已发布场景，替换后保留历史进度与收藏'
            }}</small></ElFormItem
          >
        </ElForm></AdminPanel
      >
      <AdminPanel title="场景系列只读预览"
        ><template #header-actions
          ><ElButton link type="primary" @click="addPreview">新增系列</ElButton></template
        >
        <div v-for="(row, index) in form.previews" :key="index" class="preview-row">
          <ElSelect
            v-model="row.seriesId"
            aria-label="预览内容系列"
            placeholder="选择内容系列"
            filterable
            @change="row.sceneIds = []"
            ><ElOption
              v-for="category in series"
              :key="category.id"
              :label="category.title"
              :value="category.id" /></ElSelect
          ><ElSelect
            v-model="row.sceneIds"
            aria-label="系列预览场景"
            placeholder="选择3–6个非开放场景"
            multiple
            filterable
            ><ElOption
              v-for="id in row.sceneIds.filter((id) => !scenes.some((scene) => scene.id === id))"
              :key="`missing-${id}`"
              :value="id"
              label="所选场景暂不可读取"
              disabled /><ElOption
              v-for="scene in scenes.filter((item) => item.seriesId === row.seriesId)"
              :key="scene.id"
              :label="scene.title"
              :value="scene.id"
              :disabled="form.openScenes.includes(scene.id)" /></ElSelect
          ><ElButton link type="danger" @click="form.previews.splice(index, 1)">移除</ElButton
          ><small>已选{{ row.sceneIds.length }}篇 / 最多6篇 · 非开放场景</small>
        </div>
        <ElEmpty v-if="!form.previews.length" description="尚未配置系列预览" :image-size="48" />
        <p class="help">使用安全封面、标题与一句简介；无权限点击留在当前列表页提示。</p>
        <div class="profile-row">
          <span>显示“前往我的，完善账号资料”次级入口</span
          ><ElSwitch
            v-model="learning.profileEnabled.value"
            aria-label="完善资料次级入口"
            active-text="已启用"
            inactive-text="已停用"
            :disabled="!learning.snapshot.value || learning.busy.value || learning.conflict.value"
          /></div
      ></AdminPanel>
      <ShortReadingTrialsPanel />
    </template>
    <AppPageActions
      ><ElButton
        :disabled="controller.state.value === 'saving' || learning.busy.value"
        @click="load"
        >取消修改</ElButton
      ><ElButton
        type="primary"
        :loading="controller.state.value === 'saving' || learning.busy.value"
        :disabled="!controller.draft.value || Boolean(learning.conflict.value)"
        @click="save"
        >保存配置</ElButton
      ></AppPageActions
    >
  </section>
</template>
<style scoped lang="scss">
.discovery-config-page {
  display: grid;
  gap: 20px;
  min-width: 0;

  .open-scenes-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 20px;

    :deep([class~='el-form-item__content']) {
      display: flex;
      flex-direction: column;
      align-items: stretch;
    }
  }

  .preview-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 2fr) auto;
    gap: 12px;
    padding: 12px 0;

    small {
      grid-column: 1 / -1;
    }
  }

  small,
  .help {
    color: var(--juya-color-text-secondary);
    font-size: 11px;
    line-height: 18px;
  }

  .profile-row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 16px;
    margin-top: 16px;
  }

  :deep(.el-select) {
    width: 100%;
  }

  @media (width <= 800px) {
    .open-scenes-grid,
    .preview-row {
      grid-template-columns: 1fr;
    }
  }
}
</style>
