<script setup lang="ts">
/**
 * 搜索、文件夹下拉与标签按钮，按 Gemini A 原型排列。
 */

import type { Folder, TagStat } from '@/domain/types';
import type { FolderSelection } from '../composables/useFilters';

defineProps<{
  query: string;
  folderId: FolderSelection;
  tags: string[];
  folders: Folder[];
  tagStats: TagStat[];
}>();

const emit = defineEmits<{
  'update:query': [value: string];
  'select-folder': [value: FolderSelection];
  'toggle-tag': [tag: string];
}>();
</script>

<template>
  <div class="filter-bar">
    <div class="search-wrap">
      <svg class="search-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
      <input
        :value="query"
        type="search"
        class="search-input"
        placeholder="搜索标题、原文或标签..."
        autocomplete="off"
        @input="emit('update:query', ($event.target as HTMLInputElement).value)"
      />
    </div>

    <div class="folder-select-wrap">
      <svg class="folder-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z" /></svg>
      <select
        class="folder-select"
        :value="folderId === 'all' ? 'all' : folderId === null ? '__unclassified__' : folderId"
        @change="emit('select-folder', ($event.target as HTMLSelectElement).value === 'all' ? 'all' : ($event.target as HTMLSelectElement).value === '__unclassified__' ? null : ($event.target as HTMLSelectElement).value)"
      >
        <option value="all">全部</option>
        <option v-for="folder in folders" :key="folder.id" :value="folder.id">{{ folder.name }}</option>
        <option value="__unclassified__">未归类</option>
      </select>
    </div>

    <div v-if="tagStats.length > 0" class="tag-row">
      <button
        v-for="stat in tagStats"
        :key="stat.name"
        type="button"
        class="tag-pill"
        :class="{ 'tag-pill-active': tags.includes(stat.name) }"
        @click="emit('toggle-tag', stat.name)"
      >#{{ stat.name }}</button>
    </div>
  </div>
</template>

<style scoped>
.filter-bar {
  display: flex;
  flex-direction: column;
  gap: var(--pb-space-12);
  padding: var(--pb-space-12) var(--pb-space-16);
  border-bottom: 1px solid var(--pb-border);
  background: var(--pb-paper-overlay-20);
}

.search-wrap { position: relative; }

.search-icon {
  position: absolute;
  left: 12px;
  top: 9px;
  z-index: 1;
  width: 16px;
  height: 16px;
  fill: none;
  stroke: var(--pb-text-muted);
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.search-input {
  min-height: 34px;
  padding: var(--pb-space-6) var(--pb-space-12) var(--pb-space-6) var(--pb-space-36);
  border-radius: var(--pb-radius);
  font-size: 13px;
  background: var(--pb-white-overlay-60);
}

.folder-select-wrap {
  display: flex;
  align-items: center;
  gap: var(--pb-space-8);
}

.folder-icon {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: var(--pb-text-muted);
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.folder-select {
  width: auto;
  max-width: 100%;
  min-height: auto;
  border: 0;
  padding: var(--pb-space-0);
  background: transparent;
  font-size: 12px;
  color: var(--pb-text);
  cursor: pointer;
}

.folder-select:focus { box-shadow: none; }

.tag-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--pb-space-6);
  padding-top: var(--pb-space-4);
}

.tag-pill {
  min-height: 23px;
  border: 0;
  border-radius: var(--pb-radius);
  padding: var(--pb-space-1) var(--pb-space-8);
  font-size: 12px;
  color: var(--pb-chip-text);
  background: var(--pb-surface-soft);
}

.tag-pill:hover:not(:disabled) { background: var(--pb-border); }

.tag-pill-active {
  background: var(--pb-accent);
  border-color: var(--pb-accent);
  color: var(--pb-on-accent);
  box-shadow: var(--pb-shadow-card);
}

.tag-pill-active:hover:not(:disabled) {
  background: var(--pb-accent-hover);
}

@media (max-width: 340px) {
  .filter-bar { padding-inline: var(--pb-space-12); }
}
</style>
