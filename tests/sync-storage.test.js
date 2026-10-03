import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createSyncService } from '../tools/local-sync/server.mjs';
import { createSharedStorageAdapter } from '../src/infra/sync-storage.ts';
import { SYNC_CREDENTIAL_KEY } from '../src/infra/sync-pairing.ts';
import { createSyncPairingController } from '../src/infra/sync-pairing.ts';
import { restoreBackupIfUnchanged } from '../src/domain/backup.ts';
import { SCHEMA_VERSION } from '../src/shared/constants.ts';
import { SYNC_CLIENTS, SYNC_PROTOCOL_VERSION } from '../src/shared/sync-targets.ts';

const credentialsByService = new WeakMap();

function memoryStorage() {
  const values = new Map();
  return {
    async get(key) {
      return values.has(key) ? { [key]: structuredClone(values.get(key)) } : {};
    },
    async set(items) {
      for (const [key, value] of Object.entries(items)) values.set(key, structuredClone(value));
    },
    async remove(key) { values.delete(key); },
    has(key) { return values.has(key); },
  };
}

function prompt(id, content) {
  return { id, title: id, content, folderId: null, tags: [], createdAt: 1, updatedAt: 1 };
}

function data(prompts = []) {
  return { version: SCHEMA_VERSION, prompts, folders: [] };
}

function sharedLock() {
  let tail = Promise.resolve();
  return async (callback) => {
    const previous = tail;
    let release;
    tail = new Promise((resolve) => { release = resolve; });
    await previous;
    try {
      return await callback();
    } finally {
      release();
    }
  };
}

