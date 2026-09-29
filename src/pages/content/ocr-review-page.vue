<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const taskId = computed(() => String(route.params.taskId))
const itemId = computed(() => String(route.params.itemId))
</script>

<template>
  <section class="ocr-review-page">
    <div class="page-heading">
      <div>
        <span>A19</span>
        <h2>OCR 校对 · {{ taskId }} / {{ itemId }}</h2>
      </div>
    </div>
    <ElAlert
      :closable="false"
      title="OCR 任务、候选读取和校对保存接口待接入，当前不会生成本地假候选"
      type="warning"
      show-icon
    />
    <div class="review-grid">
      <ElCard shadow="never"
        ><template #header><h3>原始图片</h3></template><ElEmpty description="原图签名地址待接入"
      /></ElCard>
      <ElCard shadow="never"
        ><template #header><h3>OCR 候选</h3></template><ElEmpty description="候选识别接口待接入"
      /></ElCard>
      <ElCard shadow="never"
        ><template #header><h3>人工版本</h3></template
        ><ElInput
          disabled
          placeholder="人工校对保存接口待接入"
          type="textarea"
          :rows="8"
        /><ElButton disabled type="primary">保存人工版本</ElButton></ElCard
      >
    </div>
  </section>
</template>

<style scoped lang="scss">
.ocr-review-page {
  .page-heading {
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

  .review-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px;
    margin-top: 14px;
  }

  h3 {
    margin: 0;
    color: var(--juya-color-sidebar);
    font-size: 15px;
  }

  .el-button {
    width: 100%;
    margin-top: 14px;
  }

  @media (width <= 1100px) {
    .review-grid {
      grid-template-columns: 1fr;
    }
  }
}
</style>
