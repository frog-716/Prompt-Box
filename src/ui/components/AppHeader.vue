<script setup lang="ts">
/**
 * 顶部栏：标题 + 新建 + 设置。
 *
 * 整个应用只有这两个入口，不设菜单、不设多级导航。
 */

const emit = defineEmits<{
  create: [];
  openSettings: [];
}>();
</script>

<template>
  <header class="header">
    <h1 class="header-title">提示词本</h1>
    <div class="header-actions">
      <button type="button" class="header-primary" @click="emit('create')">新建</button>
      <button
        type="button"
        class="header-icon-btn"
        aria-label="打开设置"
        title="设置"
        @click="emit('openSettings')"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94L14.4 2.81a.488.488 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.488.488 0 0 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.03-1.58zM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2z"
          />
        </svg>
      </button>
    </div>
  </header>
</template>

<style scoped>
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid var(--pb-border);
  flex-shrink: 0;
}

.header-title {
  margin: 0;
  font-size: 13px;
  font-weight: 500;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 7px;
}

.header-primary {
  background: var(--pb-accent);
  border-color: var(--pb-accent);
  color: #ffffff;
  font-weight: 500;
  font-size: 12px;
  padding: 3px 11px;
}

.header-primary:hover:not(:disabled) {
  background: var(--pb-accent-hover);
  border-color: var(--pb-accent-hover);
}

.header-icon-btn {
  display: flex;
  align-items: center;
  padding: 4px 6px;
  color: var(--pb-text-muted);
  border-color: transparent;
}

.header-icon-btn:hover:not(:disabled) {
  color: var(--pb-text);
  border-color: var(--pb-border);
}
</style>
