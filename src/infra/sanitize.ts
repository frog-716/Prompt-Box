/**
 * 持久化数据的纯清洗逻辑。
 *
 * Chrome storage 中既可能出现标准数组，也可能出现旧版本写下的数字键对象；
 * 统一在读入边界转成领域模型，避免界面把仍然存在的数据当成空列表。
 */

import type { Folder, Prompt, PromptBoxData } from '../domain/types.ts';
import { normalizeTags } from '../domain/prompt.ts';
import { SCHEMA_VERSION } from '../shared/constants.ts';

function emptyData(): PromptBoxData {
  return { version: SCHEMA_VERSION, prompts: [], folders: [] };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
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
  return typeof value === 'number' && Number.isFinite(value);
}

function sanitizePrompt(raw: unknown): Prompt | null {
  const record = asRecord(raw);
  if (!record) return null;

  // 兼容旧版已存数据里的 uuid 字段。
  const id = typeof record['id'] === 'string' ? record['id'] : record['uuid'];
  const title = record['title'];
  const content = record['content'];
  if (typeof id !== 'string' || !id.trim() || typeof content !== 'string') return null;

  const createdAt = isFiniteTimestamp(record['createdAt']) ? record['createdAt'] : Date.now();
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

function sanitizeFolder(raw: unknown): Folder | null {
  const record = asRecord(raw);
  if (!record) return null;
  const id = record['id'];
  const name = record['name'];
  if (typeof id !== 'string' || !id.trim() || typeof name !== 'string' || !name.trim()) return null;
  return {
    id,
    name: name.trim().replace(/\s+/g, ' '),
    createdAt: isFiniteTimestamp(record['createdAt']) ? record['createdAt'] : Date.now(),
  };
}

/** 把任意输入规整成合法的数据快照。 */
export function sanitizeData(raw: unknown): PromptBoxData {
  const record = asRecord(raw);
  if (!record) return emptyData();

  const prompts = asCollection(record['prompts'])
    .map(sanitizePrompt)
    .filter((item): item is Prompt => item !== null);

  const folderIds = new Set<string>();
  const folderNames = new Set<string>();
  const folders: Folder[] = [];
  for (const rawFolder of asCollection(record['folders'])) {
    const folder = sanitizeFolder(rawFolder);
    if (!folder) continue;
    const normalizedName = folder.name.toLocaleLowerCase();
    if (folderIds.has(folder.id) || folderNames.has(normalizedName)) continue;
    folderIds.add(folder.id);
    folderNames.add(normalizedName);
    folders.push(folder);
  }

  // 文件夹被删掉后，残留的 folderId 会指向不存在的文件夹。统一收编为「未归类」。
  const known = new Set(folders.map((folder) => folder.id));
  const repaired = prompts.map((prompt) =>
    prompt.folderId !== null && !known.has(prompt.folderId)
      ? { ...prompt, folderId: null }
      : prompt,
  );

  return { version: SCHEMA_VERSION, prompts: repaired, folders };
}
