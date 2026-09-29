<template>
  <section class="batch-jobs-page">
    <div class="page-heading">
      <div>
        <span>A24</span>
        <h2>批量任务中心</h2>
      </div>
      <ElButton disabled type="primary">新建批量任务</ElButton>
    </div>
    <ElAlert
      :closable="false"
      title="批量任务列表、命令和回收站接口待接入，当前不会发送未知请求"
      type="warning"
      show-icon
    />
    <div class="job-grid">
      <ElCard shadow="never"
        ><template #header><h3>执行中与历史任务</h3></template
        ><ElEmpty description="批量任务接口待接入" /></ElCard
      ><ElCard shadow="never"
        ><template #header><h3>草稿回收站</h3></template><ElEmpty description="回收站接口待接入" />
        <p>被引用草稿不会提供永久清理操作</p></ElCard
      >
    </div>
  </section>
</template>

<style scoped lang="scss">
.batch-jobs-page {
  .page-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: 14px;

    span {
      color: var(--juya-color-text-primary);
      font-size: 11px;
      font-weight: 700;
    }

    h2 {
      margin: 3px 0 0;
      color: var(--juya-color-sidebar);
      font-size: 18px;
    }
  }

  .job-grid {
    display: grid;
    grid-template-columns: 2fr 1fr;
    gap: 14px;
    margin-top: 14px;
  }

  h3 {
    margin: 0;
    color: var(--juya-color-sidebar);
    font-size: 15px;
  }

  p {
    color: var(--juya-color-text-secondary);
    font-size: 12px;
    text-align: center;
  }

  @media (width <= 1000px) {
    .job-grid {
      grid-template-columns: 1fr;
    }
  }
}
</style>
