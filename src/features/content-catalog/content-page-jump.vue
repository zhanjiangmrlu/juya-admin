<script setup lang="ts">
import { ElButton, ElInput } from 'element-plus'
import { ref } from 'vue'

import { parsePageTarget } from './content-catalog-model'
const props = defineProps<{ page: number; totalPages: number; busy?: boolean }>()
const emit = defineEmits<{ jump: [page: number] }>()
const input = ref(''),
  error = ref('')
/** 校验后提交明确目标，输入及失焦不触发请求 */
const submit = () => {
  if (props.busy || !props.totalPages) return
  try {
    const target = parsePageTarget(input.value, props.totalPages)
    error.value = ''
    if (target !== props.page) emit('jump', target)
  } catch (reason) {
    error.value = (reason as Error).message
  }
}
</script>
<template>
  <form class="page-jump" @submit.prevent="submit">
    <span>前往</span
    ><ElInput
      v-model="input"
      aria-label="前往页码"
      :disabled="busy || !totalPages"
      inputmode="numeric"
    /><span>页</span><ElButton native-type="submit" :disabled="busy || !totalPages">跳转</ElButton
    ><small v-if="error" class="error" role="alert">{{ error }}</small>
  </form>
</template>
<style scoped lang="scss">
.page-jump {
  display: flex;
  align-items: center;
  gap: 9px;
  flex-wrap: wrap;

  .el-input {
    width: 62px;
  }

  small {
    width: 100%;
  }
}
</style>
