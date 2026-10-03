import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { createServer } from 'node:http';
import { chmod, lstat, mkdir, open, readFile, readdir, rename, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

import { sanitizeData } from '../../src/infra/sanitize.ts';
import { SCHEMA_VERSION } from '../../src/shared/constants.ts';
import {
  SYNC_CLIENTS,
  SYNC_PROTOCOL_VERSION,
  SYNC_STORE_FORMAT_VERSION,
} from '../../src/shared/sync-targets.ts';

export const HOST = '127.0.0.1';
export const PORT = 18763;
export const MAX_BODY_BYTES = 2 * 1024 * 1024;
export const MAX_RECEIPTS = 256;
export const MAX_BACKUPS = 20;
export const PAIRING_INVITE_TTL_MS = 5 * 60 * 1000;

const SERVICE_DIR = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_DATA_DIR = resolve(SERVICE_DIR, '../../.local-sync-test-data');
const DATA_FILE = 'library.json';
const BACKUP_DIR = 'Backups';
const BACKUP_QUARANTINE_DIR = 'Quarantine';
const BACKUP_TEMP_PATTERN = /^library-\d{13}-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.json\.([1-9]\d*)\.tmp$/;
const WRITE_ROUTES = new Set(['/v1/commit']);
const READ_ROUTES = new Set(['/v1/state']);
const PAIRING_ROUTES = new Set([
  '/v1/pair/status', '/v1/pair/start', '/v1/pair/invite', '/v1/pair/join', '/v1/pair/revoke',
]);
const JSON_ROUTES = new Set([...WRITE_ROUTES, ...READ_ROUTES, ...PAIRING_ROUTES]);
const ORIGIN_CLIENTS = new Map(Object.entries(SYNC_CLIENTS).map(([clientId, client]) => [client.origin, {
  clientId,
  marker: client.marker,
}])) ;

class RequestError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

function emptyStore() {
  return {
    formatVersion: SYNC_STORE_FORMAT_VERSION,
    protocolVersion: SYNC_PROTOCOL_VERSION,
    revision: 0,
    data: sanitizeData(undefined),
    receipts: [],
    credentials: [],
    invitation: null,
  };
}

function validReceipt(receipt) {
  return typeof receipt?.requestId === 'string' &&
    typeof receipt?.clientId === 'string' &&
    typeof receipt?.fingerprint === 'string' &&
    (receipt.status === 200 || receipt.status === 409) &&
    Number.isSafeInteger(receipt.revision) && receipt.revision >= 0;
}

function validSecretHash(value) {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
}

function validCredential(credential) {
  return typeof credential?.clientId === 'string' && credential.clientId in SYNC_CLIENTS &&
    validSecretHash(credential.verifier) && Number.isSafeInteger(credential.createdAt) && credential.createdAt >= 0;
}

function validInvitation(invitation) {
  return invitation === null || (typeof invitation === 'object' && !Array.isArray(invitation) &&
    typeof invitation.issuerClientId === 'string' && invitation.issuerClientId in SYNC_CLIENTS &&
    typeof invitation.targetClientId === 'string' && invitation.targetClientId in SYNC_CLIENTS &&
    invitation.issuerClientId !== invitation.targetClientId && validSecretHash(invitation.verifier) &&
    Number.isSafeInteger(invitation.expiresAt) && invitation.expiresAt >= 0);
}

function validateStoredStore(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('共享数据文件格式无效，已停止启动以保留文件。');
  const legacy = raw.formatVersion === 1 && raw.protocolVersion === 1;
  if (!legacy && raw.formatVersion !== SYNC_STORE_FORMAT_VERSION) {
    throw new Error('共享数据文件版本不受支持，已停止启动以保留文件。');
  }
  if (!legacy && raw.protocolVersion !== SYNC_PROTOCOL_VERSION) {
    throw new Error('共享服务协议版本不匹配，已停止启动以保留文件。');
  }
  if (!Number.isSafeInteger(raw.revision) || raw.revision < 0 || !Array.isArray(raw.receipts) || !raw.receipts.every(validReceipt)) {
    throw new Error('共享数据文件内容无效，已停止启动以保留文件。');
  }
  const data = sanitizeData(raw.data);
  if (!isDeepStrictEqual(data, raw.data)) throw new Error('共享数据形状无效，已停止启动以保留文件。');
  if (!legacy && (!Array.isArray(raw.credentials) || raw.credentials.length > 2 ||
    !raw.credentials.every(validCredential) || new Set(raw.credentials.map((item) => item.clientId)).size !== raw.credentials.length ||
    !validInvitation(raw.invitation))) {
    throw new Error('共享配对信息无效，已停止启动以保留文件。');
  }
  return {
    formatVersion: SYNC_STORE_FORMAT_VERSION,
    protocolVersion: SYNC_PROTOCOL_VERSION,
    revision: raw.revision,
    data,
    receipts: raw.receipts.slice(-MAX_RECEIPTS),
    credentials: legacy ? [] : raw.credentials,
    invitation: legacy ? null : raw.invitation,
  };
}

async function writeStoreAtomically(dataDir, filePath, store, generateId = randomUUID, now = Date.now) {
  await snapshotCurrentStore(dataDir, filePath, generateId, now);
  const temporaryPath = `${filePath}.${process.pid}.${generateId()}.tmp`;
  let handle;
  let ownedTempInfo;
  try {
    handle = await open(temporaryPath, 'wx', 0o600);
    ownedTempInfo = await handle.stat();
    await handle.writeFile(`${JSON.stringify(store, null, 2)}\n`, 'utf8');
    await handle.sync();
    ownedTempInfo = await handle.stat();
    await handle.close();
    handle = undefined;
    await rename(temporaryPath, filePath);
    try {
      const directoryHandle = await open(dataDir, 'r');
      await directoryHandle.sync();
      await directoryHandle.close();
    } catch {
      // Directory fsync is unsupported on some filesystems; the atomic rename still protects the file.
    }
  } catch (error) {
    if (handle) ownedTempInfo = await handle.stat().catch(() => ownedTempInfo);
    await handle?.close().catch(() => {});
    if (ownedTempInfo) await removeOwnedTemporaryFile(temporaryPath, ownedTempInfo).catch(() => {});
    throw error;
  }
}

async function ensurePrivateDirectory(directoryPath, label) {
  await mkdir(directoryPath, { recursive: true, mode: 0o700 });
  const info = await lstat(directoryPath);
  if (info.isSymbolicLink() || !info.isDirectory()) throw new Error(`${label}必须是实际目录，不能是符号链接或其他文件。`);
  await chmod(directoryPath, 0o700);
}

async function syncDirectory(directoryPath) {
  try {
    const directoryHandle = await open(directoryPath, 'r');
    await directoryHandle.sync();
    await directoryHandle.close();
  } catch {
    // Directory fsync is unsupported on some filesystems; atomic rename still protects each file.
  }
}

async function ensureQuarantineDirectory(backupDir) {
  const quarantineDir = resolve(backupDir, BACKUP_QUARANTINE_DIR);
  try {
    await mkdir(quarantineDir, { mode: 0o700 });
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
  }
  const info = await lstat(quarantineDir);
  if (info.isSymbolicLink() || !isPrivateOwnedDirectory(info)) {
    throw new Error('自动备份隔离路径无效或权限过宽，已停止写入以保留文件。');
  }
  return quarantineDir;
}

async function createQuarantineBatch(quarantineDir) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const batchDir = resolve(quarantineDir, randomUUID());
    try {
      await mkdir(batchDir, { mode: 0o700 });
      const info = await lstat(batchDir);
      if (info.isSymbolicLink() || !isPrivateOwnedDirectory(info)) {
        throw new Error('自动备份隔离批次目录无效，已停止写入以保留文件。');
      }
      return batchDir;
    } catch (error) {
      if (error?.code === 'EEXIST') continue;
      throw error;
    }
  }
  throw new Error('无法创建唯一的自动备份隔离目录，已停止写入以保留文件。');
}

