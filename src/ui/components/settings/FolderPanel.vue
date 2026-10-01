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
  if (confirmingId.value === id) {
    if (confirmTimer !== undefined) clearTimeout(confirmTimer);
    confirmingId.value = null;
    emit('remove', id);
    return;
  }
  confirmingId.value = id;
  confirmTimer = setTimeout(() => {
    confirmingId.value = null;
  }, 3000);
}

onBeforeUnmount(() => {
  if (confirmTimer !== undefined) clearTimeout(confirmTimer);
});
</script>

<template>
  <section class="panel">
    <header class="panel-head">
      <h2 class="panel-title">文件夹</h2>
      <p class="panel-desc">每条提示词选一个文件夹；删除后会退回未归类。</p>
    </header>

    <div class="add-row">
      <input
        v-model="newName"
        type="text"
        placeholder="新文件夹名称"
        @keydown.enter.prevent="submitNew"
      />
      <button type="button" @click="submitNew">添加</button>
    </div>

    <ul v-if="folders.length > 0" class="list">
      <li v-for="folder in folders" :key="folder.id" class="row">
        <template v-if="editingId === folder.id">
          <input
            v-model="editingName"
            type="text"
            class="row-input"
            @keydown.enter.prevent="submitEdit"
            @keydown.esc="editingId = null"
          />
          <div class="row-actions">
            <button type="button" @click="submitEdit">保存</button>
            <button type="button" @click="editingId = null">取消</button>
          </div>
        </template>

        <template v-else>
          <span class="row-name">{{ folder.name }}</span>
          <span class="row-count">{{ counts[folder.id] ?? 0 }} 条</span>
          <div class="row-actions">
            <button type="button" @click="startEdit(folder)">改名</button>
            <button
              type="button"
              class="row-danger"
              :class="{ 'row-danger-armed': confirmingId === folder.id }"
              @click="requestRemove(folder.id)"
            >
              {{ confirmingId === folder.id ? '确认删除？' : '删除' }}
            </button>
          </div>
        </template>
      </li>
    </ul>

    <p v-else class="empty">还没有文件夹</p>

    <p v-if="unclassifiedCount > 0" class="hint">{{ unclassifiedCount }} 条未归类</p>
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

.add-row {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.add-row input {
  flex: 1;
}

.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 8px;
  border-radius: var(--pb-radius-sm);
}

.row:hover {
  background: var(--pb-surface);
}

.row-name {
  flex: 1;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row-input {
  flex: 1;
}

.row-count {
  font-size: 11px;
  color: var(--pb-text-faint);
  flex-shrink: 0;
}

.row-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.row-actions button {
  font-size: 11px;
  padding: 2px 9px;
  border-color: transparent;
  color: var(--pb-text-muted);
}

.row-actions button:hover:not(:disabled) {
  border-color: var(--pb-border);
}

.row-danger {
  color: var(--pb-danger);
}

.row-danger-armed {
  background: var(--pb-danger);
  border-color: var(--pb-danger);
  color: #ffffff;
}

.row-danger-armed:hover:not(:disabled) {
  background: var(--pb-danger);
  border-color: var(--pb-danger);
}

.empty,
.hint {
  margin: 0;
  font-size: 12px;
  color: var(--pb-text-faint);
  line-height: 1.8;
}

.hint {
  margin-top: 8px;
}
</style>
