<script setup lang="ts">
import PendingCapability from '@/components/pending-capability/pending-capability.vue'
import { createContentAdapter } from '@/features/content/content-adapter'
import { createApiClient } from '@/services/api/api-client'

const content = createContentAdapter(createApiClient())
</script>

<template>
  <section class="content-list-page">
    <ElCard shadow="never">
      <template #header>
        <div class="page-heading">
          <div>
            <span>A17</span>
            <h2>内容列表</h2>
          </div>
          <RouterLink v-slot="{ navigate }" custom :to="{ name: 'content-import' }">
            <ElButton type="primary" @click="navigate">批量上传图片</ElButton>
          </RouterLink>
        </div>
      </template>

      <ElAlert
        :closable="false"
        title="内容列表接口待接入，当前不会发送未知请求"
        type="warning"
        show-icon
      />
      <div class="filter-bar">
        <ElInput disabled placeholder="场景名称或编号" />
        <ElSelect aria-label="内容系列筛选（待接入）" disabled placeholder="全部系列" />
        <ElSelect aria-label="内容状态筛选（待接入）" disabled placeholder="全部状态" />
        <ElButton disabled>查询</ElButton>
      </div>
      <PendingCapability
        description="缺少内容列表查询接口，当前不装载演示场景或伪造版本状态"
        title="内容列表接口待接入"
      />
      <p class="request-state">网络请求状态：{{ content.requestCount }} 个未知请求</p>
    </ElCard>
  </section>
</template>

<style scoped lang="scss">
.content-list-page {
  .page-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;

    span {
      color: var(--juya-color-text-primary);
      font-size: 11px;
      font-weight: 700;
    }

    h2 {
      margin: 3px 0 0;
      color: var(--juya-color-sidebar);
      font-size: 16px;
    }
  }

  .filter-bar {
    display: grid;
    grid-template-columns: minmax(220px, 1fr) 180px 180px auto;
    gap: 10px;
    margin-top: 16px;
  }

  .request-state {
    margin: 0;
    color: var(--juya-color-text-secondary);
    font-size: 11px;
    text-align: center;
  }

  @media (width <= 900px) {
    .filter-bar {
      grid-template-columns: 1fr 1fr;
    }
  }
}
</style>
