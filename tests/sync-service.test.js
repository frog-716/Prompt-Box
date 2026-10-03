import assert from 'node:assert/strict';
import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import test from 'node:test';

import { createSyncService, MAX_BACKUPS, MAX_BODY_BYTES, MAX_RECEIPTS, PAIRING_INVITE_TTL_MS } from '../tools/local-sync/server.mjs';
import { SCHEMA_VERSION } from '../src/shared/constants.ts';
import { SYNC_CLIENTS, SYNC_PROTOCOL_VERSION, SYNC_STORE_FORMAT_VERSION } from '../src/shared/sync-targets.ts';

const clients = Object.keys(SYNC_CLIENTS);
const testCredentials = new WeakMap();
const originFor = (clientId) => SYNC_CLIENTS[clientId].origin;
const identityFor = (clientId) => ({
  clientId,
  marker: SYNC_CLIENTS[clientId].marker,
  protocolVersion: SYNC_PROTOCOL_VERSION,
});

function prompt(id, content) {
  return { id, title: id, content, folderId: null, tags: [], createdAt: 1, updatedAt: 1 };
}

function data(prompts = []) {
  return { version: SCHEMA_VERSION, prompts, folders: [] };
}

function findUnusedProcessId() {
  for (let pid = process.pid + 1; pid < process.pid + 10_000; pid += 1) {
    try {
      process.kill(pid, 0);
    } catch (error) {
      if (error?.code === 'ESRCH') return pid;
    }
  }
  throw new Error('无法为崩溃临时文件测试找到未使用的进程号。');
}

async function withService(t, callback, { existingDir, pair = true, serviceOptions = {} } = {}) {
  const dataDir = existingDir ?? await mkdtemp(join(tmpdir(), 'prompt-box-sync-'));
  const service = await createSyncService({ dataDir, port: 0, logger: { log() {} }, ...serviceOptions });
  const credentials = pair ? await pairService(service) : new Map();
  if (!pair) testCredentials.set(service, credentials);
  t.after(async () => {
    await service.close();
    if (!existingDir) await rm(dataDir, { recursive: true, force: true });
  });
  return callback(service, dataDir, credentials);
}

async function pairService(service) {
  const credentials = new Map();
  const first = await call(service, clients[0], '/v1/pair/start', {}, { auth: false });
  assert.equal(first.status, 200);
  const firstPair = await first.json();
  credentials.set(clients[0], firstPair.credential);
  testCredentials.set(service, credentials);
  const second = await call(service, clients[1], '/v1/pair/join', { invitation: firstPair.invitation }, { auth: false });
  assert.equal(second.status, 200);
  credentials.set(clients[1], (await second.json()).credential);
  return credentials;
}

async function call(service, clientId, route, payload = {}, options = {}) {
  const headers = { 'content-type': 'application/json', ...(options.headers ?? {}) };
  if (options.origin !== null) headers.Origin = options.origin ?? originFor(clientId);
  const credential = testCredentials.get(service)?.get(clientId);
  if (options.auth !== false && credential && !headers.Authorization && !headers.authorization) {
    headers.Authorization = `Bearer ${credential}`;
  }
  return fetch(`${service.url}${route}`, {
    method: options.method ?? 'POST',
    headers,
    ...(options.body !== undefined ? { body: options.body } : { body: JSON.stringify({ ...identityFor(clientId), ...payload }) }),
  });
}

