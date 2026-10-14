<script setup lang="ts">
import ImportResourcePreview from './import-resource-preview.vue'

defineProps<{
  batchId: string
  busy: boolean
  contentType?: string
  rows: {
    path: string
    pronunciation_path?: string
    entry_id?: string
    english: string
    meaning: string
    source: string
    role: string
    operation: string
  }[]
}>()
const labels: Record<string, string> = {
  COVER_IMAGE: '封面',
  LEARNING_IMAGE: '学习原图',
  WORD_IMAGE: '词汇小图',
  WHOLE_AUDIO: '整段音频',
  FULL_AUDIO: '全文音频',
  WORD_AUDIO: '词汇音频',
  CHUNK_AUDIO: '语块音频'
}
</script>
<template>
  <div class="content-materials-preview">
    <ElTable v-if="contentType === 'short_reading'" :data="rows" aria-label="短文素材预览">
      <ElTableColumn label="文件" prop="path" min-width="220" />
      <ElTableColumn label="角色" min-width="150"
        ><template #default="{ row }">{{ labels[row.role] }}</template></ElTableColumn
      >
      <ElTableColumn label="来源" prop="source" min-width="220" />
      <ElTableColumn label="素材预览" min-width="180"
        ><template #default="{ row }"
          ><ImportResourcePreview
            source="materials"
            :batch-id="batchId"
            :path="row.path"
            :disabled="busy" /></template
      ></ElTableColumn>
    </ElTable>
    <ElTable
      v-else-if="rows.some((row) => row.role !== 'CHUNK_AUDIO')"
      :data="rows.filter((row) => row.role !== 'CHUNK_AUDIO')"
    >
      <ElTableColumn label="图片 / 音频" min-width="150"
        ><template #default="{ row }"
          ><ImportResourcePreview
            v-if="row.path"
            source="materials"
            :batch-id="batchId"
            :path="row.path"
            :disabled="busy"
          /><span v-else>无图已确认</span></template
        ></ElTableColumn
      >
      <ElTableColumn
        v-if="rows.some((row) => row.pronunciation_path)"
        label="词汇独立音频"
        min-width="230"
      >
        <template #default="{ row }">
          <section v-if="row.pronunciation_path" :aria-label="`词汇独立音频 ${row.entry_id}`">
            <span>词汇独立音频 · WORD_AUDIO</span>
            <p>{{ row.pronunciation_path }}</p>
            <ImportResourcePreview
              source="materials"
              :batch-id="batchId"
              :path="row.pronunciation_path"
              :disabled="busy"
            />
          </section>
        </template>
      </ElTableColumn>
      <ElTableColumn label="条目 ID" prop="entry_id" min-width="160" />
      <ElTableColumn label="英文" prop="english" min-width="120" />
      <ElTableColumn label="当前释义" prop="meaning" min-width="140" />
      <ElTableColumn label="来源" prop="source" min-width="160" />
      <ElTableColumn label="本次操作" min-width="140"
        ><template #default="{ row }">{{
          row.operation === 'CREATE'
            ? '新增条目'
            : row.operation === 'UPDATE'
              ? '更新当前条目'
              : row.operation === 'SKIP'
                ? '跳过完全重复记录'
                : `关联${labels[row.role] || '素材'}`
        }}</template></ElTableColumn
      >
    </ElTable>
    <ElTable
      v-if="contentType !== 'short_reading' && rows.some((row) => row.role === 'CHUNK_AUDIO')"
      :data="rows.filter((row) => row.role === 'CHUNK_AUDIO')"
      aria-label="语块资料预览"
    >
      <ElTableColumn label="语块 ID" prop="entry_id" min-width="160" />
      <ElTableColumn label="英文" prop="english" min-width="140" />
      <ElTableColumn label="当前释义" prop="meaning" min-width="160" />
      <ElTableColumn label="来源" prop="source" min-width="160" />
      <ElTableColumn label="独立音频" min-width="170"
        ><template #default="{ row }"
          ><ImportResourcePreview
            v-if="row.path"
            source="materials"
            :batch-id="batchId"
            :path="row.path"
            :disabled="busy"
          /><span v-else>未提供选填音频</span></template
        ></ElTableColumn
      >
    </ElTable>
  </div>
</template>
<style scoped lang="scss">
.content-materials-preview {
  display: grid;
  gap: 16px;
}
</style>
