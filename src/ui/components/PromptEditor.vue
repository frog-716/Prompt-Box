<script setup lang="ts">
/**
 * 新建 / 编辑表单。
 *
 * 字段只留四个：标题、内容、文件夹、标签。标题留空会自动取内容首行，
 * 所以真正必填的只有内容 —— 记录一条提示词不该被表单挡住。
 */

import { computed, nextTick, ref, watch } from 'vue';

import type { Folder, Prompt, PromptDraft } from '@/domain/types';
import { deriveTitle } from '@/shared/utils';
import { AUTO_TITLE_MAX_LENGTH } from '@/shared/constants';
import TagInput from './TagInput.vue';

const props = defineProps<{
  prompt: Prompt | null;
  folders: Folder[];
  tagSuggestions: string[];
  saving: boolean;
  saveError: string;
  allowSaveAsNew: boolean;
}>();

const emit = defineEmits<{
  save: [draft: PromptDraft];
  saveNew: [draft: PromptDraft];
  cancel: [];
}>();

const title = ref('');
const content = ref('');
const folderId = ref<string | null>(null);
const tags = ref<string[]>([]);
const error = ref('');
const contentEl = ref<HTMLTextAreaElement | null>(null);
const confirmingDiscard = ref(false);

function reset(): void {
  const source = props.prompt;
  title.value = source?.title ?? '';
  content.value = source?.content ?? '';
  folderId.value = source?.folderId ?? null;
  tags.value = source ? [...source.tags] : [];
  error.value = '';
  confirmingDiscard.value = false;
}

/** 表单相对初始状态有没有改动——决定「退出」要不要先问一句。 */
const dirty = computed(() => {
  const source = props.prompt;
  if (!source) {
    return title.value.trim() !== '' || content.value !== '' || folderId.value !== null || tags.value.length > 0;
  }
  return (
    title.value.trim() !== source.title ||
    content.value !== source.content ||
    folderId.value !== source.folderId ||
    tags.value.length !== source.tags.length ||
    tags.value.some((tag, index) => tag !== source.tags[index])
  );
});

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

function submit(asNew = false): void {
  if (props.saving) return;
  if (!content.value.trim()) {
    error.value = '内容不能为空';
    contentEl.value?.focus();
    return;
  }
  const draft: PromptDraft = {
    title: title.value.trim() || deriveTitle(content.value, AUTO_TITLE_MAX_LENGTH),
    content: content.value,
    folderId: folderId.value,
    tags: [...tags.value],
  };
  if (asNew) emit('saveNew', draft);
  else emit('save', draft);
}

/**
 * 退出编辑器。没有改动就直接走；有改动先内联问一句
 * （与卡片删除确认同款模式，不弹窗），避免误触丢草稿。
 */
function requestCancel(): void {
  if (props.saving) return;
  if (!dirty.value) {
    emit('cancel');
    return;
  }
  confirmingDiscard.value = true;
}

function confirmDiscard(): void {
  confirmingDiscard.value = false;
  emit('cancel');
}

function resumeEditing(): void {
  confirmingDiscard.value = false;
  contentEl.value?.focus();
}

function onKeydown(event: KeyboardEvent): void {
  if (props.saving) return;
  if (event.key !== 'Escape') return;
  event.preventDefault();
  if (confirmingDiscard.value) resumeEditing();
  else requestCancel();
}
</script>

<template>
  <form class="editor" @submit.prevent="submit()" @keydown="onKeydown">
    <div class="editor-head">
      <button type="button" class="editor-back" aria-label="返回列表" :disabled="saving" @click="requestCancel()">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
      </button>
      <h2 class="editor-title">{{ prompt ? '编辑提示词' : '新建提示词' }}</h2>
      <span class="editor-spacer" aria-hidden="true"></span>
    </div>

    <div class="editor-body" :inert="saving">
      <label class="field">
        <span class="field-label">标题 <span class="field-note">(选填，默认取原文首行)</span></span>
        <input v-model="title" type="text" placeholder="输入标题..." />
      </label>

      <label class="field field-grow">
        <span class="field-label">原文 <span class="field-required">*</span></span>
        <textarea
          ref="contentEl"
          v-model="content"
          placeholder="输入提示词内容，回车换行..."
          @input="error = ''"
        />
      </label>

      <div class="field-row">
        <label class="field">
          <span class="field-label">归类至</span>
          <span class="folder-input">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z" /></svg>
            <select v-model="folderId">
              <option :value="null">未归类</option>
              <option v-for="folder in folders" :key="folder.id" :value="folder.id">
                {{ folder.name }}
              </option>
            </select>
          </span>
        </label>
      </div>

      <div class="field">
        <span class="field-label">标签 <span class="field-note">(回车添加)</span></span>
        <TagInput v-model="tags" :suggestions="tagSuggestions" />
      </div>

      <p v-if="error || saveError" class="editor-error" role="alert">{{ error || saveError }}</p>
    </div>

    <div class="editor-actions">
      <template v-if="!confirmingDiscard">
        <button type="button" :disabled="saving" @click="requestCancel()">取消</button>
        <button v-if="allowSaveAsNew" type="button" :disabled="saving" @click="submit(true)">另存为新提示词</button>
        <button type="submit" class="primary" :disabled="saving">
          {{ saving ? '保存中…' : '保存' }}
        </button>
      </template>
      <div v-else class="discard-confirm" role="alert">
        <span class="discard-text">有未保存的更改，放弃吗？</span>
        <button type="button" class="discard-no" @click="resumeEditing()">继续编辑</button>
        <button type="button" class="discard-yes" @click="confirmDiscard()">放弃更改</button>
      </div>
    </div>
  </form>
