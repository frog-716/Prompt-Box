/** 同机共享数据适配。失败时不回退写入浏览器本地库。 */

import type { PromptBoxData } from '../domain/types.ts';
import { sanitizeData } from './sanitize.ts';
import { SCHEMA_VERSION } from '../shared/constants.ts';
import { SYNC_API_BASE, SYNC_CLIENTS, SYNC_PROTOCOL_VERSION, SYNC_STORE_FORMAT_VERSION, type SyncClientId } from '../shared/sync-targets.ts';
import { createId } from '../shared/utils.ts';
import { SYNC_CREDENTIAL_KEY } from './sync-pairing.ts';

const PENDING_KEY = 'promptBox.sync.pending.v1';
const PENDING_LOCK = 'prompt-box:shared-sync-pending';
const DEFAULT_POLL_MS = 1500;

export interface SyncState {
  protocolVersion: number;
  storeFormatVersion: number;
  schemaVersion: number;
  revision: number;
  data: PromptBoxData;
}

export interface StorageStatus {
  mode: 'local' | 'shared';
  state: 'online' | 'connecting' | 'offline' | 'conflict' | 'incompatible' | 'unpaired';
  revision: number | null;
  pending: boolean;
  message: string;
}

export interface PendingSyncRequest {
  requestId: string;
  baseRevision: number;
  data: PromptBoxData;
}

interface KeyValueStorage {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(key: string): Promise<void>;
}

interface SharedStorageOptions {
  clientId: SyncClientId;
  extensionId: string;
  apiBase?: string;
  localStorage: KeyValueStorage;
  prepareStorage?: () => Promise<void>;
  fetcher?: typeof fetch;
  pollIntervalMs?: number;
  runExclusive?: <T>(callback: () => Promise<T>) => Promise<T>;
}

export class SyncStorageError extends Error {
  readonly code: string;
  readonly status: number | null;

  constructor(message: string, code: string, status: number | null = null) {
    super(message);
    this.code = code;
    this.status = status;
    this.name = 'SyncStorageError';
  }
}

export class SyncConflictError extends SyncStorageError {
  readonly current: SyncState;

