<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { createOcrAdapter } from '@/features/ocr/ocr-adapter'
import { createIdempotencyKey } from '@/services/api/api-client'
import { useAdminApiClient } from '@/services/api/use-admin-api-client'

import type { OcrCandidate, OcrJob } from '@/features/ocr/ocr-model'

const route = useRoute()
const router = useRouter()
const adapter = createOcrAdapter(useAdminApiClient())
const job = ref<OcrJob | null>(null)
const candidate = ref<OcrCandidate | null>(null)
const sceneId = ref(String(route.query.sceneId ?? ''))
const busy = ref(false)
const error = ref('')
const lines = computed(() => {
  const content = candidate.value?.content
  if (!content) return []
  if (Array.isArray(content.blocks))
    return content.blocks
      .map((block) =>
        typeof block === 'object' && block && 'text' in block ? String(block.text) : ''
      )
      .filter(Boolean)
  return typeof content.text === 'string' ? content.text.split('\n') : []
})
/** 加载当前识别任务及原始文字。 */
async function load(): Promise<void> {
  busy.value = true
  error.value = ''
  try {
    job.value = await adapter.getJob(job.value?.id ?? String(route.params.taskId))
    candidate.value =
      job.value.status === 'SUCCEEDED' ? await adapter.getCandidate(job.value.id) : null
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : '任务加载失败'
  } finally {
    busy.value = false
  }
}
/** 取消或显式重试识别。
 * @param operation - 任务命令
 */
async function command(operation: 'cancel' | 'retry'): Promise<void> {
  if (!job.value) return
  busy.value = true
  try {
    job.value = await adapter.command(job.value.id, operation, createIdempotencyKey())
    candidate.value = null
    await router.replace({ params: { ...route.params, taskId: job.value.id }, query: route.query })
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : '任务操作失败'
  } finally {
    busy.value = false
  }
}
/** 返回绑定场景，使用同一草稿进行逐项采纳。 */
function edit(): void {
  if (sceneId.value.trim() && job.value)
    void router.push({
      name: 'content-scene-edit',
      params: { id: sceneId.value.trim() },
      query: { ocrJob: job.value.id }
    })
}
onMounted(load)
</script>
<template>
  <section v-loading="busy">
    <div class="page-heading">
      <h2>OCR 任务与原始候选</h2>
      <ElButton @click="load">刷新状态</ElButton>
    </div>
    <ElAlert v-if="error" :closable="false" :title="error" type="error" /><ElCard shadow="never"
      ><ElDescriptions v-if="job" :column="1"
        ><ElDescriptionsItem label="任务">{{ job.id }}</ElDescriptionsItem
        ><ElDescriptionsItem label="状态">{{ job.status }}</ElDescriptionsItem
        ><ElDescriptionsItem label="素材">{{ job.targetId }}</ElDescriptionsItem
        ><ElDescriptionsItem label="错误">{{
          job.errorCode || '—'
        }}</ElDescriptionsItem></ElDescriptions
      ><ElButton
        v-if="job && ['PENDING', 'RUNNING'].includes(job.status)"
        @click="command('cancel')"
        >取消任务</ElButton
      ><ElButton
        v-if="job && ['FAILED', 'CANCELLED'].includes(job.status)"
        @click="command('retry')"
        >显式重试任务</ElButton
      >
      <h3>原始识别文字</h3>
      <p v-for="(line, index) in lines" :key="index">{{ line }}</p>
      <ElEmpty v-if="!lines.length" description="候选尚未生成" /><ElAlert
        :closable="false"
        title="原始 OCR 只提供文字。请在任务绑定的场景中校对分类、翻译，并选择采纳字段。"
        type="info"
      /><ElForm label-position="top"
        ><ElFormItem label="任务绑定场景编号"><ElInput v-model="sceneId" /></ElFormItem
        ><ElButton :disabled="!sceneId.trim()" type="primary" @click="edit"
          >返回场景逐项校对</ElButton
        ></ElForm
      ></ElCard
    >
  </section>
</template>
<style scoped lang="scss">
.page-heading {
  display: flex;
  justify-content: space-between;
  margin-bottom: 14px;
}

h2 {
  margin: 0;
  font-size: 18px;
}

.el-form {
  margin-top: 16px;
}
</style>