function postWithHostOverride(service, host, clientId) {
  return new Promise((resolveRequest, rejectRequest) => {
    const request = httpRequest({
      hostname: '127.0.0.1',
      port: service.port,
      path: '/v1/state',
      method: 'POST',
      headers: {
        Host: host,
        Origin: originFor(clientId),
        'Content-Type': 'application/json',
      },
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolveRequest({ status: response.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    });
    request.once('error', rejectRequest);
    request.end(JSON.stringify(identityFor(clientId)));
  });
}

test('服务只绑定回环地址，严格校验 Host、Origin、客户端标记和协议版本', async (t) => {
  await withService(t, async (service) => {
    const health = await fetch(`${service.url}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), {
      ok: true,
      protocolVersion: SYNC_PROTOCOL_VERSION,
      storeFormatVersion: SYNC_STORE_FORMAT_VERSION,
    });

    const noOrigin = await call(service, clients[0], '/v1/state', {}, { origin: null });
    assert.equal(noOrigin.status, 403);
    const untrustedOrigin = await call(service, clients[0], '/v1/state', {}, { origin: 'https://untrusted.example' });
    assert.equal(untrustedOrigin.status, 403);

    const wrongMarker = await call(service, clients[0], '/v1/state', { marker: SYNC_CLIENTS[clients[1]].marker });
    assert.equal(wrongMarker.status, 400);
    const oldProtocol = await call(service, clients[0], '/v1/state', { protocolVersion: SYNC_PROTOCOL_VERSION + 1 });
    assert.equal(oldProtocol.status, 426);

    const wrongHost = await postWithHostOverride(service, 'localhost', clients[0]);
    assert.equal(wrongHost.status, 421);
    const oldGet = await fetch(`${service.url}/v1/state`, {
      method: 'GET', headers: { Origin: originFor(clients[0]) },
    });
    assert.equal(oldGet.status, 405);

    const tooLarge = await call(service, clients[0], '/v1/state', {}, {
      body: JSON.stringify({ ...identityFor(clients[0]), padding: 'x'.repeat(MAX_BODY_BYTES) }),
    });
    assert.equal(tooLarge.status, 413);
  });
});

test('预检和共享读取只允许两个固定测试来源', async (t) => {
  await withService(t, async (service) => {
    for (const clientId of clients) {
      const preflight = await fetch(`${service.url}/v1/state`, {
        method: 'OPTIONS',
        headers: {
          Origin: originFor(clientId),
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'authorization, content-type',
        },
      });
      assert.equal(preflight.status, 204);
      assert.equal(preflight.headers.get('access-control-allow-origin'), originFor(clientId));
      assert.match(preflight.headers.get('access-control-allow-headers'), /authorization/i);

      const state = await call(service, clientId, '/v1/state');
      assert.equal(state.status, 200);
      const body = await state.json();
      assert.equal(body.revision, 0);
      assert.deepEqual(body.data, data());
    }

    const deniedPreflight = await fetch(`${service.url}/v1/state`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://untrusted.example',
        'access-control-request-method': 'POST',
      },
    });
    assert.equal(deniedPreflight.status, 403);
  });
});

test('并发写入冲突可见，删除不会被旧快照复活', async (t) => {
  await withService(t, async (service) => {
    const concurrent = await Promise.all([
      call(service, clients[0], '/v1/commit', {
        requestId: randomUUID(), baseRevision: 0, data: data([prompt('concurrent-a', 'A')]),
      }),
      call(service, clients[1], '/v1/commit', {
        requestId: randomUUID(), baseRevision: 0, data: data([prompt('concurrent-b', 'B')]),
      }),
    ]);
    assert.deepEqual(concurrent.map((response) => response.status).sort(), [200, 409]);
    const concurrentState = await call(service, clients[0], '/v1/state');
    assert.equal((await concurrentState.json()).data.prompts.length, 1);

    // 用独立服务夹具覆盖删除后旧快照重试，确认不会复活。
  });
});

test('删除不会被另一端的旧快照复活', async (t) => {
  await withService(t, async (service) => {
    const initial = data([prompt('p1', 'original')]);
    const seed = await call(service, clients[0], '/v1/commit', {
      requestId: randomUUID(), baseRevision: 0, data: initial,
    });
    assert.equal(seed.status, 200);

    const deleteCommit = await call(service, clients[0], '/v1/commit', {
      requestId: randomUUID(), baseRevision: 1, data: data(),
    });
    assert.equal(deleteCommit.status, 200);

    const staleUpdate = await call(service, clients[1], '/v1/commit', {
      requestId: randomUUID(), baseRevision: 1, data: data([prompt('p1', 'stale edit')]),
    });
    assert.equal(staleUpdate.status, 409);
    const current = await call(service, clients[0], '/v1/state');
    assert.deepEqual((await current.json()).data.prompts, []);
  });
});

test('两个来源顺序写入后都能读取同一份假数据', async (t) => {
  await withService(t, async (service) => {
    for (const [index, clientId] of clients.entries()) {
      const current = await call(service, clientId, '/v1/state');
      const state = await current.json();
      const committed = await call(service, clientId, '/v1/commit', {
        requestId: randomUUID(),
        baseRevision: state.revision,
        data: data([...state.data.prompts, prompt(`p${index + 1}`, `${clientId} fake marker`)]),
      });
      assert.equal(committed.status, 200);
    }
    for (const clientId of clients) {
      const read = await call(service, clientId, '/v1/state');
      assert.equal(read.status, 200);
      assert.deepEqual((await read.json()).data.prompts.map((item) => item.content), [
        'chrome-sync fake marker', 'gpt-sync fake marker',
      ]);
    }
  });
});

test('request id 跨服务重启去重，重复或丢失响应重试不会再次递增 revision', async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), 'prompt-box-sync-restart-'));
  let service;
  t.after(async () => {
    if (service?.server.listening) await service.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  service = await createSyncService({ dataDir, port: 0, logger: { log() {} } });
  const credentials = await pairService(service);
  const mutation = {
    ...identityFor(clients[0]),
    requestId: randomUUID(),
    baseRevision: 0,
    data: data([prompt('p1', 'persistent dummy')]),
  };
  const first = await call(service, clients[0], '/v1/commit', mutation);
  assert.equal(first.status, 200);
  assert.equal((await first.json()).revision, 1);
  const duplicate = await call(service, clients[0], '/v1/commit', mutation);
  assert.equal(duplicate.status, 200);
  assert.equal((await duplicate.json()).duplicate, true);

  await service.close();
  service = await createSyncService({ dataDir, port: 0, logger: { log() {} } });
  testCredentials.set(service, credentials);
  const restartedState = await call(service, clients[1], '/v1/state');
  const snapshot = await restartedState.json();
  assert.equal(snapshot.revision, 1);
  assert.deepEqual(snapshot.data, mutation.data);
  const retryAfterRestart = await call(service, clients[0], '/v1/commit', mutation);
  assert.equal(retryAfterRestart.status, 200);
  assert.equal((await retryAfterRestart.json()).revision, 1);
  await service.close();
});

test('未知或损坏的持久数据文件启动失败且原文件不被覆盖', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'prompt-box-sync-invalid-'));
  const filePath = resolve(dataDir, 'library.json');
  const saved = '{"formatVersion":99,"private":"dummy-only"}\n';
  await writeFile(filePath, saved, 'utf8');
  await assert.rejects(createSyncService({ dataDir, port: 0, logger: { log() {} } }), /版本不受支持/);
  assert.equal(await readFile(filePath, 'utf8'), saved);
  await rm(dataDir, { recursive: true, force: true });
});

test('每次持久写入前保留私有的原始快照，自动轮换到最近 20 份', async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), 'prompt-box-sync-backups-'));
  const service = await createSyncService({ dataDir, port: 0, logger: { log() {} } });
  t.after(async () => {
    if (service.server.listening) await service.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  await pairService(service);

  const dataFile = join(dataDir, 'library.json');
  const backupDir = join(dataDir, 'Backups');
  const previousBytes = await readFile(dataFile);
  const invite = await call(service, clients[0], '/v1/pair/invite');
  assert.equal(invite.status, 200);
  const backupNames = await readdir(backupDir);
  assert.ok(backupNames.some((name) => name.startsWith('library-') && name.endsWith('.json')));
  const matchingBackup = await Promise.all(backupNames.map((name) => readFile(join(backupDir, name))));
  assert.ok(matchingBackup.some((bytes) => bytes.equals(previousBytes)));
  assert.equal((await stat(backupDir)).mode & 0o777, 0o700);
  for (const name of backupNames) assert.equal((await stat(join(backupDir, name))).mode & 0o777, 0o600);

  for (let index = 0; index < MAX_BACKUPS + 5; index += 1) {
    const response = await call(service, clients[0], '/v1/pair/invite');
    assert.equal(response.status, 200);
  }
  assert.equal((await readdir(backupDir)).length, MAX_BACKUPS);
});

test('重启后隔离严格匹配的崩溃残留临时文件并允许继续提交', async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), 'prompt-box-sync-stale-backup-temp-'));
  let service = await createSyncService({ dataDir, port: 0, logger: { log() {} } });
  t.after(async () => {
    if (service?.server.listening) await service.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  const credentials = await pairService(service);
  const backupDir = join(dataDir, 'Backups');
  const staleName = `library-${String(Date.now()).padStart(13, '0')}-${randomUUID()}.json.${findUnusedProcessId()}.tmp`;
  const stalePath = join(backupDir, staleName);
  const partialSnapshot = Buffer.from('isolated partial crash snapshot');
  await service.close();
  await writeFile(stalePath, partialSnapshot, { mode: 0o600 });

  service = await createSyncService({ dataDir, port: 0, logger: { log() {} } });
  testCredentials.set(service, credentials);
  const retryAfterRestart = await call(service, clients[0], '/v1/pair/invite');
  assert.equal(retryAfterRestart.status, 200);

  await assert.rejects(lstat(stalePath), { code: 'ENOENT' });
  const quarantineRoot = join(backupDir, 'Quarantine');
  assert.equal((await stat(quarantineRoot)).mode & 0o777, 0o700);
  const batches = await readdir(quarantineRoot);
  assert.equal(batches.length, 1);
  const quarantineBatch = join(quarantineRoot, batches[0]);
  assert.equal((await stat(quarantineBatch)).mode & 0o777, 0o700);
  const quarantinedPath = join(quarantineBatch, staleName);
  assert.deepEqual(await readFile(quarantinedPath), partialSnapshot);
  assert.equal((await stat(quarantinedPath)).mode & 0o777, 0o600);
});

test('未知备份文件与匹配名称的符号链接保留原位并阻止写入', async (t) => {
  await withService(t, async (service, dataDir) => {
    const backupDir = join(dataDir, 'Backups');
    const dataPath = join(dataDir, 'library.json');
    const originalStore = await readFile(dataPath);
    const unknownPath = join(backupDir, 'unrecognized.keep');
    const unknownBytes = Buffer.from('unknown file must remain untouched');
    await writeFile(unknownPath, unknownBytes, { mode: 0o600 });

    const blockedByUnknown = await call(service, clients[0], '/v1/pair/invite');
    assert.equal(blockedByUnknown.status, 500);
    assert.deepEqual(await readFile(unknownPath), unknownBytes);
    assert.deepEqual(await readFile(dataPath), originalStore);

    await rm(unknownPath);
    const targetPath = join(dataDir, 'symlink-target.keep');
    const targetBytes = Buffer.from('symlink target must not be followed or deleted');
    await writeFile(targetPath, targetBytes, { mode: 0o600 });
    const symlinkName = `library-${String(Date.now()).padStart(13, '0')}-${randomUUID()}.json.${findUnusedProcessId()}.tmp`;
    const symlinkPath = join(backupDir, symlinkName);
    await symlink(targetPath, symlinkPath);

    const blockedBySymlink = await call(service, clients[0], '/v1/pair/invite');
    assert.equal(blockedBySymlink.status, 500);
    assert.equal((await lstat(symlinkPath)).isSymbolicLink(), true);
    assert.deepEqual(await readFile(targetPath), targetBytes);
    assert.deepEqual(await readFile(dataPath), originalStore);
  });
});

test('wx路径碰撞不会删除未由当前写入创建的备份临时文件', async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), 'prompt-box-sync-backup-eexist-'));
  let service = await createSyncService({ dataDir, port: 0, logger: { log() {} } });
  t.after(async () => {
    if (service?.server.listening) await service.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  const credentials = await pairService(service);
  await service.close();

  const timestamp = 1_760_000_000_000;
  const collisionId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
  const collisionPath = join(dataDir, 'Backups', `library-${timestamp}-${collisionId}.json.${process.pid}.tmp`);
  const collisionBytes = Buffer.from('pre-existing collision must remain untouched');
  await writeFile(collisionPath, collisionBytes, { mode: 0o600 });
  const originalStore = await readFile(join(dataDir, 'library.json'));
  const ids = [collisionId];
  service = await createSyncService({
    dataDir,
    port: 0,
    logger: { log() {} },
    now: () => timestamp,
    generateId: () => ids.shift() ?? randomUUID(),
  });
  testCredentials.set(service, credentials);

  const blocked = await call(service, clients[0], '/v1/pair/invite');
  assert.equal(blocked.status, 500);
  assert.deepEqual(await readFile(collisionPath), collisionBytes);
  assert.deepEqual(await readFile(join(dataDir, 'library.json')), originalStore);
});

test('wx主库临时路径碰撞不会删除未由当前写入创建的文件', async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), 'prompt-box-sync-store-eexist-'));
  let service = await createSyncService({ dataDir, port: 0, logger: { log() {} } });
  t.after(async () => {
    if (service?.server.listening) await service.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  const credentials = await pairService(service);
  await service.close();

  const timestamp = 1_760_000_000_000;
  const backupId = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';
  const collisionId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
  const collisionPath = join(dataDir, `library.json.${process.pid}.${collisionId}.tmp`);
  const collisionBytes = Buffer.from('pre-existing collision must remain untouched');
  await writeFile(collisionPath, collisionBytes, { mode: 0o600 });
  const originalStore = await readFile(join(dataDir, 'library.json'));
  const ids = [backupId, collisionId];
  service = await createSyncService({
    dataDir,
    port: 0,
    logger: { log() {} },
    now: () => timestamp,
    generateId: () => ids.shift() ?? randomUUID(),
  });
  testCredentials.set(service, credentials);

  const blocked = await call(service, clients[0], '/v1/pair/invite');
  assert.equal(blocked.status, 500);
  assert.deepEqual(await readFile(collisionPath), collisionBytes);
  assert.deepEqual(await readFile(join(dataDir, 'library.json')), originalStore);
});

test('快照轮换前验证属主和 0600 权限，异常快照保留并阻止轮换', async (t) => {
  await withService(t, async (service, dataDir) => {
    const backupDir = join(dataDir, 'Backups');
    const validNames = [];
    for (let index = 2; index < MAX_BACKUPS + 3; index += 1) {
      const name = `library-${String(index).padStart(13, '0')}-${randomUUID()}.json`;
      validNames.push(name);
      await writeFile(join(backupDir, name), Buffer.from(`fixture-${index}`), { mode: 0o600 });
    }
    const invalidName = `library-${String(1).padStart(13, '0')}-${randomUUID()}.json`;
    const invalidPath = join(backupDir, invalidName);
    const invalidBytes = Buffer.from('permission-invalid fixture remains');
    await writeFile(invalidPath, invalidBytes, { mode: 0o640 });
    await chmod(invalidPath, 0o640);
    assert.equal((await stat(invalidPath)).mode & 0o777, 0o640);

    const originalStore = await readFile(join(dataDir, 'library.json'));
    const blocked = await call(service, clients[0], '/v1/pair/invite');
    assert.equal(blocked.status, 500);
    assert.deepEqual(await readFile(invalidPath), invalidBytes);
    assert.equal((await stat(invalidPath)).mode & 0o777, 0o640);
    assert.deepEqual(await readFile(join(dataDir, 'library.json')), originalStore);
    for (const name of validNames) await stat(join(backupDir, name));
  });
});

test('当前共享数据缺失时拒绝创建空库，并可用已校验快照恢复服务', async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), 'prompt-box-sync-missing-with-backups-'));
  let service = await createSyncService({ dataDir, port: 0, logger: { log() {} } });
  t.after(async () => {
    if (service?.server.listening) await service.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  const credentials = await pairService(service);
  await service.close();
  const dataFile = join(dataDir, 'library.json');
  const backupDir = join(dataDir, 'Backups');
  const backupNames = (await readdir(backupDir)).sort();
  const lastBackup = await readFile(join(backupDir, backupNames.at(-1)));
  await rm(dataFile);
  await assert.rejects(
    createSyncService({ dataDir, port: 0, logger: { log() {} } }),
    /共享数据文件缺失但自动备份仍在/,
  );
  await assert.rejects(stat(dataFile), { code: 'ENOENT' });
  assert.ok((await readdir(backupDir)).length > 0);

  await writeFile(dataFile, lastBackup, { mode: 0o600 });
  service = await createSyncService({ dataDir, port: 0, logger: { log() {} } });
  testCredentials.set(service, credentials);
  const recoveredState = await call(service, clients[0], '/v1/state');
  assert.equal(recoveredState.status, 200);
});

test('旧版隔离服务文件升级容器格式时保留已有共享数据', async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), 'prompt-box-sync-v1-migration-'));
  const filePath = join(dataDir, 'library.json');
  const legacyData = data([prompt('legacy-fake', '保留在隔离服务库中的假数据')]);
  await writeFile(filePath, JSON.stringify({
    formatVersion: 1,
    protocolVersion: 1,
    revision: 7,
    data: legacyData,
    receipts: [],
  }), 'utf8');
  const service = await createSyncService({ dataDir, port: 0, logger: { log() {} } });
  await pairService(service);
  t.after(async () => {
    await service.close();
    await rm(dataDir, { recursive: true, force: true });
  });

  const state = await call(service, clients[0], '/v1/state');
  const snapshot = await state.json();
  assert.equal(state.status, 200);
  assert.equal(snapshot.revision, 7);
  assert.deepEqual(snapshot.data, legacyData);
  const persisted = JSON.parse(await readFile(filePath, 'utf8'));
  assert.equal(persisted.formatVersion, SYNC_STORE_FORMAT_VERSION);
  assert.equal(persisted.protocolVersion, SYNC_PROTOCOL_VERSION);
});

test('服务拒绝跟随隔离目录内的符号链接', async () => {
  const parentDir = await mkdtemp(join(tmpdir(), 'prompt-box-sync-symlink-'));
  const dataDir = join(parentDir, 'data');
  const outsideFile = join(parentDir, 'outside.json');
  await writeFile(outsideFile, '{"doNotRead":"dummy"}', 'utf8');
  await mkdir(dataDir);
  await symlink(outsideFile, join(dataDir, 'library.json'));
  await assert.rejects(createSyncService({ dataDir, port: 0, logger: { log() {} } }), /符号链接/);
  assert.equal(await readFile(outsideFile, 'utf8'), '{"doNotRead":"dummy"}');
  await rm(parentDir, { recursive: true, force: true });
});

test('未配对或错误凭据不能读取、写入，普通网页来源不能创建配对', async (t) => {
  await withService(t, async (service) => {
    const missingRead = await call(service, clients[0], '/v1/state', {}, { auth: false });
    assert.equal(missingRead.status, 401);
    assert.equal((await missingRead.json()).error, 'pairing-required');

    const wrongToken = await call(service, clients[0], '/v1/state', {}, {
      headers: { Authorization: `Bearer ${'A'.repeat(43)}` },
    });
    assert.equal(wrongToken.status, 401);

    const blockedPage = await call(service, clients[0], '/v1/pair/start', {}, {
      auth: false,
      origin: 'https://untrusted.example',
    });
    assert.equal(blockedPage.status, 403);

    const missingWrite = await call(service, clients[0], '/v1/commit', {
      requestId: randomUUID(), baseRevision: 0, data: data([prompt('denied', 'should not persist')]),
    }, { auth: false });
    assert.equal(missingWrite.status, 401);
    const state = await call(service, clients[0], '/v1/pair/status', {}, { auth: false });
    assert.deepEqual(await state.json(), { paired: false, peerPaired: false, pairingInProgress: false });
  }, { pair: false });
});

test('配对码只在 UI 配对流中生成，存储只保留校验值并可抵抗并发创建和重复使用', async (t) => {
  const logLines = [];
  await withService(t, async (service, dataDir) => {
    const starts = await Promise.all([
      call(service, clients[0], '/v1/pair/start', {}, { auth: false }),
      call(service, clients[0], '/v1/pair/start', {}, { auth: false }),
    ]);
    assert.deepEqual(starts.map((response) => response.status).sort(), [200, 409]);
    const accepted = await starts.find((response) => response.status === 200).json();
    const denied = await starts.find((response) => response.status === 409).json();
    assert.equal(denied.error, 'pairing-in-progress');

    const wrong = await call(service, clients[1], '/v1/pair/join', { invitation: 'B'.repeat(43) }, { auth: false });
    assert.equal(wrong.status, 401);

    const concurrentJoin = await Promise.all([
      call(service, clients[1], '/v1/pair/join', { invitation: accepted.invitation }, { auth: false }),
      call(service, clients[1], '/v1/pair/join', { invitation: accepted.invitation }, { auth: false }),
    ]);
    assert.deepEqual(concurrentJoin.map((response) => response.status).sort(), [200, 401]);

    const raw = await readFile(join(dataDir, 'library.json'), 'utf8');
    assert.equal((await stat(dataDir)).mode & 0o777, 0o700);
    assert.equal((await stat(join(dataDir, 'library.json'))).mode & 0o777, 0o600);
    assert.equal(raw.includes(accepted.credential), false);
    assert.equal(raw.includes(accepted.invitation), false);
    const persisted = JSON.parse(raw);
    assert.equal(persisted.credentials.length, 2);
    assert.ok(persisted.credentials.every((entry) => /^[0-9a-f]{64}$/.test(entry.verifier)));
    const logs = logLines.join('\n');
    assert.equal(logs.includes(accepted.credential), false);
    assert.equal(logs.includes(accepted.invitation), false);
  }, { pair: false, serviceOptions: { logger: { log(line) { logLines.push(line); } } } });
});

test('一次性配对码过期后被清除，无法再次使用', async (t) => {
  let clock = 1_000_000;
  await withService(t, async (service) => {
    const started = await call(service, clients[0], '/v1/pair/start', {}, { auth: false });
    const { invitation, expiresAt } = await started.json();
    assert.equal(expiresAt, clock + PAIRING_INVITE_TTL_MS);
    clock = expiresAt;

    const expired = await call(service, clients[1], '/v1/pair/join', { invitation }, { auth: false });
    assert.equal(expired.status, 410);
    assert.equal((await expired.json()).error, 'pairing-invite-expired');
    const retry = await call(service, clients[1], '/v1/pair/join', { invitation }, { auth: false });
    assert.equal(retry.status, 401);
  }, { pair: false, serviceOptions: { now: () => clock } });
});

test('设备凭据可撤销；已配对的另一端可以发码轮换被撤销设备', async (t) => {
  await withService(t, async (service, _dataDir, credentials) => {
    const revoke = await call(service, clients[0], '/v1/pair/revoke');
    assert.equal(revoke.status, 200);
    assert.deepEqual(await revoke.json(), { revoked: true });

    const denied = await call(service, clients[0], '/v1/state');
    assert.equal(denied.status, 401);
    const inviteResponse = await call(service, clients[1], '/v1/pair/invite');
    assert.equal(inviteResponse.status, 200);
    const { invitation } = await inviteResponse.json();
    const joined = await call(service, clients[0], '/v1/pair/join', { invitation }, { auth: false });
    assert.equal(joined.status, 200);
    credentials.set(clients[0], (await joined.json()).credential);
    const restored = await call(service, clients[0], '/v1/state');
    assert.equal(restored.status, 200);
  });
});

test('幂等回执最多保留最近 256 条，过期重试不能覆盖较新 revision', async (t) => {
  await withService(t, async (service, dataDir) => {
    let revision = 0;
    let firstMutation;
    for (let index = 0; index < MAX_RECEIPTS + 1; index += 1) {
      const mutation = {
        requestId: randomUUID(),
        baseRevision: revision,
        data: data([prompt('bounded', `revision-${index}`)]),
      };
      if (index === 0) firstMutation = mutation;
      const response = await call(service, clients[0], '/v1/commit', mutation);
      assert.equal(response.status, 200);
      revision = (await response.json()).revision;
    }
    const persisted = JSON.parse(await readFile(join(dataDir, 'library.json'), 'utf8'));
    assert.equal(persisted.receipts.length, MAX_RECEIPTS);

    const oldRetry = await call(service, clients[0], '/v1/commit', firstMutation);
    assert.equal(oldRetry.status, 409);
    const state = await call(service, clients[0], '/v1/state');
    const current = await state.json();
    assert.equal(current.revision, MAX_RECEIPTS + 1);
    assert.equal(current.data.prompts[0].content, `revision-${MAX_RECEIPTS}`);
  });
});
