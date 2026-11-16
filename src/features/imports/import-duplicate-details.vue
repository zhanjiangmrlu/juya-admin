<script setup lang="ts">
import {
  ElButton,
  ElConfigProvider,
  ElDialog,
  ElPagination,
  ElTable,
  ElTableColumn
} from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import { queryURL } from '@/services/display'
import { api } from '@/services/http-client'

import type { components } from '@/shared/contracts/generated/admin-api'
const props = defineProps<{ batchId: string; module: 'scene' | 'listening' }>()
const emit = defineEmits<{ close: []; candidate: [id: string] }>()
const router = useRouter(),
  data = ref<components['schemas']['DuplicatePage'] | null>(null),
  busy = ref(false),
  error = ref('')
const labels = {
  existing_content: '与已有内容及素材一致',
  same_package: '与本包已保留对象相同',
  cross_package: '跨ZIP重复，资料与素材一致'
}
let generation = 0
/** 从持久批次读取完整重复集合，失败保留原页
 * @param page 明细目标页
 */
const load = async (page = 1) => {
  const run = ++generation
  busy.value = true
  error.value = ''
  try {
    const value = await api.request<components['schemas']['DuplicatePage']>(
      queryURL(
        `/api/admin/v1/${props.module === 'listening' ? 'listening/' : ''}imports/${encodeURIComponent(props.batchId)}/duplicates`,
        { page, limit: 20 }
      )
    )
    if (run === generation) data.value = value
  } catch (reason) {
    if (run === generation) error.value = (reason as Error).message
  } finally {
    if (run === generation) busy.value = false
  }
}
/** 按服务端目标种类打开正确内容，候选仅定位当前批次
 * @param item 已查询且当前可查看的持久重复明细
 */
const open = (item: components['schemas']['DuplicateDetail']) => {
  if (!item.target_available || !item.target_id) return
  if (item.target_kind === 'scene_candidate' || item.target_kind === 'listening_candidate') {
    emit('candidate', item.target_id)
    emit('close')
  } else if (item.target_kind === 'scene_card' || item.target_kind === 'listening_article')
    void router.push({
      path: `/${item.target_kind === 'scene_card' ? 'cards' : 'listening'}/${encodeURIComponent(item.target_id)}`,
      query: { back: router.currentRoute.value.fullPath }
    })
}
onMounted(() => load())
onBeforeUnmount(() => {
  generation++
})
</script>
<template>
  <ElConfigProvider :locale="zhCn">
    <ElDialog :model-value="true" title="重复文件明细" width="1050px" @close="$emit('close')"
      ><p>
        重复 {{ data?.total ?? '—' }} {{ module === 'scene' ? '张' : '篇' }} ·
        已自动跳过。按整个批次查询，不计入新增成功数。
      </p>
      <p v-if="error" class="error" role="alert">
        {{ error }} <ElButton @click="load(data?.page)">重试</ElButton>
      </p>
      <ElTable :data="data?.items || []" row-key="candidate_id"
        ><ElTableColumn label="本次源文件"
          ><template #default="{ row }"
            >{{ row.source_name }}
            <p class="muted">{{ row.source_path }}</p></template
          ></ElTableColumn
        ><ElTableColumn label="内容标题"
          ><template #default="{ row }"
            >{{ row.title_zh }}
            <p>{{ row.title_en }}</p></template
          ></ElTableColumn
        ><ElTableColumn label="重复原因"
          ><template #default="{ row }">{{
            labels[row.reason as keyof typeof labels]
          }}</template></ElTableColumn
        ><ElTableColumn label="命中对象"
          ><template #default="{ row }"
            ><span>{{ row.target_id || '历史目标未知' }}</span
            ><ElButton
              :disabled="!row.target_available || row.target_kind === 'unknown'"
              link
              @click="open(row as components['schemas']['DuplicateDetail'])"
              >{{
                row.target_available
                  ? row.target_kind.endsWith('candidate')
                    ? '定位保留候选'
                    : '查看已有内容'
                  : '目标已移除或不可访问'
              }}</ElButton
            ></template
          ></ElTableColumn
        ></ElTable
      >
      <div class="between">
        <span>共 {{ data?.total ?? '—' }} 条 · 明细与重复数量一致</span
        ><ElPagination
          v-if="data"
          :current-page="data.page"
          :total="data.total"
          :page-size="20"
          :disabled="busy"
          layout="prev, pager, next"
          prev-text="上一页"
          next-text="下一页"
          @current-change="load"
        />
      </div>
      <p class="notice">
        只跳过本次重复候选，不删除源ZIP或已有内容。相同标题、不同资料不能仅凭标题判重。
      </p>
      <template #footer
        ><ElButton @click="$emit('close')">返回核对并保留位置</ElButton></template
      ></ElDialog
    >
  </ElConfigProvider>
</template>
