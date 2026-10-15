<script setup lang="ts">
import { onBeforeUnmount, ref, shallowRef, watch } from 'vue'

import AppAudioPlayer from '@/components/app-audio-player/app-audio-player.vue'
import { useAdminApiClient } from '@/services/api/use-admin-api-client'

import {
  createPronunciationAdminAdapter,
  type PronunciationAdminStatus
} from './pronunciation-admin-adapter'

const props = defineProps<{ targetId: string; disabled?: boolean }>()
const adapter = createPronunciationAdminAdapter(useAdminApiClient())
const state = shallowRef<PronunciationAdminStatus | null>(null)
const url = ref('')
const busy = ref(false)
const error = ref('')
const recoveryConfirmed = ref(false)
let generation = 0
/** 清除旧目标的受控文件和确认输入 */
const clear = (): void => {
  generation++
  state.value = null
  url.value = ''
  busy.value = false
  recoveryConfirmed.value = false
}
/**
 * 读取或预览固定资源，恢复仅限管理员明确选择的本地任务
 * @param action - 状态读取、固定试听或本地恢复
 */
const run = async (action: 'status' | 'preview' | 'recover'): Promise<void> => {
  if (!props.targetId || !adapter.available || busy.value || props.disabled) return
  const token = ++generation
  const target = props.targetId
  busy.value = true
  error.value = ''
  url.value = ''
  try {
    if (action === 'preview') {
      const version = state.value?.resource_version
      if (!version || state.value?.target_id !== target) return
      const preview = await adapter.preview(target, version)
      if (token !== generation) return
      if (preview.resource_version !== version)
        throw new Error('发音文件版本已变化，请重新读取状态')
      url.value = preview.url
    } else {
      if (action === 'recover') {
        const task = state.value?.task
        if (
          !recoveryConfirmed.value ||
          task?.status !== 'RECOVER' ||
          state.value?.target_id !== target
        )
          return
        const result = await adapter.recover(task.public_id)
        if (result.paid_retry !== false) throw new Error('恢复回执未确认本地阶段，请重新读取')
        recoveryConfirmed.value = false
      }
      const result = await adapter.status(target)
      if (token !== generation) return
      if (result.target_id !== target) throw new Error('发音状态不属于当前确认目标')
      state.value = result
    }
  } catch (failure) {
    if (token === generation)
      error.value = failure instanceof Error ? failure.message : '发音状态读取失败'
  } finally {
    if (token === generation) busy.value = false
  }
}
watch(() => [props.targetId, props.disabled], clear, { flush: 'sync' })
onBeforeUnmount(clear)
</script>
<template>
  <section class="pronunciation-status-panel">
    <p>状态只对应已保存并确认的固定发音目标，修改本篇输入后须重新保存确认。</p>
    <ElButton
      :disabled="!adapter.available || !targetId || disabled"
      :loading="busy"
      @click="run('status')"
      >读取发音准备状态</ElButton
    >
    <small v-if="!adapter.available">发音管理接口等待装配</small>
    <ElAlert v-if="error" :title="error" type="error" :closable="false" />
    <template v-if="state">
      <p>
        {{
          state.source === 'UPLOADED'
            ? '已上传固定音频'
            : state.source === 'CACHE'
              ? '已有缓存音频'
              : '尚无可用音频'
        }}
        · {{ state.resource_version || '无资源版本' }}
      </p>
      <p>
        确认目标{{ state.allow_synthesis ? '允许合成' : '未允许合成' }}；当前服务{{
          state.synthesis_enabled ? '已开启合成' : '未开启合成'
        }}。读取与试听不会创建合成任务。
      </p>
      <ElButton :disabled="busy || !state.resource_version || disabled" @click="run('preview')"
        >试听固定发音资源</ElButton
      >
      <AppAudioPlayer v-if="url" :src="url" />
      <p v-if="state.task">
        任务状态 {{ state.task.status }} · 尝试 {{ state.task.attempt }}；{{
          state.task.error_code ? '任务暂未完成，请核对服务结果' : '状态由服务端维护'
        }}
      </p>
      <template v-if="state.task?.status === 'RECOVER'">
        <ElCheckbox v-model="recoveryConfirmed" :disabled="busy || disabled"
          >只恢复已留存音频的本地处理，不新增收费调用</ElCheckbox
        >
        <ElButton :disabled="!recoveryConfirmed || busy || disabled" @click="run('recover')"
          >恢复本地发音处理</ElButton
        >
      </template>
      <ul>
        <li v-for="attempt in state.attempts" :key="attempt.attempt">
          第 {{ attempt.attempt }} 次 · {{ attempt.status }} · 实际字符
          {{ attempt.actual_characters ?? '尚未确认' }} · 实际费用
          {{ attempt.actual_cost ?? '尚未确认' }} {{ attempt.currency }}
        </li>
      </ul>
    </template>
  </section>
</template>
<style scoped lang="scss">
.pronunciation-status-panel {
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--juya-color-border);
  border-radius: 10px;

  p,
  small,
  li {
    color: var(--juya-color-text-secondary);
    font-size: 12px;
    overflow-wrap: anywhere;
  }
}
</style>
