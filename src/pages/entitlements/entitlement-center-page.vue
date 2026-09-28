<script setup lang="ts">
import { Tickets } from '@element-plus/icons-vue'
</script>

<template>
  <section class="entitlement-center-page">
    <ElCard shadow="never">
      <template #header>
        <div class="entitlement-center-page__heading">
          <div>
            <span>A05</span>
            <h2>统一权益中心</h2>
          </div>
          <div class="entitlement-center-page__actions">
            <RouterLink v-slot="{ navigate }" custom :to="{ name: 'formal-entitlement-grant' }">
              <ElButton type="primary" @click="navigate">授予正式权益</ElButton>
            </RouterLink>
            <RouterLink v-slot="{ navigate }" custom :to="{ name: 'limited-entitlement-grant' }">
              <ElButton @click="navigate">开通限时权益</ElButton>
            </RouterLink>
          </div>
        </div>
      </template>

      <ElAlert
        :closable="false"
        title="统一权益列表查询接口待接入；当前仅开放已有真实命令接口的入口"
        type="warning"
        show-icon
      />

      <div class="entitlement-center-page__filters">
        <ElInput disabled placeholder="用户编号、昵称、微信号" />
        <ElSelect aria-label="权益类型筛选（待接入）" disabled placeholder="正式包 / 限时包" />
        <ElSelect aria-label="权益状态筛选（待接入）" disabled placeholder="全部状态" />
      </div>

      <div class="entitlement-center-page__table-shell" role="status">
        <ElIcon><Tickets /></ElIcon>
        <strong>权益列表待接入</strong>
        <span>未使用本地模拟数据生成用户权益或成功状态。</span>
      </div>
    </ElCard>
  </section>
</template>

<style scoped lang="scss">
.entitlement-center-page {
  &__heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 20px;
  }

  &__heading span {
    color: var(--juya-color-text-secondary);
    font-size: 11px;
    font-weight: 700;
  }

  &__heading h2 {
    margin: 3px 0 0;
    color: var(--juya-color-sidebar);
    font-size: 16px;
  }

  &__actions,
  &__filters {
    display: flex;
    gap: 10px;
  }

  &__filters {
    margin: 18px 0;
  }

  &__filters .el-input {
    width: 230px;
  }

  &__filters .el-select {
    width: 160px;
  }

  &__table-shell {
    display: grid;
    min-height: 240px;
    border: 1px solid var(--juya-color-border-light);
    color: var(--juya-color-text-secondary);
    place-items: center;
    align-content: center;
    gap: 10px;
    text-align: center;
  }

  &__table-shell .el-icon {
    color: var(--juya-color-primary);
    font-size: 30px;
  }

  &__table-shell strong {
    color: var(--juya-color-text-primary);
  }
}
</style>
