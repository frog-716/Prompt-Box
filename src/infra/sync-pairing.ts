/** 同机共享服务的本机配对界面适配；扩展只在可信上下文保存设备凭据。 */

import { SYNC_API_BASE, SYNC_CLIENTS, SYNC_PROTOCOL_VERSION, type SyncClientId } from '../shared/sync-targets.ts';

export const SYNC_CREDENTIAL_KEY = 'promptBox.sync.credential.v2';

interface KeyValueStorage {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(key: string): Promise<void>;
}

interface PairingOptions {
  clientId: SyncClientId;
  extensionId: string;
  localStorage: KeyValueStorage;
  apiBase?: string;
  fetcher?: typeof fetch;
  prepareStorage?: () => Promise<void>;
}

export interface PairingStatus {
  paired: boolean;
  peerPaired: boolean;
  pairingInProgress: boolean;
}

export interface PairingInvite {
  code: string;
  expiresAt: number;
}

export class PairingError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = 'PairingError';
    this.code = code;
    this.status = status;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeCredential(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
}

const ERROR_MESSAGES: Record<string, string> = {
  'pairing-required': '此扩展尚未配对，或配对已撤销。请在下方完成配对。',
  'pairing-invite-expired': '配对码已过期，请在已配对的扩展中重新生成。',
  'pairing-invite-invalid': '配对码无效或已使用，请检查后重试。',
  'pairing-in-progress': '另一端正在配对；请在已显示配对码的界面继续。',
  'pairing-already-started': '本设备已有配对信息；请从已配对的一端生成新配对码。',
  'pairing-credential-revoked': '本设备配对已撤销，请输入新配对码。',
};

/** 只允许精确的两个本机共享扩展 ID 创建配对适配器。 */
export function createSyncPairingController(options: PairingOptions) {
  const client = SYNC_CLIENTS[options.clientId];
  const apiBase = options.apiBase ?? SYNC_API_BASE;
  const fetcher = options.fetcher ?? fetch;
  const prepareStorage = options.prepareStorage ?? (() => Promise.resolve());
  if (options.extensionId !== client.extensionId) {
    throw new PairingError('扩展 ID 与本机共享构建不匹配。', 'extension-id-mismatch', 0);
  }

  async function readCredential(): Promise<string | null> {
    await prepareStorage();
    const stored = await options.localStorage.get(SYNC_CREDENTIAL_KEY);
    const value = stored[SYNC_CREDENTIAL_KEY];
    return safeCredential(value) ? value : null;
  }

  async function call<T>(
    path: string,
    payload: Record<string, unknown> = {},
    credential?: string | null,
  ): Promise<T> {
    await prepareStorage();
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (credential) headers.authorization = `Bearer ${credential}`;
    let response: Response;
    try {
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
      throw new PairingError('无法连接同机共享服务；请确认服务已启动。', 'service-offline', 0);
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    if (!response.ok) {
      const code = isRecord(body) && typeof body.error === 'string' ? body.error : 'pairing-request-failed';
      throw new PairingError(
        ERROR_MESSAGES[code] ?? `配对请求失败（HTTP ${response.status}）。`,
        code,
        response.status,
      );
    }
    return body as T;
  }

  return {
    async status(): Promise<PairingStatus> {
      const credential = await readCredential();
      const result = await call<unknown>('/v1/pair/status', {}, credential);
      if (!isRecord(result) || typeof result.paired !== 'boolean' || typeof result.peerPaired !== 'boolean' || typeof result.pairingInProgress !== 'boolean') {
        throw new PairingError('共享服务返回了不兼容的配对状态。', 'invalid-pairing-response', 0);
      }
      return { paired: result.paired, peerPaired: result.peerPaired, pairingInProgress: result.pairingInProgress };
    },

    async start(): Promise<PairingInvite> {
      const result = await call<unknown>('/v1/pair/start');
      if (!isRecord(result) || !safeCredential(result.credential) || !safeCredential(result.invitation) || !Number.isSafeInteger(result.expiresAt)) {
        throw new PairingError('共享服务返回了无效的配对信息。', 'invalid-pairing-response', 0);
      }
      await options.localStorage.set({ [SYNC_CREDENTIAL_KEY]: result.credential });
      return { code: result.invitation, expiresAt: result.expiresAt as number };
    },

    async createInvite(): Promise<PairingInvite> {
      const credential = await readCredential();
      const result = await call<unknown>('/v1/pair/invite', {}, credential);
      if (!isRecord(result) || !safeCredential(result.invitation) || !Number.isSafeInteger(result.expiresAt)) {
        throw new PairingError('共享服务返回了无效的配对信息。', 'invalid-pairing-response', 0);
      }
      return { code: result.invitation, expiresAt: result.expiresAt as number };
    },

    async join(code: string): Promise<void> {
      if (!safeCredential(code.trim())) throw new PairingError('请输入完整的 43 位配对码。', 'pairing-invite-invalid', 400);
      const result = await call<unknown>('/v1/pair/join', { invitation: code.trim() });
      if (!isRecord(result) || !safeCredential(result.credential)) {
        throw new PairingError('共享服务返回了无效的设备凭据。', 'invalid-pairing-response', 0);
      }
      await options.localStorage.set({ [SYNC_CREDENTIAL_KEY]: result.credential });
    },

    async revoke(): Promise<void> {
      const credential = await readCredential();
      await call('/v1/pair/revoke', {}, credential);
      await options.localStorage.remove(SYNC_CREDENTIAL_KEY);
    },
  };
}
