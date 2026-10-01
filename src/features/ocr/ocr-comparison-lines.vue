<script setup lang="ts">
import type { OcrGroup, OcrSuggestions } from './ocr-suggestions'
defineProps<{ suggestions: OcrSuggestions; acceptedGroups: string[] }>()
const emit = defineEmits<{
  assign: [text: string, field: string, lineId: number]
  group: [group: OcrGroup]
}>()
</script>
<template>
  <div class="ocr-comparison-lines">
    <p>
      低于 {{ Math.round(suggestions.low_confidence_threshold * 100) }}%
      或无置信度的行需重点复核。四部分建议仅供人工选择，不提供原图中不存在的翻译。
    </p>
    <div class="group-grid">
      <ElCard v-for="group in suggestions.groups" :key="group.field" shadow="never">
        <h4>{{ group.label }} · {{ group.line_ids.length }} 行</h4>
        <p>{{ group.reason }}</p>
        <p v-for="id in group.line_ids" :key="id">
          {{ suggestions.lines.find((line) => line.id === id)?.text }}
        </p>
        <ElButton
          :disabled="!group.line_ids.length || acceptedGroups.includes(group.field)"
          @click="emit('group', group)"
          >{{
            acceptedGroups.includes(group.field) ? '已加入候选' : '确认分组并加入候选'
          }}</ElButton
        >
      </ElCard>
    </div>
    <p>未分组：{{ suggestions.unassigned_line_ids.length }} 行，请对照原图逐项判断。</p>
    <div v-for="line in suggestions.lines" :key="line.id" class="ocr-line">
      <div>
        <strong>{{ line.id + 1 }}. {{ line.text }}</strong>
        <p>
          位置：{{ Object.keys(line.location).length ? JSON.stringify(line.location) : '未返回' }} ·
          置信度：{{
            line.confidence === null ? '未返回' : `${Math.round(line.confidence * 100)}%`
          }}
        </p>
        <ElTag v-if="line.low_confidence" type="warning">低可信／需复核</ElTag>
      </div>
      <ElDropdown @command="emit('assign', line.text, $event, line.id)"
        ><ElButton>分配候选字段</ElButton
        ><template #dropdown
          ><ElDropdownMenu
            ><ElDropdownItem command="title_en">英文标题</ElDropdownItem
            ><ElDropdownItem command="title_zh">中文标题</ElDropdownItem
            ><ElDropdownItem command="dialogue">对话句子</ElDropdownItem
            ><ElDropdownItem command="vocabulary">词汇</ElDropdownItem
            ><ElDropdownItem command="chunks">语块</ElDropdownItem></ElDropdownMenu
          ></template
        ></ElDropdown
      >
    </div>
  </div>
</template>
<style scoped lang="scss">
.group-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.ocr-line {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid var(--el-border-color-light);
}

.ocr-line div {
  min-width: 0;
  overflow-wrap: anywhere;
}

@media (width <= 900px) {
  .group-grid {
    grid-template-columns: 1fr;
  }
}
</style>
