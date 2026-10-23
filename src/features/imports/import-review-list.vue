<script setup lang="ts">
import { ref, watch } from 'vue'

import SceneTitle from '@/features/scenes/scene-title.vue'
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
const managing = ref(false),
  removalIds = ref<string[]>([])
/** 切换批量移除模式，并清空上一轮独立选择范围 */
const toggleManaging = () => {
  managing.value = !managing.value
  removalIds.value = []
}
/** 判断当前导入项是否尚未提交草稿保存
 * @param entry 当前列表中的独立核对记录
 * @returns 是否可以从本次导入移除
 */
const removable = (entry: ImportEntry) =>
  !entry.item.job_id && !entry.item.saved_card_id && !entry.saving
/** 在批量移除模式下维护独立范围，保存勾选不受影响
 * @param entry 当前被勾选的核对记录
 * @param event 复选框变化事件
 */
const chooseRemoval = (entry: ImportEntry, event: Event) => {
  removalIds.value = removalIds.value.filter((id) => id !== entry.item.id)
  if ((event.target as HTMLInputElement).checked) removalIds.value.push(entry.item.id)
}
watch(
  () => props.entries,
  () => {
    removalIds.value = removalIds.value.filter((id) =>
      props.entries.some((entry) => entry.item.id === id && removable(entry))
    )
  }
)
const emit = defineEmits<{
  select: [entry: ImportEntry, event: Event]
  expand: [id: string]
  remove: [ids: string[]]
}>()
</script>
<template>
  <div class="table-wrap review-list">
    <div class="row removal-actions">
      <button type="button" data-action="manage-removals" :disabled="busy" @click="toggleManaging">
        {{ managing ? '退出批量移除' : '批量移除卡片' }}
      </button>
      <template v-if="managing">
        <button
          type="button"
          :disabled="busy"
          @click="removalIds = entries.filter(removable).map((entry) => entry.item.id)"
        >
          选择全部可移除项
        </button>
        <button
          type="button"
          data-action="remove-selected-items"
          :disabled="busy || !removalIds.length"
          @click="emit('remove', removalIds)"
        >
          移除所选 {{ removalIds.length }} 张
        </button>
      </template>
    </div>
    <p v-if="!entries.length" class="notice">本次暂无待核对卡片，可返回补充文件继续上传。</p>
    <table>
      <thead>
        <tr>
          <th>选</th>
          <th>双语标题／来源</th>
          <th>读取结果</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        <template v-for="entry in entries" :key="entry.item.id">
          <tr :data-item-id="entry.item.id" :class="{ active: activeId === entry.item.id }">
            <td>
              <input
                v-if="managing"
                type="checkbox"
                :checked="removalIds.includes(entry.item.id)"
                :disabled="busy || !removable(entry)"
                :aria-label="`移除 ${entry.edit.content.name}`"
                @change="chooseRemoval(entry, $event)"
              />
              <input
                v-else
                type="checkbox"
                :checked="entry.edit.selected"
                :disabled="
                  busy ||
                  !entry.item.readable ||
                  ['saved', 'duplicate', 'saving'].includes(entry.item.state)
                "
                :aria-label="`选择 ${entry.edit.content.name}`"
                @change="emit('select', entry, $event)"
              />
            </td>
            <td>
              <div class="review-title">
                <img
                  v-if="entry.item.thumbnail_id"
                  :src="mediaURL(entry.item.thumbnail_id)"
                  alt="核对缩略图"
                  loading="lazy"
                />
                <div>
                  <SceneTitle
                    :name="entry.edit.content.name"
                    :title-en="entry.edit.content.title_en"
                  />
                  <p v-if="entry.item.source_zip_name" class="source">
                    {{ sourceName(entry) }} / {{ entry.item.source_folder }}
                  </p>
                </div>
              </div>
            </td>
            <td>
              <span
                class="badge"
                :class="{ draft: entry.item.issues.length || entry.item.state === 'duplicate' }"
                >{{ importStates[entry.item.state] || '待核对' }}</span
              >
              <p v-if="entry.item.issues.length" class="issue">
                {{ entry.item.issues[0]?.message }}
              </p>
              <small v-if="entry.saving || entry.error || dirtyIds.includes(entry.item.id)">{{
                entry.saving ? '保存中…' : entry.error ? '暂存未成功' : '等待暂存'
              }}</small>
            </td>
            <td>
              <button
                type="button"
                class="text small"
                data-action="remove-import-item"
                :disabled="busy || !removable(entry)"
                @click="emit('remove', [entry.item.id])"
              >
                移除
              </button>
              <button
                type="button"
                class="text small"
                :disabled="busy"
                :aria-expanded="activeId === entry.item.id"
                :aria-controls="`review-${entry.item.id}`"
                @click="emit('expand', entry.item.id)"
              >
                {{ activeId === entry.item.id ? '收起核对' : '展开核对' }}
              </button>
            </td>
          </tr>
          <tr
            v-if="activeId === entry.item.id"
            :id="`review-${entry.item.id}`"
            class="expanded-row"
          >
            <td colspan="4"><slot :entry="entry" /></td>
          </tr>
        </template>
      </tbody>
    </table>
  </div>
</template>
<style scoped lang="scss">
.review-list {
  .removal-actions {
    padding: 12px 0;
    flex-wrap: wrap;
  }

  table {
    table-layout: fixed;
    min-width: 700px;
  }

  th:first-child {
    width: 5%;
  }

  th:nth-child(2) {
    width: 43%;
  }

  th:nth-child(3) {
    width: 19%;
  }

  th:last-child {
    width: 33%;
  }

  th {
    padding-top: 15px;
    padding-bottom: 15px;
  }

  td {
    padding: 20px 14px;
  }

  td:first-child {
    text-align: center;
  }

  .review-title {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;

    > div {
      min-width: 0;
    }

    img {
      width: 48px;
      height: 72px;
      object-fit: contain;
      flex-shrink: 0;
    }
  }

  .source,
  .issue,
  small {
    display: block;
    margin-top: 7px;
    font-size: 12px;
    line-height: 1.7;
    color: var(--muted);
    overflow-wrap: anywhere;
  }

  .expanded-row > td {
    padding: 24px;
    text-align: left;
    background: #fbfdf8;
    white-space: normal;
  }

  .expanded-row:hover {
    background: none;
  }
}
</style>