</template>

<style scoped>
.editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: var(--pb-white-overlay-50);
}

.editor-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 49px;
  padding: var(--pb-space-10) var(--pb-space-16);
  border-bottom: 1px solid var(--pb-border);
  background: var(--pb-white);
  flex-shrink: 0;
}

.editor-title {
  margin: var(--pb-space-0);
  font-size: 14px;
  font-weight: 500;
}

.editor-back {
  display: grid;
  width: 24px;
  height: 24px;
  min-height: 24px;
  place-items: center;
  margin-left: calc(-1 * var(--pb-space-4));
  padding: var(--pb-space-2);
  border: 0;
  background: transparent;
  color: var(--pb-text-muted);
}

.editor-back svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.editor-back:hover:not(:disabled) { background: transparent; color: var(--pb-text); }
.editor-spacer { width: 24px; }

.editor-body {
  display: flex;
  flex: 1;
  min-height: 0;
  flex-direction: column;
  gap: var(--pb-space-16);
  overflow-y: auto;
  padding: var(--pb-space-16);
}

.field {
  display: flex;
  flex-direction: column;
  gap: var(--pb-space-6);
}

.field-grow {
  flex: 1;
  min-height: 120px;
}

.field-label {
  display: block;
  font-size: 12px;
  color: var(--pb-text-muted);
  font-weight: 400;
}

.field-note { color: var(--pb-text-faint); font-size: 11px; }
.field-required { color: var(--pb-danger-text-soft); }

.field input,
.field textarea {
  width: 100%;
  padding: var(--pb-space-8) var(--pb-space-12);
  border-radius: var(--pb-radius);
  background: var(--pb-white);
  font-size: 14px;
}

.field textarea {
  flex: 1;
  min-height: 120px;
  resize: none;
  line-height: 1.55;
}

.field-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--pb-space-12);
}

.folder-input {
  position: relative;
  display: flex;
  align-items: center;
}

.folder-input svg {
  position: absolute;
  left: 10px;
  width: 14px;
  height: 14px;
  fill: none;
  stroke: var(--pb-text-muted);
  stroke-width: 1.7;
  stroke-linecap: round;
  stroke-linejoin: round;
  pointer-events: none;
}

.folder-input select {
  padding: var(--pb-space-8) var(--pb-space-30);
  background: var(--pb-white);
  font-size: 14px;
}

.editor-error {
  margin: var(--pb-space-0);
  font-size: 12px;
  color: var(--pb-danger);
}

.editor-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--pb-space-12);
  min-height: 54px;
  padding: var(--pb-space-10) var(--pb-space-16);
  border-top: 1px solid var(--pb-border);
  background: var(--pb-white-overlay-80);
  flex-shrink: 0;
}

.primary {
  background: var(--pb-accent);
  border-color: var(--pb-accent);
  color: var(--pb-on-accent);
  font-weight: 500;
}

.primary:hover:not(:disabled) {
  background: var(--pb-accent-hover);
  border-color: var(--pb-accent-hover);
}

.editor-actions button { min-width: 74px; }

.editor-actions button:not(.primary) {
  border-color: transparent;
  color: var(--pb-text-muted);
  background: transparent;
}

.editor-actions button:not(.primary):hover:not(:disabled) { background: var(--pb-black-overlay-5); }

/* 放弃草稿前的内联确认（与卡片删除确认同款模式：不弹窗） */
.discard-confirm {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--pb-space-8);
  width: 100%;
  font-size: 12px;
  color: var(--pb-danger);
}

.discard-confirm button { min-width: 74px; }
.discard-confirm .discard-no { border-color: transparent; background: transparent; color: var(--pb-text-soft); }
.discard-confirm .discard-no:hover:not(:disabled) { background: var(--pb-black-overlay-5); color: var(--pb-text); }
.discard-confirm .discard-yes { background: var(--pb-danger-button); border-color: var(--pb-danger-button); color: var(--pb-white); border-radius: var(--pb-radius-3); }
.discard-confirm .discard-yes:hover:not(:disabled) { background: var(--pb-danger); border-color: var(--pb-danger); }

@media (max-width: 340px) {
  .editor-body, .editor-head, .editor-actions { padding-inline: var(--pb-space-12); }
  .editor-actions button { min-width: 68px; }
}
</style>
