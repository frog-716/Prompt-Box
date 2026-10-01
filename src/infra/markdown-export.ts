/**
 * Markdown 导出适配。
 *
 * 数据结构与格式规则由 domain/markdown 负责；本层只触发浏览器下载。
 */

import type { PromptBoxData } from '@/domain/types';
import { EXPORT_FILE_PREFIX } from '@/shared/constants';
import { serializeMarkdown } from '@/domain/markdown';

function dateStamp(now: Date): string {
  const pad = (value: number, size = 2) => String(value).padStart(size, '0');
  return (
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-` +
    `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}-` +
    pad(now.getMilliseconds(), 3)
  );
}

/** 触发 Markdown 文件下载。 */
export function downloadMarkdown(data: PromptBoxData): void {
  const now = new Date();
  const blob = new Blob([serializeMarkdown(data, now)], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${EXPORT_FILE_PREFIX}-${dateStamp(now)}.md`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // 让浏览器先接管下载，再回收临时地址。
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
