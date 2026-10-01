<script setup lang="ts">
/**
 * 标签管理块。
 *
 * 标签是散落在各条提示词里的，所以这里的「改名」和「删除」都是批量动作：
 * 一次改动会作用于所有引用它的提示词。界面上要写清楚这一点。
 */

import { onBeforeUnmount, ref } from 'vue';

import type { TagStat } from '@/domain/types';

defineProps<{
  tagStats: TagStat[];
}>();

const emit = defineEmits<{
  rename: [from: string, to: string];
  remove: [tag: string];
}>();

const editingName = ref<string | null>(null);
const editingValue = ref('');
const confirmingName = ref<string | null>(null);
let confirmTimer: ReturnType<typeof setTimeout> | undefined;

function startEdit(tag: string): void {
  editingName.value = tag;
  editingValue.value = tag;
}

function submitEdit(): void {
  const from = editingName.value;
  if (from === null) return;
  const to = editingValue.value.trim();
  if (to && to !== from) emit('rename', from, to);
  editingName.value = null;
}

function requestRemove(tag: string): void {
  if (confirmingName.value === tag) {
    if (confirmTimer !== undefined) clearTimeout(confirmTimer);
    confirmingName.value = null;
    emit('remove', tag);
    return;
  }
  confirmingName.value = tag;
  confirmTimer = setTimeout(() => {
    confirmingName.value = null;
  }, 3000);
}

onBeforeUnmount(() => {
  if (confirmTimer !== undefined) clearTimeout(confirmTimer);
});
</script>

<template>
  <section class="panel">
    <header class="panel-head">
      <h2 class="panel-title">标签</h2>
      <p class="panel-desc">标签可多选；改名或删除会同步到关联提示词。</p>
    </header>

    <ul v-if="tagStats.length > 0" class="list">
      <li v-for="stat in tagStats" :key="stat.name" class="row">
        <template v-if="editingName === stat.name">
          <input
            v-model="editingValue"
            type="text"
            class="row-input"
            @keydown.enter.prevent="submitEdit"
            @keydown.esc="editingName = null"
          />
          <div class="row-actions">
            <button type="button" @click="submitEdit">保存</button>
            <button type="button" @click="editingName = null">取消</button>
          </div>
        </template>

        <template v-else>
          <span class="row-name">#{{ stat.name }}</span>
          <span class="row-count">{{ stat.count }} 条</span>
          <div class="row-actions">
            <button type="button" @click="startEdit(stat.name)">改名</button>
            <button
              type="button"
              class="row-danger"
              :class="{ 'row-danger-armed': confirmingName === stat.name }"
              @click="requestRemove(stat.name)"
            >
              {{ confirmingName === stat.name ? '确认删除？' : '删除' }}
            </button>
          </div>
        </template>
      </li>
    </ul>

    <p v-else class="empty">在提示词编辑页添加标签</p>
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
  color: var(--pb-accent-text);
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

.empty {
  margin: 0;
  font-size: 12px;
  color: var(--pb-text-faint);
  line-height: 1.8;
}
</style>
