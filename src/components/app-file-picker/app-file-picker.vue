<script setup lang="ts">
import { ref } from 'vue'

defineProps<{ label: string; accept: string; multiple?: boolean; disabled?: boolean }>()
const emit = defineEmits<{ change: [event: Event] }>(),
  input = ref<HTMLInputElement | null>(null)
/** 由中文按钮打开原生文件选择器，保留原浏览器文件安全机制 */
const choose = () => {
  input.value?.click()
}
</script>
<template>
  <div class="app-file-picker">
    <button type="button" :disabled="disabled" @click="choose">{{ label }}</button
    ><input
      ref="input"
      type="file"
      :accept="accept"
      :multiple="multiple"
      :disabled="disabled"
      :aria-label="label"
      tabindex="-1"
      @change="emit('change', $event)"
    />
  </div>
</template>
<style scoped lang="scss">
.app-file-picker {
  position: relative;

  input {
    position: absolute;
    width: 1px;
    height: 1px;
    min-height: 0;
    padding: 0;
    overflow: hidden;
    clip-path: inset(50%);
  }
}
</style>
