<script setup lang="ts">
import type { DialogueRow, SceneAudio } from './scene-form'
import type { createSegmentPlayer } from '@/features/audio/segment-player'

import { createDialogueRow } from './scene-form'

const rows = defineModel<DialogueRow[]>({ required: true })
const props = defineProps<{
  audio?: SceneAudio | null
  timing?: boolean
  canRecord?: boolean
  playback?: ReturnType<typeof createSegmentPlayer> | null
}>()
const emit = defineEmits<{
  play: [row: DialogueRow]
  record: [row: DialogueRow, edge: 'start_ms' | 'end_ms']
}>()
/** 移动句子而保留稳定编号。
 * @param index - 当前序号
 * @param offset - 移动方向
 */
function move(index: number, offset: number): void {
  const row = rows.value[index]
  if (!row || index + offset < 0 || index + offset >= rows.value.length) return
  rows.value.splice(index, 1)
  rows.value.splice(index + offset, 0, row)
}
/** 将确认的时间点绑定到当前整段音频版本。
 * @param row - 对话行
 */
function confirm(row: DialogueRow): void {
  row.audio_version_id = row.timing_confirmed ? (props.audio?.version_id ?? null) : null
}
/** 时间点编辑后要求重新确认。
 * @param row - 对话行
 */
function invalidate(row: DialogueRow): void {
  row.timing_confirmed = false
  row.audio_version_id = null
}
</script>
<template>
  <div class="dialogue-fields">
    <ElEmpty v-if="!rows.length" description="添加第一句对话" />
    <div v-for="(row, index) in rows" :key="row.id" class="dialogue-row">
      <div class="row-heading">
        <strong>句子 {{ index + 1 }}</strong
        ><small>{{ row.id }}</small
        ><ElButton link :disabled="index === 0" @click="move(index, -1)">上移</ElButton
        ><ElButton link :disabled="index === rows.length - 1" @click="move(index, 1)">下移</ElButton
        ><ElButton link type="danger" @click="rows.splice(index, 1)">删除句子</ElButton>
      </div>
      <ElForm label-position="top">
        <ElFormItem label="说话人"
          ><ElInput v-model="row.speaker" :aria-label="`说话人 ${index + 1}`"
        /></ElFormItem>
        <ElFormItem label="英文句子"
          ><ElInput
            v-model="row.english"
            :aria-label="`英文句子 ${index + 1}`"
            type="textarea"
            :rows="2"
            @change="invalidate(row)"
        /></ElFormItem>
        <ElFormItem label="中文翻译"
          ><ElInput
            v-model="row.chinese"
            :aria-label="`中文翻译 ${index + 1}`"
            type="textarea"
            :rows="2"
        /></ElFormItem>
        <div v-if="timing" class="timing-fields">
          <ElFormItem label="开始毫秒"
            ><ElInputNumber
              v-model="row.start_ms"
              :aria-label="`开始毫秒 ${index + 1}`"
              :min="0"
              :max="audio?.duration_ms"
              :precision="0"
              :step="10"
              @change="invalidate(row)"
          /></ElFormItem>
          <ElFormItem label="结束毫秒"
            ><ElInputNumber
              v-model="row.end_ms"
              :aria-label="`结束毫秒 ${index + 1}`"
              :min="0"
              :max="audio?.duration_ms"
              :precision="0"
              :step="10"
              @change="invalidate(row)"
          /></ElFormItem>
          <ElButton :disabled="!audio || !canRecord" @click="emit('record', row, 'start_ms')"
            >记录本句开始</ElButton
          ><ElButton :disabled="!audio || !canRecord" @click="emit('record', row, 'end_ms')"
            >记录本句结束</ElButton
          ><ElCheckbox
            v-model="row.timing_confirmed"
            :disabled="
              !audio || row.start_ms === null || row.end_ms === null || row.end_ms <= row.start_ms
            "
            @change="confirm(row)"
            >标时已核对</ElCheckbox
          >
          <ElButton
            :disabled="
              !audio || row.start_ms === null || row.end_ms === null || row.end_ms <= row.start_ms
            "
            @click="emit('play', row)"
            >{{ playback?.label(row.id) ?? '试听' }}此句</ElButton
          >
        </div>
      </ElForm>
    </div>
    <ElButton @click="rows.push(createDialogueRow())">添加句子</ElButton>
  </div>
</template>
<style scoped lang="scss">
.dialogue-row {
  margin-bottom: 16px;
  padding: 14px;
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
}

.row-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

small {
  flex: 1;
  color: var(--juya-color-text-secondary);
  overflow-wrap: anywhere;
}

.timing-fields {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}
</style>
