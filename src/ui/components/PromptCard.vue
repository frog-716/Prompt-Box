<script setup lang="ts">
/**
 * 单条提示词卡片。
 *
 * 点卡片任意位置 = 复制到剪贴板，这是最高频的动作，所以给它最大的点击区域。
 * 编辑与删除退到角落，删除还需要点两下（内联确认），避免手滑丢内容。
 */

import { onBeforeUnmount, ref } from 'vue';

import { summarize } from '@/domain/prompt';
import type { Prompt } from '@/domain/types';
import { formatDateTime } from '@/shared/utils';

const props = defineProps<{
  prompt: Prompt;
  folderName: string;
  copied: boolean;
}>();

const emit = defineEmits<{
  copy: [prompt: Prompt];
  edit: [prompt: Prompt];
  remove: [prompt: Prompt];
}>();

const confirming = ref(false);
let confirmTimer: ReturnType<typeof setTimeout> | undefined;

function requestRemove(): void {
  if (!confirming.value) {
    confirming.value = true;
    confirmTimer = setTimeout(() => {
      confirming.value = false;
    }, 3000);
    return;
  }
  if (confirmTimer !== undefined) clearTimeout(confirmTimer);
  confirming.value = false;
  emit('remove', props.prompt);
}

function onKeydown(event: KeyboardEvent): void {
  if (event.target !== event.currentTarget) return;
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    emit('copy', props.prompt);
  }
}

onBeforeUnmount(() => {
  if (confirmTimer !== undefined) clearTimeout(confirmTimer);
});
</script>

<template>
  <article
    class="card"
    :class="{ 'card-copied': copied }"
    role="button"
    tabindex="0"
    :aria-label="`复制 ${prompt.title}`"
    @click="emit('copy', prompt)"
    @keydown="onKeydown"
  >
    <header class="card-head">
      <h3 class="card-title">{{ prompt.title }}</h3>
      <span class="card-copy" :class="{ 'card-copy-done': copied }">
        {{ copied ? '已复制' : '复制' }}
      </span>
    </header>

    <p v-if="prompt.content.trim()" class="card-preview">{{ summarize(prompt.content) }}</p>

    <footer class="card-foot">
      <div class="card-tags">
        <span class="card-folder">📁 {{ folderName }}</span>
        <span v-for="tag in prompt.tags" :key="tag" class="card-tag">#{{ tag }}</span>
      </div>
      <div class="card-actions">
        <span class="card-time">{{ formatDateTime(prompt.updatedAt) }}</span>
        <button
          type="button"
          class="card-action"
          @click.stop="emit('edit', prompt)"
        >
          编辑
        </button>
        <button
          type="button"
          class="card-action"
          :class="{ 'card-action-danger': confirming }"
          @click.stop="requestRemove"
        >
          {{ confirming ? '确定删除？' : '删除' }}
        </button>
      </div>
    </footer>
  </article>
</template>

<style scoped>
.card {
  border: 1px solid var(--pb-border);
  border-radius: var(--pb-radius);
  padding: 9px 11px;
  background: var(--pb-bg);
  cursor: pointer;
  transition: border-color 0.12s ease, background 0.12s ease;
}

.card:hover {
  border-color: var(--pb-border-strong);
  background: var(--pb-surface);
}

.card:focus-visible {
  outline: 2px solid var(--pb-accent);
  outline-offset: 1px;
}

.card-copied {
  border-color: var(--pb-accent);
  background: var(--pb-accent-weak);
}

.card-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.card-title {
  margin: 0;
  font-size: 13px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-copy {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--pb-text-faint);
}

.card-copy-done {
  color: var(--pb-accent-text);
}

.card-preview {
  margin: 3px 0 0;
  font-size: 12px;
  color: var(--pb-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 7px;
  min-height: 18px;
}

.card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  min-width: 0;
}

.card-tag {
  font-size: 11px;
  color: var(--pb-accent-text);
  background: var(--pb-accent-weak);
  border-radius: 999px;
  padding: 0 7px;
  white-space: nowrap;
}

.card-folder {
  font-size: 11px;
  color: var(--pb-text-muted);
  white-space: nowrap;
}

.card-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.card-time {
  font-size: 11px;
  color: var(--pb-text-faint);
}

.card-action {
  border: none;
  background: transparent;
  padding: 0;
  font-size: 11px;
  color: var(--pb-text-faint);
}

.card-action:hover:not(:disabled) {
  background: transparent;
  color: var(--pb-text);
}

.card-action-danger {
  color: var(--pb-danger);
}
</style>
