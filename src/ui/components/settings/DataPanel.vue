<script setup lang="ts">
/** Markdown 导出与二次确认的数据清空。 */

import { onBeforeUnmount, ref } from 'vue';

defineProps<{ promptCount: number; jsonExportOnly?: boolean }>();

const emit = defineEmits<{
  export: [];
  clear: [];
}>();

const confirmingClear = ref(false);
let confirmTimer: ReturnType<typeof setTimeout> | undefined;

function requestClear(): void {
  if (confirmTimer !== undefined) clearTimeout(confirmTimer);
  confirmingClear.value = true;
  confirmTimer = setTimeout(() => {
    confirmingClear.value = false;
  }, 3000);
}

function confirmClear(): void {
  if (confirmTimer !== undefined) clearTimeout(confirmTimer);
  confirmingClear.value = false;
  emit('clear');
}

function cancelClear(): void {
  if (confirmTimer !== undefined) clearTimeout(confirmTimer);
  confirmingClear.value = false;
}

onBeforeUnmount(() => {
  if (confirmTimer !== undefined) clearTimeout(confirmTimer);
});
</script>

<template>
  <section class="section">
    <h2 class="section-title">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5M12 15V3"/></svg>
      数据管理
    </h2>
    <div class="panel">
      <div class="panel-content">
        <div class="panel-copy">
          <p class="panel-lead">导出您的提示词库</p>
          <p class="stat-line">当前共保存了 <strong>{{ promptCount }}</strong> 条提示词。</p>
          <div class="export-note">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h8"/></svg>
            <p><strong>导出说明：</strong>Markdown 按最近修改时间倒序排列；{{ jsonExportOnly ? '完整 JSON 备份见下方。' : 'JSON 备份与迁移预览见下方。' }}</p>
          </div>
        </div>

        <div class="panel-actions">
          <button type="button" class="primary" :disabled="promptCount === 0" @click="emit('export')">
            导出 Markdown
          </button>
          <button type="button" class="danger" @click="requestClear">
            清空所有数据
          </button>
        </div>
      </div>

      <div v-if="confirmingClear" class="clear-confirm">
        <span>危险操作：该操作不可逆，确定清空吗？</span>
        <div>
          <button type="button" class="cancel-clear" @click="cancelClear">取消</button>
          <button type="button" class="confirm-clear" @click="confirmClear">确定清空</button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.section { display: flex; flex-direction: column; gap: var(--pb-space-16); }

.section-title {
  display: flex;
  align-items: center;
  gap: var(--pb-space-8);
  margin: var(--pb-space-0);
  font-family: var(--pb-font-display);
  font-size: 18px;
  font-weight: 500;
}

.section-title svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }

.panel {
  border: 1px solid var(--pb-border-card);
  border-radius: var(--pb-radius);
  padding: var(--pb-space-20);
  background: var(--pb-surface);
  box-shadow: var(--pb-shadow-card);
}

.panel-content {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--pb-space-16);
}

.panel-copy { flex: 1; min-width: 0; }

.panel-lead {
  margin: var(--pb-space-0);
  font-size: 14px;
  font-weight: 500;
}

.stat-line {
  margin: var(--pb-space-6) var(--pb-space-0) var(--pb-space-0);
  font-size: 12px;
  color: var(--pb-text-muted);
}

.stat-line strong { color: var(--pb-accent); font-weight: 600; }

.export-note {
  display: flex;
  align-items: flex-start;
  gap: var(--pb-space-6);
  margin-top: var(--pb-space-12);
  padding: var(--pb-space-8) var(--pb-space-10);
  border: 1px solid var(--pb-info-border);
  border-radius: var(--pb-radius-4);
  background: var(--pb-info-bg);
  color: var(--pb-info-text);
  font-size: 12px;
  line-height: 1.5;
}

.export-note svg { width: 16px; height: 16px; flex: 0 0 16px; margin-top: var(--pb-space-1); fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; opacity: .7; }
.export-note p { margin: var(--pb-space-0); }

.panel-actions {
  display: flex;
  flex-direction: column;
  gap: var(--pb-space-12);
  flex: 0 0 154px;
}

.panel-actions button { min-height: 34px; font-size: 12px; }

.primary {
  background: var(--pb-accent);
  border-color: var(--pb-accent);
  color: var(--pb-on-accent);
  font-weight: 500;
  box-shadow: var(--pb-shadow-card);
}

.primary:hover:not(:disabled) {
  background: var(--pb-accent-hover);
  border-color: var(--pb-accent-hover);
}

.danger {
  color: var(--pb-danger-text-strong);
  border-color: var(--pb-danger-border);
  background: var(--pb-white);
}

.danger:hover:not(:disabled) {
  background: var(--pb-danger-surface-hover);
}

.clear-confirm {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--pb-space-12);
  margin-top: var(--pb-space-16);
  padding: var(--pb-space-12);
  border: 1px solid var(--pb-danger-border-strong);
  border-radius: var(--pb-radius);
  background: var(--pb-danger-surface-soft);
  color: var(--pb-danger-text);
  font-size: 12px;
}

.clear-confirm > div { display: flex; align-items: center; gap: var(--pb-space-8); }

.clear-confirm button { min-height: 27px; padding: var(--pb-space-3) var(--pb-space-9); font-size: 11px; }
.cancel-clear { border: 0; background: transparent; color: var(--pb-text-muted); }
.confirm-clear { border-color: var(--pb-danger-button-hover); background: var(--pb-danger-button); color: var(--pb-white); }
.confirm-clear:hover:not(:disabled) { border-color: var(--pb-danger-hover); background: var(--pb-danger-button-hover); }

@media (max-width: 580px) {
  .panel-content { flex-direction: column; }
  .panel-actions { flex: initial; flex-direction: row; width: 100%; }
  .panel-actions button { flex: 1; }
  .clear-confirm { align-items: flex-start; flex-direction: column; }
}

@media (max-width: 480px) {
  .panel { padding: var(--pb-space-16); }
}
</style>
