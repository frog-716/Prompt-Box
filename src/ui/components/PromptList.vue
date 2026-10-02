<script setup lang="ts">
/**
 * 提示词列表。
 *
 * 只做渲染与事件转发，不持有状态。空状态与 Gemini 原型保持一致。
 */

import type { Prompt } from '@/domain/types';
import PromptCard from './PromptCard.vue';

defineProps<{
  prompts: Prompt[];
  folderNames: Record<string, string>;
}>();

const emit = defineEmits<{
  copy: [prompt: Prompt];
  edit: [prompt: Prompt];
  remove: [prompt: Prompt];
}>();
</script>

<template>
  <div class="list">
    <template v-if="prompts.length > 0">
      <PromptCard
        v-for="prompt in prompts"
        :key="prompt.id"
        :prompt="prompt"
        :folder-name="prompt.folderId === null ? '未归类' : (folderNames[prompt.folderId] ?? '未归类')"
        @copy="emit('copy', $event)"
        @edit="emit('edit', $event)"
        @remove="emit('remove', $event)"
      />
    </template>

    <div v-else class="empty-state">
      <svg class="empty-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6M8 13h8M8 17h8" />
      </svg>
      <p>暂无匹配的提示词</p>
    </div>
  </div>
</template>

<style scoped>
.list {
  display: flex;
  flex-direction: column;
  gap: var(--pb-space-12);
  padding: var(--pb-space-12);
}

.empty-state {
  display: grid;
  justify-items: center;
  align-content: center;
  gap: var(--pb-space-12);
  min-height: 100%;
  padding: var(--pb-space-22) var(--pb-space-14);
  color: var(--pb-text-muted);
  text-align: center;
}

.empty-state p {
  margin: var(--pb-space-0);
  font-size: 13px;
}

.empty-icon {
  width: 40px;
  height: 40px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
  opacity: .2;
}

</style>
