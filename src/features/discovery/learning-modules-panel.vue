<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'

import AdminPanel from '@/components/admin-panel/admin-panel.vue'
import { useAdminApiClient } from '@/services/api/use-admin-api-client'

import { LEARNING_MODULE_LABELS } from './discovery-model'
import { createLearningModulesAdapter, type LearningModuleRow } from './learning-modules-adapter'
import { useLearningModules } from './use-learning-modules'

const emit = defineEmits<{ saved: [row: LearningModuleRow] }>()
const adapter = createLearningModulesAdapter(useAdminApiClient())
const controller = useLearningModules(adapter)
/**
 * 单独保存模块后同步父页的启用值
 * @param type - 固定模块类型
 */
const save = async (type: string): Promise<void> => {
  const row = await controller.save(type)
  if (row) emit('saved', row)
}
onMounted(() => {
  if (adapter.available) void controller.load()
})
onBeforeUnmount(controller.dispose)
</script>
<template>
  <AdminPanel title="学习模块名称与顺序" class="learning-modules-panel">
    <p>各模块单独保存；名称和顺序可编辑，入口及能力准备情况由服务端维护。可同时启用或全部关闭。</p>
    <ElAlert
      v-if="controller.error.value"
      :title="controller.error.value"
      type="error"
      :closable="false"
    />
    <ElButton :disabled="controller.busy.value" @click="controller.load"
      >放弃模块修改并载入最新配置</ElButton
    >
    <ElEmpty
      v-if="!controller.rows.value.length && !controller.busy.value"
      description="暂无模块配置"
    />
    <ElForm
      v-for="row in controller.rows.value"
      :key="row.type"
      class="module-form"
      :data-module="row.type"
      label-position="top"
      :disabled="controller.busy.value"
    >
      <h4>
        {{ LEARNING_MODULE_LABELS[row.type] }}
        <ElTag :type="row.ready ? 'success' : 'warning'">{{
          row.ready ? '已准备' : '未准备'
        }}</ElTag>
      </h4>
      <ElFormItem label="显示名称"
        ><ElInput
          v-model="row.name"
          :maxlength="80"
          :aria-label="`${LEARNING_MODULE_LABELS[row.type]}显示名称`"
      /></ElFormItem>
      <ElFormItem label="全局顺序（数值较小的在前）"
        ><ElInputNumber
          v-model="row.order"
          :min="0"
          :max="65535"
          :precision="0"
          :aria-label="`${LEARNING_MODULE_LABELS[row.type]}顺序`"
      /></ElFormItem>
      <div class="module-actions">
        <ElSwitch
          v-model="row.enabled"
          :aria-label="`${LEARNING_MODULE_LABELS[row.type]}启用`"
        /><span>{{ row.enabled ? '启用' : '关闭' }}</span
        ><ElTag effect="plain">v{{ row.version }}</ElTag
        ><ElButton :disabled="controller.conflicts.value.includes(row.type)" @click="save(row.type)"
          >保存{{ LEARNING_MODULE_LABELS[row.type] }}</ElButton
        >
      </div>
      <p v-if="!row.ready">
        {{
          row.reason === 'MODULE_NOT_IMPLEMENTED'
            ? '当前部署尚未实现该模块，暂不能开启；名称与顺序仍可保存'
            : row.reason || '服务端尚未准备就绪'
        }}
      </p>
      <p v-if="controller.conflicts.value.includes(row.type)">
        该模块版本已变化，输入已保留；请载入最新配置后重新确认
      </p>
    </ElForm>
  </AdminPanel>
</template>
<style scoped lang="scss">
.learning-modules-panel {
  min-width: 0;

  p {
    color: var(--juya-color-text-secondary);
    font-size: 12px;
  }

  .module-form {
    margin-top: 16px;
    border-top: 1px solid var(--juya-color-border);
  }

  h4 {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .module-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }
}
</style>
