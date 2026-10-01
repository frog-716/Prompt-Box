/**
 * 文件夹领域逻辑。
 *
 * 文件夹刻意做成单层结构：个人提示词库的体量下，
 * 嵌套层级只会增加操作成本，不会带来实际收益。
 */

import type { Folder, Prompt } from './types';

/** 新建文件夹。名称首尾空白会被清理。 */
export function createFolder(name: string, id: string, now: number): Folder {
  return { id, name: name.trim().replace(/\s+/g, ' '), createdAt: now };
}

/** 重命名文件夹。 */
export function renameFolder(folders: readonly Folder[], id: string, name: string): Folder[] {
  const trimmed = name.trim().replace(/\s+/g, ' ');
  if (!trimmed) return [...folders];
  const normalizedName = trimmed.toLowerCase();
  if (folders.some((folder) => folder.id !== id && folder.name.toLowerCase() === normalizedName)) {
    return [...folders];
  }
  return folders.map((folder) => (folder.id === id ? { ...folder, name: trimmed } : folder));
}

/**
 * 删除文件夹，同时把原先归属它的提示词改为「未归类」。
 *
 * 提示词本身不会被删掉 —— 文件夹只是分类，不该连带销毁内容。
 */
export function deleteFolder(
  folders: readonly Folder[],
  prompts: readonly Prompt[],
  id: string,
): { folders: Folder[]; prompts: Prompt[] } {
  return {
    folders: folders.filter((folder) => folder.id !== id),
    prompts: prompts.map((prompt) =>
      prompt.folderId === id ? { ...prompt, folderId: null } : prompt,
    ),
  };
}

/** 按名称排序，保证筛选栏顺序稳定。 */
export function sortFolders(folders: readonly Folder[]): Folder[] {
  return [...folders].sort((a, b) => a.name.localeCompare(b.name));
}

/** 统计每个文件夹下的提示词数量。 */
export function countByFolder(prompts: readonly Prompt[]): Map<string | null, number> {
  const counter = new Map<string | null, number>();
  for (const prompt of prompts) {
    counter.set(prompt.folderId, (counter.get(prompt.folderId) ?? 0) + 1);
  }
  return counter;
}
