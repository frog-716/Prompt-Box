/** 可恢复 JSON 备份文件的序列化、解析和本地下载。 */

import type { PromptBoxData } from '../domain/types.ts';
import { createBackup, type PromptBoxBackup } from '../domain/backup.ts';
import { sanitizeData } from './sanitize.ts';
import { EXPORT_FILE_PREFIX, SCHEMA_VERSION } from '../shared/constants.ts';

export const MAX_BACKUP_FILE_BYTES = 2 * 1024 * 1024;

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => [key, stableValue(item)]));
}

export function serializeJsonBackup(data: PromptBoxData, exportedAt = new Date().toISOString()): string {
  return `${JSON.stringify(createBackup(sanitizeData(data), exportedAt), null, 2)}\n`;
}

export function parseJsonBackup(text: string): PromptBoxBackup {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('JSON 文件无法解析。');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('备份文件结构无效。');
  const record = value as Record<string, unknown>;
  if (record['format'] !== 'prompt-box-backup' || record['formatVersion'] !== 1) {
    throw new Error('备份格式版本不受支持。');
  }
  if (record['schemaVersion'] !== SCHEMA_VERSION || typeof record['exportedAt'] !== 'string' || !Number.isFinite(Date.parse(record['exportedAt']))) {
    throw new Error('备份的数据版本或导出时间无效。');
  }
  let data: PromptBoxData;
  try {
    data = sanitizeData(record['data']);
  } catch {
    throw new Error('备份数据版本较新或无效，未读取文件内容。');
  }
  if (data.version !== record['schemaVersion'] ||
      JSON.stringify(stableValue(data)) !== JSON.stringify(stableValue(record['data']))) {
    throw new Error('备份数据不符合当前格式，未自动修正或导入。');
  }
  return {
    format: 'prompt-box-backup',
    formatVersion: 1,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: record['exportedAt'],
    data,
  };
}

export async function readJsonBackupFile(file: File): Promise<PromptBoxBackup> {
  if (file.size > MAX_BACKUP_FILE_BYTES) throw new Error('备份文件超过 2 MiB 限制。');
  return parseJsonBackup(await file.text());
}

export function downloadJsonBackup(data: PromptBoxData): void {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const blob = new Blob([serializeJsonBackup(data)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${EXPORT_FILE_PREFIX}-${stamp}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
