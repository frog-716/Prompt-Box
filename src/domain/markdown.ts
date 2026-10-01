/**
 * Markdown 导出格式。
 *
 * 每份文件都包含格式标识、文件夹清单（包括空文件夹）和按修改时间倒序排列的提示词。
 * 正文放在足够长的 text 围栏中；正文末尾换行数单独记录，便于准确还原原文。
 */

import type { Folder, Prompt, PromptBoxData } from './types';

export const MARKDOWN_EXPORT_FORMAT = 'prompt-box-markdown-v1';

function escapeInline(value: string): string {
  return value.replace(/([\\`*_{}\[\]()#+.!|>~-])/g, '\\$1');
}

function singleLine(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

function isoDate(timestamp: number): string {
  return new Date(timestamp).toISOString();
}

function folderName(prompt: Prompt, folders: readonly Folder[]): string {
  if (prompt.folderId === null) return '未归类';
  return folders.find((folder) => folder.id === prompt.folderId)?.name ?? '未归类';
}

function fenceFor(content: string): string {
  const runs = content.match(/`+/g) ?? [];
  const longest = runs.reduce((max, run) => Math.max(max, run.length), 0);
  return '`'.repeat(Math.max(3, longest + 1));
}

function endingNewlineCount(content: string): number {
  return content.match(/\n+$/)?.[0].length ?? 0;
}

/** 生成规范化、可读的 Markdown 导出文本。 */
export function serializeMarkdown(data: PromptBoxData, exportedAt = new Date()): string {
  const counts = new Map<string | null, number>();
  for (const prompt of data.prompts) {
    counts.set(prompt.folderId, (counts.get(prompt.folderId) ?? 0) + 1);
  }

  const folders = [...data.folders].sort((a, b) => a.name.localeCompare(b.name));
  const folderLines = [
    `- 未归类：${counts.get(null) ?? 0} 条`,
    ...folders.map((folder) => `- ${escapeInline(folder.name)}：${counts.get(folder.id) ?? 0} 条`),
  ];

  const promptSections = [...data.prompts]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((prompt) => {
      const title = escapeInline(singleLine(prompt.title) || '未命名提示词');
      const folder = escapeInline(folderName(prompt, data.folders));
      const tags = prompt.tags.length
        ? prompt.tags.map((tag) => `#${escapeInline(tag)}`).join('、')
        : '无';
      const fence = fenceFor(prompt.content);
      const body = prompt.content.endsWith('\n') ? prompt.content : `${prompt.content}\n`;
      return [
        `### ${title}`,
        '',
        `- 文件夹：${folder}`,
        `- 标签：${tags}`,
        `- 修改时间：${isoDate(prompt.updatedAt)}`,
        `- 正文末尾换行数：${endingNewlineCount(prompt.content)}`,
        '',
        `${fence}text`,
        body,
        fence,
      ].join('\n');
    });

  return [
    '# Prompt Box 导出',
    '',
    `<!-- ${MARKDOWN_EXPORT_FORMAT} -->`,
    `- 导出时间：${exportedAt.toISOString()}`,
    `- 提示词：${data.prompts.length} 条`,
    `- 文件夹：${data.folders.length} 个（含空文件夹）`,
    '',
    '## 文件夹',
    '',
    ...folderLines,
    '',
    '## 提示词',
    '',
    ...(promptSections.length ? promptSections : ['（暂无提示词）']),
    '',
  ].join('\n');
}