async function withService(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'prompt-box-adapter-'));
  const service = await createSyncService({ dataDir, port: 0, logger: { log() {} } });
  const identity = (clientId) => ({
    clientId,
    marker: SYNC_CLIENTS[clientId].marker,
    protocolVersion: SYNC_PROTOCOL_VERSION,
  });
  const requestPairing = (clientId, route, payload = {}) => fetch(`${service.url}${route}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Origin: SYNC_CLIENTS[clientId].origin },
    body: JSON.stringify({ ...identity(clientId), ...payload }),
  });
  const credentials = new Map();
  const start = await requestPairing('chrome-sync', '/v1/pair/start');
  const chromePair = await start.json();
  credentials.set('chrome-sync', chromePair.credential);
  const joinResponse = await requestPairing('gpt-sync', '/v1/pair/join', { invitation: chromePair.invitation });
  const gptPair = await joinResponse.json();
  credentials.set('gpt-sync', gptPair.credential);
  credentialsByService.set(service, credentials);
  t.after(async () => {
    await service.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  return service;
}

function adapter(service, clientId, localStorage, extra = {}) {
  void localStorage.set({ [SYNC_CREDENTIAL_KEY]: credentialsByService.get(service).get(clientId) });
  const { fetcher: transport = fetch, ...otherOptions } = extra;
  return createSharedStorageAdapter({
    clientId,
    extensionId: SYNC_CLIENTS[clientId].extensionId,
    apiBase: service.url,
    localStorage,
    pollIntervalMs: 20,
    fetcher: (url, init) => transport(url, {
      ...init,
      headers: { ...init?.headers, Origin: SYNC_CLIENTS[clientId].origin },
    }),
    ...otherOptions,
  });
}

test('新写入会通过轮询自动到达另一端', async (t) => {
  const service = await withService(t);
  const chrome = adapter(service, 'chrome-sync', memoryStorage());
  const gpt = adapter(service, 'gpt-sync', memoryStorage());
  let resolveSeen;
  const seen = new Promise((resolve) => { resolveSeen = resolve; });
  const unsubscribe = gpt.onDataChanged((current) => {
    if (current.prompts.some((item) => item.id === 'shared-1')) resolveSeen(current);
  });
  t.after(unsubscribe);

  await chrome.updateData((current) => ({ ...current, prompts: [...current.prompts, prompt('shared-1', '假数据自动刷新')] }));
  const received = await Promise.race([
    seen,
    new Promise((_, reject) => setTimeout(() => reject(new Error('另一端未在轮询周期内刷新')), 1500)),
  ]);
  assert.equal(received.prompts[0].content, '假数据自动刷新');
  assert.equal(gpt.getStatus().state, 'online');
});

test('配对控制器把每端设备凭据留在本地，可轮换另一端且撤销后无法读取', async (t) => {
  const service = await withService(t);
  const chromeStorage = memoryStorage();
  const gptStorage = memoryStorage();
  const credentials = credentialsByService.get(service);
  await chromeStorage.set({ [SYNC_CREDENTIAL_KEY]: credentials.get('chrome-sync') });
  const fetchFor = (clientId) => (url, init) => fetch(url, {
    ...init,
    headers: { ...init?.headers, Origin: SYNC_CLIENTS[clientId].origin },
  });
  let prepareCalls = 0;
  const chromePairing = createSyncPairingController({
    clientId: 'chrome-sync', extensionId: SYNC_CLIENTS['chrome-sync'].extensionId,
    apiBase: service.url, localStorage: chromeStorage, fetcher: fetchFor('chrome-sync'),
    prepareStorage: async () => { prepareCalls += 1; },
  });
  const gptPairing = createSyncPairingController({
    clientId: 'gpt-sync', extensionId: SYNC_CLIENTS['gpt-sync'].extensionId,
    apiBase: service.url, localStorage: gptStorage, fetcher: fetchFor('gpt-sync'),
  });

  const previousGptCredential = credentials.get('gpt-sync');
  assert.equal((await chromePairing.status()).paired, true);
  const invite = await chromePairing.createInvite();
  await gptPairing.join(invite.code);
  const updatedGptCredential = (await gptStorage.get(SYNC_CREDENTIAL_KEY))[SYNC_CREDENTIAL_KEY];
  assert.notEqual(updatedGptCredential, previousGptCredential);
  assert.equal((await gptPairing.status()).paired, true);
  assert.ok(prepareCalls >= 2);

  const revokedRequest = await fetchFor('gpt-sync')(`${service.url}/v1/state`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${previousGptCredential}` },
    body: JSON.stringify({
      clientId: 'gpt-sync', marker: SYNC_CLIENTS['gpt-sync'].marker, protocolVersion: SYNC_PROTOCOL_VERSION,
    }),
  });
  assert.equal(revokedRequest.status, 401);

  await gptPairing.revoke();
  assert.equal((await gptStorage.get(SYNC_CREDENTIAL_KEY))[SYNC_CREDENTIAL_KEY], undefined);
  const deniedState = await gptPairing.status();
  assert.equal(deniedState.paired, false);
});

test('提交响应丢失时用相同 requestId 重试，服务端去重并清除待确认项', async (t) => {
  const service = await withService(t);
  const local = memoryStorage();
  let loseOneResponse = true;
  const fetcher = async (url, init) => {
    const response = await fetch(url, init);
    if (url.endsWith('/v1/commit') && loseOneResponse) {
      loseOneResponse = false;
      throw new TypeError('模拟已提交但响应丢失');
    }
    return response;
  };
  const chrome = adapter(service, 'chrome-sync', local, { fetcher });
  const result = await chrome.updateData((current) => ({ ...current, prompts: [prompt('retry-1', '可重试假数据')] }));
  assert.equal(result.prompts.length, 1);
  assert.equal(chrome.getStatus().revision, 1);
  assert.equal(chrome.getStatus().pending, false);
  assert.equal(local.has('promptBox.sync.pending.v1'), false);
  const remote = adapter(service, 'gpt-sync', memoryStorage());
  assert.deepEqual(await remote.readData(), result);
});

