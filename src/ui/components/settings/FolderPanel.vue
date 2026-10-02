<script setup lang="ts">
/**
 * 文件夹管理块。
 *
 * 文件夹是单层的，所以这里就是一张平铺的列表：改名、删除、看数量。
 * 删除文件夹不会连带删掉里面的提示词，它们只是退回「未归类」。
 */

import { onBeforeUnmount, ref } from 'vue';

import type { Folder } from '@/domain/types';

defineProps<{
  folders: Folder[];
  counts: Record<string, number>;
  unclassifiedCount: number;
}>();

const emit = defineEmits<{
  add: [name: string];
  rename: [id: string, name: string];
  remove: [id: string];
}>();

const newName = ref('');
const editingId = ref<string | null>(null);
const editingName = ref('');
const confirmingId = ref<string | null>(null);
let confirmTimer: ReturnType<typeof setTimeout> | undefined;

function submitNew(): void {
  const name = newName.value.trim();
  if (!name) return;
  emit('add', name);
  newName.value = '';
}

function startEdit(folder: Folder): void {
  editingId.value = folder.id;
  editingName.value = folder.name;
}

function submitEdit(): void {
  const id = editingId.value;
  if (id === null) return;
  const name = editingName.value.trim();
  if (name) emit('rename', id, name);
  editingId.value = null;
}

function requestRemove(id: string): void {
  if (confirmTimer !== undefined) clearTimeout(confirmTimer);
  confirmingId.value = id;
  confirmTimer = setTimeout(() => {
    confirmingId.value = null;
  }, 3000);
}

function confirmRemove(id: string): void {
  if (confirmTimer !== undefined) clearTimeout(confirmTimer);
  confirmingId.value = null;
  emit('remove', id);
}

function cancelRemove(): void {
  if (confirmTimer !== undefined) clearTimeout(confirmTimer);
  confirmingId.value = null;
}

onBeforeUnmount(() => {
  if (confirmTimer !== undefined) clearTimeout(confirmTimer);
});
</script>

<template>
  <section class="section">
    <h2 class="section-title">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z" /></svg>
      文件夹管理
    </h2>
    <div class="panel">
      <div class="add-row">
        <input
          v-model="newName"
          type="text"
          placeholder="输入新文件夹名称..."
          @keydown.enter.prevent="submitNew"
        />
        <button type="button" class="add-button" @click="submitNew">新增</button>
      </div>

      <ul class="list">
        <li class="row row-fixed">
          <div class="folder-main">
            <svg class="folder-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z" /></svg>
            <span class="folder-copy"><span class="row-name fixed-name">未归类</span><span class="row-count">包含 {{ unclassifiedCount }} 条提示词</span></span>
          </div>
        </li>

        <li v-for="folder in folders" :key="folder.id" class="row">
          <template v-if="editingId === folder.id">
          <input
            v-model="editingName"
            type="text"
            class="row-input"
            autofocus
            @blur="submitEdit"
              @keydown.enter.prevent="submitEdit"
              @keydown.esc="editingId = null"
            />
          </template>

          <template v-else>
            <button type="button" class="folder-main" @click="startEdit(folder)">
              <svg class="folder-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z" /></svg>
              <span class="folder-copy"><span class="row-name">{{ folder.name }}</span><span class="row-count">包含 {{ counts[folder.id] ?? 0 }} 条提示词</span></span>
            </button>
            <div v-if="confirmingId === folder.id" class="delete-confirm">
              <span>条目将移至未归类</span>
              <button type="button" @click="cancelRemove">取消</button>
              <button type="button" class="confirm-delete" @click="confirmRemove(folder.id)">确认</button>
            </div>
            <button v-else type="button" class="remove-button" :aria-label="`删除文件夹 ${folder.name}`" title="删除" @click="requestRemove(folder.id)">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/><path d="M10 11v5M14 11v5"/></svg>
            </button>
          </template>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.section { display: flex; flex-direction: column; gap: var(--pb-space-16); }
