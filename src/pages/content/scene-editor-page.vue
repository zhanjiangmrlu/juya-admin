<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const sceneId = computed(() => String(route.params.id))
</script>

<template>
  <section class="scene-editor-page">
    <div class="page-heading">
      <div>
        <span>A20</span>
        <h2>结构化场景编辑 · {{ sceneId }}</h2>
      </div>
      <ElTag effect="plain" type="warning">草稿接口待接入</ElTag>
    </div>
    <ElAlert
      :closable="false"
      title="场景详情和编辑保存接口待接入，当前表单不会写入本地假版本"
      type="warning"
      show-icon
    />
    <div class="editor-grid">
      <ElCard shadow="never"
        ><template #header><h3>基础信息</h3></template
        ><ElForm label-position="top"
          ><ElFormItem label="场景标题"><ElInput disabled /></ElFormItem
          ><ElFormItem label="系列"><ElInput disabled /></ElFormItem
          ><ElFormItem label="场景说明"
            ><ElInput disabled type="textarea" :rows="5" /></ElFormItem></ElForm
      ></ElCard>
      <ElCard shadow="never"
        ><template #header><h3>结构化条目</h3></template
        ><ElEmpty description="条目读取接口待接入" /><ElButton disabled>新增条目</ElButton></ElCard
      >
    </div>
  </section>
</template>

<style scoped lang="scss">
.scene-editor-page {
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

  .editor-grid {
    display: grid;
    grid-template-columns: minmax(320px, 2fr) minmax(420px, 3fr);
    gap: 14px;
    margin-top: 14px;
  }

  h3 {
    margin: 0;
    color: var(--juya-color-sidebar);
    font-size: 15px;
  }

  @media (width <= 1050px) {
    .editor-grid {
      grid-template-columns: 1fr;
    }
  }
}
</style>
