/**
 * 持久化数据的纯清洗逻辑。
 *
 * Chrome storage 中既可能出现标准数组，也可能出现旧版本写下的数字键对象；
 * 统一在读入边界转成领域模型，避免界面把仍然存在的数据当成空列表。
 */

import type { Folder, Prompt, PromptBoxData } from '../domain/types.ts';
import { normalizeFolderName, folderNameKey } from '../domain/folder.ts';
import { normalizeTags } from '../domain/prompt.ts';
import { SCHEMA_VERSION } from '../shared/constants.ts';

function emptyData(): PromptBoxData {
  return { version: SCHEMA_VERSION, prompts: [], folders: [] };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/** 接受数组与按数字索引序列化的对象，不接受任意对象。 */
function asCollection(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const record = asRecord(value);
  if (!record) return [];

  const keys = Object.keys(record);
  if (keys.some((key) => !/^(0|[1-9]\d*)$/.test(key) || !Number.isSafeInteger(Number(key)))) {
    return [];
  }
  return keys
    .sort((left, right) => Number(left) - Number(right))
    .map((key) => record[key]);
}

function isFiniteTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 8.64e15;
}

function sanitizePrompt(raw: unknown, fallbackTime: number): Prompt | null {
  const record = asRecord(raw);
  if (!record) return null;

  // 兼容旧版已存数据里的 uuid 字段。
  const id = typeof record['id'] === 'string' && record['id'].trim() ? record['id'] : record['uuid'];
  const title = record['title'];
  const content = record['content'];
  if (typeof id !== 'string' || !id.trim() || typeof content !== 'string') return null;

  const createdAt = isFiniteTimestamp(record['createdAt']) ? record['createdAt'] : fallbackTime;
  const updatedAt = isFiniteTimestamp(record['updatedAt']) ? record['updatedAt'] : createdAt;
  const folderId = typeof record['folderId'] === 'string' ? record['folderId'] : null;
  const tags = Array.isArray(record['tags'])
    ? normalizeTags(record['tags'].filter((tag): tag is string => typeof tag === 'string'))
    : [];

  return {
    id,
    title: typeof title === 'string' && title.trim()
      ? title.trim().replace(/[\r\n]+/g, ' ')
      : '未命名提示词',
    content,
    folderId,
    tags,
    createdAt,
    updatedAt,
  };
}

function sanitizeFolder(raw: unknown, fallbackTime: number): Folder | null {
  const record = asRecord(raw);
  if (!record) return null;
  const id = record['id'];
  const name = record['name'];
  if (typeof id !== 'string' || !id.trim() || typeof name !== 'string' || !name.trim()) return null;
  return {
    id,
    name: normalizeFolderName(name),
    createdAt: isFiniteTimestamp(record['createdAt']) ? record['createdAt'] : fallbackTime,
  };
}

/** 把任意输入规整成合法的数据快照。 */
export function sanitizeData(raw: unknown, fallbackTime = 0): PromptBoxData {
  const record = asRecord(raw);
  if (!record) return emptyData();
  const version = record['version'];
  if (typeof version === 'number' && version > SCHEMA_VERSION) {
    throw new Error('数据由较新版本保存，请更新扩展后再打开。');
  }
  if (version !== undefined && (typeof version !== 'number' || !Number.isInteger(version) || version < 0)) {
    throw new Error('数据版本无效，已停止写入以保留原数据。');
  }
  const defaultTime = isFiniteTimestamp(fallbackTime) ? fallbackTime : 0;

  const prompts = asCollection(record['prompts'])
    .map((item) => sanitizePrompt(item, defaultTime))
    .filter((item): item is Prompt => item !== null);

  // 重复主键分配稳定的新 ID，保留每一条内容，并避开已有的正常 ID。
  const reserved = new Set(prompts.map((prompt) => prompt.id));
  const promptIds = new Set<string>();
  const uniquePrompts = prompts.map((prompt) => {
    let id = prompt.id;
    if (promptIds.has(id)) {
      let suffix = 2;
      while (reserved.has(`${id}~${suffix}`) || promptIds.has(`${id}~${suffix}`)) suffix += 1;
      id = `${id}~${suffix}`;
    }
    promptIds.add(id);
    return id === prompt.id ? prompt : { ...prompt, id };
  });

  const folderIds = new Set<string>();
  const foldersByName = new Map<string, Folder>();
  const folderAliases = new Map<string, string>();
  const folders: Folder[] = [];
  for (const rawFolder of asCollection(record['folders'])) {
    const folder = sanitizeFolder(rawFolder, defaultTime);
    if (!folder || folderIds.has(folder.id)) continue;
    folderIds.add(folder.id);
    const key = folderNameKey(folder.name);
    const existing = foldersByName.get(key);
    if (existing) {
      folderAliases.set(folder.id, existing.id);
      continue;
    }
    foldersByName.set(key, folder);
    folders.push(folder);
  }

  // 合并同名文件夹时保留归属；真正不存在的归属改为「未归类」。
  const known = new Set(folders.map((folder) => folder.id));
  const repaired = uniquePrompts.map((prompt) => {
    const folderId = prompt.folderId === null ? null : folderAliases.get(prompt.folderId) ?? prompt.folderId;
    const repairedId = folderId !== null && !known.has(folderId) ? null : folderId;
    return repairedId === prompt.folderId ? prompt : { ...prompt, folderId: repairedId };
  });

  return { version: SCHEMA_VERSION, prompts: repaired, folders };
}
