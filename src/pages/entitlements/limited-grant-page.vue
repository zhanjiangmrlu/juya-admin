<script setup lang="ts">
import { reactive } from 'vue'

const form = reactive({ campaignVersionId: '', userId: '' })
</script>

<template>
  <section class="limited-grant-page">
    <ElCard shadow="never">
      <template #header>
        <div class="heading">
          <div>
            <span>A07</span>
            <h2>开通限时学习权益</h2>
          </div>
          <RouterLink v-slot="{ navigate }" custom :to="{ name: 'entitlements' }">
            <ElButton @click="navigate">返回权益中心</ElButton>
          </RouterLink>
        </div>
      </template>

      <ElForm label-position="top">
        <ElFormItem label="用户编号" required>
          <ElInput v-model="form.userId" maxlength="64" placeholder="输入用户编号" />
        </ElFormItem>
        <ElFormItem label="限时活动版本" required>
          <ElInput v-model="form.campaignVersionId" disabled placeholder="活动版本查询接口待接入" />
        </ElFormItem>
        <ElAlert
          class="notice"
          :closable="false"
          title="活动版本、开放状态、容量、首次开通时长和启动截止信息无法查询，暂不允许提交开通命令"
          type="warning"
          show-icon
        />
        <div class="capacity">
          <span>容量</span><strong>接口待接入</strong><span>启动截止</span
          ><strong>接口待接入</strong>
        </div>
        <ElTooltip content="缺少活动版本和容量查询接口">
          <span><ElButton disabled type="primary">二次确认并开通</ElButton></span>
        </ElTooltip>
      </ElForm>
    </ElCard>
  </section>
</template>

<style scoped lang="scss">
.limited-grant-page {
  .heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
  }

  .heading span {
    color: var(--juya-color-text-secondary);
    font-size: 11px;
    font-weight: 700;
  }

  .heading h2 {
    margin: 3px 0 0;
    color: var(--juya-color-sidebar);
    font-size: 16px;
  }

  .notice {
    margin-bottom: 16px;
  }

  .capacity {
    display: grid;
    grid-template-columns: auto 1fr auto 1fr;
    gap: 10px;
    margin-bottom: 16px;
    padding: 14px;
    border-radius: var(--juya-control-radius);
    background: #fbebcf;
  }

  .capacity span {
    color: var(--juya-color-text-secondary);
  }
}
</style>
