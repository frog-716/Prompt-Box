<script setup lang="ts">
/**
 * 设置页根组件。
 *
 * 侧边栏负责「记和取」，这里负责 Markdown 导出和分类管理。
 */

import { computed } from 'vue';

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

const folderCounts = computed<Record<string, number>>(() => {
  const counts: Record<string, number> = {};
  for (const prompt of allPrompts.value) {
    if (prompt.folderId === null) continue;
    counts[prompt.folderId] = (counts[prompt.folderId] ?? 0) + 1;
  }
  return counts;
});

const unclassifiedCount = computed(
  () => allPrompts.value.filter((prompt) => prompt.folderId === null).length,
);

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
    <div v-if="!ready" class="load-state">
      <p>{{ loadError ? '读取失败，数据未更改' : '正在读取…' }}</p>
      <button v-if="loadError" type="button" @click="reload">重试</button>
    </div>

    <template v-else>
      <header class="settings-head">
        <h1 class="settings-title">设置</h1>
        <p class="settings-sub">数据仅保存在本机</p>
      </header>

      <DataPanel
        :prompt-count="allPrompts.length"
        :folder-count="folders.length"
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
    </template>

    <ToastBar :message="message" :tone="tone" />
  </main>
</template>

<style scoped>
.settings {
  max-width: 720px;
  margin: 0 auto;
  padding: 32px 24px 56px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.settings-head {
  margin-bottom: 4px;
}

.settings-title {
  margin: 0 0 4px;
  font-size: 20px;
  font-weight: 500;
}

.settings-sub {
  margin: 0;
  font-size: 12px;
  color: var(--pb-text-muted);
}

.load-state {
  display: grid;
  justify-items: center;
  gap: 8px;
  padding: 72px 0;
  color: var(--pb-text-muted);
}

.load-state p {
  margin: 0;
}
</style>
