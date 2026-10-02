/**
 * Markdown 导出包含提示词标题、原文及独立的文件夹和标签信息。
 */

import type { PromptBoxData } from './types';

function escapeMarkdownText(value: string): string {
  return value.replace(/([\\`*_{}\[\]()#+.!|<>~-])/g, '\\$1');
}

function singleLine(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

function fenceFor(content: string): string {
  const runs = content.match(/`+/g) ?? [];
  const longest = runs.reduce((max, run) => Math.max(max, run.length), 0);
  return '`'.repeat(Math.max(3, longest + 1));
}

function folderName(prompt: PromptBoxData['prompts'][number], data: PromptBoxData): string {
  if (prompt.folderId === null) return '未归类';
  return data.folders.find((folder) => folder.id === prompt.folderId)?.name ?? '未归类';
}

/** 生成按最近修改时间倒序排列的 Markdown 提示词。 */
export function serializeMarkdown(data: PromptBoxData): string {
  const sections = [...data.prompts]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((prompt) => {
      const title = escapeMarkdownText(singleLine(prompt.title) || '未命名提示词');
      const fence = fenceFor(prompt.content);
      const body = prompt.content.endsWith('\n') ? prompt.content : `${prompt.content}\n`;
      const folder = escapeMarkdownText(singleLine(folderName(prompt, data)) || '未归类');
      const tags = prompt.tags
        .map((tag) => singleLine(tag))
        .filter(Boolean)
        .map((tag) => `#${escapeMarkdownText(tag)}`)
        .join('、') || '无';
      return `## ${title}\n\n${fence}text\n${body}${fence}\n\n- 文件夹：${folder}\n- 标签：${tags}`;
    });

  return sections.length ? `${sections.join('\n\n')}\n` : '';
}
