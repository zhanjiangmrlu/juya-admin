<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'

import { createUserAdapter, type UserProjectionDto } from '@/features/users/user-adapter'
import { useAdminApiClient } from '@/services/api/use-admin-api-client'

const model = defineModel<string>({ required: true })
const adapter = createUserAdapter(useAdminApiClient())
const text = ref(model.value)
const matches = ref<UserProjectionDto[]>([])
const error = ref('')
const busy = ref(false)
let selectedId = ''
let timer: ReturnType<typeof globalThis.setTimeout> | undefined
let sequence = 0
let disposed = false
const /** 搜索昵称或句芽号，不将完整联系方式写入持久化
   * @param value - 管理员输入的昵称或句芽编号
   */ search = (value: string): void => {
    selectedId = ''
    model.value = value.trim()
    globalThis.clearTimeout(timer)
    const token = ++sequence
    matches.value = []
    error.value = ''
    if (!value.trim()) return
    timer = globalThis.setTimeout(async () => {
      busy.value = true
      try {
        const result = await adapter.searchUsers(value.trim())
        if (!disposed && token === sequence) matches.value = result
      } catch {
        if (!disposed && token === sequence) error.value = '用户搜索失败，请重试'
      } finally {
        if (token === sequence) busy.value = false
      }
    }, 250)
  }
const /** 选择服务端用户身份，保存稳定编号并显示昵称与句芽号
   * @param user - 当前搜索结果中的真实用户
   */ select = (user: UserProjectionDto): void => {
    globalThis.clearTimeout(timer)
    sequence++
    busy.value = false
    selectedId = user.user_id
    model.value = user.user_id
    text.value = `${user.nickname || '未设置昵称'} · 句芽号：${user.juya_number || user.user_id}`
    matches.value = []
  }
watch(model, (value) => {
  if (value !== selectedId) text.value = value
})
onBeforeUnmount(() => {
  disposed = true
  sequence++
  globalThis.clearTimeout(timer)
  matches.value = []
})
</script>
<template>
  <div class="entitlement-user-selector">
    <ElInput
      v-model="text"
      placeholder="输入用户编号"
      aria-label="用户编号"
      clearable
      @input="search"
    /><small v-if="busy">正在查询用户</small>
    <p v-if="error">{{ error }}</p>
    <div v-if="matches.length" class="matches">
      <ElButton v-for="user in matches" :key="user.user_id" text @click="select(user)"
        >{{ user.nickname || '未设置昵称' }} · 句芽号：{{
          user.juya_number || user.user_id
        }}</ElButton
      >
    </div>
  </div>
</template>
<style scoped lang="scss">
.entitlement-user-selector {
  width: 100%;

  small,
  p {
    font-size: 11px;
    color: var(--juya-color-text-secondary);
  }

  .matches {
    display: grid;
    max-height: 200px;
    overflow: auto;
    margin-top: 8px;

    :deep(.el-button) {
      height: auto;
      min-height: 32px;
      margin: 0;
      white-space: normal;
      text-align: left;
      justify-content: flex-start;
    }
  }
}
</style>
