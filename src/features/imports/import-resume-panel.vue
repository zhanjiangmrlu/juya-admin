<script setup lang="ts">
import { computed, ref } from 'vue'

import { dateText } from '@/services/display'
import { importErrors } from '@/shared/constants/import'

import type { ImportBatch } from '@/shared/types/import'

const props = defineProps<{
  batches: ImportBatch[]
  loading: boolean
  busy: boolean
  resumingId: string
  error: string
  notice: string
}>()
const emit = defineEmits<{ resume: [id: string]; refresh: [] }>()
const expanded = ref(true)
const single = computed(() => (props.batches.length === 1 ? props.batches[0] : null))
const stages: Record<ImportBatch['stage'], string> = {
  upload: '上传资料',
  processing: '正在读取资料',
  review: '核对卡片',
  result: '保存结果'
}
/** 展示服务端已保存的来源名称，不用批次编号代替文件
 * @param batch 当前待处理批次
 * @returns 管理员可识别的来源
 */
const sourceText = (batch: ImportBatch) => batch.source_names.join('、') || '已保存资料'
/** 汇总尚未处理项目的问题，保留已成功资料的真实结果
 * @param batch 当前待处理批次及逐文件、逐卡状态
 * @returns 至多两个必要问题及其余数量
 */
const problemText = (batch: ImportBatch) => {
  const messages = [
    ...new Set([
      ...batch.files
        .filter((file) => file.state === 'failed')
        .map((file) => importErrors[file.error_code || ''] || '部分文件处理失败，请核对或重新选择'),
      ...batch.items
        .filter((item) => !['saved', 'duplicate'].includes(item.state))
        .flatMap((item) => [
          ...(item.state === 'failed'
            ? [importErrors[item.error_code || ''] || '部分草稿未保存，可继续核对']
            : []),
          ...item.issues.map((issue) => issue.message)
        ])
    ])
  ]
  return (
    messages.slice(0, 2).join('；') +
    (messages.length > 2 ? `；另有${messages.length - 2}项待核对` : '')
  )
}
</script>
<template>
  <div v-if="batches.length || error || notice || loading" class="recovery-area">
    <p v-if="notice" class="notice" role="status">{{ notice }}</p>
    <p v-if="error" class="notice error" role="alert">
      <span>{{ error }}</span>
      <button
        type="button"
        class="text"
        data-action="refresh-resumable"
        :disabled="loading || busy"
        @click="emit('refresh')"
      >
        重新查询
      </button>
    </p>
    <section
      v-if="batches.length"
      class="resume-panel"
      aria-label="未完成导入批次"
      :aria-busy="loading"
    >
      <div class="resume-heading between" :data-resume-batch="single?.id">
        <div>
          <h2>有 {{ batches.length }} 个未完成批次</h2>
          <p class="help">选择服务端已保存的批次，回到实际处理阶段。</p>
          <template v-if="single">
            <p class="source">
              <strong>{{ sourceText(single) }}</strong>
            </p>
            <p class="metadata">{{ dateText(single.updated_at) }} · {{ stages[single.stage] }}</p>
            <p v-if="problemText(single)" class="problem">{{ problemText(single) }}</p>
          </template>
        </div>
        <button
          v-if="single"
          type="button"
          class="primary"
          data-action="resume-import"
          :disabled="busy"
          @click="emit('resume', single.id)"
        >
          {{ resumingId === single.id ? '正在恢复…' : '继续处理' }}
        </button>
        <button
          v-else
          type="button"
          class="primary"
          data-action="choose-import"
          :aria-expanded="expanded"
          aria-controls="import-resume-list"
          @click="expanded = !expanded"
        >
          {{ expanded ? '收起待处理批次' : '选择继续处理的批次' }}
        </button>
      </div>
      <ul v-if="!single && expanded" id="import-resume-list" class="resume-list">
        <li v-for="value in batches" :key="value.id" class="between" :data-resume-batch="value.id">
          <div>
            <strong class="source">{{ sourceText(value) }}</strong>
            <p class="metadata">{{ dateText(value.updated_at) }} · {{ stages[value.stage] }}</p>
            <p v-if="problemText(value)" class="problem">{{ problemText(value) }}</p>
          </div>
          <button
            type="button"
            class="text"
            data-action="resume-import"
            :disabled="busy"
            @click="emit('resume', value.id)"
          >
            {{ resumingId === value.id ? '正在恢复…' : '继续处理' }}
          </button>
        </li>
      </ul>
    </section>
    <p v-else-if="loading" class="small muted" role="status">正在查询待处理批次…</p>
  </div>
</template>
<style scoped lang="scss">
.recovery-area {
  margin-bottom: 24px;

  .notice {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }
}

.resume-panel {
  padding: 22px 24px;
  background: var(--soft);
  border-radius: 12px;

  h2 {
    font-weight: 700;
    line-height: 28px;
  }

  button {
    flex-shrink: 0;
  }

  .help {
    margin-top: 6px;
    color: var(--muted);
    font-size: 13px;
    line-height: 22px;
  }

  .source {
    overflow-wrap: anywhere;
  }

  p.source {
    margin-top: 12px;
  }

  .metadata,
  .problem {
    color: var(--muted);
    font-size: 13px;
    line-height: 24px;
    margin-top: 5px;
    overflow-wrap: anywhere;
  }

  .resume-list {
    list-style: none;
    margin: 18px 0 0;
    padding: 0;
    border-top: 1px solid var(--line);

    li {
      padding: 16px 0;
      border-bottom: 1px solid var(--line);
    }
  }
}
</style>
