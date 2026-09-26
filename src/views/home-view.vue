<script setup lang="ts">
import { APP_META } from '@/shared/constants/app-meta'
</script>

<template>
  <main class="home-view">
    <section class="home-view__content">
      <p class="home-view__eyebrow">JUYA ENGLISH</p>
      <h1 class="home-view__title">{{ APP_META.name }}</h1>
      <p class="home-view__description">{{ APP_META.description }}</p>
      <p class="home-view__status">工程初始化完成</p>
    </section>
  </main>
</template>

<style scoped lang="scss">
.home-view {
  display: grid;
  min-height: 100vh;
  place-items: center;
  padding: 48px;

  &__content {
    width: min(100%, 680px);
    padding: 64px;
    border: 1px solid #e2e8f0;
    border-radius: 24px;
    background: #fff;
    box-shadow: 0 24px 64px rgb(15 23 42 / 8%);
    text-align: center;
  }

  &__eyebrow {
    margin: 0 0 16px;
    color: #2f6fed;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.16em;
  }

  &__title {
    margin: 0;
    color: #0f172a;
    font-size: clamp(32px, 5vw, 48px);
    line-height: 1.2;
  }

  &__description {
    margin: 20px 0 0;
    color: #64748b;
    font-size: 18px;
    line-height: 1.6;
  }

  &__status {
    margin: 32px 0 0;
    color: #2f6fed;
    font-size: 14px;
  }
}
</style>
