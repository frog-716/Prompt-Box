/**
 * 提示词库状态中心。
 *
 * 所有修改都以存储中的最新快照为起点，并由 infra/storage 串行提交，
 * 避免侧边栏、设置页和右键菜单互相覆盖数据。
 */

import { computed, onMounted, onUnmounted, ref } from 'vue';

import {
  createFolder, deleteFolder as deleteFolderDomain, renameFolder as renameFolderDomain,
  sortFolders, countByFolder, validateFolderName, checkFolderRename,
  type FolderRenameResult,
} from '@/domain/folder';
import { collectTagStats, removeTag, renameTag, sortPrompts, upsertPrompt, type PromptSaveStatus } from '@/domain/prompt';
import type { Folder, Prompt, PromptBoxData, PromptDraft } from '@/domain/types';
import { onDataChanged, readData, updateData } from '@/infra/storage';
import { SCHEMA_VERSION } from '@/shared/constants';
import { createId, timestamp } from '@/shared/utils';

function emptyData(): PromptBoxData {
  return { version: SCHEMA_VERSION, prompts: [], folders: [] };
}

export function useLibrary() {
  const data = ref<PromptBoxData>(emptyData());
  const ready = ref(false);
  const loadError = ref(false);
  let unsubscribe: (() => void) | null = null;
  let syncRevision = 0;

  const prompts = computed(() => sortPrompts(data.value.prompts));
  const allPrompts = computed(() => data.value.prompts);
  const folders = computed(() => sortFolders(data.value.folders));
  const tagStats = computed(() => collectTagStats(data.value.prompts));
  const counts = computed(() => countByFolder(data.value.prompts));
  const folderCounts = computed(() => Object.fromEntries(
    [...counts.value].filter((entry): entry is [string, number] => entry[0] !== null),
  ));
  const unclassifiedCount = computed(() => counts.value.get(null) ?? 0);

  /** 只有成功写入后才更新界面状态；失败时保留原快照并交给调用方反馈。 */
  async function commit(change: (current: PromptBoxData) => PromptBoxData): Promise<PromptBoxData> {
    const revisionAtStart = syncRevision;
    const saved = await updateData(change);
    if (revisionAtStart === syncRevision) {
      syncRevision += 1;
      data.value = saved;
    }
    ready.value = true;
    loadError.value = false;
    return saved;
  }

  async function load(): Promise<boolean> {
    const revisionAtStart = syncRevision;
    try {
      const loaded = await readData();
      if (revisionAtStart === syncRevision) {
        data.value = loaded;
        ready.value = true;
        loadError.value = false;
      }
      return true;
    } catch (error) {
      console.error('[Prompt Box] 读取本地数据失败：', error);
      if (revisionAtStart === syncRevision) loadError.value = true;
      return false;
    }
  }

  async function savePrompt(draft: PromptDraft, original: Prompt | null): Promise<PromptSaveStatus> {
    const now = timestamp();
    const newId = createId();
    let status: PromptSaveStatus = 'saved';
    await commit((current) => {
      const result = upsertPrompt(current.prompts, draft, original, now, newId);
      status = result.status;
      return result.status === 'saved' ? { ...current, prompts: result.prompts } : current;
    });
    return status;
  }

  async function deletePrompt(id: string): Promise<void> {
    await commit((current) => {
      if (!current.prompts.some((prompt) => prompt.id === id)) return current;
      return { ...current, prompts: current.prompts.filter((prompt) => prompt.id !== id) };
    });
  }

  async function addFolder(name: string): Promise<Folder | null> {
    let created: Folder | null = null;
    await commit((current) => {
      if (validateFolderName(current.folders, name) !== 'valid') return current;

      created = createFolder(name, createId(), timestamp());
      return { ...current, folders: [...current.folders, created] };
    });
    return created;
  }

  async function renameFolder(id: string, name: string): Promise<FolderRenameResult> {
    let result: FolderRenameResult = 'missing';
    await commit((current) => {
      result = checkFolderRename(current.folders, id, name);
      return result === 'renamed'
        ? { ...current, folders: renameFolderDomain(current.folders, id, name) }
        : current;
    });
    return result;
  }

  async function removeFolder(id: string): Promise<void> {
    await commit((current) => {
      if (!current.folders.some((folder) => folder.id === id)) return current;
      const result = deleteFolderDomain(current.folders, current.prompts, id);
      return { ...current, folders: result.folders, prompts: result.prompts };
    });
  }

  async function renameTagEverywhere(from: string, to: string): Promise<void> {
    await commit((current) => ({ ...current, prompts: renameTag(current.prompts, from, to) }));
  }

  async function removeTagEverywhere(tag: string): Promise<void> {
    await commit((current) => ({ ...current, prompts: removeTag(current.prompts, tag) }));
  }

  async function clearAll(): Promise<void> {
    await commit(() => emptyData());
  }

  onMounted(() => {
    // 先订阅再读取，避免初始化期间漏掉另一个界面的写入。
    unsubscribe = onDataChanged((incoming) => {
      syncRevision += 1;
      data.value = incoming;
      ready.value = true;
      loadError.value = false;
    });
    void load();
  });

  onUnmounted(() => {
    unsubscribe?.();
  });

  return {
    ready,
    loadError,
    prompts,
    allPrompts,
    folders,
    tagStats,
    folderCounts,
    unclassifiedCount,
    savePrompt,
    deletePrompt,
    addFolder,
    renameFolder,
    removeFolder,
    renameTagEverywhere,
    removeTagEverywhere,
    clearAll,
    reload: load,
  };
}
