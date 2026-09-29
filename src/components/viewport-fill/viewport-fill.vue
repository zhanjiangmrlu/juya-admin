<template>
  <section class="viewport-fill">
    <slot />
  </section>
</template>

<style scoped lang="scss">
.viewport-fill {
  display: flex;
  width: 100%;
  min-width: 0;
  min-height: calc(100vh - var(--juya-header-height) - var(--juya-main-padding-block));
  min-height: calc(100dvh - var(--juya-header-height) - var(--juya-main-padding-block));
  flex-direction: column;
}
</style>
