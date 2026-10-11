<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'

import { createContentAdapter } from '@/features/content/content-adapter'
import ScenePreview from '@/features/content-editor/scene-preview.vue'
import { useAdminApiClient } from '@/services/api/use-admin-api-client'

import type { SceneSummary } from '@/features/content/content-model'

const props = defineProps<{ modelValue: string[]; requiredCount: number; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [ids: string[]] }>()
const adapter = createContentAdapter(useAdminApiClient())
const query = ref('')
const choices = ref<SceneSummary[]>([])
const selected = ref<Record<string, SceneSummary>>({})
const loading = ref(false)
const error = ref('')
const dragging = ref<number | null>(null)
const previewOpened = ref(false)
const previewContent = ref<Record<string, unknown> | null>(null)
const previewRevisionId = ref('')
const previewError = ref('')
let previewSequence = 0
const selectedRows = computed(() =>
  props.modelValue.map((id) => ({ id, title: selected.value[id]?.title ?? '正在加载内容标题' }))
)
let sequence = 0
let disposed = false
let timer: ReturnType<typeof globalThis.setTimeout> | undefined

const /** 按已发布标题查询可选内容 */
  search = async (): Promise<void> => {
    const request = ++sequence
    loading.value = true
    error.value = ''
    try {
      const result = await adapter.listScenes({
        page: 1,
        pageSize: 100,
        query: query.value,
        seriesId: '',
        status: 'PUBLISHED'
      })
      if (disposed || request !== sequence) return
      choices.value = result.items
      for (const scene of result.items) selected.value[scene.id] = scene
    } catch {
      if (!disposed && request === sequence) error.value = '内容查询失败，请重试'
    } finally {
      if (!disposed && request === sequence) loading.value = false
    }
  }
const /**
   * 切换选择，id 为服务端已发布场景编号
   * @param id - 服务端已发布场景编号
   */
  toggle = (id: string): void => {
    if (props.disabled) return
    emit(
      'update:modelValue',
      props.modelValue.includes(id)
        ? props.modelValue.filter((item) => item !== id)
        : [...props.modelValue, id]
    )
  }
const /**
   * 移动已选场景，from/to 为原位置及目标顺序
   * @param from - 原列表位置
   * @param to - 新列表位置
   */
  move = (from: number, to: number): void => {
    if (props.disabled || to < 0 || to >= props.modelValue.length) return
    const ids = [...props.modelValue]
    const [id] = ids.splice(from, 1)
    if (id) ids.splice(to, 0, id)
    emit('update:modelValue', ids)
  }
const /**
   * 将拖动项目放到目标位置，index 为落点顺序
   * @param index - 拖动落点位置
   */
  drop = (index: number): void => {
    if (dragging.value !== null) move(dragging.value, index)
    dragging.value = null
  }
const /**
   * 只预览已发布固定版本，不进入可编辑草稿
   * @param id - 管理员选择的场景编号
   */ preview = async (id: string): Promise<void> => {
    const request = ++previewSequence
    previewOpened.value = true
    previewContent.value = null
    previewError.value = ''
    try {
      const scene = selected.value[id] ?? (await adapter.getScene(id))
      if (!scene.publishedRevisionId) throw new Error('此内容尚无已发布版本')
      const revision = await adapter.getRevision(scene.publishedRevisionId)
      if (disposed || request !== previewSequence) return
      previewRevisionId.value = revision.id
      previewContent.value = revision.content
    } catch (failure) {
      if (!disposed && request === previewSequence)
        previewError.value = failure instanceof Error ? failure.message : '已发布内容预览失败'
    }
  }
const /** 关闭只读预览并撤销迟到资源返回 */ closePreview = (): void => {
    previewSequence++
    previewContent.value = null
  }
watch(query, () => {
  globalThis.clearTimeout(timer)
  timer = globalThis.setTimeout(() => void search(), 250)
})
watch(
  () => props.modelValue,
  async (ids) => {
    for (const id of ids) {
      if (selected.value[id]) continue
      try {
        const scene = await adapter.getScene(id)
        if (!disposed) selected.value[id] = scene
      } catch {
        if (!disposed) error.value = '部分已选内容无法读取，请刷新核对'
      }
    }
  },
  { immediate: true }
)
void search()
onBeforeUnmount(() => {
  disposed = true
  sequence++
  globalThis.clearTimeout(timer)
  previewSequence++
  previewContent.value = null
})
</script>

