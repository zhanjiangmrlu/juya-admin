<script setup lang="ts">
import {
  ElButton,
  ElConfigProvider,
  ElInputNumber,
  ElOption,
  ElPagination,
  ElSelect
} from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import { ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    currentPage?: number
    pageSize?: number
    total?: number
    hasNext?: boolean
    disabled?: boolean
  }>(),
  { currentPage: 1, pageSize: 10, total: undefined, hasNext: false, disabled: false }
)
const emit = defineEmits<{
  'update:currentPage': [page: number]
  'update:pageSize': [size: number]
  change: [page: number, size: number]
}>()
const jumpPage = ref<number | undefined>(props.currentPage)
watch(
  () => props.currentPage,
  (page) => {
    jumpPage.value = page
  }
)

/**
 * 更新页码并通知页面加载，未知总数时允许直接跳转。
 * @param page - 目标页码
 */
function changePage(page: number | undefined): void {
  if (props.disabled || !page || !Number.isInteger(page) || page < 1 || page === props.currentPage)
    return
  emit('update:currentPage', page)
  emit('change', page, props.pageSize)
}

/**
 * 切换条数时回到第一页，只触发一次查询。
 * @param size - 每页条数
 */
function changeSize(size: number): void {
  if (props.disabled || size === props.pageSize) return
  emit('update:pageSize', size)
  emit('update:currentPage', 1)
  emit('change', 1, size)
}
</script>

<template>
  <ElConfigProvider :locale="zhCn">
    <div class="app-pagination" role="navigation" aria-label="列表分页">
      <ElSelect
        :model-value="pageSize"
        aria-label="每页条数"
        :disabled="disabled"
        class="app-pagination-sizes"
        @update:model-value="changeSize"
      >
        <ElOption
          v-for="size in [10, 20, 50, 100]"
          :key="size"
          :label="`${size} 条/页`"
          :value="size"
        />
      </ElSelect>
      <ElPagination
        v-if="total !== undefined"
        :current-page="currentPage"
        :page-size="pageSize"
        :total="total"
        :disabled="disabled"
        layout="total, prev, pager, next, jumper"
        @update:current-page="changePage"
      />
      <template v-else>
        <ElButton :disabled="disabled || currentPage <= 1" @click="changePage(currentPage - 1)"
          >上一页</ElButton
        >
        <span>第 {{ currentPage }} 页</span>
        <ElButton :disabled="disabled || !hasNext" @click="changePage(currentPage + 1)"
          >下一页</ElButton
        >
        <span>前往</span>
        <ElInputNumber
          v-model="jumpPage"
          aria-label="跳转页码"
          :min="1"
          :step="1"
          step-strictly
          :controls="false"
          :disabled="disabled"
          class="app-pagination-jump"
          @keyup.enter="changePage(jumpPage)"
        />
        <span>页</span>
        <ElButton :disabled="disabled" @click="changePage(jumpPage)">跳转</ElButton>
      </template>
    </div>
  </ElConfigProvider>
</template>

<style scoped lang="scss">
.app-pagination {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 16px;

  :deep(.el-pagination) {
    flex-wrap: wrap;
    gap: 8px 0;
  }

  :deep(.el-button + .el-button) {
    margin-left: 0;
  }
}

.app-pagination-sizes {
  width: 128px;
}

.app-pagination-jump {
  width: 72px;
}
</style>
