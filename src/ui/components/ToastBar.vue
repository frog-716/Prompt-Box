<script setup lang="ts">
/**
 * 底部提示条。
 *
 * 只负责显示一句话，自动消失。不用弹窗，因为复制、保存这些动作
 * 频繁发生，任何需要点击关闭的反馈都会变成负担。
 */

defineProps<{
  message: string;
  tone: 'info' | 'error';
}>();
</script>

<template>
  <Transition name="toast">
    <div v-if="message" class="toast" :class="`toast-${tone}`" role="status">
      <svg v-if="tone !== 'error'" class="toast-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
      <svg v-else class="toast-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M12 8v4m0 4h.01" /></svg>
      {{ message }}
    </div>
  </Transition>
</template>

<style scoped>
.toast {
  position: fixed;
  left: 50%;
  bottom: 24px;
  transform: translateX(-50%);
  max-width: calc(100% - 28px);
  display: flex;
  align-items: center;
  gap: var(--pb-space-8);
  padding: var(--pb-space-8) var(--pb-space-16);
  border-radius: var(--pb-radius);
  font-size: 13px;
  background: var(--pb-text);
  color: var(--pb-white);
  pointer-events: none;
  z-index: 20;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.toast-icon { width: 16px; height: 16px; flex: 0 0 16px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }

.toast-error {
  background: var(--pb-danger);
  color: var(--pb-on-accent);
}

.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(6px);
}
</style>
