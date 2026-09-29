<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const sceneId = computed(() => String(route.params.id))
</script>

<template>
  <section class="audio-version-page">
    <div class="page-heading">
      <div>
        <span>A21</span>
        <h2>音频版本管理 · {{ sceneId }}</h2>
      </div>
      <ElButton disabled type="primary">批量上传音频</ElButton>
    </div>
    <ElAlert
      :closable="false"
      title="音频版本列表、关联、生成、确认及回退接口待接入"
      type="warning"
      show-icon
    />
    <ElCard shadow="never"
      ><template #header><h3>音频文件与版本</h3></template
      ><ElEmpty description="音频版本接口待接入" />
      <p class="limit-note">单批最多 300 个，支持 MP3、M4A、WAV、AAC</p></ElCard
    >
  </section>
</template>

<style scoped lang="scss">
.audio-version-page {
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

  .el-card {
    margin-top: 14px;
  }

  h3 {
    margin: 0;
    color: var(--juya-color-sidebar);
    font-size: 15px;
  }

  .limit-note {
    color: var(--juya-color-text-secondary);
    font-size: 12px;
    text-align: center;
  }
}
</style>
