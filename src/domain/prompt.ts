/**
 * 提示词领域逻辑。
 *
 * 全部是纯函数：给定输入必定得到相同输出，不碰 storage、不碰 DOM。
 * 因此可以被单元测试直接覆盖，也便于日后替换存储实现。
 */

import type { Prompt, PromptDraft, PromptFilter, TagStat } from './types';

const TAG_PREFIX = /^#+/;
const WHITESPACE = /\s+/g;

/** 标签归一化：去 # 前缀、去首尾空白、转小写。 */
export function normalizeTag(raw: string): string {
  return raw.trim().replace(TAG_PREFIX, '').trim().toLowerCase();
}

/** 批量归一化并去重，保持首次出现的顺序。 */
export function normalizeTags(raw: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of raw) {
    const tag = normalizeTag(item);
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    result.push(tag);
  }
  return result;
}

/** 把多行内容压成单行预览，供列表展示。 */
export function summarize(content: string, maxLength = 70): string {
  const flat = content.replace(WHITESPACE, ' ').trim();
  return flat.length > maxLength ? `${flat.slice(0, maxLength)}…` : flat;
}

/** 由草稿构造新提示词。id 与时间戳由调用方注入，保证函数纯净。 */
export function createPrompt(draft: PromptDraft, id: string, now: number): Prompt {
  return {
    id,
    title: draft.title.trim(),
    content: draft.content,
    folderId: draft.folderId,
    tags: normalizeTags(draft.tags),
    createdAt: now,
    updatedAt: now,
  };
}

/** 用草稿覆盖已有提示词的可编辑字段。 */
export function applyDraft(prompt: Prompt, draft: PromptDraft, now: number): Prompt {
  return {
    ...prompt,
    title: draft.title.trim(),
    content: draft.content,
    folderId: draft.folderId,
    tags: normalizeTags(draft.tags),
    updatedAt: now,
  };
}

export type PromptSaveStatus = 'saved' | 'missing' | 'conflict';

export type PromptSaveResult =
  | { status: 'saved'; prompts: Prompt[] }
  | { status: 'missing' | 'conflict'; prompts: readonly Prompt[] };

/** 在最新快照上保存；编辑时核对打开表单时的原记录，不覆盖其他界面的修改。 */
export function upsertPrompt(
  prompts: readonly Prompt[],
  draft: PromptDraft,
  original: Prompt | null,
  now: number,
  newId: string,
): PromptSaveResult {
  if (original === null) {
    return { status: 'saved', prompts: [createPrompt(draft, newId, now), ...prompts] };
  }
  const current = prompts.find((prompt) => prompt.id === original.id);
  if (!current) return { status: 'missing', prompts };
  // 标签整理不改 updatedAt，因此同时比较可编辑字段，不能只比较时间戳。
  if (
    current.updatedAt !== original.updatedAt || current.createdAt !== original.createdAt ||
    current.title !== original.title || current.content !== original.content ||
    current.folderId !== original.folderId ||
    current.tags.length !== original.tags.length ||
    current.tags.some((tag, index) => tag !== original.tags[index])
  ) return { status: 'conflict', prompts };

  return {
    status: 'saved',
    prompts: prompts.map((prompt) =>
      prompt.id === original.id ? applyDraft(prompt, draft, now) : prompt,
    ),
  };
}

/** 统计每个标签被多少条提示词引用，按引用次数降序、同次数按字母序。 */
export function collectTagStats(prompts: readonly Prompt[]): TagStat[] {
  const counter = new Map<string, number>();
  for (const prompt of prompts) {
    for (const tag of prompt.tags) {
      counter.set(tag, (counter.get(tag) ?? 0) + 1);
    }
  }
  return [...counter.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** 按筛选条件过滤提示词。标签之间是「与」关系。 */
export function filterPrompts(
  prompts: readonly Prompt[],
  filter: PromptFilter,
): Prompt[] {
  const query = filter.query.trim().toLowerCase();
  return prompts.filter((prompt) => {
    if (filter.folderId !== 'all' && prompt.folderId !== filter.folderId) {
      return false;
    }
    if (filter.tags.length > 0 && !filter.tags.every((tag) => prompt.tags.includes(tag))) {
      return false;
    }
    if (!query) return true;
    return (
      prompt.title.toLowerCase().includes(query) ||
      prompt.content.toLowerCase().includes(query) ||
      prompt.tags.some((tag) => tag.includes(query))
    );
  });
}

/** 最近修改的排在前面。 */
export function sortPrompts(prompts: readonly Prompt[]): Prompt[] {
  return [...prompts].sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * 批量重命名标签。
 *
 * 属于整理动作而非内容修改，因此不动 updatedAt —— 否则改个错别字
 * 就会把整个列表的排序打乱。
 */
export function renameTag(prompts: readonly Prompt[], from: string, to: string): Prompt[] {
  const source = normalizeTag(from);
  const target = normalizeTag(to);
  if (!target || source === target) return [...prompts];

  return prompts.map((prompt) => {
    if (!prompt.tags.includes(source)) return prompt;
    return {
      ...prompt,
      tags: normalizeTags(prompt.tags.map((tag) => (tag === source ? target : tag))),
    };
  });
}

/** 从所有提示词里摘掉某个标签。 */
export function removeTag(prompts: readonly Prompt[], tag: string): Prompt[] {
  const target = normalizeTag(tag);
  return prompts.map((prompt) =>
    prompt.tags.includes(target)
      ? { ...prompt, tags: prompt.tags.filter((item) => item !== target) }
      : prompt,
  );
}
