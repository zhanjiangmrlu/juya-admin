<script setup lang="ts">
import PendingCapability from '@/components/pending-capability/pending-capability.vue'
</script>

<template>
  <section class="feedback-list-page">
    <ElCard shadow="never">
      <template #header>
        <div class="page-heading">
          <div>
            <span class="page-number">A14</span>
            <h2>问题反馈列表</h2>
          </div>
          <ElButton disabled type="primary">导出反馈</ElButton>
        </div>
      </template>

      <ElAlert
        :closable="false"
        title="反馈列表接口待接入，当前不会发送未知请求"
        type="warning"
        show-icon
      />

      <div class="filter-bar" aria-label="反馈筛选占位">
        <ElInput disabled placeholder="反馈编号或用户编号" />
        <ElSelect aria-label="反馈状态筛选（待接入）" disabled placeholder="全部状态" />
        <ElSelect aria-label="反馈分类筛选（待接入）" disabled placeholder="全部分类" />
        <ElButton disabled>查询</ElButton>
      </div>

      <PendingCapability
        description="后端尚未提供反馈列表查询接口，未使用本地模拟数据，也不会推测分页或筛选结果"
        title="反馈列表接口待接入"
      />
      <p class="request-state">网络请求状态：0 个未知请求</p>
    </ElCard>
  </section>
</template>

<style scoped lang="scss">
.feedback-list-page {
  .page-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;

    .page-number {
      color: var(--juya-color-text-primary);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
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
