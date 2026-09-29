<script setup lang="ts">
/**
 * 设置页根组件。
 *
 * 侧边栏负责「记和取」，这里负责「整理和兜底」：
 * 备份、文件夹、标签。三个块各自独立，互不依赖。
 */

import { computed } from 'vue';

import { downloadBackup, readBackupFile } from '@/infra/backup';
import { SCHEMA_VERSION } from '@/shared/constants';
import BackupPanel from '@/ui/components/settings/BackupPanel.vue';
import FolderPanel from '@/ui/components/settings/FolderPanel.vue';
import TagPanel from '@/ui/components/settings/TagPanel.vue';
import ToastBar from '@/ui/components/ToastBar.vue';
import { useLibrary } from '@/ui/composables/useLibrary';
import { useToast } from '@/ui/composables/useToast';

const {
  allPrompts,
  folders,
  tagStats,
  addFolder,
  renameFolder,
  removeFolder,
  renameTagEverywhere,
  removeTagEverywhere,
  replaceAll,
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
  downloadBackup({
    version: SCHEMA_VERSION,
    prompts: allPrompts.value,
    folders: folders.value,
  });
  show('已导出备份文件');
}

async function handleImport(file: File): Promise<void> {
  try {
    const data = await readBackupFile(file);
    await replaceAll(data);
    show(`已导入 ${data.prompts.length} 条提示词`);
  } catch (error) {
    show(error instanceof Error ? error.message : '导入失败', { tone: 'error' });
  }
}

async function handleClear(): Promise<void> {
  await clearAll();
  show('已清空全部数据');
}

async function handleAddFolder(name: string): Promise<void> {
  const folder = await addFolder(name);
  show(folder ? `已添加「${folder.name}」` : '名称重复或为空', folder ? {} : { tone: 'error' });
}
</script>

<template>
  <main class="settings">
    <header class="settings-head">
      <h1 class="settings-title">设置</h1>
      <p class="settings-sub">提示词本 · 所有数据只保存在这台电脑上</p>
    </header>

    <BackupPanel
      :prompt-count="allPrompts.length"
      :folder-count="folders.length"
      @export="handleExport"
      @import="handleImport"
      @clear="handleClear"
    />

    <FolderPanel
      :folders="folders"
      :counts="folderCounts"
      :unclassified-count="unclassifiedCount"
      @add="handleAddFolder"
      @rename="renameFolder"
      @remove="removeFolder"
    />

    <TagPanel
      :tag-stats="tagStats"
      @rename="renameTagEverywhere"
      @remove="removeTagEverywhere"
    />

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
</style>
