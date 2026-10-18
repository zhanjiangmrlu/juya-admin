<script setup lang="ts">
import { mediaURL } from '@/services/display'
import { importStates } from '@/shared/constants/import'

import type { ImportEntry } from '@/shared/types/import'
const props = defineProps<{
  entries: ImportEntry[]
  activeId?: string
  busy: boolean
  dirtyIds: string[]
}>()
/** 为同名但不同来源包显示本批顺序，避免管理员混淆
 * @param entry 当前卡片及其来源包
 * @returns 可读来源名称
 */
const sourceName = (entry: ImportEntry) => {
  const sources = [
    ...new Map(
      props.entries
        .filter((value) => value.item.source_zip_name === entry.item.source_zip_name)
        .map((value) => [value.item.source_zip_id, value.item.source_zip_name])
    ).keys()
  ]
  return `${entry.item.source_zip_name}${sources.length > 1 ? `（第${sources.indexOf(entry.item.source_zip_id) + 1}包）` : ''}`
}
const emit = defineEmits<{ select: [entry: ImportEntry, event: Event]; expand: [id: string] }>()
</script>
<template>
  <aside class="panel review-list">
    <div
      v-for="entry in entries"
      :key="entry.item.id"
      :class="{ active: activeId === entry.item.id }"
    >
      <label
        ><input
          type="checkbox"
          :checked="entry.edit.selected"
          :disabled="
            busy ||
            !entry.item.readable ||
            ['saved', 'duplicate', 'saving'].includes(entry.item.state)
          "
          :aria-label="`选择 ${entry.edit.content.name}`"
          @change="emit('select', entry, $event)"
        /><img
          v-if="entry.item.thumbnail_id"
          :src="mediaURL(entry.item.thumbnail_id)"
          alt="核对缩略图"
          loading="lazy"
        /><button type="button" class="text" @click="emit('expand', entry.item.id)">
          {{ entry.edit.content.name || '未命名资料' }}
        </button></label
      >
      <p v-if="entry.item.source_zip_name" class="small muted">
        来源：{{ sourceName(entry) }} / {{ entry.item.source_folder }}
      </p>
      <p>{{ importStates[entry.item.state] || '待核对' }}</p>
      <p v-if="entry.item.issues.length" class="small muted">{{ entry.item.issues[0]?.message }}</p>
      <small>{{
        entry.saving
          ? '保存中…'
          : entry.error
            ? '暂存未成功'
            : dirtyIds.includes(entry.item.id)
              ? '等待暂存'
              : '已暂存'
      }}</small>
    </div>
  </aside>
</template>
<style scoped lang="scss">
.review-list {
  position: sticky;
  top: 20px;
  padding: 10px;
  max-height: 75vh;
  overflow: auto;

  > div {
    padding: 14px 10px;
    border-radius: 6px;
    border-bottom: 1px solid var(--line);

    &.active {
      background: var(--soft);
    }

    label {
      display: flex;
      align-items: start;
      gap: 8px;

      img {
        width: 34px;
        height: 44px;
        border-radius: 4px;
        object-fit: cover;
      }

      button {
        padding: 0;
        text-align: left;
      }
    }

    p {
      margin: 8px 0;
      font-size: 12px;
    }

    small {
      color: var(--muted);
      font-size: 11px;
    }
  }
}
</style>
