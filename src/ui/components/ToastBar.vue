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
      {{ message }}
    </div>
  </Transition>
</template>

<style scoped>
.toast {
  position: fixed;
  left: 50%;
  bottom: 16px;
  transform: translateX(-50%);
  max-width: calc(100% - 28px);
  padding: 6px 14px;
  border-radius: 999px;
  font-size: 12px;
  background: var(--pb-text);
  color: var(--pb-bg);
  pointer-events: none;
  z-index: 20;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.toast-error {
  background: var(--pb-danger);
  color: #ffffff;
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
