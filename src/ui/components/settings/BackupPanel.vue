<script setup lang="ts">
/**
 * 数据备份块。
 *
 * 数据只存在这台浏览器里，卸载扩展就没了 —— 所以导出是这一页最该做的事，
 * 放在最前面。清空是不可逆操作，用内联二次确认挡住手滑。
 */

import { ref } from 'vue';

defineProps<{
  promptCount: number;
  folderCount: number;
}>();

const emit = defineEmits<{
  export: [];
  import: [file: File];
  clear: [];
}>();

const fileInput = ref<HTMLInputElement | null>(null);
const confirmingClear = ref(false);
let confirmTimer: ReturnType<typeof setTimeout> | undefined;

function pickFile(): void {
  fileInput.value?.click();
}

function onFileChange(event: Event): void {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  // 清空 value，这样连续选同一个文件也能再次触发 change
  input.value = '';
  if (file) emit('import', file);
}

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
</script>

<template>
  <section class="panel">
    <header class="panel-head">
      <h2 class="panel-title">数据备份</h2>
      <p class="panel-desc">
        数据全部保存在这台电脑的浏览器里，不会上传到任何服务器。
        换电脑或重装浏览器前，请先导出一份。
      </p>
    </header>

    <p class="stat-line">
      当前共 <strong>{{ promptCount }}</strong> 条提示词、<strong>{{ folderCount }}</strong> 个文件夹
    </p>

    <div class="panel-actions">
      <button type="button" class="primary" @click="emit('export')">导出备份</button>
      <button type="button" @click="pickFile">导入备份</button>
      <input
        ref="fileInput"
        type="file"
        accept="application/json,.json"
        hidden
        @change="onFileChange"
      />
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

.stat-line strong {
  color: var(--pb-text);
  font-weight: 500;
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
