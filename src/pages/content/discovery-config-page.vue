<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { reactive } from 'vue'

import { createDiscoveryAdapter } from '@/features/discovery/discovery-adapter'
import { validateOpenScenes, validatePreviewScenes } from '@/features/discovery/discovery-model'
import { createApiClient } from '@/services/api/api-client'

const form = reactive({ openScenes: ['', '', ''], previewScenes: '', seriesId: '' })
const adapter = createDiscoveryAdapter(createApiClient())

/**
 * 保存开放场景配置
 *
 * @returns 保存完成后的 Promise
 */
async function saveOpenScenes(): Promise<void> {
  const sceneIds = form.openScenes.map((id) => id.trim())
  const validation = validateOpenScenes(sceneIds)
  if (!validation.valid) {
    ElMessage.warning(validation.message)
    return
  }
  await adapter.replaceOpenScenes(sceneIds)
  ElMessage.success('开放场景已更新')
}

/**
 * 保存系列预览配置
 *
 * @returns 保存完成后的 Promise
 */
async function savePreviewScenes(): Promise<void> {
  const sceneIds = form.previewScenes
    .split(/[,\n]/)
    .map((id) => id.trim())
    .filter(Boolean)
  const validation = validatePreviewScenes(
    sceneIds,
    form.openScenes.map((id) => id.trim())
  )
  if (!validation.valid) {
    ElMessage.warning(validation.message)
    return
  }
  await adapter.replacePreviewScenes(form.seriesId.trim(), sceneIds)
  ElMessage.success('系列预览已更新')
}
</script>

<template>
  <section class="discovery-config-page">
    <div class="page-heading">
      <div>
        <span>A23</span>
        <h2>发现页与开放场景配置</h2>
      </div>
    </div>
    <ElAlert
      :closable="false"
      title="配置读取接口待接入，保存前请人工核对线上现状，页面不会伪造当前配置"
      type="warning"
      show-icon
    />
    <div class="config-grid">
      <ElCard shadow="never"
        ><template #header><h3>三个开放场景</h3></template
        ><ElForm label-position="top" @submit.prevent="saveOpenScenes"
          ><ElFormItem
            v-for="(_id, index) in form.openScenes"
            :key="index"
            :label="`开放场景 ${index + 1}`"
            required
            ><ElInput v-model="form.openScenes[index]" /></ElFormItem
          ><ElButton native-type="submit" type="primary">替换开放场景</ElButton></ElForm
        ></ElCard
      >
      <ElCard shadow="never"
        ><template #header><h3>系列预览</h3></template
        ><ElForm label-position="top" @submit.prevent="savePreviewScenes"
          ><ElFormItem label="系列编号" required><ElInput v-model="form.seriesId" /></ElFormItem
          ><ElFormItem label="3–6 个预览场景编号" required
            ><ElInput
              v-model="form.previewScenes"
              placeholder="使用逗号或换行分隔"
              type="textarea"
              :rows="5" /></ElFormItem
          ><ElButton :disabled="!form.seriesId.trim()" native-type="submit" type="primary"
            >替换系列预览</ElButton
          ></ElForm
        ></ElCard
      >
      <ElCard shadow="never"
        ><template #header><h3>学习模块</h3></template
        ><ElEmpty description="学习模块读取与保存接口待接入" /><ElSwitch
          disabled
          active-text="场景学习"
      /></ElCard>
    </div>
  </section>
</template>

<style scoped lang="scss">
.discovery-config-page {
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

  .config-grid {
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
  }

  @media (width <= 1100px) {
    .config-grid {
      grid-template-columns: 1fr;
    }
  }
}
</style>
