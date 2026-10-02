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
    <h1 class="header-title">
      <svg class="header-message" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8A8.5 8.5 0 0 1 8.7 4a8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z" />
      </svg>
      提示词本
    </h1>
    <div class="header-actions">
      <button type="button" class="header-icon-btn" aria-label="新建提示词" title="新建" @click="emit('create')">
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
      <button
        type="button"
        class="header-icon-btn"
        aria-label="打开设置"
        title="设置"
        @click="emit('openSettings')"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" />
          <path d="m19.4 15 .1.1a1.8 1.8 0 0 1-2.5 2.5l-.1-.1a1.8 1.8 0 0 0-3 .8v.2a1.8 1.8 0 0 1-3.6 0v-.2a1.8 1.8 0 0 0-3-.8l-.1.1a1.8 1.8 0 0 1-2.5-2.5l.1-.1a1.8 1.8 0 0 0-.8-3H4a1.8 1.8 0 0 1 0-3.6h.2a1.8 1.8 0 0 0 .8-3l-.1-.1a1.8 1.8 0 0 1 2.5-2.5l.1.1a1.8 1.8 0 0 0 3-.8V2a1.8 1.8 0 0 1 3.6 0v.2a1.8 1.8 0 0 0 3 .8l.1-.1a1.8 1.8 0 0 1 2.5 2.5l-.1.1a1.8 1.8 0 0 0 .8 3h.2a1.8 1.8 0 0 1 0 3.6H20a1.8 1.8 0 0 0-.6 3Z" />
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
  min-height: 48px;
  padding: var(--pb-space-10) var(--pb-space-16);
  border-bottom: 1px solid var(--pb-border);
  background: var(--pb-surface-translucent);
  flex-shrink: 0;
}

.header-title {
  margin: var(--pb-space-0);
  display: flex;
  align-items: center;
  gap: var(--pb-space-8);
  font-family: var(--pb-font-display);
  font-size: 16px;
  font-weight: 500;
}

.header-message {
  width: 20px;
  height: 20px;
  fill: none;
  stroke: var(--pb-accent);
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: var(--pb-space-8);
}

.header-icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  min-height: 28px;
  padding: var(--pb-space-4);
  color: var(--pb-text-muted);
  background: transparent;
  border-color: transparent;
  border-radius: var(--pb-radius);
}

.header-icon-btn:hover:not(:disabled) {
  color: var(--pb-text);
  border-color: transparent;
  background: var(--pb-black-overlay-5);
}

.header-icon-btn svg { fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }

@media (max-width: 340px) {
  .header { padding-inline: var(--pb-space-10); }
  .header-actions { gap: var(--pb-space-6); }
}
</style>
