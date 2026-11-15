<script setup lang="ts">
import {
  ElButton,
  ElCheckbox,
  ElConfigProvider,
  ElDialog,
  ElOption,
  ElPagination,
  ElSelect,
  ElTable,
  ElTableColumn
} from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import { onMounted, ref } from 'vue'

import {
  type ContentType,
  contentTypeLabels
} from '@/features/content-catalog/content-catalog-model'
import { queryURL } from '@/services/display'
import { api } from '@/services/http-client'

import type { components } from '@/shared/contracts/generated/admin-api'
defineEmits<{ close: [] }>()
const data = ref<components['schemas']['HistoryPage'] | null>(null),
  selected = ref<string[]>([]),
  choices = ref<Record<string, ContentType>>({}),
  busy = ref(false),
  error = ref(''),
  confirmOpen = ref(false),
  enableOpen = ref(false),
  onlyUnclassified = ref(true),
  results = ref<{ card_id: string; status: string; reason?: string | null }[]>([])
const warningLabels: Record<string, string> = {
  invalid_body: '当前发布正文引用异常',
  invalid_pdf: '当前发布PDF引用异常',
  draft_pdf_only: '当前无发布PDF，仅草稿有PDF，须核对版本',
  binding_changed: '正文与PDF类型绑定已变化，须重新核对'
}
const receiptLabels: Record<string, string> = {
  snapshot_changed: '内容版本已变化，请重新核对',
  type_pdf_conflict: '类型与当前PDF冲突，请修正后重新核对'
}
let pending:
  (() => Promise<{ items: { card_id: string; status: string; reason?: string | null }[] }>) | null =
  null
/** 读取当前有效发布的建议快照，不自动应用建议
 * @param page 待查看的核对页码
 */
