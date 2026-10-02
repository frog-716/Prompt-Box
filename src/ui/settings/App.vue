<script setup lang="ts">
/**
 * 设置页根组件。
 *
 * 侧边栏负责「记和取」，这里负责 Markdown 导出和分类管理。
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
      <header class="settings-head">
        <div>
          <h1 class="settings-title">Prompt-Box 设置</h1>
          <p class="settings-sub">管理本地数据、分类与标签。所有内容仅保存在这台设备。</p>
        </div>
      </header>

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
  height: 720px;
  margin: var(--pb-space-0) auto;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--pb-bg);
}

.settings-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-shrink: 0;
  padding: var(--pb-space-24) var(--pb-space-32);
  border-bottom: 1px solid var(--pb-border);
  background: var(--pb-white-overlay-40);
}

.settings-title {
  margin: var(--pb-space-0);
  font-family: var(--pb-font-display);
  font-size: 24px;
  font-weight: 700;
  line-height: 1.25;
}

.settings-sub {
  margin: var(--pb-space-4) var(--pb-space-0) var(--pb-space-0);
  max-width: 520px;
  font-size: 13px;
  color: var(--pb-text-muted);
  line-height: 1.5;
}

.settings-body {
  display: flex;
  flex: 1;
  min-height: 0;
  flex-direction: column;
  gap: var(--pb-space-40);
  overflow-y: auto;
  padding: var(--pb-space-32);
}

.load-state {
  display: grid;
  justify-items: center;
  align-content: center;
  gap: var(--pb-space-10);
  min-height: 100%;
  padding: var(--pb-space-40) var(--pb-space-18);
  color: var(--pb-text-muted);
}

.state-title,
.state-copy {
  margin: var(--pb-space-0);
}

.state-title { color: var(--pb-text); font-size: 13px; font-weight: 500; }
.state-copy { color: var(--pb-text-muted); font-size: 12px; text-align: center; }
.state-retry { margin-top: var(--pb-space-5); border-color: var(--pb-accent); background: var(--pb-accent); color: var(--pb-on-accent); }
.state-retry:hover:not(:disabled) { border-color: var(--pb-accent-hover); background: var(--pb-accent-hover); }

@media (max-width: 480px) {
  .settings { height: min(720px, 100vh); }
  .settings-head { padding: var(--pb-space-22) var(--pb-space-20); }
  .settings-body { padding: var(--pb-space-22) var(--pb-space-20); gap: var(--pb-space-32); }
  .settings-title { font-size: 22px; }
}

@media (max-height: 719px) { .settings { height: 100vh; } }
</style>
