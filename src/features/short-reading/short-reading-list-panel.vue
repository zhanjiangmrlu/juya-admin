<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { useRouter } from 'vue-router'

import AdminPanel from '@/components/admin-panel/admin-panel.vue'
import AppPagination from '@/components/app-pagination/app-pagination.vue'
import { createContentAdapter } from '@/features/content/content-adapter'
import { createIdempotencyKey } from '@/services/api/api-client'
import { useAdminApiClient } from '@/services/api/use-admin-api-client'

import type { ShortReadingSnapshot } from './short-reading-model'
import type { ContentSeries } from '@/features/content/content-adapter'

import { createShortReadingAdapter } from './short-reading-adapter'
import { normalizeShortReading } from './short-reading-model'
const client = useAdminApiClient()
const adapter = createShortReadingAdapter(client)
const content = createContentAdapter(client)
const router = useRouter()
const items = ref<ShortReadingSnapshot[]>([])
const series = ref<ContentSeries[]>([])
const seriesId = ref('')
const page = ref(1)
const total = ref(0)
const busy = ref(false)
const error = ref('')
let disposed = false
let sequence = 0
let createKey = createIdempotencyKey()
const labels: Record<string, string> = { DRAFT: '草稿', PUBLISHED: '已发布', OFFLINE: '已下线' }
const /** 显式加载独立短文列表与可用分类 */ load = async (): Promise<void> => {
    if (busy.value || !adapter.available) return
    const current = ++sequence
    busy.value = true
    error.value = ''
    try {
      const result = await client.request<{ items: { public_id: string }[]; total: number }>({
        method: 'GET',
        path: '/api/v1/admin/content/short-readings',
        query: { page: page.value, page_size: 20 }
      })
      const rows = await Promise.all(result.items.map((item) => adapter.load(item.public_id)))
      const categories = await content.listSeries()
      if (disposed || current !== sequence) return
      items.value = rows
      total.value = result.total
      series.value = categories
    } catch (failure) {
      if (!disposed && current === sequence)
        error.value = failure instanceof Error ? failure.message : '短文列表加载失败'
    } finally {
      if (current === sequence) busy.value = false
    }
  }
const /** 创建选定分类下的独立纯阅读草稿 */ create = async (): Promise<void> => {
    if (busy.value || !seriesId.value || !adapter.available) return
    const current = ++sequence
    busy.value = true
    error.value = ''
    try {
      const result = await adapter.create(seriesId.value, normalizeShortReading({}), createKey)
      if (disposed || current !== sequence) return
      createKey = createIdempotencyKey()
      await router.push({ name: 'content-short-reading-edit', params: { id: result.id } })
    } catch (failure) {
      if (!disposed && current === sequence)
        error.value = failure instanceof Error ? failure.message : '创建短文失败'
    } finally {
      if (current === sequence) busy.value = false
    }
  }
onBeforeUnmount(() => {
  disposed = true
  sequence++
  items.value = []
})
</script>
<template>
  <AdminPanel title="独立短文阅读" class="short-reading-list-panel">
    <p>完整英文与全文中文独立管理；封面和全文音频选填，逐篇配置试读。</p>
    <ElAlert
      v-if="!adapter.available"
      title="短文服务尚未装配"
      type="warning"
      :closable="false"
    /><ElAlert v-if="error" :title="error" type="error" :closable="false" />
    <div class="actions">
      <ElButton :disabled="!adapter.available" :loading="busy" @click="load"
        >加载短文列表与分类</ElButton
      ><ElSelect v-model="seriesId" aria-label="新建短文分类" placeholder="选择分类"
        ><ElOption
          v-for="category in series"
          :key="category.id"
          :value="category.id"
          :label="category.title" /></ElSelect
      ><ElButton
        type="primary"
        :disabled="!seriesId || !adapter.available"
        :loading="busy"
        @click="create"
        >新建独立短文</ElButton
      >
    </div>
    <ElTable v-if="items.length" :data="items"
      ><ElTableColumn label="标题" min-width="240"
        ><template #default="{ row }"
          ><strong>{{ row.content.title_zh || '未命名短文' }}</strong>
          <p>{{ row.content.title_en }}</p></template
        ></ElTableColumn
      ><ElTableColumn label="类别 / 题材 / 难度" min-width="180"
        ><template #default="{ row }">{{
          [row.content.category, row.content.topic, row.content.level].filter(Boolean).join(' · ')
        }}</template></ElTableColumn
      ><ElTableColumn label="当前修订" min-width="120"
        ><template #default="{ row }"
          >{{ labels[row.status] || row.status }} · v{{ row.editVersion }}</template
        ></ElTableColumn
      ><ElTableColumn label="试读" min-width="100"
        ><template #default="{ row }">{{
          row.trialEnabled === null ? '状态未返回' : row.trialEnabled ? '允许' : '关闭'
        }}</template></ElTableColumn
      ><ElTableColumn label="全局顺序" min-width="100"
        ><template #default="{ row }">{{ row.sortOrder ?? '未返回' }}</template></ElTableColumn
      ><ElTableColumn label="操作" min-width="150"
        ><template #default="{ row }"
          ><ElButton
            link
            type="primary"
            @click="router.push({ name: 'content-short-reading-edit', params: { id: row.id } })"
            >{{ row.status === 'DRAFT' ? '编辑 / 校对' : '查看 / 新候选' }}</ElButton
          ></template
        ></ElTableColumn
      ></ElTable
    >
    <AppPagination
      v-if="total"
      v-model:current-page="page"
      :total="total"
      :page-size="20"
      :disabled="busy"
      @change="load"
    />
  </AdminPanel>
</template>
<style scoped lang="scss">
.short-reading-list-panel {
  min-width: 0;
  margin-top: 18px;

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin: 16px 0;
    align-items: center;

    :deep(.el-select) {
      max-width: 300px;
    }
  }

  p {
    color: var(--juya-color-text-secondary);
    line-height: 1.7;
  }
}
</style>