test('迁移预览后另一客户端有新写入时拒绝恢复且 revision 不递增', async (t) => {
  const service = await withService(t);
  const chrome = adapter(service, 'chrome-sync', memoryStorage());
  const gpt = adapter(service, 'gpt-sync', memoryStorage());
  const previewSnapshot = data([prompt('current', '预览时的数据')]);
  await chrome.updateData(() => previewSnapshot);
  const newer = await gpt.updateData((current) => ({
    ...current,
    prompts: [...current.prompts, prompt('newer', '预览后另一端新增')],
  }));

  await assert.rejects(chrome.updateData((current) => restoreBackupIfUnchanged(
    current,
    previewSnapshot,
    data([prompt('backup', '不得覆盖')]),
  )), /预览后数据已变化/);

  assert.deepEqual(await gpt.readData(), newer);
  assert.equal(gpt.getStatus().revision, 2);
});

test('待确认请求可另存其数据草稿，不向界面暴露本机 requestId 或 revision', async () => {
  const local = memoryStorage();
  const draft = data([prompt('pending', '需要保留的假草稿')]);
  await local.set({ 'promptBox.sync.pending.v1': {
    requestId: 'ec78b274-46f0-4b88-85e4-a0a43e5c2222',
    baseRevision: 7,
    data: draft,
  } });
  const service = createSharedStorageAdapter({
    clientId: 'chrome-sync',
    extensionId: SYNC_CLIENTS['chrome-sync'].extensionId,
    localStorage: local,
    fetcher: async () => { throw new TypeError('本测试不发网络请求'); },
  });
  assert.deepEqual(await service.getPendingDraft(), draft);
});

test('服务离线时状态明确且更新函数不会被当作已保存', async () => {
  const local = memoryStorage();
  const offline = createSharedStorageAdapter({
    clientId: 'chrome-sync',
    extensionId: SYNC_CLIENTS['chrome-sync'].extensionId,
    apiBase: 'http://127.0.0.1:1',
    localStorage: local,
    fetcher: async () => { throw new TypeError('模拟离线'); },
  });
  let changeCalled = false;
  await assert.rejects(offline.updateData((current) => {
    changeCalled = true;
    return { ...current, prompts: [prompt('offline', '不可保存')] };
  }), /无法连接同机共享服务/);
  assert.equal(changeCalled, false);
  assert.equal(offline.getStatus().state, 'offline');
  assert.equal(offline.getStatus().pending, false);
});

