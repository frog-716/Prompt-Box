<script setup lang="ts">
/**
 * 侧边栏根组件。
 *
 * 只有两种视图：列表和编辑，互斥切换 —— 不做弹窗、不做抽屉，
 * 因为在几百像素宽的侧边栏里，叠加层只会让操作变慢。
 *
 * 这里也是唯一把「用户动作」翻译成「领域操作」的地方：
 * 组件本身不认识 storage，composable 不认识 DOM。
 */

import { computed, onUnmounted, ref } from 'vue';

import { copyText } from '@/infra/clipboard';
import { openOptionsPage } from '@/infra/runtime';
import { COPY_FEEDBACK_MS } from '@/shared/constants';
import type { Prompt, PromptDraft } from '@/domain/types';
import AppHeader from '@/ui/components/AppHeader.vue';
import FilterBar from '@/ui/components/FilterBar.vue';
import PromptEditor from '@/ui/components/PromptEditor.vue';
import PromptList from '@/ui/components/PromptList.vue';
import ToastBar from '@/ui/components/ToastBar.vue';
import { useFilters } from '@/ui/composables/useFilters';
import { useLibrary } from '@/ui/composables/useLibrary';
import { useToast } from '@/ui/composables/useToast';

const {
  ready,
  loadError,
  reload,
  prompts,
  folders,
  tagStats,
  unclassifiedCount,
  savePrompt,
  deletePrompt,
} = useLibrary();

const {
  query,
  folderId,
  tags,
  visible,
  selectFolder,
  toggleTag,
  clearTags,
} = useFilters(prompts, folders, tagStats);

const { message, tone, show } = useToast();

const editorOpen = ref(false);
const editing = ref<Prompt | null>(null);
const saving = ref(false);
const copiedId = ref<string | null>(null);
let copiedTimer: ReturnType<typeof setTimeout> | undefined;

const tagSuggestions = computed(() => tagStats.value.map((stat) => stat.name));
const folderNames = computed<Record<string, string>>(() =>
  Object.fromEntries(folders.value.map((folder) => [folder.id, folder.name])),
);
const hasFilter = computed(
  () => query.value.trim() !== '' || folderId.value !== 'all' || tags.value.length > 0,
);

function openCreate(): void {
  editing.value = null;
  editorOpen.value = true;
}

function openEdit(prompt: Prompt): void {
  editing.value = prompt;
  editorOpen.value = true;
}

function closeEditor(): void {
  editorOpen.value = false;
  editing.value = null;
}

async function handleSave(draft: PromptDraft): Promise<void> {
  if (saving.value) return;
  saving.value = true;
  const isEdit = editing.value !== null;
  try {
    await savePrompt(draft, editing.value?.id ?? null);
    closeEditor();
    show(isEdit ? '已更新' : '已保存');
  } catch (error) {
    console.error('[Prompt Box] 保存提示词失败：', error);
    show('保存失败，数据未更改', { tone: 'error' });
  } finally {
    saving.value = false;
  }
}

async function handleCopy(prompt: Prompt): Promise<void> {
  const ok = await copyText(prompt.content);
  if (!ok) {
    show('复制失败，请重试', { tone: 'error' });
    return;
  }
  copiedId.value = prompt.id;
  if (copiedTimer !== undefined) clearTimeout(copiedTimer);
  copiedTimer = setTimeout(() => {
    copiedId.value = null;
  }, COPY_FEEDBACK_MS);
}

async function handleRemove(prompt: Prompt): Promise<void> {
  try {
    await deletePrompt(prompt.id);
    show('已删除');
  } catch (error) {
    console.error('[Prompt Box] 删除提示词失败：', error);
    show('删除失败，数据未更改', { tone: 'error' });
  }
}

function openSettings(): void {
  openOptionsPage();
}

onUnmounted(() => {
  if (copiedTimer !== undefined) clearTimeout(copiedTimer);
});
</script>

<template>
  <div class="app">
    <div v-if="!ready" class="load-state">
      <p>{{ loadError ? '读取失败，数据未更改' : '正在读取…' }}</p>
      <button v-if="loadError" type="button" @click="reload">重试</button>
    </div>

    <PromptEditor
      v-else-if="editorOpen"
      :prompt="editing"
      :folders="folders"
      :tag-suggestions="tagSuggestions"
      :saving="saving"
      @save="handleSave"
      @cancel="closeEditor"
    />

    <template v-else-if="ready">
      <AppHeader @create="openCreate" @open-settings="openSettings" />
      <FilterBar
        :query="query"
        :folder-id="folderId"
        :tags="tags"
        :folders="folders"
        :tag-stats="tagStats"
        :total-count="prompts.length"
        :unclassified-count="unclassifiedCount"
        @update:query="query = $event"
        @select-folder="selectFolder"
        @toggle-tag="toggleTag"
        @clear-tags="clearTags"
      />
      <div class="app-body">
        <PromptList
          :prompts="visible"
          :folder-names="folderNames"
          :copied-id="copiedId"
          :has-filter="hasFilter"
          @copy="handleCopy"
          @edit="openEdit"
          @remove="handleRemove"
        />
      </div>
    </template>

    <ToastBar :message="message" :tone="tone" />
  </div>
</template>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

.app-body {
  flex: 1;
  overflow-y: auto;
}

.load-state {
  display: grid;
  place-content: center;
  gap: 8px;
  flex: 1;
  text-align: center;
  color: var(--pb-text-muted);
}

.load-state p {
  margin: 0;
}
</style>
