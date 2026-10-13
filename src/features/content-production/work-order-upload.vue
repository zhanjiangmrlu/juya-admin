<script setup lang="ts">
import { onMounted, ref, shallowRef } from 'vue'
import { useRouter } from 'vue-router'

import AdminPanel from '@/components/admin-panel/admin-panel.vue'
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
let uploadKey = createIdempotencyKey()
const /** 选择原始文件，校验格式和服务端大小限制
   * @param selected - 管理员选择的实际上传文件
   */
  choose = (selected: UploadFile): void => {
    if (!selected.raw) return
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
const /** 创建工作单后立即保存可恢复地址
   */
  upload = async (): Promise<void> => {
    if (!file.value || !props.seriesId || busy.value) return
    busy.value = true
    error.value = ''
    try {
      const body = new globalThis.FormData()
      body.set('file', file.value)
      body.set('series_id', props.seriesId)
      body.set('content_type', props.contentType)
      body.set('mode', props.kind.toUpperCase())
      const order = await adapter.upload(body, uploadKey)
      await router.replace({
        name: 'content-work-order',
        params: { id: order.work_order_id },
        query: { view: 'import' }
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
    <ElButton type="primary" :disabled="!file || !seriesId" :loading="busy" @click="upload"
      >上传并校验内容</ElButton
    ></AdminPanel
  >
</template>
