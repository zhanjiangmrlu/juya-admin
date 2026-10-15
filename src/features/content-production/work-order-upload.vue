<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { useRouter } from 'vue-router'

import AdminPanel from '@/components/admin-panel/admin-panel.vue'
import AppPageActions from '@/components/app-page-actions/app-page-actions.vue'
import { createContentPackageAdapter } from '@/features/content-import/content-package-adapter'
import { createIdempotencyKey } from '@/services/api/api-client'
import { useAdminApiClient } from '@/services/api/use-admin-api-client'

import type { UploadFile } from 'element-plus'

import { createWorkOrderAdapter } from './work-order-adapter'
const props = defineProps<{
  seriesId: string
  contentType: 'dialogue' | 'word_card' | 'short_reading'
  kind: 'zip' | 'docx'
}>()
const router = useRouter(),
  client = useAdminApiClient(),
  adapter = createWorkOrderAdapter(client)
const file = shallowRef<globalThis.File | null>(null),
  busy = ref(false),
  error = ref('')
const limits = ref<{ maxBytes: number; maxItems: number } | null>(null)
const uploadProgress = ref<number | null>(null)
let uploadAbort: globalThis.AbortController | null = null
let uploadKey = createIdempotencyKey()
let active = true
onBeforeUnmount(() => {
  active = false
  uploadAbort?.abort()
})
/**
 * 选择原始文件，校验格式和服务端大小限制
 * @param selected - 管理员选择的实际上传文件
 */
const choose = (selected: UploadFile): void => {
  if (busy.value || !selected.raw) return
  if (!selected.name.toLowerCase().endsWith(`.${props.kind}`)) {
    error.value = `请选择 ${props.kind.toUpperCase()} 文件`
    return
  }
  if (limits.value && selected.raw.size > limits.value.maxBytes) {
    error.value = '文件超过当前服务允许的上传规模'
    return
  }
  file.value = selected.raw
  error.value = ''
  uploadKey = createIdempotencyKey()
}
/** 创建工作单后立即保存可恢复地址 */
const upload = async (): Promise<void> => {
  if (!file.value || !props.seriesId || busy.value) return
  busy.value = true
  uploadProgress.value = null
  uploadAbort = new globalThis.AbortController()
  error.value = ''
  try {
    const body = new globalThis.FormData()
    body.set('file', file.value)
    body.set('series_id', props.seriesId)
    body.set('content_type', props.contentType)
    body.set('mode', props.kind.toUpperCase())
    const order = await adapter.upload(body, uploadKey, {
      signal: uploadAbort.signal,
      onUploadProgress: (percentage) => {
        if (active) uploadProgress.value = percentage
      }
    })
    if (!active) return
    await router.replace({
      name: 'content-work-order',
      params: { id: order.work_order_id },
      query: { view: 'import', import_phase: 'validation' }
    })
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : '上传失败，请重试本次文件'
  } finally {
    busy.value = false
  }
}
onMounted(async () => {
  try {
    limits.value = await createContentPackageAdapter(client).limits()
  } catch {
    error.value = '上传策略暂不可用，请稍后重试'
  }
})
</script>
<template>
  <AdminPanel :title="kind === 'zip' ? '统一内容包 · 正文、词表与素材' : '中英文正文 · 按标题分篇'"
    ><p>沿用已选择的分类与内容类型。上传后先校验，再查看不可变原文、双语正文和素材对应。</p>
    <ElAlert
      v-if="!seriesId"
      title="请返回入口选择内容分类"
      type="warning"
      :closable="false"
    /><ElAlert v-if="error" :title="error" type="error" :closable="false" /><ElUpload
      drag
      :auto-upload="false"
      :show-file-list="false"
      :accept="`.${kind}`"
      :disabled="busy"
      @change="choose"
      ><p>{{ file ? file.name : `点击选择或拖入 ${kind.toUpperCase()} 文件` }}</p></ElUpload
    >
    <p v-if="limits">
      单文件最大 {{ Math.round(limits.maxBytes / 1024 / 1024) }} MB，本批最多
      {{ limits.maxItems }} 篇
    </p>
    <div v-if="busy" class="upload-progress" role="status" aria-live="polite">
      <p>{{ uploadProgress === 100 ? '文件传输完成，等待服务器确认' : '正在上传文件，请稍候' }}</p>
      <ElProgress v-if="uploadProgress !== null" :percentage="uploadProgress" />
    </div>
    <AppPageActions
      ><ElButton @click="router.push({ name: 'content-import' })">返回批量导入</ElButton
      ><ElButton type="primary" :disabled="!file || !seriesId" :loading="busy" @click="upload"
        >开始校验</ElButton
      ></AppPageActions
    ></AdminPanel
  >
  <AdminPanel v-if="kind === 'zip'" title="按稳定导入标识对应资料"
    ><ElTable
      :data="[
        {
          file: '内容表.xlsx · 内容导入 ID',
          saved: '双语文档、封面、整段 / 全文音频',
          binding: '每篇一个 DOCX，使用包内相对路径'
        },
        {
          file: '词汇表.xlsx · 条目 ID',
          saved: '英文、本篇释义、音标、解释与来源',
          binding: '关联内容 ID；词汇可配图，语块无图片'
        },
        {
          file: 'documents/ · images/ · audio/',
          saved: '正文文件、素材与音频',
          binding: '不按行号、标题或文件顺序猜配'
        }
      ]"
      ><ElTableColumn prop="file" label="文件 / 标识" min-width="250" /><ElTableColumn
        prop="saved"
        label="保存资料"
        min-width="350" /><ElTableColumn prop="binding" label="绑定方式" min-width="360" /></ElTable
  ></AdminPanel>
  <ElAlert
    v-if="kind === 'zip' && contentType === 'short_reading'"
    title="短文仍为纯阅读"
    type="info"
    :closable="false"
    >只整理完整中英文、元信息、来源版权、安全封面与可选全文音频，不生成词汇、语块或讲解</ElAlert
  >
</template>