  constructor(current: SyncState, message = '共享数据已被其他页面修改，当前草稿未覆盖新版本。') {
    super(message, 'revision-conflict', 409);
    this.current = current;
    this.name = 'SyncConflictError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sameData(left: PromptBoxData, right: PromptBoxData): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isSyncState(value: unknown): value is SyncState {
  return isRecord(value) &&
    value.protocolVersion === SYNC_PROTOCOL_VERSION &&
    value.storeFormatVersion === SYNC_STORE_FORMAT_VERSION &&
    value.schemaVersion === SCHEMA_VERSION &&
    Number.isSafeInteger(value.revision) && (value.revision as number) >= 0 &&
    isRecord(value.data);
}

function isPending(value: unknown): value is PendingSyncRequest {
  return isRecord(value) && typeof value.requestId === 'string' &&
    Number.isSafeInteger(value.baseRevision) && (value.baseRevision as number) >= 0 &&
    isRecord(value.data);
}

function localLock<T>(callback: () => Promise<T>): Promise<T> {
  const locks = globalThis.navigator?.locks;
  if (!locks) return callback();
  return new Promise<T>((resolve, reject) => {
    void locks.request<unknown>(PENDING_LOCK, { mode: 'exclusive' }, () => callback().then(resolve, reject))
      .catch(reject);
  });
}

function messageForStatus(state: StorageStatus['state']): string {
  if (state === 'online') return '同机共享服务在线';
  if (state === 'connecting') return '正在连接同机共享服务';
  if (state === 'offline') return '同机共享服务离线；本次修改未报告保存成功';
  if (state === 'conflict') return '有一项修改尚未确认；共享库已变化，未自动覆盖';
  if (state === 'unpaired') return '此设备尚未完成本机配对；请在设置页输入配对码';
  return '共享服务协议或数据版本不匹配；请更新两个共享扩展';
}

function responseState(value: unknown): SyncState {
  if (!isSyncState(value)) {
    const protocol = isRecord(value) ? value.protocolVersion : undefined;
    const code = isRecord(value) ? value.error : undefined;
    if (code === 'protocol-version-unsupported' || (typeof protocol === 'number' && protocol !== SYNC_PROTOCOL_VERSION)) {
      throw new SyncStorageError('共享服务协议版本不匹配，请更新两个共享扩展。', 'protocol-version-unsupported', 426);
    }
    throw new SyncStorageError('共享服务返回了不兼容的数据结构。', 'invalid-server-response');
  }
  try {
    return { ...value, data: sanitizeData(value.data) };
  } catch {
    throw new SyncStorageError('共享数据版本较新或无效，已停止读取和写入。', 'schema-version-unsupported');
  }
}

export function createSharedStorageAdapter(options: SharedStorageOptions) {
  const client = SYNC_CLIENTS[options.clientId];
  const apiBase = options.apiBase ?? SYNC_API_BASE;
  const fetcher = options.fetcher ?? fetch;
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_MS;
  const runExclusive = options.runExclusive ?? localLock;
  const prepareStorage = options.prepareStorage ?? (() => Promise.resolve());
  if (options.extensionId !== client.extensionId) {
    throw new SyncStorageError('扩展 ID 与本机共享构建不匹配。', 'extension-id-mismatch');
  }

  let status: StorageStatus = {
    mode: 'shared', state: 'connecting', revision: null, pending: false,
    message: messageForStatus('connecting'),
  };
  let lastState: SyncState | null = null;
  let pendingConflict = false;
  let pollTimer: ReturnType<typeof setTimeout> | undefined;
  let pollActive = false;
  const dataListeners = new Set<(data: PromptBoxData) => void>();
  const statusListeners = new Set<(value: StorageStatus) => void>();

  function publishStatus(state: StorageStatus['state'], revision = status.revision, pending = status.pending): void {
    const next: StorageStatus = { mode: 'shared', state, revision, pending, message: messageForStatus(state) };
    if (next.state === status.state && next.revision === status.revision && next.pending === status.pending) return;
    status = next;
    for (const listener of statusListeners) listener({ ...status });
  }

  function setState(state: SyncState, notify = true): void {
    const changed = lastState?.revision !== state.revision;
    lastState = state;
    publishStatus(pendingConflict ? 'conflict' : 'online', state.revision, status.pending);
    if (notify && changed) for (const listener of dataListeners) listener(state.data);
  }

  async function request(path: string, payload: Record<string, unknown>): Promise<unknown> {
    let response: Response;
    try {
      await prepareStorage();
      const storedCredential = await options.localStorage.get(SYNC_CREDENTIAL_KEY);
      const credential = storedCredential[SYNC_CREDENTIAL_KEY];
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (typeof credential === 'string' && /^[A-Za-z0-9_-]{43}$/.test(credential)) {
        headers.authorization = `Bearer ${credential}`;
      }
      response = await fetcher(`${apiBase}${path}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          clientId: options.clientId,
          marker: client.marker,
          protocolVersion: SYNC_PROTOCOL_VERSION,
          ...payload,
        }),
      });
    } catch {
      publishStatus('offline', status.revision, status.pending);
      throw new SyncStorageError('无法连接同机共享服务；本次修改未报告保存成功。', 'service-offline');
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    if (response.status === 409) {
      const current = responseState(body);
      throw new SyncConflictError(current);
    }
    if (response.status === 426) {
      publishStatus('incompatible', status.revision, status.pending);
      throw new SyncStorageError('共享服务协议版本不匹配，请更新两个共享扩展。', 'protocol-version-unsupported', 426);
    }
    if (response.status === 401) {
      const code = isRecord(body) && typeof body.error === 'string' ? body.error : '';
      if (code === 'pairing-required') {
        publishStatus('unpaired', status.revision, status.pending);
        throw new SyncStorageError('此设备尚未配对，请在设置页完成本机配对。', 'pairing-required', 401);
      }
    }
    if (!response.ok) {
      throw new SyncStorageError(`同机共享请求失败（HTTP ${response.status}）。`, 'shared-request-failed', response.status);
    }
    return body;
  }

  async function fetchState(): Promise<SyncState> {
    const state = responseState(await request('/v1/state', {}));
    setState(state);
    return state;
  }

  async function getPending(): Promise<PendingSyncRequest | null> {
    const stored = await options.localStorage.get(PENDING_KEY);
    const value = stored[PENDING_KEY];
    return isPending(value) ? { ...value, data: sanitizeData(value.data) } : null;
  }

  async function clearPending(requestId: string): Promise<boolean> {
    const stored = await options.localStorage.get(PENDING_KEY);
    const value = stored[PENDING_KEY];
    if (value !== undefined && (!isPending(value) || value.requestId !== requestId)) {
      publishStatus(pendingConflict ? 'conflict' : status.state, status.revision, true);
      return false;
    }
    if (value !== undefined) await options.localStorage.remove(PENDING_KEY);
    pendingConflict = false;
    publishStatus(status.state === 'offline' ? 'offline' : 'online', status.revision, false);
    return true;
  }

  async function sendCommit(pending: PendingSyncRequest): Promise<SyncState> {
    const body = await request('/v1/commit', pending as unknown as Record<string, unknown>);
    return responseState(body);
  }

  /** 调用方必须已持有共享写入锁；避免嵌套同一把 Web Lock。 */
  async function recoverPendingUnderLock(): Promise<SyncState | null> {
    const pending = await getPending();
    if (!pending) {
      publishStatus(status.state, status.revision, false);
      return null;
    }
    publishStatus(status.state, status.revision, true);
    try {
      const state = await sendCommit(pending);
      await clearPending(pending.requestId);
      setState(state);
      return state;
    } catch (error) {
      if (error instanceof SyncConflictError) {
        pendingConflict = true;
        setState(error.current, false);
        publishStatus('conflict', error.current.revision, true);
        return error.current;
      }
      if (error instanceof SyncStorageError && error.code === 'protocol-version-unsupported') {
        publishStatus('incompatible', status.revision, true);
      } else if (error instanceof SyncStorageError && error.code === 'pairing-required') {
        publishStatus('unpaired', status.revision, true);
      } else {
        publishStatus('offline', status.revision, true);
      }
      throw error;
    }
  }

  async function readData(): Promise<PromptBoxData> {
    const recovered = await runExclusive(recoverPendingUnderLock);
    if (recovered) return recovered.data;
    return (await fetchState()).data;
  }

  async function updateData(change: (current: PromptBoxData) => PromptBoxData): Promise<PromptBoxData> {
    return runExclusive(async () => {
      const recovered = await recoverPendingUnderLock();
      if (pendingConflict) throw new SyncConflictError(recovered ?? lastState ?? await fetchState());
      const current = recovered ?? await fetchState();
      const changed = change(current.data);
      if (changed === current.data) return current.data;
      const nextData = sanitizeData(changed);
      if (sameData(nextData, current.data)) return current.data;

      const pending: PendingSyncRequest = {
        requestId: createId(),
        baseRevision: current.revision,
        data: nextData,
      };
      await options.localStorage.set({ [PENDING_KEY]: pending });
      pendingConflict = false;
      publishStatus('online', current.revision, true);

      let state: SyncState;
      try {
        state = await sendCommit(pending);
      } catch (error) {
        if (error instanceof SyncConflictError) {
          pendingConflict = true;
          setState(error.current, false);
          publishStatus('conflict', error.current.revision, true);
          throw error;
        }
        if (error instanceof SyncStorageError && error.code !== 'service-offline') throw error;
        // 响应丢失时用同一 requestId 重试，服务端回执可跨重启去重。
        try {
          state = await sendCommit(pending);
        } catch (retryError) {
          if (retryError instanceof SyncConflictError) {
            pendingConflict = true;
            setState(retryError.current, false);
            publishStatus('conflict', retryError.current.revision, true);
            throw retryError;
          }
          publishStatus('offline', status.revision, true);
          throw new SyncStorageError('共享服务暂不可用；保存结果未确认，草稿仍保留，可恢复后重试。', 'pending-retry-required');
        }
      }

      await clearPending(pending.requestId);
      setState(state);
      return state.data;
    });
  }

  async function retryPending(): Promise<void> {
    await runExclusive(async () => {
      const result = await recoverPendingUnderLock();
      if (!result) await fetchState();
    });
  }

  async function discardPending(): Promise<void> {
    await runExclusive(async () => {
      await options.localStorage.remove(PENDING_KEY);
      pendingConflict = false;
      if (lastState) publishStatus('online', lastState.revision, false);
      else publishStatus('connecting', null, false);
    });
  }

  async function poll(): Promise<void> {
    if (pollActive || dataListeners.size === 0) return;
    pollActive = true;
    try {
      await runExclusive(async () => {
        const pending = await getPending();
        if (pending && !pendingConflict) await recoverPendingUnderLock();
      });
      await fetchState();
    } catch (error) {
      if (error instanceof SyncStorageError && error.code === 'protocol-version-unsupported') {
        publishStatus('incompatible', status.revision, status.pending);
      } else if (error instanceof SyncStorageError && error.code === 'pairing-required') {
        publishStatus('unpaired', status.revision, status.pending);
      } else if (!(error instanceof SyncConflictError)) {
        publishStatus('offline', status.revision, status.pending);
      }
    } finally {
      pollActive = false;
      if (dataListeners.size > 0) pollTimer = setTimeout(() => void poll(), pollIntervalMs);
    }
  }

  function onDataChanged(listener: (data: PromptBoxData) => void): () => void {
    dataListeners.add(listener);
    if (dataListeners.size === 1) void poll();
    return () => {
      dataListeners.delete(listener);
      if (dataListeners.size === 0 && pollTimer !== undefined) {
        clearTimeout(pollTimer);
        pollTimer = undefined;
      }
    };
  }

  function onStatusChanged(listener: (value: StorageStatus) => void): () => void {
    statusListeners.add(listener);
    listener({ ...status });
    return () => statusListeners.delete(listener);
  }

  return {
    readData,
    updateData,
    onDataChanged,
    onStatusChanged,
    getStatus: () => ({ ...status }),
    getPendingDraft: async () => (await getPending())?.data ?? null,
    retryPending,
    discardPending,
  };
}
