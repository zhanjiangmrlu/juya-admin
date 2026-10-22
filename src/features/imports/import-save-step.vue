<script setup lang="ts">
import { computed } from 'vue'

import SceneTitle from '@/features/scenes/scene-title.vue'
import { importErrors, importStates } from '@/shared/constants/import'

import type { ImportConfirmation, ImportEntry } from '@/shared/types/import'
const props = defineProps<{
  entries: ImportEntry[]
  batchId: string
  confirmation: ImportConfirmation | null
  showResults: boolean
  busy: boolean
  saving: boolean
  polling: boolean
  scope?: string[] | null
}>()
const emit = defineEmits<{ back: []; save: []; refresh: []; retry: [] }>()
const retryable = computed(() =>
  props.entries.some(
    (entry) => entry.item.state === 'failed' && entry.item.readable && entry.edit.selected
  )
)
const counts = computed(() => ({
  saved: props.entries.filter((entry) => entry.item.state === 'saved').length,
  failed: props.entries.filter((entry) => entry.item.state === 'failed').length,
  skipped: props.entries.filter((entry) => entry.item.state === 'duplicate').length,
  excluded: props.entries.filter(
    (entry) => !entry.edit.selected && entry.item.readable && entry.item.state !== 'duplicate'
  ).length,
  unreadable: props.entries.filter((entry) => !entry.item.readable).length
}))
</script>
<template>
  <section class="panel save-step">
    <template v-if="!showResults"
      ><h2 v-if="confirmation">
        将保存{{ confirmation.count }}张草稿，其中{{ confirmation.incomplete }}张仍待补充
      </h2>
      <p v-else class="notice">请返回核对以重新确认当前保存范围。</p>
      <p v-if="confirmation" class="small muted">
        已保存{{ confirmation.saved }} · 重复跳过{{ confirmation.duplicates }} · 排除{{
          confirmation.excluded
        }}
        · 无法读取{{ confirmation.unreadable }}
      </p>
      <ul>
        <li
          v-for="entry in entries.filter(
            (entry) =>
              entry.edit.selected &&
              (!scope || scope.includes(entry.item.id)) &&
              entry.item.readable &&
              !['saved', 'duplicate'].includes(entry.item.state)
          )"
          :key="entry.item.id"
        >
          <strong
            ><SceneTitle
              :name="entry.edit.content.name"
              :title-en="entry.edit.content.title_en" /></strong
          ><span
            >{{ entry.edit.target_card_id || entry.item.saved_card_id ? '更新草稿' : '新增草稿' }} ·
            {{ entry.item.issues.length ? '仍待补充' : '资料完整' }}</span
          >
        </li>
      </ul></template
    >
    <template v-else
      ><h2>保存结果</h2>
      <p class="result-summary">
        成功 {{ counts.saved }} · 失败 {{ counts.failed }} · 跳过 {{ counts.skipped }} · 排除
        {{ counts.excluded }} · 无法读取 {{ counts.unreadable }}
      </p>
      <p v-if="saving" class="notice">正在逐卡保存，关闭页面后仍会继续处理。</p>
      <table>
        <thead>
          <tr>
            <th>卡片</th>
            <th>来源ZIP／文件夹</th>
            <th>实际结果</th>
            <th>下一步</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="entry in entries" :key="entry.item.id">
            <td>
              <SceneTitle :name="entry.edit.content.name" :title-en="entry.edit.content.title_en" />
            </td>
            <td>
              {{
                entry.item.source_zip_name
                  ? `${entry.item.source_zip_name} / ${entry.item.source_folder}`
                  : 'DOCX资料'
              }}
            </td>
            <td>
              {{
                entry.item.state === 'failed'
                  ? importErrors[entry.item.error_code || ''] || '保存未成功，请重新核对或重试'
                  : !entry.edit.selected &&
                      entry.item.readable &&
                      !['saved', 'duplicate'].includes(entry.item.state)
                    ? '已排除'
                    : importStates[entry.item.state] || '待核对'
              }}
            </td>
            <td>
              <RouterLink
                v-if="entry.item.saved_card_id"
                :to="`/cards/${entry.item.saved_card_id}?back=${encodeURIComponent(`/cards?batch_id=${batchId}`)}`"
                >补充资料</RouterLink
              >
            </td>
          </tr>
        </tbody>
      </table></template
    >
    <footer class="editor-actions">
      <button type="button" :disabled="busy || saving" @click="emit('back')">返回核对</button
      ><button
        v-if="!showResults"
        type="button"
        class="primary"
        data-action="save-import"
        :disabled="busy || !confirmation?.count"
        @click="emit('save')"
      >
        {{ busy ? '正在接收…' : '确认保存草稿' }}</button
      ><template v-else
        ><button type="button" :disabled="polling" @click="emit('refresh')">刷新结果</button
        ><button v-if="retryable" type="button" :disabled="busy || saving" @click="emit('retry')">
          重试失败项，重新确认</button
        ><RouterLink
          v-if="counts.saved"
          class="button-link primary"
          data-action="import-cards"
          :to="`/cards?batch_id=${batchId}`"
          >查看本次卡片</RouterLink
        ></template
      >
    </footer>
  </section>
</template>
<style scoped lang="scss">
.save-step {
  h2 {
    margin-bottom: 16px;
  }

  ul {
    list-style: none;
    padding: 0;
    margin: 20px 0;

    li {
      display: flex;
      justify-content: space-between;
      padding: 16px 0;
      border-bottom: 1px solid var(--line);

      span {
        color: var(--muted);
        font-size: 12px;
      }
    }
  }

  .result-summary {
    margin: 18px 0;
    font-size: 17px;
  }
}
</style>
