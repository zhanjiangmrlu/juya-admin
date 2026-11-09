<script setup lang="ts">
import { ElButton } from 'element-plus'
import { onBeforeUnmount, onMounted, ref } from 'vue'

import { api } from '@/services/http-client'
const props = defineProps<{ mediaId: string }>()
defineEmits<{ close: [] }>()
const url = ref(''),
  error = ref(''),
  busy = ref(false)
let alive = true
/** 通过管理员认证读取PDF，重试时释放旧Blob地址 */
const load = async () => {
  if (busy.value) return
  busy.value = true
  error.value = ''
  if (url.value) URL.revokeObjectURL(url.value)
  url.value = ''
  try {
    const blob = await api.blob(`/api/admin/v1/media/${encodeURIComponent(props.mediaId)}`)
    if (alive) url.value = URL.createObjectURL(blob)
  } catch (reason) {
    if (alive) error.value = reason instanceof Error ? reason.message : 'PDF打开失败，请重试'
  } finally {
    if (alive) busy.value = false
  }
}
onMounted(load)
onBeforeUnmount(() => {
  alive = false
  if (url.value) URL.revokeObjectURL(url.value)
})
</script>
<template>
  <ElDialog
    :model-value="true"
    title="学习笔记PDF · 管理员只读预览"
    width="min(1000px,95vw)"
    destroy-on-close
    @close="$emit('close')"
  >
    <p v-if="busy" role="status">正在打开学习笔记</p>
    <p v-if="error" role="alert">{{ error }} <ElButton @click="load">重试</ElButton></p>
    <iframe v-if="url" :src="url" title="学习笔记PDF" class="pdf-frame" />
    <p v-if="url"><a :href="url" target="_blank" rel="noopener">在新窗口查看PDF</a></p>
  </ElDialog>
</template>
<style scoped lang="scss">
.pdf-frame {
  width: 100%;
  height: 65vh;
  border: 1px solid var(--line);
}
</style>
