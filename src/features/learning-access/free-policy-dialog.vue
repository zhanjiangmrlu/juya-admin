<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'

import { mediaURL } from '@/services/display'
import { api } from '@/services/http-client'

import type { components } from '@/shared/contracts/generated/admin-api'

import { useAccessOperation } from './use-access-operation'

const emit = defineEmits<{ close: []; saved: [] }>()
const count = ref(''),
  config = ref<components['schemas']['PolicyView'] | null>(null),
  preview = ref<components['schemas']['FreePolicyPreview'] | null>(null),
  error = ref(''),
  loading = ref(false)
const path = '/api/admin/v1/learning-access/free-policy'
const operation = useAccessOperation<components['schemas']['PolicyView']>(
  path,
  (value) => value.enabled === true && typeof value.revision === 'number'
)
let generation = 0
/** 未提交设置可取消，未知结果必须先确认 */
const close = () => {
  if (!operation.busy.value && !operation.unknown.value) emit('close')
}
/** 读取当前真实设置，未启用时保留空输入 */
const load = async () => {
  loading.value = true
  try {
    config.value = await api.request(path)
    count.value = config.value?.free_count == null ? '' : String(config.value.free_count)
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '配置读取失败，请重试'
  } finally {
    loading.value = false
  }
}
/** 取得当前数量的全局免费名单，page为完整名单页码
 * @param page 核对名单页码
 */
const inspect = async (page = 1) => {
  if (loading.value || operation.unknown.value || operation.busy.value) return
  if (!/^\d+$/.test(count.value) || !Number.isSafeInteger(Number(count.value))) {
    error.value = '请输入非负整数'
    return
  }
  const run = ++generation
  loading.value = true
  error.value = ''
  try {
    const value = await api.request<components['schemas']['FreePolicyPreview']>(
      `${path}/preview?page=${page}&limit=10`,
      { method: 'POST', body: { free_count: Number(count.value) } }
    )
    if (run !== generation) return
    preview.value = value
    operation.prepare(value.preview_token)
  } catch (reason) {
    if (run === generation)
      error.value = reason instanceof Error ? reason.message : '名单读取失败，请重试'
  } finally {
    if (run === generation) loading.value = false
  }
}
/** 保存已核对的同一份名单，成功才刷新原列表 */
const save = async () => {
  if (await operation.submit()) emit('saved')
}
/** 防止浏览器关闭丢失待确认操作
 * @param event 浏览器原生离开事件
 */
const guard = (event: BeforeUnloadEvent) => {
  if (operation.unknown.value || operation.busy.value) {
    event.preventDefault()
    event.returnValue = ''
  }
}
watch(count, () => {
  generation++
  preview.value = null
  loading.value = false
})
onBeforeRouteLeave(() => !operation.unknown.value && !operation.busy.value)
onMounted(() => {
  void load()
  window.addEventListener('beforeunload', guard)
})
onBeforeUnmount(() => {
  generation++
  window.removeEventListener('beforeunload', guard)
})
</script>
<template>
  <ElDialog
    :model-value="true"
    title="免费开放设置"
    modal-class="learning-access-mask"
    width="680px"
    align-center
    :close-on-click-modal="false"
    :show-close="!operation.unknown.value && !operation.busy.value"
    :close-on-press-escape="!operation.unknown.value && !operation.busy.value"
    :before-close="close"
  >
    <p>按全部已发布场景的当前排序开放前 N 张，学完后不自动补入新卡片。</p>
    <label class="count-field"
      >免费场景数量<input
        v-model="count"
        aria-label="免费场景数量"
        type="text"
        inputmode="numeric"
        :disabled="operation.unknown.value || operation.busy.value || !config"
    /></label>
    <p class="small muted">0 表示不开放免费场景；超过发布数量时全部免费。</p>
    <p v-if="error || operation.error.value" class="notice error" role="alert">
      {{ error || operation.error.value }}
    </p>
    <button v-if="!config" type="button" :disabled="loading" @click="load">重试读取配置</button>
    <section v-if="preview" class="free-preview">
      <div class="between">
        <strong>实际免费 {{ preview.total }} 张</strong
        ><span>新增 {{ preview.added_count }} 张 · 移出 {{ preview.removed_count }} 张</span>
      </div>
      <ol :start="(preview.page - 1) * preview.limit + 1">
        <li v-for="item in preview.items" :key="item.id">
          <img v-if="item.thumbnail_id" :src="mediaURL(item.thumbnail_id)" alt="" /><strong>{{
            item.name
          }}</strong
          ><small>{{ item.title_en }}</small
          ><span class="badge">{{ item.change === 'added' ? '新增免费' : '保持免费' }}</span>
        </li>
      </ol>
      <p v-for="item in preview.removed" :key="item.id" class="notice">移出免费：{{ item.name }}</p>
      <div v-if="preview.total > preview.limit" class="between">
        <button
          :disabled="loading || preview.page <= 1 || operation.unknown.value"
          @click="inspect(preview.page - 1)"
        >
          上一页</button
        ><span>{{ preview.page }} / {{ Math.ceil(preview.total / preview.limit) }}</span
        ><button
          :disabled="
            loading || preview.page * preview.limit >= preview.total || operation.unknown.value
          "
          @click="inspect(preview.page + 1)"
        >
          下一页
        </button>
      </div>
    </section>
    <template #footer>
      <button
        type="button"
        :disabled="operation.unknown.value || operation.busy.value"
        @click="close"
      >
        取消
      </button>
      <button
        v-if="!preview || operation.stale.value"
        type="button"
        class="primary"
        :disabled="loading || !config"
        @click="inspect()"
      >
        {{ loading ? '正在核对…' : '核对免费名单' }}
      </button>
      <button
        v-else
        type="button"
        class="primary"
        :disabled="
          operation.busy.value ||
          loading ||
          (config?.enabled && Number(count) === config.free_count)
        "
        @click="save"
      >
        {{
          operation.busy.value
            ? '正在保存…'
            : operation.unknown.value
              ? '查询／重试保存'
              : '确认保存'
        }}
      </button>
    </template>
  </ElDialog>
</template>
<style scoped lang="scss">
:global(.learning-access-mask) {
  background: rgb(43 68 56 / 20%);
}

.count-field {
  display: grid;
  gap: 8px;
  margin-top: 24px;

  input {
    width: 100%;
  }
}

.free-preview {
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 16px;
  margin-top: 20px;
  max-height: 420px;
  overflow: auto;

  ol {
    padding-left: 28px;
  }

  img {
    float: left;
    width: 34px;
    height: 48px;
    object-fit: contain;
    margin-right: 12px;
  }

  li {
    position: relative;
    padding: 12px 80px 12px 0;
    border-bottom: 1px solid var(--line);
  }

  small {
    display: block;
  }

  .badge {
    position: absolute;
    right: 0;
    top: 16px;
  }
}
</style>
