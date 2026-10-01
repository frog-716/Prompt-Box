<script setup lang="ts">
/** Markdown 导出与二次确认的数据清空。 */

import { onBeforeUnmount, ref } from 'vue';

defineProps<{
  promptCount: number;
  folderCount: number;
}>();

const emit = defineEmits<{
  export: [];
  clear: [];
}>();

const confirmingClear = ref(false);
let confirmTimer: ReturnType<typeof setTimeout> | undefined;

function requestClear(): void {
  if (!confirmingClear.value) {
    confirmingClear.value = true;
    confirmTimer = setTimeout(() => {
      confirmingClear.value = false;
    }, 3000);
    return;
  }
  if (confirmTimer !== undefined) clearTimeout(confirmTimer);
  confirmingClear.value = false;
  emit('clear');
}

onBeforeUnmount(() => {
  if (confirmTimer !== undefined) clearTimeout(confirmTimer);
});
</script>

<template>
  <section class="panel">
    <header class="panel-head">
      <h2 class="panel-title">数据</h2>
      <p class="panel-desc">
        prompt-box-markdown-v1（.md）：按修改时间倒序，含标题、分类、标签、时间与原文；空文件夹也会列出。
      </p>
    </header>

    <p class="stat-line">{{ promptCount }} 条提示词 · {{ folderCount }} 个文件夹</p>

    <div class="panel-actions">
      <button type="button" class="primary" @click="emit('export')">导出 Markdown</button>
      <button
        type="button"
        class="danger"
        :class="{ 'danger-armed': confirmingClear }"
        @click="requestClear"
      >
        {{ confirmingClear ? '再点一次确认清空' : '清空全部数据' }}
      </button>
    </div>
  </section>
</template>

<style scoped>
.panel {
  border: 1px solid var(--pb-border);
  border-radius: var(--pb-radius-lg);
  padding: 16px 18px;
  background: var(--pb-bg);
}

.panel-head {
  margin-bottom: 12px;
}

.panel-title {
  margin: 0 0 4px;
  font-size: 14px;
  font-weight: 500;
}

.panel-desc {
  margin: 0;
  font-size: 12px;
  color: var(--pb-text-muted);
  line-height: 1.7;
}

.stat-line {
  margin: 0 0 12px;
  font-size: 12px;
  color: var(--pb-text-muted);
}

.panel-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.primary {
  background: var(--pb-accent);
  border-color: var(--pb-accent);
  color: #ffffff;
  font-weight: 500;
}

.primary:hover:not(:disabled) {
  background: var(--pb-accent-hover);
  border-color: var(--pb-accent-hover);
}

.danger {
  margin-left: auto;
  color: var(--pb-danger);
  border-color: var(--pb-border);
}

.danger:hover:not(:disabled) {
  background: var(--pb-danger-weak);
}

.danger-armed {
  background: var(--pb-danger);
  border-color: var(--pb-danger);
  color: #ffffff;
}

.danger-armed:hover:not(:disabled) {
  background: var(--pb-danger);
}
</style>
