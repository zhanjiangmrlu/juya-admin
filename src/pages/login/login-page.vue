<script setup lang="ts">
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
    <form class="login-box" @submit.prevent="submit">
      <div class="brand"><AppBrand /></div>
      <h1>内容管理后台</h1>
      <p class="muted">登录后管理场景卡片与用户学习数据</p>
      <label class="field"
        >管理员账号<input
          v-model="username"
          autocomplete="username"
          required
          :disabled="busy"
          placeholder="请输入管理员账号" /></label
      ><label class="field"
        >密码<input
          v-model="password"
          type="password"
          autocomplete="current-password"
          required
          :disabled="busy"
          placeholder="请输入密码"
      /></label>
      <p v-if="error" class="notice error" role="alert">{{ error }}</p>
      <button class="primary block" type="submit" :disabled="busy">
        {{ busy ? '正在登录…' : '登录后台' }}
      </button>
    </form>
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
      margin-top: 28px;
      margin-bottom: 22px;
    }

    .block {
      margin-top: 22px;
    }

    .notice {
      margin-top: 16px;
    }
  }
}
</style>
