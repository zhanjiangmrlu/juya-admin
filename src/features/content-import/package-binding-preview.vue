<script setup lang="ts">
import AdminPanel from '@/components/admin-panel/admin-panel.vue'
import AppAudioPlayer from '@/components/app-audio-player/app-audio-player.vue'

import type { ImportPreview } from './content-package-model'

defineProps<{ preview: ImportPreview; busy: boolean; canConfirm: boolean }>()
const selected = defineModel<string[]>('selected', { required: true })
const defaults = defineModel<string[]>('defaults', { required: true })
const diffs = defineModel<string[]>('diffs', { required: true })
const emit = defineEmits<{ confirm: []; back: [] }>()
const defaultLabels: Record<string, string> = {
  default_cover: '确认使用默认封面',
  NO_WORD_IMAGE: '确认本篇单词无图片',
  DEFAULT_COVER: '确认使用服务端说明的默认封面',
  NO_AUDIO: '确认本篇不配全文音频'
}
const actionLabels = { CREATE: '新增草稿', UPDATE: '更新草稿', SKIP: '内容相同，跳过' }
const /**
   * 展示正文或候选值，保留双语内容
   * @param value - 本次服务端提供的字段内容
   * @returns 当前操作结果或完成状态
   */ text = (value: unknown): string => {
    if (value === null || value === undefined || value === '') return '—'
    if (Array.isArray(value)) return value.map(text).join('\n\n')
    if (typeof value === 'object') {
      const row = value as Record<string, unknown>
      return (
        [
          row.speaker,
          row.english,
          row.chinese ?? row.meaning_zh,
          row.explanation,
          row.source_sentence
        ]
          .filter(Boolean)
          .join('\n') || Object.values(row).map(text).join(' · ')
      )
    }
    return String(value)
  }
const fieldLabels: Record<string, string> = {
  title_en: '英文标题',
  title_zh: '中文标题',
  safe_intro: '安全简介',
  category: '类别',
  topic: '题材',
  level: '难度',
  source: '来源',
  copyright: '版权',
  copyright_source: '来源与版权说明',
  entries: '本篇条目、义项与素材对应',
  dialogue: '完整对话',
  paragraphs_en: '英文正文',
  translation_zh: '全文中文',
  vocabulary: '本篇单词',
  words: '本篇单词',
  chunks: '本篇语块'
}
</script>
<template>
  <div class="binding-preview">
    <ElAlert title="确认后只保存草稿，仍需校对与发布" type="info" :closable="false" />
    <AdminPanel v-for="item in preview.items" :key="item.id" :title="item.title">
      <div class="item-heading">
        <ElCheckboxGroup v-model="selected"
          ><ElCheckbox :value="item.id" :disabled="busy || item.action === 'SKIP'"
            >选中这篇</ElCheckbox
          ></ElCheckboxGroup
        ><ElTag>{{ actionLabels[item.action] }}</ElTag>
      </div>
      <dl class="content-fields">
        <template v-for="(label, key) in fieldLabels" :key="key"
          ><template v-if="item.content[key] !== undefined"
            ><dt>{{ label }}</dt>
            <dd>{{ text(item.content[key]) }}</dd></template
          ></template
        >
      </dl>
      <h4>明确素材绑定</h4>
      <ElEmpty v-if="!item.bindings.length" description="本篇无素材绑定" :image-size="45" />
      <div
        v-for="binding in item.bindings"
        :key="`${binding.role}:${binding.target}:${binding.path}`"
        class="binding"
      >
        <span>{{ binding.role }} · {{ binding.target }}</span
        ><small>{{ binding.path }}</small>
        <img
          v-if="binding.url && ['cover', 'word_image', 'learning_image'].includes(binding.role)"
          :src="binding.url"
          :alt="binding.role === 'word_image' ? '本篇单词图片' : '封面或学习材料'"
        />
        <AppAudioPlayer v-if="binding.url && binding.role.includes('audio')" :src="binding.url" />
      </div>
      <template v-if="item.action === 'UPDATE' && item.previous">
        <h4>当前与候选差异</h4>
        <div class="diff-grid">
          <div>
            <strong>当前草稿 · v{{ item.expectedVersion }}</strong>
            <p v-for="(label, key) in fieldLabels" :key="key">
              <template v-if="item.previous[key] !== undefined"
                >{{ label }}：{{ text(item.previous[key]) }}</template
              >
            </p>
          </div>
          <div>
            <strong>候选草稿</strong>
            <p v-for="(label, key) in fieldLabels" :key="key">
              <template v-if="item.content[key] !== undefined"
                >{{ label }}：{{ text(item.content[key]) }}</template
              >
            </p>
          </div>
        </div>
        <ElCheckboxGroup v-model="diffs"
          ><ElCheckbox :value="item.id" :disabled="busy"
            >已核对这篇更新差异</ElCheckbox
          ></ElCheckboxGroup
        >
      </template>
      <ElCheckboxGroup v-model="defaults"
        ><ElCheckbox
          v-for="value in item.requiredDefaults"
          :key="value"
          :value="`${item.id}:${value}`"
          :disabled="busy"
          >{{
            defaultLabels[value] ||
            (value.startsWith('no_image:') ? `确认本篇单词 ${value.slice(9)} 无图片` : value)
          }}</ElCheckbox
        ></ElCheckboxGroup
      >
    </AdminPanel>
    <div class="actions">
      <ElButton :disabled="busy" @click="emit('back')">返回校验</ElButton
      ><ElButton type="primary" :disabled="!canConfirm" :loading="busy" @click="emit('confirm')"
        >确认保存选中 {{ selected.length }} 篇草稿</ElButton
      >
    </div>
  </div>
</template>
<style scoped lang="scss">
.binding-preview {
  display: grid;
  gap: 18px;
}

.item-heading,
.actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 16px;
}

.content-fields {
  display: grid;
  grid-template-columns: 100px minmax(0, 1fr);
  gap: 14px;

  dt {
    color: var(--juya-color-text-secondary);
  }

  dd {
    margin: 0;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    line-height: 1.7;
  }
}

.binding {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 14px;
  padding: 12px 0;
  border-bottom: 1px solid var(--el-border-color-light);

  img {
    width: 80px;
    height: 80px;
    object-fit: contain;
  }

  small {
    overflow-wrap: anywhere;
  }

  audio {
    max-width: 100%;
  }
}

.diff-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  margin-bottom: 16px;

  > div {
    padding: 16px;
    border: 1px solid var(--el-border-color-light);
    border-radius: 12px;
  }

  p {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
}

@media (width <= 800px) {
  .diff-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .content-fields {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
