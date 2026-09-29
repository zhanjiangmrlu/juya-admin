<script setup lang="ts">
import { Lock, Reading, User } from '@element-plus/icons-vue'
import { reactive } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { useAuthStore } from '@/features/auth/auth-store'

const authStore = useAuthStore()
const route = useRoute()
const router = useRouter()
const passwordForm = reactive({ password: '', username: '' })
const totpForm = reactive({ code: '', deviceSummary: globalThis.navigator.userAgent.slice(0, 200) })

/**
 * 提交账号密码并清除页面中的明文密码
 *
 * @returns 密码步骤完成后的 Promise
 */
async function submitPassword(): Promise<void> {
  try {
    await authStore.submitPassword({ ...passwordForm })
  } catch {
    // 错误提示由 Store 统一提供
  } finally {
    passwordForm.password = ''
  }
}

/**
 * 提交 TOTP 并进入原目标页或工作台
 *
 * @returns 登录跳转完成后的 Promise
 */
async function submitTotp(): Promise<void> {
  try {
    await authStore.submitTotp({ ...totpForm })
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/dashboard'
    await router.replace(redirect)
  } catch {
    totpForm.code = ''
  }
}
</script>

<template>
  <main class="login-page">
    <section class="brand" aria-label="句芽英语管理后台介绍">
      <div class="brand-content">
        <span class="logo"
          ><ElIcon><Reading /></ElIcon
        ></span>
        <p class="eyebrow">JUYA ENGLISH</p>
        <h1 class="brand-title">让内容与体验运营<br />清晰、有序、可追踪</h1>
        <p class="brand-description">
          句芽英语单管理员后台，覆盖用户、权益、反馈与内容生产全流程。
        </p>
      </div>
    </section>

    <section class="form-area">
      <div class="form-card">
        <div class="form-heading">
          <p class="eyebrow">ADMIN CONSOLE</p>
          <h2 class="form-title">
            {{ authStore.step === 'password' ? '登录管理后台' : '输入安全验证码' }}
          </h2>
          <p class="form-description">
            {{
              authStore.step === 'password'
                ? '请使用管理员账号继续'
                : '请输入验证器应用生成的 6 位验证码'
            }}
          </p>
        </div>

        <ElAlert
          v-if="authStore.errorMessage"
          :closable="false"
          :title="authStore.errorMessage"
          type="error"
          show-icon
        />

        <ElForm
          v-if="authStore.step === 'password'"
          class="form"
          label-position="top"
          :model="passwordForm"
          @submit.prevent="submitPassword"
        >
          <ElFormItem label="管理员账号" required>
            <ElInput
              v-model.trim="passwordForm.username"
              :prefix-icon="User"
              autocomplete="username"
            />
          </ElFormItem>
          <ElFormItem label="密码" required>
            <ElInput
              v-model="passwordForm.password"
              :prefix-icon="Lock"
              autocomplete="current-password"
              show-password
              type="password"
              @keyup.enter="submitPassword"
            />
          </ElFormItem>
          <ElButton
            class="submit"
            :disabled="!passwordForm.username || !passwordForm.password"
            :loading="authStore.status === 'loading'"
            native-type="submit"
            type="primary"
          >
            下一步
          </ElButton>
        </ElForm>

        <ElForm
          v-else
          class="form"
          label-position="top"
          :model="totpForm"
          @submit.prevent="submitTotp"
        >
          <ElFormItem label="6 位验证码" required>
            <ElInput
              v-model="totpForm.code"
              autocomplete="one-time-code"
              inputmode="numeric"
              maxlength="6"
              placeholder="000000"
              @keyup.enter="submitTotp"
            />
          </ElFormItem>
          <ElButton
            class="submit"
            :disabled="!/^[0-9]{6}$/.test(totpForm.code)"
            :loading="authStore.status === 'loading'"
            native-type="submit"
            type="primary"
          >
            安全登录
          </ElButton>
          <ElButton class="back" text @click="authStore.clearSensitiveState">
            返回账号密码登录
          </ElButton>
        </ElForm>
      </div>
    </section>
  </main>
</template>

<style scoped lang="scss">
.login-page {
  display: grid;
  grid-template-columns: minmax(420px, 0.95fr) minmax(520px, 1.05fr);
  min-height: 100vh;
  background: var(--juya-color-surface);

  .brand,
  .form-area {
    display: grid;
    place-items: center;
    padding: 64px;
  }

  .brand {
    position: relative;
    overflow: hidden;
    background: var(--juya-color-sidebar);
    color: #fff;
  }

  .brand::after {
    position: absolute;
    right: -120px;
    bottom: -140px;
    width: 380px;
    height: 380px;
    border: 1px solid rgb(255 255 255 / 12%);
    border-radius: 50%;
    box-shadow: 0 0 0 80px rgb(255 255 255 / 3%);
    content: '';
  }

  .brand-content {
    z-index: 1;
    max-width: 520px;
  }

  .logo {
    display: grid;
    width: 56px;
    height: 56px;
    margin-bottom: 40px;
    border-radius: 14px;
    background: #f7f5eb;
    color: var(--juya-color-sidebar);
    font-size: 30px;
    place-items: center;
  }

  .eyebrow {
    margin: 0 0 12px;
    color: #75ad98;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.14em;
  }

  .brand-title {
    margin: 0;
    font-size: clamp(34px, 4vw, 52px);
    line-height: 1.28;
  }

  .brand-description {
    max-width: 440px;
    margin: 28px 0 0;
    color: rgb(255 255 255 / 68%);
    font-size: 16px;
    line-height: 1.8;
  }

  .form-card {
    width: min(100%, 420px);
  }

  .form-heading {
    margin-bottom: 32px;
  }

  .form-title {
    margin: 0;
    color: var(--juya-color-text-primary);
    font-size: 30px;
    line-height: 1.3;
  }

  .form-description {
    margin: 10px 0 0;
    color: var(--juya-color-text-secondary);
  }

  .form {
    margin-top: 24px;
  }

  .submit {
    width: 100%;
    height: 44px;
    margin-top: 8px;
  }

  .back {
    width: 100%;
    margin-top: 12px;
  }
}

@media (width <= 900px) {
  .login-page {
    grid-template-columns: 1fr;

    .brand {
      display: none;
    }

    .form-area {
      padding: 32px;
    }
  }
}
</style>
