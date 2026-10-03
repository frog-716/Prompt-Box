/**
 * 存储适配层：唯一直接读写 chrome.storage.local 的地方。
 * 数据清洗在纯函数模块中完成，便于单独回归各种旧存储形状。
 */

import { browser } from 'wxt/browser';

import type { PromptBoxData } from '@/domain/types';
import { STORAGE_KEY } from '@/shared/constants';
import { sanitizeData } from '@/infra/sanitize';
import {
  createSharedStorageAdapter,
  type StorageStatus,
} from '@/infra/sync-storage';
import { createSyncPairingController } from '@/infra/sync-pairing';
import { BUILD_CLIENT_ID } from '@/shared/build-profile';

const DATA_LOCK = 'prompt-box:data-write';
const syncClientId = BUILD_CLIENT_ID;
const credentialStorageReady: Promise<boolean> = syncClientId
  ? browser.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }).then(() => true, () => false)
  : Promise.resolve(true);
async function prepareSyncCredentialStorage(): Promise<void> {
  if (!await credentialStorageReady) {
    throw new Error('当前浏览器无法将配对凭据限制在扩展可信上下文，已停止本机配对。');
  }
}
const sharedAdapter = syncClientId
  ? createSharedStorageAdapter({
    clientId: syncClientId,
    extensionId: browser.runtime.id,
    localStorage: browser.storage.local,
    prepareStorage: prepareSyncCredentialStorage,
  })
  : null;
const pairingController = syncClientId
  ? createSyncPairingController({
    clientId: syncClientId,
    extensionId: browser.runtime.id,
    localStorage: browser.storage.local,
    prepareStorage: prepareSyncCredentialStorage,
  })
  : null;

/** 读取全部数据。读取失败必须向上报告，不能把暂时不可读误当成空库。 */
export async function readData(): Promise<PromptBoxData> {
  if (sharedAdapter) return sharedAdapter.readData();
  const stored = await browser.storage.local.get(STORAGE_KEY);
  return sanitizeData(stored[STORAGE_KEY]);
}

/** 在跨界面共享的 Web Lock 中读取最新快照、应用改动并一次写回。 */
export async function updateData(
  change: (current: PromptBoxData) => PromptBoxData,
): Promise<PromptBoxData> {
  if (sharedAdapter) return sharedAdapter.updateData(change);
  return navigator.locks.request(DATA_LOCK, { mode: 'exclusive' }, async () => {
    const current = await readData();
    const changed = change(current);
    if (changed === current) return current;
    const next = sanitizeData(changed);
    await browser.storage.local.set({ [STORAGE_KEY]: next });
    return next;
  });
}

/**
 * 订阅数据变化。
 *
 * 侧边栏与设置页同时打开时，任何一侧的修改都会通过这里同步到另一侧。
 * 右键菜单保存的提示词也是靠它让侧边栏自动刷新。
 */
export function onDataChanged(listener: (data: PromptBoxData) => void): () => void {
  if (sharedAdapter) return sharedAdapter.onDataChanged(listener);
  let latestRequest = 0;
  const handler = (
    changes: Record<string, { newValue?: unknown }>,
    areaName: string,
  ): void => {
    if (areaName !== 'local') return;
    const change = changes[STORAGE_KEY];
    if (!change) return;
    // 事件可能跨界面延迟抵达。重新读取最新值，避免旧事件覆盖新状态。
    const request = ++latestRequest;
    void readData()
      .then((data) => {
        if (request === latestRequest) listener(data);
      })
      .catch((error: unknown) => console.error('[Prompt Box] 同步本地数据失败：', error));
  };

  browser.storage.onChanged.addListener(handler);
  return () => browser.storage.onChanged.removeListener(handler);
}

/** 当前数据来源状态；本地构建始终独立使用原有浏览器存储。 */
export function getStorageStatus(): StorageStatus {
  return sharedAdapter?.getStatus() ?? {
    mode: 'local', state: 'online', revision: null, pending: false, message: '数据保存在此浏览器',
  };
}

export function onStorageStatusChanged(listener: (status: StorageStatus) => void): () => void {
  if (sharedAdapter) return sharedAdapter.onStatusChanged(listener);
  listener(getStorageStatus());
  return () => {};
}

/** 本机配对状态与用户发起的配对操作；本地构建不暴露此能力。 */
export async function getSyncPairingStatus() {
  if (!pairingController) return null;
  return pairingController.status();
}

export async function startSyncPairing() {
  if (!pairingController) throw new Error('当前构建不使用同机共享。');
  return pairingController.start();
}

export async function createSyncPairingInvite() {
  if (!pairingController) throw new Error('当前构建不使用同机共享。');
  return pairingController.createInvite();
}

export async function joinSyncPairing(code: string): Promise<void> {
  if (!pairingController) throw new Error('当前构建不使用同机共享。');
  await pairingController.join(code);
}

export async function revokeSyncPairing(): Promise<void> {
  if (!pairingController) throw new Error('当前构建不使用同机共享。');
  await pairingController.revoke();
}

/** 重试服务确认结果未知的请求；同一个 requestId 会由服务端去重。 */
export async function retryPendingSync(): Promise<void> {
  await sharedAdapter?.retryPending();
}

/** 读取本机待确认请求的数据部分，供用户另存为可恢复 JSON 备份。 */
export async function readPendingSyncDraft(): Promise<PromptBoxData | null> {
  return sharedAdapter?.getPendingDraft() ?? null;
}

/** 仅移除本扩展保存的待确认请求，不会撤销服务端已确认的数据。 */
export async function discardPendingSync(): Promise<void> {
  await sharedAdapter?.discardPending();
}