<template>
  <div class="campaign-scene-selector">
    <ElInput
      v-model="query"
      :disabled="disabled"
      placeholder="按内容标题搜索已发布场景"
      aria-label="内容标题搜索"
      clearable
    />

    <ElAlert v-if="error" :title="error" type="error" :closable="false"
      ><ElButton link @click="search">重试</ElButton></ElAlert
    >
    <div
      v-if="!disabled && (query || modelValue.length < requiredCount)"
      v-loading="loading"
      class="choices"
    >
      <ElCheckbox
        v-for="scene in choices"
        :key="scene.id"
        :model-value="modelValue.includes(scene.id)"
        @change="toggle(scene.id)"
        >{{ scene.title }}</ElCheckbox
      >
      <ElEmpty
        v-if="!loading && !choices.length"
        description="没有匹配的已发布内容"
        :image-size="48"
      />
    </div>
    <div v-if="selectedRows.length" class="list-heading">
      <span>排序</span><span>已选场景</span><span>操作</span>
    </div>
    <ol>
      <li
        v-for="(scene, index) in selectedRows"
        :key="scene.id"
        :draggable="!disabled"
        @dragstart="dragging = index"
        @dragover.prevent
        @drop.prevent="drop(index)"
      >
        <span class="order">⋮⋮ {{ index + 1 }}</span
        ><span class="scene-title">{{ scene.title }}</span>
        <div class="row-actions">
          <ElButton v-if="!disabled" link :disabled="index === 0" @click="move(index, index - 1)"
            >上移</ElButton
          >
          <ElButton
            v-if="!disabled"
            link
            :disabled="index === modelValue.length - 1"
            @click="move(index, index + 1)"
            >下移</ElButton
          >
          <ElButton link @click="preview(scene.id)">预览</ElButton>
          <ElButton v-if="!disabled" link type="danger" @click="toggle(scene.id)">移除</ElButton>
        </div>
      </li>
    </ol>
    <ElDialog
      v-model="previewOpened"
      title="已发布内容只读预览"
      width="min(900px, 94vw)"
      @closed="closePreview"
      ><ElAlert
        v-if="previewError"
        :title="previewError"
        type="error"
        :closable="false" /><ScenePreview
        v-else-if="previewContent"
        :content="previewContent"
        :revision-id="previewRevisionId" /><ElSkeleton v-else :rows="6" animated
    /></ElDialog>
    <p v-if="modelValue.length !== requiredCount" class="validation">
      启用前需选择 {{ requiredCount }} 个不同且可用的场景；可先保存草稿
    </p>
  </div>
</template>

<style scoped lang="scss">
.campaign-scene-selector {
  width: 100%;
  min-width: 0;

  p {
    color: var(--juya-color-text-secondary);
    font-size: 12px;
  }

  .choices {
    display: flex;
    flex-wrap: wrap;
    max-height: 180px;
    overflow: auto;
    gap: 8px 16px;
  }

  .list-heading {
    display: grid;
    grid-template-columns: 110px minmax(0, 1fr) 240px;
    padding: 14px 12px;
    background: var(--juya-color-primary-soft);
    color: var(--juya-color-primary);
    font-size: 14px;
  }

  ol {
    padding: 0;
    margin: 0;
    list-style: none;
  }

  li {
    display: grid;
    grid-template-columns: 110px minmax(0, 1fr) 240px;
    align-items: center;
    gap: 0;
    min-height: 48px;
    padding: 10px 12px;
    border-bottom: 1px solid var(--juya-color-border);
    overflow-wrap: anywhere;
  }

  .order {
    color: var(--juya-color-text-secondary);
  }

  .scene-title {
    padding-right: 12px;
  }

  @media (width <= 700px) {
    .list-heading {
      display: none;
    }

    li {
      grid-template-columns: 50px minmax(0, 1fr);
    }

    .row-actions {
      grid-column: 2;
    }
  }

  .row-actions {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
  }

  .validation {
    color: var(--el-color-warning);
  }
}
</style>
