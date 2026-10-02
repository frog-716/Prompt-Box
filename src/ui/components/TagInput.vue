<script setup lang="ts">
/**
 * 标签输入。
 *
 * 交互刻意保持最简：打字、回车即添加；已有标签点叉删除。
 * 下方列出库里出现过的标签，点一下就补上，省去重复打字。
 */

import { computed, ref } from 'vue';

import { normalizeTag } from '@/domain/prompt';

const props = defineProps<{
  modelValue: string[];
  suggestions?: string[];
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string[]];
}>();

const draft = ref('');

const remainingSuggestions = computed(() =>
  (props.suggestions ?? []).filter((tag) => !props.modelValue.includes(tag)).slice(0, 8),
);

function add(raw: string): void {
  const tag = normalizeTag(raw);
  draft.value = '';
  if (!tag || props.modelValue.includes(tag)) return;
  emit('update:modelValue', [...props.modelValue, tag]);
}

function remove(tag: string): void {
  emit(
    'update:modelValue',
    props.modelValue.filter((item) => item !== tag),
  );
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter' || event.key === ',') {
    event.preventDefault();
    add(draft.value);
    return;
  }
  if (event.key === 'Backspace' && !draft.value && props.modelValue.length > 0) {
    const last = props.modelValue[props.modelValue.length - 1];
    if (last !== undefined) remove(last);
  }
}
</script>

<template>
  <div class="tag-input">
    <div class="tag-input-field">
      <span v-for="tag in modelValue" :key="tag" class="tag-chip">
        #{{ tag }}
        <button type="button" class="tag-chip-remove" :aria-label="`移除标签 ${tag}`" @click="remove(tag)">
          ×
        </button>
      </span>
      <input
        v-model="draft"
        type="text"
        class="tag-input-text"
        placeholder="输入标签后回车"
        @keydown="onKeydown"
        @blur="add(draft)"
      />
    </div>
    <div v-if="remainingSuggestions.length > 0" class="tag-suggestions">
      <span class="suggestion-label">建议:</span>
      <button
        v-for="tag in remainingSuggestions"
        :key="tag"
        type="button"
        class="tag-suggestion"
        @click="add(tag)"
      >
        #{{ tag }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.tag-input-field {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--pb-space-6);
  min-height: 42px;
  border: 1px solid var(--pb-border);
  border-radius: var(--pb-radius);
  padding: var(--pb-space-7) var(--pb-space-8);
  background: var(--pb-white);
}

.tag-input-field:focus-within {
  border-color: var(--pb-accent);
  box-shadow: 0 0 0 1px var(--pb-accent-ring);
}

.tag-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--pb-space-3);
  font-size: 11px;
  padding: var(--pb-space-3) var(--pb-space-5) var(--pb-space-3) var(--pb-space-7);
  border-radius: var(--pb-radius-4);
  background: var(--pb-black-overlay-5);
  color: var(--pb-text);
  white-space: nowrap;
}

.tag-chip-remove {
  border: none;
  background: transparent;
  padding: var(--pb-space-0) var(--pb-space-3);
  font-size: 13px;
  line-height: 1;
  color: inherit;
  opacity: 0.6;
}

.tag-chip-remove:hover {
  background: transparent;
  opacity: 1;
}

.tag-input-text {
  flex: 1 1 90px;
  min-width: 90px;
  border: none;
  padding: var(--pb-space-2) var(--pb-space-0);
  background: transparent;
}

.tag-input-text:focus {
  border: none;
}

.tag-suggestions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--pb-space-8);
  margin-top: var(--pb-space-6);
  color: var(--pb-text-soft);
  font-size: 11px;
}

.suggestion-label { color: var(--pb-text-soft); }

.tag-suggestions button.tag-suggestion {
  min-height: auto;
  border: 0;
  border-radius: var(--pb-radius-none);
  padding: var(--pb-space-0);
  background: transparent;
  color: inherit;
  font: inherit;
}

.tag-suggestion {
  font-size: 11px;
}

.tag-suggestion:hover:not(:disabled) { background: transparent; color: var(--pb-accent); }
</style>
