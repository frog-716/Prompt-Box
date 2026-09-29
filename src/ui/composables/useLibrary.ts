/**
 * 提示词库状态中心。
 *
 * 界面与存储之间唯一的连接点：组件不直接碰 chrome API，
 * 只调用这里的方法、读这里的状态。所有写入都会落盘并广播，
 * 因此侧边栏与设置页同时打开时天然保持一致。
 */

import { computed, onMounted, onUnmounted, ref } from 'vue';

import { createFolder, deleteFolder as deleteFolderDomain, renameFolder as renameFolderDomain, sortFolders } from '@/domain/folder';
import { collectTagStats, removeTag, renameTag, sortPrompts, upsertPrompt } from '@/domain/prompt';
import type { Folder, PromptBoxData, PromptDraft } from '@/domain/types';
import { onDataChanged, readData, writeData } from '@/infra/storage';
import { SCHEMA_VERSION } from '@/shared/constants';
import { createId, timestamp } from '@/shared/utils';

function emptyData(): PromptBoxData {
  return { version: SCHEMA_VERSION, prompts: [], folders: [] };
}

export function useLibrary() {
  const data = ref<PromptBoxData>(emptyData());
  const ready = ref(false);
  let unsubscribe: (() => void) | null = null;

  const prompts = computed(() => sortPrompts(data.value.prompts));
  const allPrompts = computed(() => data.value.prompts);
  const folders = computed(() => sortFolders(data.value.folders));
  const tagStats = computed(() => collectTagStats(data.value.prompts));
  const unclassifiedCount = computed(
    () => data.value.prompts.filter((prompt) => prompt.folderId === null).length,
  );

  /** 先改内存再落盘：界面立即响应，存储失败也不会阻塞操作。 */
  async function commit(next: PromptBoxData): Promise<void> {
    data.value = next;
    try {
      await writeData(next);
    } catch (error) {
      console.error('[Prompt Box] 保存失败：', error);
    }
  }

  async function load(): Promise<void> {
    data.value = await readData();
    ready.value = true;
  }

  /** 新建或更新一条提示词。id 为 null 表示新建。 */
  async function savePrompt(draft: PromptDraft, id: string | null): Promise<void> {
    const next = upsertPrompt(data.value.prompts, draft, id, timestamp(), createId());
    await commit({ ...data.value, prompts: next });
  }

  async function deletePrompt(id: string): Promise<void> {
    await commit({
      ...data.value,
      prompts: data.value.prompts.filter((prompt) => prompt.id !== id),
    });
  }

  /** 新增文件夹。名称为空或重名时返回 null，由界面给出提示。 */
  async function addFolder(name: string): Promise<Folder | null> {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const duplicated = data.value.folders.some(
      (folder) => folder.name.toLowerCase() === trimmed.toLowerCase(),
    );
    if (duplicated) return null;

    const folder = createFolder(trimmed, createId(), timestamp());
    await commit({ ...data.value, folders: [...data.value.folders, folder] });
    return folder;
  }

  async function renameFolder(id: string, name: string): Promise<void> {
    await commit({
      ...data.value,
      folders: renameFolderDomain(data.value.folders, id, name),
    });
  }

  /** 删除文件夹，其中的提示词退回「未归类」，内容不丢。 */
  async function removeFolder(id: string): Promise<void> {
    const result = deleteFolderDomain(data.value.folders, data.value.prompts, id);
    await commit({ ...data.value, folders: result.folders, prompts: result.prompts });
  }

  /** 把所有提示词里的某个标签改名。 */
  async function renameTagEverywhere(from: string, to: string): Promise<void> {
    await commit({ ...data.value, prompts: renameTag(data.value.prompts, from, to) });
  }

  /** 从所有提示词里摘掉某个标签。 */
  async function removeTagEverywhere(tag: string): Promise<void> {
    await commit({ ...data.value, prompts: removeTag(data.value.prompts, tag) });
  }

  /** 用导入的数据整体替换当前库。 */
  async function replaceAll(next: PromptBoxData): Promise<void> {
    await commit(next);
  }

  async function clearAll(): Promise<void> {
    await commit(emptyData());
  }

  onMounted(async () => {
    await load();
    unsubscribe = onDataChanged((incoming) => {
      data.value = incoming;
    });
  });

  onUnmounted(() => {
    unsubscribe?.();
  });

  return {
    ready,
    prompts,
    allPrompts,
    folders,
    tagStats,
    unclassifiedCount,
    savePrompt,
    deletePrompt,
    addFolder,
    renameFolder,
    removeFolder,
    renameTagEverywhere,
    removeTagEverywhere,
    replaceAll,
    clearAll,
    reload: load,
  };
}
