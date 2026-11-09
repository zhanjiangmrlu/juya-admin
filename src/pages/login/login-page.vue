<script setup lang="ts">
import { ElButton, ElForm, ElFormItem, ElInput } from 'element-plus'
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import AppBrand from '@/components/app-brand/app-brand.vue'
import { useAdminStore } from '@/stores/admin-store'
const admin = useAdminStore(),
  router = useRouter(),
  route = useRoute()
const username = ref(''),
  password = ref(''),
  busy = ref(false),
  error = ref('')
/** 登录成功后恢复同站安全目标，失败保留输入 */
const submit = async () => {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    await admin.login({ username: username.value, password: password.value })
    const target = String(route.query.return || '/cards')
    await router.replace(
      target.startsWith('/') && !target.startsWith('//') && !target.startsWith('/login')
        ? target
        : '/cards'
    )
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '登录失败，请重试'
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <main class="login-shell">
    <ElForm class="login-box" label-position="top" @submit.prevent="submit">
      <div class="brand"><AppBrand /></div>
      <h1>内容管理后台</h1>
      <p class="muted">登录后管理场景卡片与用户学习数据</p>
      <ElFormItem class="field" label="管理员账号" for="login-username">
        <ElInput
          id="login-username"
          v-model="username"
          autocomplete="username"
          required
          :disabled="busy"
          placeholder="请输入管理员账号"
        />
      </ElFormItem>
      <ElFormItem class="field" label="密码" for="login-password">
        <ElInput
          id="login-password"
          v-model="password"
          type="password"
          autocomplete="current-password"
          required
          :disabled="busy"
          placeholder="请输入密码"
        />
      </ElFormItem>
      <p v-if="error" class="notice error" role="alert">{{ error }}</p>
      <ElButton class="primary block" type="primary" native-type="submit" :disabled="busy">
        {{ busy ? '正在登录…' : '登录后台' }}
      </ElButton>
    </ElForm>
  </main>
</template>
<style scoped lang="scss">
.login-shell {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg);
  padding: 32px;
}

.login-box {
  width: 456px;
  max-width: 100%;
  min-height: 510px;
  padding: 40px;
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 14px;

  .brand {
    margin-bottom: 28px;
  }

  h1 {
    font-size: 24px;
    margin-bottom: 8px;
  }

  .field {
    display: block;
    margin-top: 28px;
    margin-bottom: 22px;

    :deep([class~='el-form-item__label']) {
      display: block;
      height: auto;
      margin: 0 0 7px;
      padding: 0;
      color: var(--ink);
      font: inherit;
    }
  }

  :deep([class~='el-input__wrapper']) {
    padding: 1px 12px;
    box-shadow: 0 0 0 1px #ced9c5 inset;

    &:where(.is-focus) {
      box-shadow: 0 0 0 1px var(--el-color-primary) inset;
    }
  }

  :deep([class~='el-input__inner']) {
    height: 44px;
    color: var(--ink);
    font: inherit;

    &::placeholder {
      color: #757575;
    }
  }

  // 自动填充沿用白色输入框，避免浏览器在内部叠加蓝色底块
  :deep(input:autofill),
  :deep(input:-webkit-autofill) {
    box-shadow: 0 0 0 1000px var(--paper) inset;
    -webkit-text-fill-color: var(--ink);
    caret-color: var(--ink);
  }

  .block {
    margin-top: 22px;
    font: inherit;
    font-weight: 500;
    border-radius: 9px;
  }

  .notice {
    margin-top: 16px;
  }
}
</style>
