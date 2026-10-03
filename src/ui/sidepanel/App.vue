<script setup lang="ts">
/**
 * 主界面根组件。
 *
 * 只有两种视图：列表和编辑，互斥切换 —— 不做弹窗、不做抽屉，
 * 兼顾窄视窗与独立标签页两种窗口尺寸。
 *
 * 这里也是唯一把「用户动作」翻译成「领域操作」的地方：
 * 组件本身不认识 storage，composable 不认识 DOM。
 */

import { computed, ref } from 'vue';

import { copyText } from '@/infra/clipboard';
import { openOptionsPage } from '@/infra/runtime';
import type { Prompt, PromptDraft } from '@/domain/types';
import AppHeader from '@/ui/components/AppHeader.vue';
import FilterBar from '@/ui/components/FilterBar.vue';
import PromptEditor from '@/ui/components/PromptEditor.vue';
import PromptList from '@/ui/components/PromptList.vue';
import ToastBar from '@/ui/components/ToastBar.vue';
import SyncStatusBar from '@/ui/components/SyncStatusBar.vue';
import PairingPanel from '@/ui/components/settings/PairingPanel.vue';
import { useFilters } from '@/ui/composables/useFilters';
import { useLibrary } from '@/ui/composables/useLibrary';
import { useToast } from '@/ui/composables/useToast';

const {
  ready,
  loadError,
  storageStatus,
  reload,
  prompts,
  folders,
  tagStats,
  savePrompt,
  deletePrompt,
  retryPending,
  discardPending,
  exportPendingDraft,
} = useLibrary();

const { query, folderId, tags, visible, selectFolder, toggleTag } = useFilters(prompts, folders, tagStats);

const { message, tone, show } = useToast();

const editorOpen = ref(false);
const editing = ref<Prompt | null>(null);
const saving = ref(false);
const saveError = ref('');
const allowSaveAsNew = ref(false);

const tagSuggestions = computed(() => tagStats.value.map((stat) => stat.name));
const folderNames = computed<Record<string, string>>(() =>
  Object.fromEntries(folders.value.map((folder) => [folder.id, folder.name])),
);
function openCreate(): void {
  editing.value = null;
  saveError.value = '';
  allowSaveAsNew.value = false;
  editorOpen.value = true;
}

function openEdit(prompt: Prompt): void {
  editing.value = { ...prompt, tags: [...prompt.tags] };
  saveError.value = '';
  allowSaveAsNew.value = false;
  editorOpen.value = true;
}

function closeEditor(): void {
  editorOpen.value = false;
  editing.value = null;
}

async function handleSave(draft: PromptDraft, asNew = false): Promise<void> {
  if (saving.value) return;
  saving.value = true;
  const original = asNew ? null : editing.value;
  const isEdit = original !== null;
  saveError.value = '';
  try {
    const result = await savePrompt(draft, original);
    if (result !== 'saved') {
      saveError.value = result === 'missing'
        ? '这条提示词已被删除，草稿已保留，可另存为新提示词。'
        : '这条提示词已在其他页面修改，草稿已保留，可另存或返回查看。';
      allowSaveAsNew.value = true;
      return;
    }
    closeEditor();
    show(isEdit ? '已更新' : '已保存');
  } catch (error) {
    console.error('[Prompt Box] 保存提示词失败：', error);
    saveError.value = '保存失败，草稿已保留，请重试。';
    show(saveError.value, { tone: 'error' });
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
  show('已复制原文');
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

async function handleRetrySync(): Promise<void> {
  try {
    await retryPending();
    await reload();
    if (storageStatus.value.state === 'online') show('已连接共享服务');
  } catch (error) {
    console.error('[Prompt Box] 重试共享服务失败：', error);
    show('仍无法确认共享服务请求，请稍后重试', { tone: 'error' });
  }
}

async function handleDiscardPending(): Promise<void> {
  try {
    await discardPending();
    await reload();
    show('已清除本机待确认记录；未回滚服务端数据');
  } catch (error) {
    console.error('[Prompt Box] 清除待确认请求失败：', error);
    show('清除失败，请重试', { tone: 'error' });
  }
}

async function handleExportPending(): Promise<void> {
  try {
    const exported = await exportPendingDraft();
    show(exported ? '待确认草稿已下载为 JSON' : '没有待确认草稿', exported ? {} : { tone: 'error' });
  } catch (error) {
    console.error('[Prompt Box] 下载待确认草稿失败：', error);
    show('下载失败，请重试', { tone: 'error' });
  }
}

</script>

<template>
  <div class="app">
    <SyncStatusBar :status="storageStatus" @retry="handleRetrySync" @discard="handleDiscardPending" @export-pending="handleExportPending" />
    <PairingPanel v-if="storageStatus.mode === 'shared'" @paired="reload" />
    <div v-if="!ready" class="load-state" :role="loadError ? 'alert' : 'status'">
      <p class="state-title">{{ loadError ? '暂时无法读取提示词' : '正在打开提示词本…' }}</p>
      <p v-if="loadError" class="state-copy">{{ storageStatus.mode === 'shared'
        ? storageStatus.state === 'unpaired'
          ? '此设备尚未配对。请在上方生成或输入一次性配对码；配对前不会读取或写入共享数据。'
          : '无法连接同机共享服务；本次没有报告保存成功。服务恢复后可重新连接。'
        : '本机数据没有被更改。请检查后重试。' }}</p>
      <button v-if="loadError" type="button" class="state-retry" @click="reload">重新读取</button>
    </div>

    <PromptEditor
      v-else-if="editorOpen"
      :prompt="editing"
      :folders="folders"
      :tag-suggestions="tagSuggestions"
      :saving="saving"
      :save-error="saveError"
      :allow-save-as-new="allowSaveAsNew"
      @save="handleSave"
      @save-new="handleSave($event, true)"
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
        @update:query="query = $event"
        @select-folder="selectFolder"
        @toggle-tag="toggleTag"
      />
      <div class="app-body">
        <PromptList
          :prompts="visible"
          :folder-names="folderNames"
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
  width: 100%;
  max-width: 880px;
  height: 100vh;
  margin-inline: auto;
  overflow: hidden;
}

.app-body {
  flex: 1;
  display: flex;
  min-height: 0;
  flex-direction: column;
  overflow-y: auto;
}

.app-body :deep(.list) { flex: 1; min-height: 100%; }

.load-state {
  display: grid;
  align-content: center;
  justify-items: center;
  gap: var(--pb-space-9);
  flex: 1;
  padding: var(--pb-space-28) var(--pb-space-22);
  text-align: center;
  color: var(--pb-text-muted);
}

.state-title,
.state-copy {
  margin: var(--pb-space-0);
}

.state-title {
  color: var(--pb-text);
  font-size: 13px;
  font-weight: 500;
}

.state-copy {
  max-width: 240px;
  color: var(--pb-text-muted);
  font-size: 12px;
}

.state-retry {
  margin-top: var(--pb-space-5);
  border-color: var(--pb-accent);
  background: var(--pb-accent);
  color: var(--pb-on-accent);
}

.state-retry:hover:not(:disabled) {
  border-color: var(--pb-accent-hover);
  background: var(--pb-accent-hover);
}

</style>
