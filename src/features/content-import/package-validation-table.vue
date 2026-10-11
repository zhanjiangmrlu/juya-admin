<script setup lang="ts">
import { computed } from 'vue'

import AdminPanel from '@/components/admin-panel/admin-panel.vue'

import type { ImportBatch } from './content-package-model'

const props = defineProps<{ batch: ImportBatch; busy: boolean }>()
const excluded = defineModel<string[]>('excluded', { required: true })
const emit = defineEmits<{ validate: []; preview: [] }>()
const issues = computed(() =>
  props.batch.items.flatMap((item) =>
    (item.issues.length
      ? item.issues
      : [{ code: 'READY', message: '校验通过', severity: 'optional' as const }]
    ).map((issue) => ({ ...issue, item }))
  )
)
const hasBlocking = computed(() =>
  props.batch.items.some(
    (item) =>
      !excluded.value.includes(item.id) && item.issues.some((issue) => issue.severity === 'error')
  )
)
</script>
<template>
  <AdminPanel title="逐行校验">
    <p>错误行需修正后重新导入或明确排除。选填缺省与错误分开显示，未引用文件不会自动绑定。</p>
    <div class="table-scroll">
      <ElTable :data="issues" stripe>
        <ElTableColumn label="文件 / 表 / 行" min-width="170"
          ><template #default="{ row }"
            >{{ row.item.file
            }}<small>{{ row.item.sheet }} · 第 {{ row.item.row }} 行</small></template
          ></ElTableColumn
        >
        <ElTableColumn label="标题 / 导入 ID" min-width="160"
          ><template #default="{ row }"
            >{{ row.item.title }}<small>{{ row.item.importId }}</small></template
          ></ElTableColumn
        >
        <ElTableColumn label="路径与角色" min-width="140"
          ><template #default="{ row }"
            >{{ row.path || '—' }}<small>{{ row.role || '—' }}</small></template
          ></ElTableColumn
        >
        <ElTableColumn label="问题与修正动作" min-width="250"
          ><template #default="{ row }"
            ><ElTag
              :type="
                row.severity === 'error'
                  ? 'danger'
                  : row.severity === 'warning'
                    ? 'warning'
                    : 'info'
              "
              >{{
                row.severity === 'error'
                  ? '需修正'
                  : row.severity === 'warning'
                    ? '需确认'
                    : '选填 / 通过'
              }}</ElTag
            >
            {{ row.message }}<small>{{ row.action }}</small></template
          ></ElTableColumn
        >
        <ElTableColumn label="排除这篇" width="110"
          ><template #default="{ row }"
            ><ElCheckboxGroup v-model="excluded"
              ><ElCheckbox
                :value="row.item.id"
                :disabled="busy"
                :aria-label="`排除 ${row.item.title}`"
                >排除</ElCheckbox
              ></ElCheckboxGroup
            ></template
          ></ElTableColumn
        >
      </ElTable>
    </div>
    <ElAlert
      v-if="batch.unreferencedFiles.length"
      type="warning"
      :closable="false"
      title="未引用文件（不会绑定）"
      ><ul>
        <li v-for="file in batch.unreferencedFiles" :key="file">{{ file }}</li>
      </ul></ElAlert
    >
    <div class="actions">
      <ElButton :loading="busy" @click="emit('validate')">重新校验当前范围</ElButton
      ><ElButton
        type="primary"
        :disabled="busy || hasBlocking || batch.items.length === excluded.length"
        @click="emit('preview')"
        >查看对应关系与差异</ElButton
      >
    </div>
  </AdminPanel>
</template>
<style scoped lang="scss">
.table-scroll {
  overflow-x: auto;
}

small {
  display: block;
  margin-top: 5px;
  color: var(--juya-color-text-secondary);
  overflow-wrap: anywhere;
}

p {
  color: var(--juya-color-text-secondary);
  line-height: 1.6;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 20px;
}
</style>
