/**
 * 备份导入导出。
 *
 * 数据全部躺在浏览器本地，浏览器一卸载就没了 —— 所以导出必须是第一等功能，
 * 而不是藏在角落里的附加项。导出格式就是存储快照本身，可读、可手工编辑。
 */

import type { PromptBoxData } from '@/domain/types';
import { EXPORT_FILE_PREFIX } from '@/shared/constants';
import { sanitizeData } from './storage';

function dateStamp(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}`
  );
}

/** 序列化为可读的 JSON 文本。 */
export function serialize(data: PromptBoxData): string {
  return JSON.stringify(data, null, 2);
}

/** 触发浏览器下载。 */
export function downloadBackup(data: PromptBoxData): void {
  const blob = new Blob([serialize(data)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${EXPORT_FILE_PREFIX}-${dateStamp()}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/**
 * 解析备份文件。
 *
 * 走和存储层同一套 sanitize，因此也能直接吃原版 Prompt Manager 导出的 JSON。
 * 解析不出任何内容时抛错，让界面能给出明确反馈，而不是静默导入一个空库。
 */
export async function readBackupFile(file: File): Promise<PromptBoxData> {
  const text = await file.text();

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('这个文件不是有效的 JSON');
  }

  const data = sanitizeData(parsed);
  if (data.prompts.length === 0 && data.folders.length === 0) {
    throw new Error('文件里没有找到任何提示词');
  }
  return data;
}
