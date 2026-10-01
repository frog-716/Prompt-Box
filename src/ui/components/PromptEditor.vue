<script setup lang="ts">
/**
 * 新建 / 编辑表单。
 *
 * 字段只留四个：标题、内容、文件夹、标签。标题留空会自动取内容首行，
 * 所以真正必填的只有内容 —— 记录一条提示词不该被表单挡住。
 */

import { nextTick, ref, watch } from 'vue';

import type { Folder, Prompt, PromptDraft } from '@/domain/types';
import { deriveTitle } from '@/shared/utils';
import { AUTO_TITLE_MAX_LENGTH } from '@/shared/constants';
import TagInput from './TagInput.vue';

const props = defineProps<{
  prompt: Prompt | null;
  folders: Folder[];
  tagSuggestions: string[];
  saving: boolean;
}>();

const emit = defineEmits<{
  save: [draft: PromptDraft];
  cancel: [];
}>();

const title = ref('');
const content = ref('');
const folderId = ref<string | null>(null);
const tags = ref<string[]>([]);
const error = ref('');
const contentEl = ref<HTMLTextAreaElement | null>(null);

function reset(): void {
  const source = props.prompt;
  title.value = source?.title ?? '';
  content.value = source?.content ?? '';
  folderId.value = source?.folderId ?? null;
  tags.value = source ? [...source.tags] : [];
  error.value = '';
}

watch(
  () => props.prompt,
  async () => {
    reset();
    await nextTick();
    contentEl.value?.focus();
  },
  { immediate: true },
);

watch(
  () => props.folders.map((folder) => folder.id),
  (ids) => {
    if (folderId.value !== null && !ids.includes(folderId.value)) folderId.value = null;
  },
);

function submit(): void {
  if (props.saving) return;
  if (!content.value.trim()) {
    error.value = '内容不能为空';
    contentEl.value?.focus();
    return;
  }
  emit('save', {
    title: title.value.trim() || deriveTitle(content.value, AUTO_TITLE_MAX_LENGTH),
    content: content.value,
    folderId: folderId.value,
    tags: tags.value,
  });
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault();
    emit('cancel');
  }
}
</script>

<template>
  <form class="editor" @submit.prevent="submit" @keydown="onKeydown">
    <div class="editor-head">
      <h2 class="editor-title">{{ prompt ? '编辑提示词' : '新建提示词' }}</h2>
    </div>

    <label class="field">
      <span class="field-label">标题</span>
      <input v-model="title" type="text" placeholder="留空则自动取内容首行" />
    </label>

    <label class="field field-grow">
      <span class="field-label">内容</span>
      <textarea
        ref="contentEl"
        v-model="content"
        placeholder="把提示词写在这里，可以多行"
        @input="error = ''"
      />
    </label>

    <div class="field-row">
      <label class="field">
        <span class="field-label">文件夹</span>
        <select v-model="folderId">
          <option :value="null">未归类</option>
          <option v-for="folder in folders" :key="folder.id" :value="folder.id">
            {{ folder.name }}
          </option>
        </select>
      </label>
    </div>

    <div class="field">
      <span class="field-label">标签</span>
      <TagInput v-model="tags" :suggestions="tagSuggestions" />
    </div>

    <p v-if="error" class="editor-error">{{ error }}</p>

    <div class="editor-actions">
      <button type="submit" class="primary" :disabled="saving">
        {{ saving ? '保存中…' : '保存' }}
      </button>
      <button type="button" @click="emit('cancel')">取消</button>
    </div>
  </form>
</template>

<style scoped>
.editor {
  display: flex;
  flex-direction: column;
  gap: 11px;
  padding: 14px;
  height: 100%;
  overflow-y: auto;
}

.editor-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.editor-title {
  margin: 0;
  font-size: 13px;
  font-weight: 500;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.field-grow {
  flex: 1;
  min-height: 140px;
}

.field-label {
  font-size: 11px;
  color: var(--pb-text-muted);
}

.field textarea {
  flex: 1;
  min-height: 120px;
  resize: vertical;
  line-height: 1.6;
}

.editor-error {
  margin: 0;
  font-size: 11px;
  color: var(--pb-danger);
}

.editor-actions {
  display: flex;
  gap: 7px;
  padding-top: 2px;
}

.primary {
  background: var(--pb-accent);
  border-color: var(--pb-accent);
  color: #ffffff;
  font-weight: 500;
}

.primary:hover:not(:disabled) {
  background: var(--pb-accent-hover);
  border-color: var(--pb-accent-hover);
}
</style>
