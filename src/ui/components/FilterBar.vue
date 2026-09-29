<script setup lang="ts">
/**
 * 筛选区：搜索框 + 文件夹一行 + 标签一行。
 *
 * 把三者放一起是因为它们解决同一个问题 ——「现在想看哪一批」。
 * 点已选中的文件夹或标签可以取消选择，不需要额外的「清除」按钮。
 */

import type { Folder, TagStat } from '@/domain/types';
import type { FolderSelection } from '../composables/useFilters';

defineProps<{
  query: string;
  folderId: FolderSelection;
  tags: string[];
  folders: Folder[];
  tagStats: TagStat[];
  totalCount: number;
  unclassifiedCount: number;
}>();

const emit = defineEmits<{
  'update:query': [value: string];
  'select-folder': [value: FolderSelection];
  'toggle-tag': [tag: string];
  'clear-tags': [];
}>();
</script>

<template>
  <div class="filter-bar">
    <input
      :value="query"
      type="search"
      class="search-input"
      placeholder="搜索标题、内容或标签"
      autocomplete="off"
      @input="emit('update:query', ($event.target as HTMLInputElement).value)"
    />

    <div v-if="folders.length > 0" class="pill-row">
      <span class="pill-row-label">文件夹</span>
      <button
        type="button"
        class="pill"
        :class="{ 'pill-active': folderId === 'all' }"
        @click="emit('select-folder', 'all')"
      >
        全部 <span class="pill-count">{{ totalCount }}</span>
      </button>
      <button
        v-for="folder in folders"
        :key="folder.id"
        type="button"
        class="pill"
        :class="{ 'pill-active': folderId === folder.id }"
        @click="emit('select-folder', folder.id)"
      >
        {{ folder.name }}
      </button>
      <button
        v-if="unclassifiedCount > 0"
        type="button"
        class="pill"
        :class="{ 'pill-active': folderId === null }"
        @click="emit('select-folder', null)"
      >
        未归类 <span class="pill-count">{{ unclassifiedCount }}</span>
      </button>
    </div>

    <div v-if="tagStats.length > 0" class="pill-row">
      <span class="pill-row-label">标签</span>
      <button
        v-for="stat in tagStats"
        :key="stat.name"
        type="button"
        class="pill"
        :class="{ 'pill-active': tags.includes(stat.name) }"
        @click="emit('toggle-tag', stat.name)"
      >
        #{{ stat.name }} <span class="pill-count">{{ stat.count }}</span>
      </button>
      <button v-if="tags.length > 0" type="button" class="pill pill-reset" @click="emit('clear-tags')">
        清除标签
      </button>
    </div>
  </div>
</template>

<style scoped>
.filter-bar {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 14px 12px;
  border-bottom: 1px solid var(--pb-border);
}

.search-input {
  font-size: 12px;
}

.pill-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px;
}

.pill-row-label {
  font-size: 11px;
  color: var(--pb-text-faint);
  margin-right: 2px;
}

.pill {
  font-size: 11px;
  padding: 2px 9px;
  border-radius: 999px;
  color: var(--pb-text-muted);
  border-color: var(--pb-border);
  white-space: nowrap;
}

.pill-active {
  background: var(--pb-accent-weak);
  border-color: var(--pb-accent);
  color: var(--pb-accent-text);
}

.pill-active:hover:not(:disabled) {
  background: var(--pb-accent-weak);
}

.pill-count {
  opacity: 0.65;
  margin-left: 2px;
}

.pill-reset {
  border-style: dashed;
  color: var(--pb-text-faint);
}
</style>
