#!/usr/bin/env node
/**
 * 一次性数据迁移：把同机共享服务的数据文件导入正式版（chrome-local）。
 *
 * 背景：共享试验版的数据保存在本机服务的 library.json 里，正式版保存在
 * Chrome 自己的本地存储（chrome.storage.local，键名 promptBox）。重构移除
 * 共享代码后，这份数据需要搬进正式版。
 *
 * 本脚本只负责「提取 + 清洗 + 输出」标准 promptBox JSON；把 JSON 写入 Chrome
 * 本地存储由配套的导入步骤完成（加载扩展后在扩展页面执行
 * chrome.storage.local.set({ promptBox })）。
 *
 * 用法：node scripts/migrate-shared-to-local.mjs [源 library.json 路径]
 * 默认源：~/Library/Application Support/Prompt-Box/Data/library.json
 * 输出：/tmp/promptbox-migration/promptBox.json
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const SCHEMA_VERSION = 1;
const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, '..');

function fail(message) {
  console.error(`[migrate] ${message}`);
  process.exit(1);
}

const sourceArg = process.argv[2];
const defaultSource = resolve(homedir(), 'Library', 'Application Support', 'Prompt-Box', 'Data', 'library.json');
const source = sourceArg ? resolve(sourceArg) : defaultSource;

if (!existsSync(source)) fail(`找不到共享数据文件：${source}`);

let raw;
try {
  raw = JSON.parse(readFileSync(source, 'utf8'));
} catch (error) {
  fail(`读取或解析失败：${error instanceof Error ? error.message : String(error)}`);
}

const data = raw?.data;
if (!data || !Array.isArray(data.prompts) || !Array.isArray(data.folders)) {
  fail('文件里没有有效的 data.{prompts,folders}，可能不是共享库文件。');
}

const cleanPrompts = [];
const promptIds = new Set();
for (const p of data.prompts) {
  if (!p || typeof p.id !== 'string' || !p.id) {
    console.warn('[migrate] 跳过一条无 id 的提示词');
    continue;
  }
  if (promptIds.has(p.id)) {
    console.warn(`[migrate] 跳过重复 id 提示词：${p.id}`);
    continue;
  }
  promptIds.add(p.id);
  cleanPrompts.push({
    id: p.id,
    title: typeof p.title === 'string' ? p.title : '',
    content: typeof p.content === 'string' ? p.content : '',
    folderId: p.folderId === null || typeof p.folderId === 'string' ? p.folderId : null,
    tags: Array.isArray(p.tags) ? p.tags.filter((t) => typeof t === 'string') : [],
    createdAt: typeof p.createdAt === 'number' ? p.createdAt : Date.now(),
    updatedAt: typeof p.updatedAt === 'number' ? p.updatedAt : Date.now(),
  });
}

const cleanFolders = [];
const folderIds = new Set();
for (const f of data.folders) {
  if (!f || typeof f.id !== 'string' || !f.id) {
    console.warn('[migrate] 跳过一条无 id 的文件夹');
    continue;
  }
  if (folderIds.has(f.id)) {
    console.warn(`[migrate] 跳过重复 id 文件夹：${f.id}`);
    continue;
  }
  folderIds.add(f.id);
  cleanFolders.push({
    id: f.id,
    name: typeof f.name === 'string' ? f.name : '未命名',
    createdAt: typeof f.createdAt === 'number' ? f.createdAt : Date.now(),
  });
}

let reparented = 0;
for (const p of cleanPrompts) {
  if (p.folderId !== null && !folderIds.has(p.folderId)) {
    p.folderId = null;
    reparented += 1;
  }
}

const promptBox = { version: SCHEMA_VERSION, prompts: cleanPrompts, folders: cleanFolders };

const outDir = '/tmp/promptbox-migration';
mkdirSync(outDir, { recursive: true });
const outPath = resolve(outDir, 'promptBox.json');
writeFileSync(outPath, JSON.stringify(promptBox, null, 2));

console.log(`[migrate] 已提取：${cleanPrompts.length} 条提示词、${cleanFolders.length} 个文件夹（${reparented} 条指向缺失文件夹已归零）。`);
console.log(`[migrate] 输出：${outPath}`);
console.log('[migrate] 下一步：把这份 promptBox.json 写入正式版扩展的 chrome.storage.local（键名 promptBox）。');
