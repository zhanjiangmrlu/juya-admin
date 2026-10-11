<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

import AdminPanel from '@/components/admin-panel/admin-panel.vue'
import AppPagination from '@/components/app-pagination/app-pagination.vue'
import { createIdempotencyKey } from '@/services/api/api-client'
import { useAdminApiClient } from '@/services/api/use-admin-api-client'

interface TrialRow {
  id: string
  title: string
  enabled: boolean | null
  draftEnabled: boolean
  version: number
}
const client = useAdminApiClient()
const rows = ref<TrialRow[]>([])
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const busy = ref(false)
const error = ref('')
const keys = new Map<string, { signature: string; key: string }>()
let generation = 0
let disposed = false
const /** 仅读取已发布短文标题及真实试读状态，不将候选草稿误作线上内容 */ load =
    async (): Promise<void> => {
      const token = ++generation
      busy.value = true
      error.value = ''
      try {
        const result = await client.request<{ items: Record<string, unknown>[]; total: number }>({
          method: 'GET',
          path: '/api/v1/admin/content/short-readings',
          query: { page: page.value, page_size: pageSize.value, status: 'PUBLISHED' }
        })
        const items = await Promise.all(
          result.items
            .filter((row) => row.status === 'PUBLISHED' && row.published_revision_id)
            .map(async (row) => {
              const id = String(row.public_id)
              const revision = await client.request<{ content_snapshot: Record<string, unknown> }>({
                method: 'GET',
                path: `/api/v1/admin/content/short-readings/${encodeURIComponent(id)}/revisions/${encodeURIComponent(String(row.published_revision_id))}`
              })
              const title = [revision.content_snapshot.title_en, revision.content_snapshot.title_zh]
                .filter((value) => typeof value === 'string' && value)
                .join('｜')
              return {
                id,
                title: title || '未设置标题',
                enabled: typeof row.trial_enabled === 'boolean' ? row.trial_enabled : null,
                draftEnabled: row.trial_enabled === true,
                version: Number(row.version)
              }
            })
        )
        if (disposed || token !== generation) return
        rows.value = items
        total.value = result.total
      } catch (failure) {
        if (!disposed && token === generation)
          error.value = failure instanceof Error ? failure.message : '短文试读配置读取失败'
      } finally {
        if (token === generation) busy.value = false
      }
    }
const /** 保存明确目标状态，失败重试复用命令身份
   * @param row - 当前已发布短文及读取版本
   * @param enabled - 管理员选择的试读目标状态
   */ save = async (row: TrialRow, enabled: boolean): Promise<void> => {
    if (busy.value || row.enabled === null) return
    row.draftEnabled = enabled
    const signature = JSON.stringify([row.version, enabled])
    if (keys.get(row.id)?.signature !== signature)
      keys.set(row.id, { signature, key: createIdempotencyKey() })
    const token = ++generation
    busy.value = true
    error.value = ''
    try {
      const result = await client.request<{ version: number }>({
        method: 'PUT',
        path: `/api/v1/admin/content/short-readings/${encodeURIComponent(row.id)}/trial`,
        headers: { 'Idempotency-Key': keys.get(row.id)!.key },
        body: { expected_version: row.version, enabled }
      })
      if (disposed || token !== generation) return
      row.enabled = enabled
      row.version = result.version
      keys.delete(row.id)
    } catch (failure) {
      if (!disposed && token === generation)
        error.value = failure instanceof Error ? failure.message : '试读保存失败，原选择保留'
    } finally {
      if (token === generation) busy.value = false
    }
  }
onMounted(() => void load())
onBeforeUnmount(() => {
  disposed = true
  generation++
  rows.value = []
  keys.clear()
})
</script>
<template>
  <AdminPanel title="短文开放试读 · 无篇数上限" class="short-reading-trials-panel">
    <ElAlert v-if="error" :title="error" type="error" :closable="false"
      ><ElButton @click="load">重新读取</ElButton></ElAlert
    >
    <ElSkeleton v-if="busy && !rows.length" :rows="2" animated />
    <ElEmpty v-else-if="!rows.length" description="本页暂无已发布短文" :image-size="48" />
    <div v-for="row in rows" :key="row.id" class="trial-row">
      <span>{{ row.title }}</span
      ><ElSwitch
        :model-value="row.draftEnabled"
        :disabled="busy || row.enabled === null"
        :aria-label="`${row.title}开放试读`"
        active-text="开放试读"
        inactive-text="未开放"
        @update:model-value="(value: string | number | boolean) => save(row, value === true)"
      /><small v-if="row.enabled === null">试读状态暂不可读取</small
      ><template v-else-if="row.draftEnabled !== row.enabled && !busy"
        ><small>修改尚未保存</small
        ><ElButton link type="primary" @click="save(row, row.draftEnabled)"
          >重试保存试读</ElButton
        ></template
      >
    </div>
    <p>逐篇控制已发布短文。安全预览不返回英文正文、全文译文或音频。</p>
    <p v-if="rows.some((row) => row.enabled === null)">
      服务端尚未返回试读状态，请在状态可核对后再修改。
    </p>
    <AppPagination
      v-if="total > pageSize"
      v-model:current-page="page"
      v-model:page-size="pageSize"
      :total="total"
      :disabled="busy"
      @change="load"
    />
  </AdminPanel>
</template>
<style scoped lang="scss">
.short-reading-trials-panel {
  .trial-row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 16px;
    padding: 12px 0;

    span {
      flex: 1;
      overflow-wrap: anywhere;
    }

    small {
      color: var(--juya-color-text-secondary);
    }
  }

  p {
    margin-bottom: 0;
    color: var(--juya-color-text-secondary);
    font-size: 11px;
    line-height: 18px;
  }
}
</style>
