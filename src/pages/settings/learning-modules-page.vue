<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { onBeforeUnmount, onMounted, ref } from 'vue'

import AdminNotice from '@/components/admin-notice/admin-notice.vue'
import AdminPanel from '@/components/admin-panel/admin-panel.vue'
import AppPageActions from '@/components/app-page-actions/app-page-actions.vue'
import { LEARNING_MODULE_LABELS } from '@/features/discovery/discovery-model'
import { createLearningModulesAdapter } from '@/features/discovery/learning-modules-adapter'
import { useLearningModules } from '@/features/discovery/use-learning-modules'
import { useAdminApiClient } from '@/services/api/use-admin-api-client'

const controller = useLearningModules(createLearningModulesAdapter(useAdminApiClient()))
const advanced = ref<string[]>([])
const descriptions: Record<string, string> = {
  scene_learning: '对话、词卡、音频与跟读',
  short_reading: '英文短文、全文译文与可选整篇音频',
  long_sentence: '能力未完成时保持关闭',
  grammar: '能力未完成时保持关闭'
}
let baseline = new Map<string, string>()
/** 读取服务端配置并建立已保存值，用于判断实际修改 */
const load = async (): Promise<void> => {
  await controller.load()
  if (!controller.error.value)
    baseline = new Map(controller.rows.value.map((row) => [row.type, JSON.stringify(row)]))
}
/** 逐项保存独立版本，任何失败保留剩余输入并展示真实结果 */
const save = async (): Promise<void> => {
  if (controller.busy.value) return
  const changed = controller.rows.value.filter(
    (row) => baseline.get(row.type) !== JSON.stringify(row)
  )
  for (const row of changed) {
    const saved = await controller.save(row.type)
    if (!saved) return
    baseline.set(saved.type, JSON.stringify(saved))
  }
  ElMessage.success(changed.length ? '模块配置已保存' : '模块配置没有变更')
}
onMounted(() => void load())
onBeforeUnmount(controller.dispose)
</script>

<template>
  <section class="learning-modules-page">
    <ElAlert
      v-if="controller.error.value"
      :title="controller.error.value"
      type="error"
      :closable="false"
    />
    <AdminPanel title="学习页顶部模块" class="modules-card">
      <ElSkeleton
        v-if="controller.busy.value && !controller.rows.value.length"
        :rows="7"
        animated
      />
      <ElEmpty v-else-if="!controller.rows.value.length" description="暂无模块配置"
        ><ElButton @click="load">重新读取配置</ElButton></ElEmpty
      >
      <div
        v-for="row in controller.rows.value"
        :key="row.type"
        class="module-row"
        :data-module="row.type"
      >
        <span class="order-marker" aria-hidden="true">⋮⋮</span>
        <div class="module-copy">
          <h3>{{ LEARNING_MODULE_LABELS[row.type] }}</h3>
          <p>
            {{
              row.ready
                ? descriptions[row.type]
                : row.reason === 'MODULE_NOT_IMPLEMENTED'
                  ? '能力未完成时保持关闭'
                  : row.reason || '能力未完成时保持关闭'
            }}
          </p>
        </div>
        <ElSwitch
          v-model="row.enabled"
          :disabled="controller.busy.value"
          :aria-label="`${LEARNING_MODULE_LABELS[row.type]}启用`"
          inline-prompt
          active-text="已启用"
          inactive-text="已停用"
        />
      </div>
      <ElCollapse v-model="advanced"
        ><ElCollapseItem title="编辑显示名称与顺序" name="metadata"
          ><ElForm label-position="top" :disabled="controller.busy.value"
            ><div v-for="row in controller.rows.value" :key="row.type" class="metadata-row">
              <ElFormItem :label="`${LEARNING_MODULE_LABELS[row.type]}显示名称`"
                ><ElInput v-model="row.name" maxlength="80" /></ElFormItem
              ><ElFormItem label="全局顺序"
                ><ElInputNumber v-model="row.order" :min="0" :max="65535" :precision="0"
              /></ElFormItem>
              <p v-if="controller.conflicts.value.includes(row.type)">
                配置已变化，输入已保留。请重新读取后核对。
              </p>
            </div></ElForm
          ></ElCollapseItem
        ></ElCollapse
      >
    </AdminPanel>
    <AdminNotice title="停用后的行为"
      ><p>
        入口隐藏并停止新的模块访问，内容、收藏、学习进度和权益历史保留；停用不延长权益计时。
      </p></AdminNotice
    >
    <p class="empty-note">全部关闭时显示：学习内容正在调整，请稍后再来。</p>
    <RouterLink to="/settings" class="system-link">系统、审核与时限配置</RouterLink>
    <AppPageActions
      ><ElButton :disabled="controller.busy.value" @click="load">取消修改</ElButton
      ><ElButton
        type="primary"
        :loading="controller.busy.value"
        :disabled="!controller.rows.value.length || Boolean(controller.conflicts.value.length)"
        @click="save"
        >保存模块配置</ElButton
      ></AppPageActions
    >
  </section>
</template>

<style scoped lang="scss">
.learning-modules-page {
  display: grid;
  gap: 20px;
  min-width: 0;

  .modules-card {
    background: var(--juya-color-surface);
  }

  .module-row {
    display: flex;
    align-items: center;
    gap: 16px;
    min-height: 87px;
    padding: 12px;
  }

  .order-marker {
    width: 24px;
    flex: 0 0 24px;
    color: var(--juya-color-text-secondary);
  }

  .module-copy {
    flex: 1;
    min-width: 0;

    h3 {
      margin: 0 0 4px;
      font-size: 17px;
      line-height: 25px;
    }

    p {
      margin: 0;
      color: var(--juya-color-text-secondary);
      font-size: 11px;
      line-height: 18px;
      overflow-wrap: anywhere;
    }
  }

  :deep(.el-switch) {
    --el-color-white: var(--juya-color-text-secondary);

    width: 150px;
    height: 36px;
    flex: 0 0 150px;
  }

  :deep(.el-switch.is-checked) {
    --el-color-white: white;
  }

  :deep([class~='el-switch__core']) {
    width: 100%;
    height: 36px;
    border: 0;
    background: var(--juya-color-page);
  }

  :deep([class~='el-switch__action']) {
    display: none;
  }

  :deep([class~='el-switch__inner']) {
    padding: 0;
  }

  :deep([class~='el-switch__inner'] .is-text) {
    color: var(--juya-color-text-secondary);
    font-size: 14px;
  }

  :deep(.is-checked [class~='el-switch__core']) {
    background: var(--juya-color-primary);
  }

  :deep(.is-checked .is-text) {
    color: white;
  }

  .metadata-row {
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
  }

  .empty-note,
  .system-link {
    margin: 0;
    color: var(--juya-color-text-secondary);
    font-size: 11px;
  }

  @media (width <= 650px) {
    .module-row {
      gap: 8px;
      padding: 12px 0;
    }

    :deep(.el-switch) {
      width: 100px;
      flex-basis: 100px;
    }
  }
}
</style>
