<script setup lang="ts">
import { ref } from 'vue'

import AppFilePicker from '@/components/app-file-picker/app-file-picker.vue'
import { api } from '@/services/http-client'
import { listeningBase } from '@/services/listening-service'

import type { ArticlePayload } from './listening-types'

const props = defineProps<{ payload: ArticlePayload; disabled?: boolean }>(),
  emit = defineEmits<{ apply: [payload: ArticlePayload] }>()
const parsed = ref<{ payload: ArticlePayload; hints: Record<string, string> } | null>(null),
  busy = ref(false),
  error = ref(''),
  open = ref(false),
  progress = ref('')
let pending: { form: FormData; key: string } | null = null
/** 解析DOCX且不创建导入批次，不覆盖当前表单 */
const read = async () => {
  if (!pending) return
  busy.value = true
  error.value = ''
  try {
    parsed.value = await api.upload(
      `${listeningBase}/docx-preview`,
      pending.form,
      pending.key,
      (value) => {
        progress.value =
          value.percent === null
            ? `已上传${value.loaded}字节`
            : `传输${value.percent}%${value.percent === 100 ? '，正在解析' : ''}`
      }
    )
    open.value = true
    pending = null
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '文档读取失败，原输入保留'
  } finally {
    busy.value = false
  }
}
/** 读取单份模板资料，失败可以原键重试
 * @param event 单份模板文档选择事件
 */
const choose = (event: Event) => {
  const input = event.target as HTMLInputElement,
    file = input.files?.[0]
  if (!file) return
  const form = new FormData()
  form.append('file', file)
  pending = { form, key: crypto.randomUUID() }
  void read()
  input.value = ''
}
/** 明确确认后带入文档，保留当前音频与原图，不自动保存或发布 */
const apply = () => {
  if (!parsed.value) return
  emit('apply', {
    ...JSON.parse(JSON.stringify(parsed.value.payload)),
    audio_id: props.payload.audio_id,
    image_id: props.payload.image_id
  })
  open.value = false
}
</script>
<template>
  <section class="docx-import">
    <label class="field"
      >从DOCX带入（先核对变化）<AppFilePicker
        label="选择DOCX文件"
        accept=".docx"
        :disabled="busy || disabled"
        @change="choose"
      /><small>{{ progress || '解析后先展示当前输入与文档内容，确认后才替换表单' }}</small></label
    >
    <p v-if="error" class="notice error" role="alert">
      {{ error }}<button v-if="pending" :disabled="busy" @click="read">以原操作重试读取</button>
    </p>
    <ElDialog v-model="open" title="核对DOCX带入变化" width="1000px" :close-on-click-modal="false">
      <p class="notice">
        确认后替换表单双标题、正文、译文、表达和词义；保留当前音频与原图。请核对主题归属，尚不保存或发布文章
      </p>
      <p v-if="parsed?.hints" class="muted small">
        文档归属提示：{{
          Object.entries(parsed.hints)
            .map(([label, value]) => `${label}：${value}`)
            .join(' / ') || '无，请人工确认'
        }}
      </p>
      <div v-if="parsed" class="comparison">
        <div>
          <h3>当前输入</h3>
          <h4>{{ payload.title_zh }} / {{ payload.title_en }}</h4>
          <p class="body-text">{{ payload.body_en }}</p>
          <p class="body-text">{{ payload.translation_zh }}</p>
          <p>表达 {{ payload.expressions.length }} 组</p>
        </div>
        <div>
          <h3>文档带入</h3>
          <h4>
            {{ parsed.payload.title_zh || '中文标题缺失' }} /
            {{ parsed.payload.title_en || '英文标题缺失' }}
          </h4>
          <p class="body-text">{{ parsed.payload.body_en }}</p>
          <p class="body-text">{{ parsed.payload.translation_zh }}</p>
          <p>表达 {{ parsed.payload.expressions.length }} 组</p>
        </div>
      </div>
      <template #footer
        ><button @click="open = false">取消带入</button
        ><button class="primary" :disabled="!parsed || busy" @click="apply">
          确认带入以上资料
        </button></template
      >
    </ElDialog>
  </section>
</template>
<style scoped lang="scss">
.docx-import {
  border-bottom: 1px solid var(--line);
  padding-bottom: 12px;

  .comparison {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 24px;

    h4 {
      overflow-wrap: anywhere;
    }

    .body-text {
      white-space: pre-wrap;
      max-height: 240px;
      overflow: auto;
      margin: 14px 0;
    }
  }
}
</style>
