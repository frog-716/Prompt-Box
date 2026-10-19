<script setup lang="ts">
/**
 * 设置视图。
 *
 * 设置不再是独立页面，而是侧边栏/标签页内的一个视图，与列表、编辑互斥切换：
 * 顶部「返回」回到列表。承载 Markdown 导出、清空、文件夹与标签管理这些
 * 低频「整理类」操作。与旧 options 页共用同一套 composable 与 domain 逻辑。
 */

import { downloadMarkdown } from '@/infra/markdown-export';
import { SCHEMA_VERSION } from '@/shared/constants';
import DataPanel from '@/ui/components/settings/DataPanel.vue';
import FolderPanel from '@/ui/components/settings/FolderPanel.vue';
import TagPanel from '@/ui/components/settings/TagPanel.vue';
import ToastBar from '@/ui/components/ToastBar.vue';
import { useLibrary } from '@/ui/composables/useLibrary';
import { useToast } from '@/ui/composables/useToast';

const {
  ready,
  loadError,
  reload,
  allPrompts,
  folderCounts,
  unclassifiedCount,
  folders,
  tagStats,
  addFolder,
  renameFolder,
  removeFolder,
  renameTagEverywhere,
  removeTagEverywhere,
  clearAll,
} = useLibrary();

const { message, tone, show } = useToast();

const emit = defineEmits<{
  close: [];
}>();

function handleExport(): void {
  try {
    downloadMarkdown({
      version: SCHEMA_VERSION,
      prompts: allPrompts.value,
      folders: folders.value,
    });
    show('已导出 Markdown');
  } catch (error) {
    console.error('[Prompt Box] 导出失败：', error);
    show('导出失败，请重试', { tone: 'error' });
  }
}

async function handleClear(): Promise<void> {
  try {
    await clearAll();
    show('已清空');
  } catch (error) {
    console.error('[Prompt Box] 清空数据失败：', error);
    show('清空失败，数据未更改', { tone: 'error' });
  }
}

async function handleAddFolder(name: string): Promise<void> {
  try {
    const folder = await addFolder(name);
    show(folder ? `已添加「${folder.name}」` : '名称重复或为空', folder ? {} : { tone: 'error' });
  } catch (error) {
    console.error('[Prompt Box] 添加文件夹失败：', error);
    show('添加失败，数据未更改', { tone: 'error' });
  }
}

async function handleRenameFolder(id: string, name: string): Promise<void> {
  try {
    const result = await renameFolder(id, name);
    if (result === 'duplicate') show('文件夹名称已存在', { tone: 'error' });
    else if (result === 'renamed') show('已重命名');
  } catch (error) {
    console.error('[Prompt Box] 重命名文件夹失败：', error);
    show('重命名失败，数据未更改', { tone: 'error' });
  }
}

async function handleRemoveFolder(id: string): Promise<void> {
  try {
    await removeFolder(id);
    show('文件夹已删除，提示词保留');
  } catch (error) {
    console.error('[Prompt Box] 删除文件夹失败：', error);
    show('删除失败，数据未更改', { tone: 'error' });
  }
}

async function handleRenameTag(from: string, to: string): Promise<void> {
  try {
    await renameTagEverywhere(from, to);
    show('标签已更新');
  } catch (error) {
    console.error('[Prompt Box] 重命名标签失败：', error);
    show('重命名失败，数据未更改', { tone: 'error' });
  }
}

async function handleRemoveTag(tag: string): Promise<void> {
  try {
    await removeTagEverywhere(tag);
    show('标签已删除');
  } catch (error) {
    console.error('[Prompt Box] 删除标签失败：', error);
    show('删除失败，数据未更改', { tone: 'error' });
  }
}
</script>

<template>
  <main class="settings">
    <div v-if="!ready" class="load-state" :role="loadError ? 'alert' : 'status'">
      <p class="state-title">{{ loadError ? '暂时无法读取提示词' : '正在打开提示词本…' }}</p>
      <p v-if="loadError" class="state-copy">本机数据没有被更改。请检查后重试。</p>
      <button v-if="loadError" type="button" class="state-retry" @click="reload">重新读取</button>
    </div>

    <template v-else>
      <div class="settings-bar">
        <button type="button" class="settings-back" aria-label="返回列表" @click="emit('close')">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
        </button>
      </div>

      <div class="settings-body">
        <DataPanel
          :prompt-count="allPrompts.length"
          @export="handleExport"
          @clear="handleClear"
        />

        <FolderPanel
          :folders="folders"
          :counts="folderCounts"
          :unclassified-count="unclassifiedCount"
          @add="handleAddFolder"
          @rename="handleRenameFolder"
          @remove="handleRemoveFolder"
        />

        <TagPanel
          :tag-stats="tagStats"
          @rename="handleRenameTag"
          @remove="handleRemoveTag"
        />
      </div>
    </template>

    <ToastBar :message="message" :tone="tone" />
  </main>
</template>

<style scoped>
.settings {
  width: 100%;
  max-width: 720px;
  height: 100%;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--pb-bg);
}

/* 顶部返回栏（与编辑器返回栏同一模式）：只有一个返回箭头，不用文字 */
.settings-bar {
  display: flex;
  align-items: center;
  gap: var(--pb-space-8);
  min-height: 49px;
  padding: var(--pb-space-12) var(--pb-space-16);
  border-bottom: 1px solid var(--pb-border);
  background: var(--pb-white);
  flex-shrink: 0;
}

.settings-back {
  display: grid;
  width: 24px;
  height: 24px;
  min-height: 24px;
  place-items: center;
  margin-left: calc(-1 * var(--pb-space-4));
  padding: var(--pb-space-4);
  border: 0;
  background: transparent;
  color: var(--pb-text-muted);
}

.settings-back svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.settings-back:hover:not(:disabled) { background: transparent; color: var(--pb-text); }

.settings-body {
  display: flex;
  flex: 1;
  min-height: 0;
  flex-direction: column;
  gap: var(--pb-space-32);
  overflow-y: auto;
  padding: var(--pb-space-32);
}

.load-state {
  display: grid;
  justify-items: center;
  align-content: center;
  gap: var(--pb-space-12);
  flex: 1;
  padding: var(--pb-space-32) var(--pb-space-16);
  color: var(--pb-text-muted);
}

.state-title,
.state-copy {
  margin: 0;
}

.state-title { color: var(--pb-text); font-size: var(--pb-text-md); font-weight: 500; }
.state-copy { color: var(--pb-text-muted); font-size: var(--pb-text-sm); text-align: center; }
.state-retry { margin-top: var(--pb-space-4); border-color: var(--pb-accent); background: var(--pb-accent); color: var(--pb-on-accent); }
.state-retry:hover:not(:disabled) { border-color: var(--pb-accent-hover); background: var(--pb-accent-hover); }

@media (max-width: 480px) {
  .settings-bar { padding-inline: var(--pb-space-24); }
  .settings-body { padding: var(--pb-space-24) var(--pb-space-24); gap: var(--pb-space-32); }
}
</style>