function isPrivateOwnedFile(info) {
  return info.isFile() &&
    (typeof process.getuid !== 'function' || info.uid === process.getuid()) &&
    (info.mode & 0o777) === 0o600;
}

function isPrivateOwnedDirectory(info) {
  return info.isDirectory() &&
    (typeof process.getuid !== 'function' || info.uid === process.getuid()) &&
    (info.mode & 0o777) === 0o700;
}

function isSameFile(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

function isSameFileState(left, right) {
  return isSameFile(left, right) && left.size === right.size &&
    left.mtimeMs === right.mtimeMs && left.ctimeMs === right.ctimeMs;
}

function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code !== 'ESRCH';
  }
}

async function removeOwnedTemporaryFile(filePath, ownedInfo) {
  let currentInfo;
  try {
    currentInfo = await lstat(filePath);
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
  if (currentInfo.isSymbolicLink() || !isPrivateOwnedFile(currentInfo) || !isSameFileState(ownedInfo, currentInfo)) return;
  await rm(filePath);
}

async function quarantineStaleBackupTemps(backupDir) {
  const entries = await readdir(backupDir, { withFileTypes: true });
  const staleTemps = entries.filter((entry) => BACKUP_TEMP_PATTERN.test(entry.name));
  if (staleTemps.length === 0) return;

  const openedTemps = [];
  try {
    for (const entry of staleTemps) {
      const [, pidText] = BACKUP_TEMP_PATTERN.exec(entry.name) ?? [];
      const pid = Number(pidText);
      if (!Number.isSafeInteger(pid) || isProcessRunning(pid)) {
        throw new Error('自动备份临时文件对应的进程仍可能在运行，已保留现场并停止写入。');
      }
      const sourcePath = resolve(backupDir, entry.name);
      const beforeOpen = await lstat(sourcePath);
      if (beforeOpen.isSymbolicLink() || !isPrivateOwnedFile(beforeOpen)) {
        throw new Error('自动备份临时文件类型或权限无效，已停止写入并保留现场。');
      }
      const handle = await open(sourcePath, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
      openedTemps.push({ entry, sourcePath, handle, beforeOpen });
      const openedInfo = await handle.stat();
      const afterOpen = await lstat(sourcePath);
      if (!isPrivateOwnedFile(openedInfo) || !isSameFileState(beforeOpen, openedInfo) ||
        afterOpen.isSymbolicLink() || !isPrivateOwnedFile(afterOpen) || !isSameFileState(openedInfo, afterOpen)) {
        throw new Error('自动备份临时文件在检查期间发生变化，已停止写入并保留现场。');
      }
    }

    const quarantineDir = await ensureQuarantineDirectory(backupDir);
    const batchDir = await createQuarantineBatch(quarantineDir);
    for (const { entry, sourcePath, beforeOpen, handle } of openedTemps) {
      const currentInfo = await lstat(sourcePath);
      const openedInfo = await handle.stat();
      if (currentInfo.isSymbolicLink() || !isPrivateOwnedFile(currentInfo) ||
        !isPrivateOwnedFile(openedInfo) || !isSameFileState(beforeOpen, currentInfo) || !isSameFileState(openedInfo, currentInfo)) {
        throw new Error('自动备份临时文件在隔离期间发生变化，已停止写入并保留现场。');
      }
      await rename(sourcePath, resolve(batchDir, entry.name));
    }
    await syncDirectory(backupDir);
    await syncDirectory(batchDir);
    await syncDirectory(quarantineDir);
  } finally {
    await Promise.all(openedTemps.map(({ handle }) => handle.close().catch(() => {})));
  }
}

async function snapshotCurrentStore(dataDir, filePath, generateId = randomUUID, now = Date.now) {
  let sourceHandle;
  try {
    sourceHandle = await open(filePath, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
  try {
    const sourceInfo = await sourceHandle.stat();
    if (!sourceInfo.isFile()) throw new Error('共享数据文件必须是实际普通文件，无法生成自动备份。');
    const bytes = await sourceHandle.readFile();
    const backupDir = resolve(dataDir, BACKUP_DIR);
    await ensurePrivateDirectory(backupDir, '自动备份路径');
    const timestamp = String(now()).padStart(13, '0');
    const backupPath = resolve(backupDir, `library-${timestamp}-${generateId()}.json`);
    const temporaryPath = `${backupPath}.${process.pid}.tmp`;
    let backupHandle;
    let ownedTempInfo;
    try {
      backupHandle = await open(temporaryPath, 'wx', 0o600);
      ownedTempInfo = await backupHandle.stat();
      await backupHandle.writeFile(bytes);
      await backupHandle.sync();
      ownedTempInfo = await backupHandle.stat();
      await backupHandle.close();
      backupHandle = undefined;
      await rename(temporaryPath, backupPath);
      await syncDirectory(backupDir);
    } catch (error) {
      if (backupHandle) ownedTempInfo = await backupHandle.stat().catch(() => ownedTempInfo);
      await backupHandle?.close().catch(() => {});
      if (ownedTempInfo) await removeOwnedTemporaryFile(temporaryPath, ownedTempInfo).catch(() => {});
      throw error;
    }
    await trimBackups(backupDir);
  } finally {
    await sourceHandle.close();
  }
}

async function trimBackups(backupDir) {
  await quarantineStaleBackupTemps(backupDir);
  const entries = await readdir(backupDir, { withFileTypes: true });
  const backups = [];
  for (const entry of entries) {
    if (entry.name === BACKUP_QUARANTINE_DIR) {
      const quarantinePath = resolve(backupDir, entry.name);
      const quarantineInfo = await lstat(quarantinePath);
      if (quarantineInfo.isSymbolicLink() || !isPrivateOwnedDirectory(quarantineInfo)) {
        throw new Error('自动备份隔离路径无效，已停止写入以保留文件。');
      }
      continue;
    }
    if (!/^library-\d{13}-[0-9a-f-]{36}\.json$/.test(entry.name)) {
      throw new Error('自动备份目录含有未知文件，已停止写入以保留现场。');
    }
    const path = resolve(backupDir, entry.name);
    const info = await lstat(path);
    if (info.isSymbolicLink() || !isPrivateOwnedFile(info)) {
      throw new Error('自动备份文件属主或权限无效，已停止轮换并保留文件。');
    }
    backups.push({ path, name: entry.name, info });
  }
  backups.sort((left, right) => left.name.localeCompare(right.name));
  for (const backup of backups.slice(0, Math.max(0, backups.length - MAX_BACKUPS))) {
    const currentInfo = await lstat(backup.path);
    if (currentInfo.isSymbolicLink() || !isPrivateOwnedFile(currentInfo) || !isSameFileState(backup.info, currentInfo)) {
      throw new Error('自动备份文件在轮换期间发生变化，已停止轮换并保留文件。');
    }
    await rm(backup.path);
  }
  await syncDirectory(backupDir);
}

async function hasAutomaticBackups(dataDir) {
  const backupDir = resolve(dataDir, BACKUP_DIR);
  try {
    const info = await lstat(backupDir);
    if (info.isSymbolicLink() || !info.isDirectory()) throw new Error('自动备份路径无效，已停止启动以保留文件。');
    return (await readdir(backupDir)).length > 0;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function readRequestJson(request) {
  const contentType = request.headers['content-type'];
  if (typeof contentType !== 'string' || !/^application\/json(?:\s*;|$)/i.test(contentType)) {
    throw new RequestError(415, 'json-required');
  }
  const declaredSize = Number(request.headers['content-length']);
  if (Number.isFinite(declaredSize) && declaredSize > MAX_BODY_BYTES) throw new RequestError(413, 'body-too-large');
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new RequestError(413, 'body-too-large');
    chunks.push(chunk);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid-json-object');
    return value;
  } catch {
    throw new RequestError(400, 'invalid-json');
  }
}

function sendJson(response, status, body, origin = null) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...(origin ? {
      'access-control-allow-origin': origin,
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'content-type',
      vary: 'Origin',
    } : {}),
  });
  response.end(JSON.stringify(body));
}

function logDecision(logger, request, pathname, origin, reason) {
  logger.log(JSON.stringify({
    origin: typeof origin === 'string' ? origin : null,
    method: request.method,
    path: pathname,
    reason,
  }));
}

function isUuid(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function statePayload(store, extra = {}) {
  return {
    protocolVersion: SYNC_PROTOCOL_VERSION,
    storeFormatVersion: SYNC_STORE_FORMAT_VERSION,
    schemaVersion: SCHEMA_VERSION,
    revision: store.revision,
    data: store.data,
    ...extra,
  };
}

function appendReceipt(receipts, receipt) {
  // 有界保留最近 256 条；revision 单调递增，过期请求不会覆盖更新版本。
  return [...receipts, receipt].slice(-MAX_RECEIPTS);
}

function hashSecret(secret) {
  return createHash('sha256').update(secret, 'utf8').digest('hex');
}

function secretsMatch(secret, verifier) {
  if (typeof secret !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(secret) || !validSecretHash(verifier)) return false;
  const supplied = Buffer.from(hashSecret(secret), 'hex');
  const expected = Buffer.from(verifier, 'hex');
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function bearerToken(request) {
  const header = request.headers.authorization;
  const match = typeof header === 'string' ? /^Bearer ([A-Za-z0-9_-]{43})$/.exec(header) : null;
  return match?.[1] ?? null;
}

function credentialFor(store, clientId) {
  return store.credentials.find((item) => item.clientId === clientId);
}

function isAuthorized(request, store, clientId) {
  const token = bearerToken(request);
  const credential = credentialFor(store, clientId);
  return Boolean(token && credential && secretsMatch(token, credential.verifier));
}

function makeSecret(generateSecret) {
  const value = generateSecret();
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value)) {
    throw new Error('配对随机值生成失败。');
  }
  return value;
}

/** 启动一个仅绑定回环地址的同机共享服务；测试可注入临时目录和端口。 */
export async function createSyncService({
  dataDir = DEFAULT_DATA_DIR,
  host = HOST,
  port = PORT,
  logger = console,
  now = Date.now,
  generateId = randomUUID,
  generateSecret = () => randomBytes(32).toString('base64url'),
} = {}) {
  if (host !== HOST) throw new Error('共享服务只允许绑定 127.0.0.1。');
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  const directoryInfo = await lstat(dataDir);
  if (directoryInfo.isSymbolicLink() || !directoryInfo.isDirectory()) {
    throw new Error('隔离数据路径必须是实际目录，不能是符号链接或其他文件。');
  }
  await chmod(dataDir, 0o700);
  const filePath = resolve(dataDir, DATA_FILE);
  let store;
  try {
    const fileInfo = await lstat(filePath);
    if (fileInfo.isSymbolicLink() || !fileInfo.isFile()) {
      throw new Error('共享数据文件必须是实际普通文件，不能是符号链接。');
    }
    await chmod(filePath, 0o600);
    store = validateStoredStore(JSON.parse(await readFile(filePath, 'utf8')));
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    if (await hasAutomaticBackups(dataDir)) {
      throw new Error('共享数据文件缺失但自动备份仍在，已停止启动以避免创建空库；请先校验并恢复备份。');
    }
    store = emptyStore();
    await writeStoreAtomically(dataDir, filePath, store, generateId, now);
  }

  let expectedHost = `${host}:${port}`;
  let writeQueue = Promise.resolve();
  const serializeWrite = (change) => {
    const task = writeQueue.then(change);
    writeQueue = task.catch(() => {});
    return task;
  };

  const server = createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url ?? '/', `http://${HOST}`);
      const origin = request.headers.origin;
      if (request.headers.host !== expectedHost) {
        logDecision(logger, request, url.pathname, origin, 'host-not-allowed');
        return sendJson(response, 421, { error: 'host-not-allowed' });
      }
      if (request.method === 'GET' && url.pathname === '/health') {
        return sendJson(response, 200, {
          ok: true,
          protocolVersion: SYNC_PROTOCOL_VERSION,
          storeFormatVersion: SYNC_STORE_FORMAT_VERSION,
        });
      }

      const client = typeof origin === 'string' ? ORIGIN_CLIENTS.get(origin) : undefined;
      logDecision(logger, request, url.pathname, origin, client ? 'origin-allowed' : typeof origin === 'string' ? 'origin-not-allowed' : 'origin-missing');
      if (!client) return sendJson(response, 403, { error: 'origin-not-allowed' });

      if (request.method === 'OPTIONS') {
        const requestedHeaders = String(request.headers['access-control-request-headers'] ?? '')
          .split(',').map((header) => header.trim().toLowerCase()).filter(Boolean);
        if (!JSON_ROUTES.has(url.pathname) || request.headers['access-control-request-method'] !== 'POST' || requestedHeaders.some((header) => !['content-type', 'authorization'].includes(header))) {
          return sendJson(response, 403, { error: 'preflight-not-allowed' });
        }
        response.writeHead(204, {
          'access-control-allow-origin': origin,
          'access-control-allow-methods': 'POST, OPTIONS',
          'access-control-allow-headers': 'content-type, authorization',
          'access-control-max-age': '60',
          vary: 'Origin',
        });
        return response.end();
      }

      if (request.method !== 'POST' || !JSON_ROUTES.has(url.pathname)) {
        return sendJson(response, 405, { error: 'method-or-route-not-allowed' }, origin);
      }

      const needsCredential = READ_ROUTES.has(url.pathname) || WRITE_ROUTES.has(url.pathname) ||
        url.pathname === '/v1/pair/invite' || url.pathname === '/v1/pair/revoke';
      if (needsCredential && !isAuthorized(request, store, client.clientId)) {
        return sendJson(response, 401, { error: 'pairing-required' }, origin);
      }

      const payload = await readRequestJson(request);
      if (payload.clientId !== client.clientId || payload.marker !== client.marker) {
        return sendJson(response, 400, { error: 'client-marker-mismatch' }, origin);
      }
      if (payload.protocolVersion !== SYNC_PROTOCOL_VERSION) {
        return sendJson(response, 426, { error: 'protocol-version-unsupported', protocolVersion: SYNC_PROTOCOL_VERSION }, origin);
      }

      if (url.pathname === '/v1/pair/status') {
        const peerId = client.clientId === 'chrome-sync' ? 'gpt-sync' : 'chrome-sync';
        return sendJson(response, 200, {
          paired: isAuthorized(request, store, client.clientId),
          peerPaired: Boolean(credentialFor(store, peerId)),
          pairingInProgress: Boolean(store.invitation && store.invitation.expiresAt > now()),
        }, origin);
      }

      if (url.pathname === '/v1/pair/start') {
        const result = await serializeWrite(async () => {
          if (store.credentials.length > 0) {
            return { status: 409, body: { error: store.invitation ? 'pairing-in-progress' : 'pairing-already-started' } };
          }
          const peerId = client.clientId === 'chrome-sync' ? 'gpt-sync' : 'chrome-sync';
          const credential = makeSecret(generateSecret);
          const invitation = makeSecret(generateSecret);
          const expiresAt = now() + PAIRING_INVITE_TTL_MS;
          const nextStore = {
            ...store,
            credentials: [{ clientId: client.clientId, verifier: hashSecret(credential), createdAt: now() }],
            invitation: {
              issuerClientId: client.clientId,
              targetClientId: peerId,
              verifier: hashSecret(invitation),
              expiresAt,
            },
          };
          await writeStoreAtomically(dataDir, filePath, nextStore, generateId, now);
          store = nextStore;
          return { status: 200, body: { credential, invitation, expiresAt } };
        });
        return sendJson(response, result.status, result.body, origin);
      }

      if (url.pathname === '/v1/pair/invite') {
        const result = await serializeWrite(async () => {
          const peerId = client.clientId === 'chrome-sync' ? 'gpt-sync' : 'chrome-sync';
          const invitation = makeSecret(generateSecret);
          const expiresAt = now() + PAIRING_INVITE_TTL_MS;
          const nextStore = {
            ...store,
            invitation: {
              issuerClientId: client.clientId,
              targetClientId: peerId,
              verifier: hashSecret(invitation),
              expiresAt,
            },
          };
          await writeStoreAtomically(dataDir, filePath, nextStore, generateId, now);
          store = nextStore;
          return { invitation, expiresAt };
        });
        return sendJson(response, 200, result, origin);
      }

      if (url.pathname === '/v1/pair/join') {
        const result = await serializeWrite(async () => {
          const invitation = store.invitation;
          if (!invitation || !secretsMatch(payload.invitation, invitation.verifier)) {
            return { status: 401, body: { error: 'pairing-invite-invalid' } };
          }
          if (invitation.expiresAt <= now()) {
            const nextStore = { ...store, invitation: null };
            await writeStoreAtomically(dataDir, filePath, nextStore, generateId, now);
            store = nextStore;
            return { status: 410, body: { error: 'pairing-invite-expired' } };
          }
          if (invitation.targetClientId !== client.clientId) {
            return { status: 403, body: { error: 'pairing-invite-target-mismatch' } };
          }
          const credential = makeSecret(generateSecret);
          const nextStore = {
            ...store,
            credentials: [
              ...store.credentials.filter((item) => item.clientId !== client.clientId),
              { clientId: client.clientId, verifier: hashSecret(credential), createdAt: now() },
            ],
            invitation: null,
          };
          await writeStoreAtomically(dataDir, filePath, nextStore, generateId, now);
          store = nextStore;
          return { status: 200, body: { credential } };
        });
        return sendJson(response, result.status, result.body, origin);
      }

      if (url.pathname === '/v1/pair/revoke') {
        const result = await serializeWrite(async () => {
          const nextStore = {
            ...store,
            credentials: store.credentials.filter((item) => item.clientId !== client.clientId),
            invitation: store.invitation && (store.invitation.issuerClientId === client.clientId || store.invitation.targetClientId === client.clientId)
              ? null
              : store.invitation,
          };
          await writeStoreAtomically(dataDir, filePath, nextStore, generateId, now);
          store = nextStore;
          return { revoked: true };
        });
        return sendJson(response, 200, result, origin);
      }

      if (READ_ROUTES.has(url.pathname)) return sendJson(response, 200, statePayload(store), origin);

      if (!isUuid(payload.requestId) || !Number.isSafeInteger(payload.baseRevision) || payload.baseRevision < 0) {
        return sendJson(response, 400, { error: 'commit-metadata-invalid' }, origin);
      }
      let nextData;
      try {
        nextData = sanitizeData(payload.data);
      } catch {
        return sendJson(response, 422, { error: 'data-version-unsupported' }, origin);
      }
      if (nextData.version !== SCHEMA_VERSION || !isDeepStrictEqual(nextData, payload.data)) {
        return sendJson(response, 422, { error: 'data-shape-unsupported' }, origin);
      }

      const fingerprint = createHash('sha256')
        .update(JSON.stringify({ clientId: client.clientId, baseRevision: payload.baseRevision, data: nextData }))
        .digest('hex');

      const result = await serializeWrite(async () => {
        const existing = store.receipts.find((item) => item.requestId === payload.requestId);
        if (existing) {
          if (existing.clientId !== client.clientId || existing.fingerprint !== fingerprint) {
            return { status: 409, body: statePayload(store, { error: 'idempotency-key-reused' }) };
          }
          if (existing.status === 409) {
            return { status: 409, body: statePayload(store, { error: existing.reason ?? 'revision-conflict', duplicate: true }) };
          }
          return { status: 200, body: statePayload(store, { duplicate: true, committedRevision: existing.revision }) };
        }

        if (payload.baseRevision !== store.revision) {
          const receipt = {
            requestId: payload.requestId,
            clientId: client.clientId,
            fingerprint,
            status: 409,
            revision: store.revision,
            reason: 'revision-conflict',
          };
          const nextStore = { ...store, receipts: appendReceipt(store.receipts, receipt) };
          await writeStoreAtomically(dataDir, filePath, nextStore, generateId, now);
          store = nextStore;
          return { status: 409, body: statePayload(store, { error: 'revision-conflict' }) };
        }

        const changed = !isDeepStrictEqual(nextData, store.data);
        const committedRevision = changed ? store.revision + 1 : store.revision;
        const receipt = {
          requestId: payload.requestId,
          clientId: client.clientId,
          fingerprint,
          status: 200,
          revision: committedRevision,
        };
        const nextStore = {
          ...store,
          revision: committedRevision,
          data: changed ? nextData : store.data,
          receipts: appendReceipt(store.receipts, receipt),
        };
        await writeStoreAtomically(dataDir, filePath, nextStore, generateId, now);
        store = nextStore;
        return { status: 200, body: statePayload(store, { duplicate: false, committedRevision }) };
      });
      return sendJson(response, result.status, result.body, origin);
    })().catch((error) => {
      if (response.headersSent) {
        response.destroy();
        return;
      }
      const status = error instanceof RequestError ? error.status : 500;
      sendJson(response, status, { error: error instanceof RequestError ? error.code : 'internal-error' });
    });
  });

  await new Promise((resolveListen, rejectListen) => {
    const onError = (error) => rejectListen(error);
    server.once('error', onError);
    server.listen(port, host, () => {
      server.off('error', onError);
      const address = server.address();
      if (!address || typeof address === 'string') return rejectListen(new Error('无法确认回环监听端口。'));
      expectedHost = `${host}:${address.port}`;
      resolveListen();
    });
  });

  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('共享服务监听失败。');
  return {
    server,
    dataDir,
    dataFile: filePath,
    host,
    port: address.port,
    url: `http://${host}:${address.port}`,
    close: () => new Promise((resolveClose, rejectClose) => server.close((error) => error ? rejectClose(error) : resolveClose())),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const configuredDataDir = process.env.PROMPT_BOX_SYNC_DATA_DIR;
    const dataDir = configuredDataDir ? resolve(configuredDataDir) : DEFAULT_DATA_DIR;
    const service = await createSyncService({ dataDir });
    console.log(`Prompt-Box 同机共享试验服务已启动：http://${service.host}:${service.port}`);
    console.log(`隔离数据目录：${service.dataDir}`);
    console.log('仅接受两个试验扩展来源；按 Ctrl+C 停止。');
    const stop = () => void service.close().finally(() => process.exit(0));
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  } catch (error) {
    console.error(`Prompt-Box 同机共享试验服务未启动：${error instanceof Error ? error.message : '未知错误'}`);
    process.exitCode = 1;
  }
}