.section-title { display: flex; align-items: center; gap: var(--pb-space-8); margin: var(--pb-space-0); font-family: var(--pb-font-display); font-size: 18px; font-weight: 500; }
.section-title svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }

.panel {
  border: 1px solid var(--pb-border-card);
  border-radius: var(--pb-radius);
  padding: var(--pb-space-20);
  background: var(--pb-surface);
  box-shadow: var(--pb-shadow-card);
}

.add-row {
  display: flex;
  gap: var(--pb-space-12);
  margin-bottom: var(--pb-space-24);
}

.add-row input { width: 100%; max-width: 360px; min-width: 0; padding: var(--pb-space-7) var(--pb-space-12); font-size: 12px; }
.add-button { border-color: var(--pb-border); background: var(--pb-surface-soft); color: var(--pb-text-soft); font-size: 12px; }
.add-button:hover:not(:disabled) { background: var(--pb-border); }

.list {
  list-style: none;
  margin: var(--pb-space-0);
  padding: var(--pb-space-0);
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--pb-space-12);
}

.row {
  position: relative;
  display: flex;
  align-items: center;
  min-height: 56px;
  gap: var(--pb-space-8);
  padding: var(--pb-space-12);
  border: 1px solid var(--pb-border);
  border-radius: var(--pb-radius);
  background: var(--pb-white);
  transition: box-shadow .14s ease;
}

.row:hover { box-shadow: var(--pb-shadow-card); }
.row-fixed { cursor: default; }

.folder-main {
  display: flex;
  align-items: center;
  min-width: 0;
  flex: 1;
  gap: var(--pb-space-12);
  border: 0;
  padding: var(--pb-space-0);
  background: transparent;
  text-align: left;
}

.folder-main:hover:not(:disabled) { background: transparent; }
.folder-icon { width: 16px; height: 16px; flex: 0 0 16px; fill: none; stroke: var(--pb-text-muted); stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
.folder-copy { display: flex; min-width: 0; flex-direction: column; gap: var(--pb-space-2); }

.row-input {
  width: 100%;
  min-width: 0;
  border: 0;
  border-bottom: 2px solid var(--pb-edit-underline);
  border-radius: var(--pb-radius-none);
  padding: var(--pb-space-3) var(--pb-space-0);
  background: transparent;
  font-size: 13px;
  outline: none;
}

.row-name {
  font-size: 12px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row-count {
  font-size: 10px;
  color: var(--pb-text-muted);
  flex-shrink: 0;
}

.remove-button {
  display: grid;
  place-items: center;
  width: 25px;
  height: 25px;
  min-height: 25px;
  border: 0;
  padding: var(--pb-space-4);
  background: var(--pb-surface-subtle);
  color: var(--pb-text-muted);
  opacity: 0;
  transition: opacity .14s ease, color .14s ease;
}

.row:hover .remove-button, .remove-button:focus-visible { opacity: 1; }
.remove-button:hover:not(:disabled) { background: var(--pb-danger-surface-subtle); color: var(--pb-danger-text-strong); }
.remove-button svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }

.delete-confirm {
  position: absolute;
  z-index: 3;
  right: 8px;
  top: 8px;
  display: flex;
  align-items: center;
  gap: var(--pb-space-7);
  padding: var(--pb-space-6) var(--pb-space-8);
  border: 1px solid var(--pb-danger-border-soft);
  border-radius: var(--pb-radius-4);
  background: var(--pb-danger-surface);
  color: var(--pb-danger);
  box-shadow: var(--pb-shadow-card);
  font-size: 10px;
}

.delete-confirm button { min-height: 22px; border: 0; padding: var(--pb-space-2) var(--pb-space-4); background: transparent; color: var(--pb-text-muted); font-size: 10px; }
.delete-confirm .confirm-delete { color: var(--pb-danger-text-strong); font-weight: 600; }

@media (max-width: 480px) {
  .panel { padding: var(--pb-space-16); }
  .list { grid-template-columns: 1fr; }
  .remove-button { opacity: 1; }
}
</style>
