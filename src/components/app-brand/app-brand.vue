<template>
  <span class="app-brand" aria-label="句芽英语">
    <span class="wordmark" aria-hidden="true">juya</span>
    <span class="brand-label">句芽英语</span>
  </span>
</template>

<style scoped lang="scss">
.app-brand {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--ink);
  white-space: nowrap;

  .wordmark {
    font-family: Fraunces, serif;
    font-size: 27px;
    font-weight: 400;
    font-style: italic;
    line-height: 44px;
  }

  .brand-label {
    font-family: 'Noto Sans SC', sans-serif;
    font-size: 15px;
    font-weight: 500;
    line-height: 28px;
  }
}
</style>
