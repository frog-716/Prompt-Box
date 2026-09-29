/**
 * 存储适配层。
 *
 * 唯一直接读写 chrome.storage.local 的地方。对外只暴露
 * 领域模型（PromptBoxData），上层不需要知道数据存在哪儿、长什么样。
 *
 * 之所以要 sanitize：storage 里的内容可能来自旧版本、手工编辑的备份文件，
 * 或者干脆被别的东西写脏了。宁可丢弃坏数据，也不能让它把界面搞崩。
 */

import { browser } from 'wxt/browser';

import type { Folder, Prompt, PromptBoxData } from '@/domain/types';
import { SCHEMA_VERSION, STORAGE_KEY } from '@/shared/constants';
import { normalizeTags } from '@/domain/prompt';

function emptyData(): PromptBoxData {
  return { version: SCHEMA_VERSION, prompts: [], folders: [] };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function sanitizePrompt(raw: unknown): Prompt | null {
  const record = asRecord(raw);
  if (!record) return null;

  // 同时接受 id 与 uuid：后者是原版 Prompt Manager 的字段名，便于直接导入它的备份。
  const id = typeof record['id'] === 'string' ? record['id'] : record['uuid'];
  const title = record['title'];
  const content = record['content'];
  if (typeof id !== 'string' || typeof content !== 'string') return null;

  const createdAt = typeof record['createdAt'] === 'number' ? record['createdAt'] : Date.now();
  const updatedAt = typeof record['updatedAt'] === 'number' ? record['updatedAt'] : createdAt;
  const folderId = typeof record['folderId'] === 'string' ? record['folderId'] : null;
  const tags = Array.isArray(record['tags'])
    ? normalizeTags(record['tags'].filter((tag): tag is string => typeof tag === 'string'))
    : [];

  return {
    id,
    title: typeof title === 'string' && title.trim() ? title : '未命名提示词',
    content,
    folderId,
    tags,
    createdAt,
    updatedAt,
  };
}

function sanitizeFolder(raw: unknown): Folder | null {
  const record = asRecord(raw);
  if (!record) return null;
  const id = record['id'];
  const name = record['name'];
  if (typeof id !== 'string' || typeof name !== 'string' || !name.trim()) return null;
  return {
    id,
    name: name.trim(),
    createdAt: typeof record['createdAt'] === 'number' ? record['createdAt'] : Date.now(),
  };
}

/** 把任意输入规整成合法的数据快照。 */
export function sanitizeData(raw: unknown): PromptBoxData {
  const record = asRecord(raw);
  if (!record) return emptyData();

  const prompts = Array.isArray(record['prompts'])
    ? record['prompts'].map(sanitizePrompt).filter((item): item is Prompt => item !== null)
    : [];

  const folders = Array.isArray(record['folders'])
    ? record['folders'].map(sanitizeFolder).filter((item): item is Folder => item !== null)
    : [];

  // 文件夹被删掉后，残留的 folderId 会指向不存在的文件夹。这里统一收编为「未归类」。
  const known = new Set(folders.map((folder) => folder.id));
  const repaired = prompts.map((prompt) =>
    prompt.folderId !== null && !known.has(prompt.folderId)
      ? { ...prompt, folderId: null }
      : prompt,
  );

  return { version: SCHEMA_VERSION, prompts: repaired, folders };
}

/** 读取全部数据。读不到或格式损坏时返回空库，而不是抛错。 */
export async function readData(): Promise<PromptBoxData> {
  try {
    const stored = await browser.storage.local.get(STORAGE_KEY);
    return sanitizeData(stored[STORAGE_KEY]);
  } catch (error) {
    console.error('[Prompt Box] 读取本地数据失败：', error);
    return emptyData();
  }
}

/** 写入全部数据。 */
export async function writeData(data: PromptBoxData): Promise<void> {
  await browser.storage.local.set({ [STORAGE_KEY]: data });
}

/**
 * 订阅数据变化。
 *
 * 侧边栏与设置页同时打开时，任何一侧的修改都会通过这里同步到另一侧。
 * 右键菜单保存的提示词也是靠它让侧边栏自动刷新。
 */
export function onDataChanged(listener: (data: PromptBoxData) => void): () => void {
  const handler = (
    changes: Record<string, { newValue?: unknown }>,
    areaName: string,
  ): void => {
    if (areaName !== 'local') return;
    const change = changes[STORAGE_KEY];
    if (!change) return;
    listener(sanitizeData(change.newValue));
  };

  browser.storage.onChanged.addListener(handler);
  return () => browser.storage.onChanged.removeListener(handler);
}
