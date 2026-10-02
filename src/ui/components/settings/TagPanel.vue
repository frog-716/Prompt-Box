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
  if (confirmTimer !== undefined) clearTimeout(confirmTimer);
  confirmingName.value = tag;
  confirmTimer = setTimeout(() => {
    confirmingName.value = null;
  }, 3000);
}

function confirmRemove(tag: string): void {
  if (confirmTimer !== undefined) clearTimeout(confirmTimer);
  confirmingName.value = null;
  emit('remove', tag);
}

function cancelRemove(): void {
  if (confirmTimer !== undefined) clearTimeout(confirmTimer);
  confirmingName.value = null;
}

onBeforeUnmount(() => {
  if (confirmTimer !== undefined) clearTimeout(confirmTimer);
});
</script>

<template>
  <section class="section">
    <h2 class="section-title">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z"/><circle cx="7.5" cy="7.5" r=".5"/></svg>
      标签管理
    </h2>
    <div class="panel">
      <ul v-if="tagStats.length > 0" class="list">
      <li v-for="stat in tagStats" :key="stat.name" class="row">
        <template v-if="editingName === stat.name">
          <input
            v-model="editingValue"
            type="text"
            class="row-input"
            autofocus
            @blur="submitEdit"
            @keydown.enter.prevent="submitEdit"
            @keydown.esc="editingName = null"
          />
        </template>

        <template v-else>
          <button type="button" class="tag-name" title="点击重命名" @click="startEdit(stat.name)">
            <span>#{{ stat.name }}</span><span class="row-count">({{ stat.count }})</span>
          </button>
          <div v-if="confirmingName === stat.name" class="delete-confirm">
            <strong>将从关联提示词中移除</strong>
            <div><button type="button" @click="cancelRemove">取消</button><button type="button" class="confirm-delete" @click="confirmRemove(stat.name)">确认</button></div>
          </div>
          <button v-else type="button" class="remove-button" :aria-label="`删除标签 ${stat.name}`" title="删除" @click="requestRemove(stat.name)">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/><path d="M10 11v5M14 11v5"/></svg>
          </button>
        </template>
      </li>
      </ul>

      <div v-else class="empty-state">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z"/><circle cx="7.5" cy="7.5" r=".5"/></svg>
        <p>暂无标签。在编辑提示词时输入 #标签名 即可。</p>
      </div>
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

.list {
  list-style: none;
  margin: var(--pb-space-0);
  padding: var(--pb-space-0);
  display: flex;
  flex-wrap: wrap;
  gap: var(--pb-space-12);
}

.row {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--pb-space-4);
  min-height: 34px;
  padding: var(--pb-space-4) var(--pb-space-7) var(--pb-space-4) var(--pb-space-12);
  border: 1px solid var(--pb-border);
  border-radius: var(--pb-radius-pill);
  background: var(--pb-white);
  box-shadow: var(--pb-shadow-card);
}

.row:hover { border-color: var(--pb-border-strong); }

.tag-name {
  display: inline-flex;
  align-items: center;
  gap: var(--pb-space-6);
  min-height: 22px;
  border: 0;
  padding: var(--pb-space-0);
  background: transparent;
  color: var(--pb-text-strong-muted);
  font-size: 12px;
}

.tag-name:hover:not(:disabled) { background: transparent; color: var(--pb-text); }
.row-input { width: 100px; border: 0; border-bottom: 1px solid var(--pb-border-strong); border-radius: var(--pb-radius-none); padding: var(--pb-space-2) var(--pb-space-0); outline: none; background: transparent; font-size: 12px; }

.row-count {
  font-size: 10px;
  color: var(--pb-text-faint);
  flex-shrink: 0;
}

.remove-button {
  display: grid;
  place-items: center;
  width: 21px;
  height: 21px;
  min-height: 21px;
  border: 0;
  padding: var(--pb-space-3);
  background: transparent;
  color: var(--pb-text-faint);
  opacity: 0;
  transition: opacity .14s ease, color .14s ease;
}

.row:hover .remove-button, .remove-button:focus-visible { opacity: 1; }
.remove-button:hover:not(:disabled) { background: transparent; color: var(--pb-danger-text-strong); }
.remove-button svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }

.delete-confirm {
  position: absolute;
  z-index: 10;
  bottom: calc(100% + 8px);
  left: 50%;
  display: flex;
  min-width: 150px;
  flex-direction: column;
  gap: var(--pb-space-8);
  padding: var(--pb-space-10);
  transform: translateX(-50%);
  border: 1px solid var(--pb-border);
  border-radius: var(--pb-radius-8);
  background: var(--pb-white);
  box-shadow: 0 8px 24px var(--pb-black-overlay-12);
  color: var(--pb-text-strong-muted);
  white-space: nowrap;
  font-size: 10px;
}

.delete-confirm strong { font-weight: 500; text-align: center; }
.delete-confirm > div { display: flex; justify-content: center; gap: var(--pb-space-16); padding-top: var(--pb-space-7); border-top: 1px solid var(--pb-border); }
.delete-confirm button { min-height: 20px; border: 0; padding: var(--pb-space-0); background: transparent; color: var(--pb-text-muted); font-size: 10px; }
.delete-confirm .confirm-delete { color: var(--pb-danger-text-strong); font-weight: 500; }

.empty-state {
  display: flex;
  min-height: 96px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--pb-space-8);
  color: var(--pb-text-muted);
}

.empty-state svg { width: 40px; height: 40px; fill: none; stroke: currentColor; stroke-width: 1.6; opacity: .2; }
.empty-state p { margin: var(--pb-space-0); font-size: 12px; }

@media (max-width: 480px) {
  .panel { padding: var(--pb-space-16); }
  .remove-button { opacity: 1; }
}
</style>
