import type { PromptBoxData } from '../../src/domain/types';
import type { StorageStatus } from '../../src/infra/sync-storage';

const folderId = 'demo-folder-writing';
const day = 86_400_000;
const olderDemoTime = (timestamp: number): number => timestamp - day * 5;

let data: PromptBoxData = {
  version: 1,
  folders: [
    { id: folderId, name: '写作与表达', createdAt: olderDemoTime(1790812800000) },
    { id: 'demo-folder-research', name: '调研分析', createdAt: olderDemoTime(1790812800000) },
  ],
  prompts: [
    {
      id: 'demo-prompt-weekly',
      title: '把零散进展整理成一页周报',
      content: '请把以下工作记录整理成简洁周报，按「已完成 / 进行中 / 需要协助」分组。保留可核对的事实，不补写没有提供的数字。\n\n工作记录：完成新手引导文案校对；和设计同学确认导航结构；下周开始小范围可用性走查。',
      folderId,
      tags: ['工作', '总结'],
      createdAt: olderDemoTime(1791158400000),
      updatedAt: olderDemoTime(1791327600000),
    },
    {
      id: 'demo-prompt-interview',
      title: '准备一份轻量的用户访谈提纲',
      content: '为一款日常记事工具设计 6 个开放式访谈问题。先了解对方最近一次记录灵感的经历，再追问保存、分类和再次找到内容时遇到的困难。避免诱导式提问。',
      folderId: 'demo-folder-research',
      tags: ['用户研究', '访谈'],
      createdAt: olderDemoTime(1791072000000),
      updatedAt: olderDemoTime(1791241200000),
    },
    {
      id: 'demo-prompt-launch',
      title: '写三版简明的功能更新说明',
      content: '请为一款效率工具写三版功能更新说明：一句话版、社交媒体版和站内公告版。语气清楚友好，聚焦用户能完成的事情，不使用夸大承诺。',
      folderId,
      tags: ['产品文案', '发布'],
      createdAt: olderDemoTime(1790985600000),
      updatedAt: olderDemoTime(1791154800000),
    },
    {
      id: 'demo-prompt-compare',
      title: '比较方案时先列出判断依据',
      content: '请把下面几种方案按实施成本、维护负担和用户影响逐项比较。缺少信息时标记待确认，不替我做未经说明的假设，最后列出最影响选择的两个问题。',
      folderId: 'demo-folder-research',
      tags: ['分析', '决策'],
      createdAt: olderDemoTime(1790899200000),
      updatedAt: olderDemoTime(1791068400000),
    },
    {
      id: 'demo-prompt-empty-folder',
      title: '给复杂说明做一版易读摘要',
      content: '将材料整理为：一句话结论、三条关键信息、一个下一步建议。保留术语原义；如果材料没有给出答案，请明确说尚未说明。',
      folderId: null,
      tags: ['阅读', '摘要'],
      createdAt: olderDemoTime(1790812800000),
      updatedAt: olderDemoTime(1790982000000),
    },
  ],
};

const listeners = new Set<(data: PromptBoxData) => void>();
const status: StorageStatus = {
  mode: 'shared',
  state: 'online',
  revision: 8,
  pending: false,
  message: '演示预览：同机共享服务在线',
};

const copy = <T>(value: T): T => structuredClone(value);

export async function readData(): Promise<PromptBoxData> {
  return copy(data);
}

export async function updateData(change: (current: PromptBoxData) => PromptBoxData): Promise<PromptBoxData> {
  data = copy(change(copy(data)));
  const snapshot = copy(data);
  for (const listener of listeners) listener(snapshot);
  return copy(data);
}

export function onDataChanged(listener: (data: PromptBoxData) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getStorageStatus(): StorageStatus {
  return { ...status };
}

export function onStorageStatusChanged(listener: (status: StorageStatus) => void): () => void {
  listener(getStorageStatus());
  return () => {};
}

export async function getSyncPairingStatus(): Promise<null> {
  return null;
}

export async function startSyncPairing(): Promise<never> {
  throw new Error('演示预览不提供配对操作。');
}

export async function createSyncPairingInvite(): Promise<never> {
  throw new Error('演示预览不提供配对操作。');
}

export async function joinSyncPairing(): Promise<void> {}
export async function revokeSyncPairing(): Promise<void> {}
export async function retryPendingSync(): Promise<void> {}
export async function discardPendingSync(): Promise<void> {}
export async function readPendingSyncDraft(): Promise<null> {
  return null;
}