const load = async (page = 1) => {
  busy.value = true
  error.value = ''
  try {
    const value = await api.request<components['schemas']['HistoryPage']>(
      queryURL('/api/admin/v1/content-types/history', {
        page,
        limit: 10,
        unclassified_only: onlyUnclassified.value
      })
    )
    data.value = value
    selected.value = []
    choices.value = Object.fromEntries(value.items.map((item) => [item.card_id, item.suggestion]))
  } catch (reason) {
    error.value = (reason as Error).message
  } finally {
    busy.value = false
  }
}
/** 冻结管理员已选条目、明确类型与版本快照 */
const prepare = () => {
  if (!data.value || !selected.value.length || busy.value) return
  pending = api.operation('POST', '/api/admin/v1/content-types/confirm', {
    items: data.value.items
      .filter((item) => selected.value.includes(item.card_id))
      .map((item) => ({
        card_id: item.card_id,
        snapshot: item.snapshot,
        content_type: choices.value[item.card_id]
      }))
  })
  confirmOpen.value = true
}
/** 提交原确认操作，未知结果重试仍使用原幂等键 */
const confirm = async () => {
  if (!pending || busy.value) return
  busy.value = true
  error.value = ''
  try {
    results.value = (await pending()).items
    pending = null
    confirmOpen.value = false
    await load(data.value?.page || 1)
  } catch (reason) {
    error.value = (reason as Error).message
  } finally {
    busy.value = false
  }
}
/** 管理员明确启用后由服务端重新核验全部有效发布 */
const enable = async () => {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    await api.operation('POST', '/api/admin/v1/content-types/enable', {})()
    enableOpen.value = false
    await load()
  } catch (reason) {
    error.value = (reason as Error).message
  } finally {
    busy.value = false
  }
}
onMounted(() => load())
</script>
<template>
  <ElConfigProvider :locale="zhCn">
    <ElDialog
      :model-value="true"
      title="旧卡内容类型核对"
      width="1100px"
      :close-on-click-modal="false"
      :show-close="!busy"
      :close-on-press-escape="!busy"
      @close="$emit('close')"
      ><p>仅生成建议，管理员确认后应用。卡片身份、成绩、收藏和免费状态保留。</p>
      <p class="notice">
        {{
          data?.content_types_ready ? '双分类已启用' : '核对完成前不启用新分类，避免旧发布内容遗漏'
        }}
      </p>
      <div class="between">
        <ElCheckbox v-model="onlyUnclassified" :disabled="busy" @change="load()"
          >仅未归类</ElCheckbox
        ><ElButton :disabled="busy || !selected.length" @click="prepare"
          >确认应用选中归类（{{ selected.length }}）</ElButton
        >
      </div>
      <p v-if="error" class="error" role="alert">
        {{ error }} <ElButton :disabled="busy" @click="load(data?.page)">重新核对</ElButton>
      </p>
      <ElTable :data="data?.items || []" row-key="card_id"
        ><ElTableColumn width="52"
          ><template #default="{ row }"
            ><ElCheckbox
              :model-value="selected.includes(row.card_id)"
              :disabled="busy || !!pending"
              :aria-label="`归类 ${row.name}`"
              @change="
                selected = $event
                  ? [...selected, row.card_id]
                  : selected.filter((id) => id !== row.card_id)
              " /></template></ElTableColumn
        ><ElTableColumn prop="name" label="旧卡片" /><ElTableColumn label="当前附件依据"
          ><template #default="{ row }"
            >{{ row.study_note_version_id ? '有效发布PDF' : '无有效发布PDF' }}
            <p v-for="warning in row.warnings" :key="warning" class="error">
              {{ warningLabels[warning] || warning }}
            </p></template
          ></ElTableColumn
        ><ElTableColumn label="建议类型／明确选择"
          ><template #default="{ row }"
            ><ElSelect
              v-model="choices[row.card_id]"
              :disabled="busy || !!pending"
              :aria-label="`${row.name}明确类型`"
              ><ElOption
                v-for="(label, value) in contentTypeLabels"
                :key="value"
                :value="value"
                :label="label" /></ElSelect></template></ElTableColumn
        ><ElTableColumn label="处理状态"
          ><template #default="{ row }"
            >{{
              row.published_content_type
                ? contentTypeLabels[row.published_content_type as ContentType]
                : '管理员确认后应用'
            }}
            <p
              v-if="row.draft_content_type && row.draft_content_type !== row.published_content_type"
              class="muted"
            >
              草稿拟改为{{ contentTypeLabels[row.draft_content_type as ContentType] }}
            </p></template
          ></ElTableColumn
        ></ElTable
      >
      <p v-for="item in results" :key="item.card_id" role="status">
        {{ item.card_id }} · {{ item.status === 'confirmed' ? '已确认' : '待重新核对' }}
        {{ item.reason ? receiptLabels[item.reason] || item.reason : '' }}
      </p>
      <ElPagination
        v-if="data"
        :current-page="data.page"
        :total="data.total"
        :page-size="10"
        :disabled="busy"
        layout="prev, pager, next"
        prev-text="上一页"
        next-text="下一页"
        @current-change="load"
      /><template #footer
        ><ElButton :disabled="busy" @click="$emit('close')">返回场景卡片</ElButton
        ><ElButton
          v-if="!data?.content_types_ready"
          class="primary"
          :disabled="busy"
          @click="enableOpen = true"
          >核验并启用双分类</ElButton
        ></template
      ><ElDialog
        v-model="confirmOpen"
        append-to-body
        title="确认明确归类"
        width="560px"
        :close-on-click-modal="false"
        :show-close="!busy"
        :close-on-press-escape="!busy"
        ><p v-if="error" class="error" role="alert">{{ error }}</p>
        <p>
          应用已选 {{ selected.length }} 张卡片的明确类型。并发变化将保留为待核对，不修改正文或PDF。
        </p>
        <template #footer
          ><ElButton
            :disabled="busy"
            @click="
              () => {
                confirmOpen = false
                pending = null
              }
            "
            >取消</ElButton
          ><ElButton :disabled="busy" @click="confirm">确认归类</ElButton></template
        ></ElDialog
      ><ElDialog
        v-model="enableOpen"
        append-to-body
        title="启用双分类"
        width="560px"
        :show-close="!busy"
        :close-on-press-escape="!busy"
        :close-on-click-modal="false"
        ><p v-if="error" class="error" role="alert">{{ error }}</p>
        <p>将重新核验全部有效发布的类型与PDF组合，全部符合后才启用。</p>
        <template #footer
          ><ElButton :disabled="busy" @click="enableOpen = false">取消</ElButton
          ><ElButton :disabled="busy" @click="enable">确认核验并启用</ElButton></template
        ></ElDialog
      ></ElDialog
    >
  </ElConfigProvider>
</template>