test('跨页面恢复锁避免旧响应清除新待确认草稿，离线后可重试', async () => {
  const local = memoryStorage();
  const lock = sharedLock();
  const oldDraft = data([prompt('old-pending', '旧恢复请求假数据')]);
  await local.set({ 'promptBox.sync.pending.v1': {
    requestId: 'old-response',
    baseRevision: 0,
    data: oldDraft,
  } });

  let serverState = {
    protocolVersion: SYNC_PROTOCOL_VERSION,
    storeFormatVersion: 2,
    schemaVersion: SCHEMA_VERSION,
    revision: 0,
    data: data(),
  };
  let oldCommitCalls = 0;
  let newCommitCalls = 0;
  let remainingNewFailures = 2;
  let announceOldCommit;
  let releaseOldResponse;
  const oldCommitStarted = new Promise((resolve) => { announceOldCommit = resolve; });
  const oldResponseGate = new Promise((resolve) => { releaseOldResponse = resolve; });
  const respond = (value, status = 200) => new Response(JSON.stringify(value), { status });
  const fetcher = async (url, init) => {
    if (url.endsWith('/v1/state')) return respond(serverState);
    if (!url.endsWith('/v1/commit')) return respond({ error: 'not-found' }, 404);

    const pending = JSON.parse(init.body);
    if (pending.requestId === 'old-response') {
      oldCommitCalls += 1;
      serverState = {
        ...serverState,
        revision: 1,
        data: pending.data,
      };
      const acceptedState = structuredClone(serverState);
      if (oldCommitCalls === 1) {
        announceOldCommit();
        await oldResponseGate;
      }
      return respond(acceptedState);
    }

    newCommitCalls += 1;
    if (remainingNewFailures > 0) {
      remainingNewFailures -= 1;
      throw new TypeError('模拟新请求暂时离线');
    }
    if (pending.baseRevision !== serverState.revision) return respond(serverState, 409);
    serverState = {
      ...serverState,
      revision: serverState.revision + 1,
      data: pending.data,
    };
    return respond(serverState);
  };

  const createAdapter = () => createSharedStorageAdapter({
    clientId: 'chrome-sync',
    extensionId: SYNC_CLIENTS['chrome-sync'].extensionId,
    localStorage: local,
    fetcher,
    runExclusive: lock,
  });
  const recoveringPage = createAdapter();
  const editingPage = createAdapter();

  const oldRead = recoveringPage.readData();
  await oldCommitStarted;
  const newPrompt = prompt('new-pending', '新写入假数据');
  const newWrite = editingPage.updateData((current) => ({
    ...current,
    prompts: [...current.prompts, newPrompt],
  }));

  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(oldCommitCalls, 1, '新页面必须等旧恢复结束，不能并行恢复同一 requestId');
  assert.equal(newCommitCalls, 0, '共享锁释放前不能开始新提交');
  assert.equal((await local.get('promptBox.sync.pending.v1'))['promptBox.sync.pending.v1'].requestId, 'old-response');

  releaseOldResponse();
  assert.deepEqual(await oldRead, oldDraft);
  await assert.rejects(newWrite, /保存结果未确认/);

  const pendingAfterFailure = (await local.get('promptBox.sync.pending.v1'))['promptBox.sync.pending.v1'];
  assert.ok(pendingAfterFailure);
  assert.notEqual(pendingAfterFailure.requestId, 'old-response');
  assert.deepEqual(pendingAfterFailure.data.prompts.map((item) => item.id), ['old-pending', 'new-pending']);
  assert.equal(editingPage.getStatus().pending, true);
  assert.deepEqual(await editingPage.getPendingDraft(), pendingAfterFailure.data);

  remainingNewFailures = 0;
  await editingPage.retryPending();
  assert.equal((await local.get('promptBox.sync.pending.v1'))['promptBox.sync.pending.v1'], undefined);
  assert.equal(editingPage.getStatus().pending, false);
  assert.deepEqual(serverState.data.prompts.map((item) => item.id), ['old-pending', 'new-pending']);
  assert.equal(serverState.revision, 2);
});

test('清理已确认请求时只移除 requestId 相同的待确认项', async () => {
  const pendingKey = 'promptBox.sync.pending.v1';
  const local = memoryStorage();
  const oldDraft = data([prompt('confirmed', '已确认的假数据')]);
  const newerDraft = data([prompt('newer-pending', '后来写入的假草稿')]);
  await local.set({ [pendingKey]: {
    requestId: 'confirmed-request',
    baseRevision: 0,
    data: oldDraft,
  } });

  let pendingReads = 0;
  const storageWithInterleaving = {
    ...local,
    async get(key) {
      if (key === pendingKey && ++pendingReads === 2) {
        // 模拟共享锁之外的存储变化，验证清理守卫仍会保住新请求。
        await local.set({ [pendingKey]: {
          requestId: 'newer-request',
          baseRevision: 1,
          data: newerDraft,
        } });
      }
      return local.get(key);
    },
  };
  const acceptedState = {
    protocolVersion: SYNC_PROTOCOL_VERSION,
    storeFormatVersion: 2,
    schemaVersion: SCHEMA_VERSION,
    revision: 1,
    data: oldDraft,
  };
  const adapterUnderTest = createSharedStorageAdapter({
    clientId: 'chrome-sync',
    extensionId: SYNC_CLIENTS['chrome-sync'].extensionId,
    localStorage: storageWithInterleaving,
    fetcher: async () => new Response(JSON.stringify(acceptedState), { status: 200 }),
  });

  assert.deepEqual(await adapterUnderTest.readData(), oldDraft);
  const pending = (await local.get(pendingKey))[pendingKey];
  assert.equal(pending.requestId, 'newer-request');
  assert.deepEqual(await adapterUnderTest.getPendingDraft(), newerDraft);
  assert.equal(adapterUnderTest.getStatus().pending, true);
});
