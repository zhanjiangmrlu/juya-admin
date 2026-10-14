<script setup lang="ts">
defineProps<{
  page: number
  targetId: string
  targets: { id: string; revisionId: string; title: string }[]
  busy: boolean
  missingDraftCount: number
  target: { revisionId: string; version: number } | null
}>()
const emit = defineEmits<{
  'update:page': [value: number]
  'update:targetId': [value: string]
  load: []
  read: []
}>()
</script>
<template>
  <section class="content-materials-target">
    <div class="target-actions">
      <ElInputNumber
        :model-value="page"
        :min="1"
        :precision="0"
        :readonly="busy"
        aria-label="素材草稿页码"
        @update:model-value="emit('update:page', $event || 1)"
      />
      <ElButton :loading="busy" @click="emit('load')">加载本页目标草稿</ElButton>
      <ElSelect
        :model-value="targetId"
        aria-label="素材目标草稿"
        placeholder="明确选择来源草稿"
        :disabled="busy"
        @update:model-value="emit('update:targetId', String($event))"
        ><ElOption
          v-for="row in targets"
          :key="row.revisionId"
          :label="`${row.title} · ${row.revisionId}`"
          :value="row.revisionId"
      /></ElSelect>
      <ElButton :disabled="busy || !targetId" @click="emit('read')">读取固定草稿</ElButton>
    </div>
    <ElAlert
      v-if="missingDraftCount"
      :title="`本页 ${missingDraftCount} 篇内容尚无可编辑草稿；请先在内容生产生成候选版本，再加载素材目标。`"
      type="info"
      :closable="false"
      ><RouterLink to="/content/scenes">前往内容生产生成候选版本</RouterLink></ElAlert
    >
    <p v-if="target">
      来源：{{
        targets.find((row) => row.revisionId === target?.revisionId)?.title || target?.revisionId
      }}
      · 当前编辑版本 {{ target.version }}
    </p>
  </section>
</template>
<style scoped lang="scss">
.content-materials-target {
  .target-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin: 16px 0;

    :deep(.el-select) {
      flex: 1 1 180px;
    }
  }

  p {
    font-size: 14px;
    line-height: 22px;
    overflow-wrap: anywhere;
  }
}
</style>
