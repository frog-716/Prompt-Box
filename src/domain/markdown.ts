/**
 * Markdown 导出只保留提示词标题和原文，供阅读与复用。
 * 文件夹、标签等分类信息仍由扩展管理，不写入导出文件。
 */

import type { PromptBoxData } from './types';

function escapeHeading(value: string): string {
  return value.replace(/([\\`*_{}\[\]()#+.!|>~-])/g, '\\$1');
}

function singleLine(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

function fenceFor(content: string): string {
  const runs = content.match(/`+/g) ?? [];
  const longest = runs.reduce((max, run) => Math.max(max, run.length), 0);
  return '`'.repeat(Math.max(3, longest + 1));
}

/** 生成按最近修改时间倒序排列的 Markdown 提示词。 */
export function serializeMarkdown(data: PromptBoxData): string {
  const sections = [...data.prompts]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((prompt) => {
      const title = escapeHeading(singleLine(prompt.title) || '未命名提示词');
      const fence = fenceFor(prompt.content);
      const body = prompt.content.endsWith('\n') ? prompt.content : `${prompt.content}\n`;
      return `## ${title}\n\n${fence}text\n${body}${fence}`;
    });

  return sections.length ? `${sections.join('\n\n')}\n` : '';
}
