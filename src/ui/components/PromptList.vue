<script setup lang="ts">
/**
 * 提示词列表。
 *
 * 只做渲染与事件转发，不持有状态。空状态分两种文案：
 * 库里一条都没有，和筛选后没匹配上 —— 后者提示用户去改筛选，而不是去新建。
 */

import type { Prompt } from '@/domain/types';
import PromptCard from './PromptCard.vue';

defineProps<{
  prompts: Prompt[];
  copiedId: string | null;
  hasFilter: boolean;
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
        :copied="copiedId === prompt.id"
        @copy="emit('copy', $event)"
        @edit="emit('edit', $event)"
        @remove="emit('remove', $event)"
      />
    </template>

    <p v-else class="empty">
      {{ hasFilter ? '没有匹配的提示词，换个条件试试' : '还没有提示词，点右上角「新建」记一条' }}
    </p>
  </div>
</template>

<style scoped>
.list {
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 12px 14px 18px;
}

.empty {
  margin: 28px 0;
  text-align: center;
  font-size: 12px;
  color: var(--pb-text-faint);
  line-height: 1.8;
}
</style>
