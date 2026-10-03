/** JSON 备份合并规则。仅纯数据运算；时间、文件和存储由上层提供。 */

import type { Folder, Prompt, PromptBoxData } from './types.ts';
import { folderNameKey, normalizeFolderName } from './folder.ts';

export interface PromptBoxBackup {
  format: 'prompt-box-backup';
  formatVersion: 1;
  schemaVersion: number;
  exportedAt: string;
  data: PromptBoxData;
}

export type BackupConflictPolicy = 'keep-current' | 'use-backup';

export interface BackupMergeChoice {
  promptConflicts: BackupConflictPolicy;
  folderConflicts: BackupConflictPolicy;
}

export interface BackupPreview {
  incomingPrompts: number;
  newPrompts: number;
  identicalPromptIds: number;
  conflictingPrompts: number;
  incomingFolders: number;
  newFolders: number;
  identicalFolderIds: number;
  conflictingFolderIds: number;
  sameNameFolderIds: number;
}

function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/** 仅当用户预览时的快照仍是当前快照时，才产生恢复写入值。 */
export function restoreBackupIfUnchanged(
  current: PromptBoxData,
  expectedCurrent: PromptBoxData,
  replacement: PromptBoxData,
): PromptBoxData {
  if (!same(current, expectedCurrent)) {
    throw new Error('预览后数据已变化，请重新选择备份并预览。');
  }
  return replacement;
}

function remapPromptFolder(prompt: Prompt, folderIdMap: Map<string, string>): Prompt {
  if (prompt.folderId === null) return prompt;
  const folderId = folderIdMap.get(prompt.folderId) ?? prompt.folderId;
  return folderId === prompt.folderId ? prompt : { ...prompt, folderId };
}

export function createBackup(data: PromptBoxData, exportedAt: string): PromptBoxBackup {
  return {
    format: 'prompt-box-backup',
    formatVersion: 1,
    schemaVersion: data.version,
    exportedAt,
    data,
  };
}

export function previewBackup(current: PromptBoxData, incoming: PromptBoxData): BackupPreview {
  const currentPrompts = new Map(current.prompts.map((item) => [item.id, item]));
  const currentFolders = new Map(current.folders.map((item) => [item.id, item]));
  const currentFolderNames = new Set(current.folders.map((item) => folderNameKey(item.name)));
  let newPrompts = 0;
  let identicalPromptIds = 0;
  let conflictingPrompts = 0;
  for (const item of incoming.prompts) {
    const existing = currentPrompts.get(item.id);
    if (!existing) newPrompts += 1;
    else if (same(existing, item)) identicalPromptIds += 1;
    else conflictingPrompts += 1;
  }
  let newFolders = 0;
  let identicalFolderIds = 0;
  let conflictingFolderIds = 0;
  let sameNameFolderIds = 0;
  for (const item of incoming.folders) {
    const existing = currentFolders.get(item.id);
    if (!existing) {
      if (currentFolderNames.has(folderNameKey(item.name))) sameNameFolderIds += 1;
      else newFolders += 1;
    } else if (same(existing, item)) identicalFolderIds += 1;
    else conflictingFolderIds += 1;
  }
  return {
    incomingPrompts: incoming.prompts.length,
    newPrompts,
    identicalPromptIds,
    conflictingPrompts,
    incomingFolders: incoming.folders.length,
    newFolders,
    identicalFolderIds,
    conflictingFolderIds,
    sameNameFolderIds,
  };
}

/** 合并只在调用方展示预览、选择冲突策略并确认后执行。 */
export function mergeBackup(
  current: PromptBoxData,
  incoming: PromptBoxData,
  choice: BackupMergeChoice,
): PromptBoxData {
  const folders: Folder[] = current.folders.map((item) => ({ ...item }));
  const folderById = new Map(folders.map((item) => [item.id, item]));
  const folderByName = new Map(folders.map((item) => [folderNameKey(item.name), item]));
  const folderIdMap = new Map<string, string>();

  for (const imported of incoming.folders) {
    const sameId = folderById.get(imported.id);
    if (sameId) {
      folderIdMap.set(imported.id, sameId.id);
      if (choice.folderConflicts === 'use-backup') {
        const conflictingName = folderByName.get(folderNameKey(imported.name));
        if (!conflictingName || conflictingName.id === sameId.id) {
          folderByName.delete(folderNameKey(sameId.name));
          sameId.name = normalizeFolderName(imported.name);
          folderByName.set(folderNameKey(sameId.name), sameId);
        }
      }
      continue;
    }

    const sameName = folderByName.get(folderNameKey(imported.name));
    if (sameName) {
      folderIdMap.set(imported.id, sameName.id);
      if (choice.folderConflicts === 'use-backup') sameName.name = normalizeFolderName(imported.name);
      continue;
    }

    const added = { ...imported, name: normalizeFolderName(imported.name) };
    folders.push(added);
    folderById.set(added.id, added);
    folderByName.set(folderNameKey(added.name), added);
    folderIdMap.set(imported.id, added.id);
  }

  const prompts = current.prompts.map((item) => ({ ...item, tags: [...item.tags] }));
  const promptById = new Map(prompts.map((item) => [item.id, item]));
  for (const importedValue of incoming.prompts) {
    const imported = remapPromptFolder(importedValue, folderIdMap);
    const existing = promptById.get(imported.id);
    if (!existing) {
      const added = { ...imported, tags: [...imported.tags] };
      prompts.push(added);
      promptById.set(added.id, added);
    } else if (choice.promptConflicts === 'use-backup' && !same(existing, imported)) {
      const replacement = { ...imported, tags: [...imported.tags] };
      const index = prompts.findIndex((item) => item.id === existing.id);
      prompts[index] = replacement;
      promptById.set(replacement.id, replacement);
    }
  }

  return { version: current.version, prompts, folders };
}
