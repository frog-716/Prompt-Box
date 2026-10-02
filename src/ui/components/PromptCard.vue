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
}>();

const emit = defineEmits<{
  copy: [prompt: Prompt];
  edit: [prompt: Prompt];
  remove: [prompt: Prompt];
}>();

const confirming = ref(false);
let confirmTimer: ReturnType<typeof setTimeout> | undefined;

function requestRemove(): void {
  confirming.value = true;
  if (confirmTimer !== undefined) clearTimeout(confirmTimer);
  confirmTimer = setTimeout(() => {
    confirming.value = false;
  }, 3000);
}

function confirmRemove(): void {
  if (confirmTimer !== undefined) clearTimeout(confirmTimer);
  confirming.value = false;
  emit('remove', props.prompt);
}

function cancelRemove(): void {
  if (confirmTimer !== undefined) clearTimeout(confirmTimer);
  confirming.value = false;
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
    role="button"
    tabindex="0"
    :aria-label="`复制 ${prompt.title}`"
    @click="emit('copy', prompt)"
    @keydown="onKeydown"
  >
    <header class="card-head">
      <h3 class="card-title">{{ prompt.title }}</h3>
    </header>

    <div v-if="confirming" class="card-confirm" @click.stop>
      <span>确认删除?</span>
      <button type="button" class="confirm-yes" @click="confirmRemove">是</button>
      <button type="button" class="confirm-no" @click="cancelRemove">否</button>
    </div>
    <div v-else class="card-actions" @click.stop>
      <button type="button" class="card-action" aria-label="编辑" title="编辑" @click="emit('edit', prompt)">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>
      </button>
      <button type="button" class="card-action" aria-label="删除" title="删除" @click="requestRemove">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/><path d="M10 11v5M14 11v5"/></svg>
      </button>
    </div>

    <p v-if="prompt.content.trim()" class="card-preview">{{ summarize(prompt.content) }}</p>

    <footer class="card-foot">
      <div class="card-tags">
        <span class="card-folder">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z" /></svg>
          {{ folderName }}
        </span>
        <span v-for="tag in prompt.tags" :key="tag" class="card-tag">#{{ tag }}</span>
      </div>
      <span class="card-time">{{ formatDateTime(prompt.updatedAt).slice(5, 10) }}</span>
    </footer>
  </article>
</template>

<style scoped>
.card {
  position: relative;
  border: 1px solid var(--pb-border-card);
  border-radius: var(--pb-radius);
  padding: var(--pb-space-12);
  background: var(--pb-surface);
  box-shadow: var(--pb-shadow-card);
  cursor: pointer;
  transition: border-color 0.14s ease, box-shadow 0.14s ease;
}

.card:hover {
  border-color: var(--pb-text);
  box-shadow: var(--pb-shadow-raised);
}

.card:focus-visible {
  outline: 2px solid var(--pb-accent);
  outline-offset: 2px;
}

.card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--pb-space-8);
  margin-bottom: var(--pb-space-6);
  padding-right: var(--pb-space-44);
}

.card-title {
  margin: var(--pb-space-0);
  font-family: var(--pb-font-display);
  font-size: 14px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-preview {
  margin: var(--pb-space-0) var(--pb-space-0) var(--pb-space-10);
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
  gap: var(--pb-space-8);
  margin-top: var(--pb-space-0);
  min-height: 18px;
}

.card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--pb-space-6);
  min-width: 0;
  overflow: hidden;
}

.card-tag {
  font-size: 11px;
  color: var(--pb-text-muted);
  background: var(--pb-black-overlay-4);
  border-radius: var(--pb-radius-4);
  padding: var(--pb-space-2) var(--pb-space-6);
  white-space: nowrap;
}

.card-folder {
  display: inline-flex;
  align-items: center;
  gap: var(--pb-space-4);
  font-size: 11px;
  color: var(--pb-text-muted);
  background: var(--pb-black-overlay-4);
  border-radius: var(--pb-radius-4);
  padding: var(--pb-space-2) var(--pb-space-6);
  white-space: nowrap;
}

.card-folder svg {
  width: 12px;
  height: 12px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
  opacity: .7;
}

.card-actions {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  align-items: center;
  gap: var(--pb-space-2);
  border-radius: var(--pb-radius);
  background: var(--pb-paper-overlay-80);
  opacity: .4;
  transition: opacity .14s ease;
}

.card:hover .card-actions, .card:focus-within .card-actions { opacity: 1; }

.card-time {
  font-size: 11px;
  color: var(--pb-text-faint);
}

.card-action {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  min-height: 24px;
  border: 0;
  background: transparent;
  padding: var(--pb-space-4);
  color: var(--pb-text-faint);
}

.card-action:hover:not(:disabled) {
  background: transparent;
  color: var(--pb-accent);
}

.card-action svg {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.card-confirm {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: var(--pb-space-7);
  padding: var(--pb-space-4) var(--pb-space-7);
  border: 1px solid var(--pb-danger-border-soft);
  border-radius: var(--pb-radius-5);
  background: var(--pb-danger-surface);
  color: var(--pb-danger);
  font-size: 11px;
}

.card-confirm button {
  min-height: 22px;
  padding: var(--pb-space-1) var(--pb-space-5);
  border: 0;
  background: transparent;
  color: var(--pb-text-soft);
  font-size: 11px;
}

.card-confirm .confirm-yes { background: var(--pb-danger-button); color: var(--pb-white); border-radius: var(--pb-radius-3); }

.card-confirm .confirm-no:hover { color: var(--pb-text); }

.card-time {
  flex-shrink: 0;
  color: var(--pb-text-date);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

@media (max-width: 360px) {
  .card { padding: var(--pb-space-10); }
  .card-tags { gap: var(--pb-space-4); }
}
</style>
