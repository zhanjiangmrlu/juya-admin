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
  min-height: calc(
    100vh - var(--juya-header-height) - var(--juya-main-padding-block) - var(
        --juya-main-margin-block,
        0px
      )
  );
  min-height: calc(
    100dvh - var(--juya-header-height) - var(--juya-main-padding-block) - var(
        --juya-main-margin-block,
        0px
      )
  );
  flex-direction: column;
}
</style>
