<script setup lang="ts">
import { Loading } from '@element-plus/icons-vue'
import { computed } from 'vue'

import AdminPanel from '@/components/admin-panel/admin-panel.vue'

import type { ImportProgressState } from './use-import-progress'

const props = defineProps<{ state: ImportProgressState; message: string; longRunning: boolean }>()
const emit = defineEmits<{ reconnect: [] }>()
const waiting = computed(() => ['loading', 'waiting', 'checking'].includes(props.state))
const titles: Record<ImportProgressState, string> = {
  loading: '等待校验结果',
  waiting: '等待校验',
  checking: '正在解析校验',
  ready: '校验完成',
  failed: '校验失败',
  cancelled: '本次导入已取消',
  disconnected: '连接暂时中断',
  error: '暂时无法读取校验状态'
}
</script>
<template>
  <AdminPanel :title="titles[state]">
    <div class="import-progress" role="status" aria-live="polite" :aria-busy="waiting">
      <ElIcon v-if="waiting" class="is-loading"><Loading /></ElIcon>
      <p>
        {{
          message ||
          (waiting
            ? '文件已接收，校验结果会自动更新，无需手动刷新。'
            : '请查看本次导入状态后继续处理。')
        }}
      </p>
    </div>
    <p v-if="waiting && longRunning">本次校验耗时较长，可先离开，稍后从工作单继续查看。</p>
    <ElButton v-if="state === 'disconnected' || state === 'error'" @click="emit('reconnect')"
      >重新连接</ElButton
    >
  </AdminPanel>
</template>
<style scoped lang="scss">
.import-progress {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--juya-color-text-regular);

  p {
    margin: 0;
    overflow-wrap: anywhere;
  }
}
</style>
