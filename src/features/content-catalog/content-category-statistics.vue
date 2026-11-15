<script setup lang="ts">
import { ElButton } from 'element-plus'

import type { components } from '@/shared/contracts/generated/admin-api'
defineProps<{
  value?: components['schemas']['CatalogStatistics'] | null
  all?: components['schemas']['CatalogStatistics'] | null
  title: string
  unit: string
  error?: string
  snapshot?: string
}>()
defineEmits<{ retry: [] }>()
const fields = [
  { key: 'total', label: '内容总数' },
  { key: 'published', label: '已发布' },
  { key: 'free', label: '已免费开放' },
  { key: 'remaining', label: '剩余可开启免费' }
] as const
</script>
<template>
  <section class="category-statistics" aria-label="分类统计">
    <div class="between">
      <strong>{{ title }} 分类统计</strong><small>按当前分类汇总，不受标题搜索和状态筛选影响</small>
    </div>
    <p v-if="error" class="error" role="alert">
      统计加载失败，{{ value ? '保留旧快照，未刷新' : '暂不可用' }}
      <ElButton link @click="$emit('retry')">重试统计</ElButton>
    </p>
    <div class="metrics">
      <div v-for="field in fields" :key="field.key">
        <span>{{ field.label }}</span
        ><strong>{{ value ? value[field.key] : '—' }}</strong
        ><small>{{ unit }}</small>
      </div>
    </div>
    <small v-if="all && title !== '全部'" class="muted"
      >模块全部：{{ all.total }}{{ unit }} · 已发布{{ all.published }} · 已免费开放{{ all.free }} ·
      剩余可开启免费{{ all.remaining }}</small
    ><small v-if="snapshot" class="snapshot">快照 {{ snapshot }}</small>
  </section>
</template>
<style scoped lang="scss">
.category-statistics {
  border: 1px solid var(--line);
  background: var(--paper);
  border-radius: 10px;
  padding: 18px 20px;
  margin: 20px 0;

  .between {
    gap: 15px;
    flex-wrap: wrap;
    font-size: 13px;
  }

  small {
    color: var(--muted);
    font-size: 11px;
  }

  .metrics {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    margin: 18px 0 10px;

    > div {
      display: flex;
      gap: 8px;
      align-items: baseline;
      padding: 0 18px;
      border-right: 1px solid var(--line);

      &:where(:first-child) {
        padding-left: 0;
      }

      &:where(:last-child) {
        border: 0;
      }
    }

    span {
      font-size: 12px;
    }

    strong {
      font-size: 24px;
      font-weight: 600;
    }
  }

  .snapshot {
    display: block;
    margin-top: 6px;
  }

  @media (width <= 900px) {
    .metrics {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 16px;

      > div {
        padding: 0;
        border: 0;
        flex-wrap: wrap;
      }
    }
  }
}
</style>
