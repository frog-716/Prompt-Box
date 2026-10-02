import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setImmediate } from 'node:timers/promises';
import ts from 'typescript';
import { createRenderer, toRaw } from 'vue';

// 运行真实 composable 和存储适配，仅替换 Chrome 与锁，不读写用户浏览器。
function moduleUrl(path, overrides = {}) {
  const output = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText.replace(/from (['"])([^'"]+)\1/g, (_match, _quote, spec) => {
    const target = overrides[spec] ?? (spec.startsWith('@/')
      ? pathToFileURL(resolve('src', spec.slice(2) + '.ts')).href
      : import.meta.resolve(spec));
    return `from ${JSON.stringify(target)}`;
  });
  return `data:text/javascript;base64,${Buffer.from(output).toString('base64')}`;
}

const renderer = createRenderer({
  insert() {}, remove() {}, patchProp() {}, setText() {}, setElementText() {},
  createElement: () => ({}), createText: () => ({}), createComment: () => ({}),
  parentNode: () => null, nextSibling: () => null,
});

const original = { id: 'p', title: '标题', content: '原文', folderId: 'f', tags: ['工作'], createdAt: 1, updatedAt: 1 };
const draft = (content) => ({ title: '标题', content, folderId: 'f', tags: ['工作'] });

test('两个界面通过真实共享写入入口保存、同步与报告冲突', async (t) => {
  let database;
  let writes;
  let listeners;
  let queue = Promise.resolve();
  let failRead = false;
  let delayedRead = null;
  let broadcastPaused = false;
  const key = Symbol.for('prompt-box:test-browser');
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(navigator, 'locks');
  Object.defineProperty(navigator, 'locks', { configurable: true, value: {
    request(_name, _options, change) {
      const request = queue.then(change);
      queue = request.catch(() => {});
      return request;
    },
  } });
  globalThis[key] = {
    storage: {
      local: {
        async get() {
          if (failRead) throw new Error('模拟读取失败');
          const snapshot = structuredClone(database);
          if (delayedRead) {
            const wait = delayedRead;
            delayedRead = null;
            await wait;
          }
          return { promptBox: snapshot };
        },
        async set(value) {
          writes += 1;
          database = structuredClone(value.promptBox);
          if (!broadcastPaused) for (const listener of listeners) listener({ promptBox: { newValue: database } }, 'local');
        },
      },
      onChanged: { addListener: fn => listeners.add(fn), removeListener: fn => listeners.delete(fn) },
    },
  };
  const browserModule = 'data:text/javascript,' + encodeURIComponent('export const browser = globalThis[Symbol.for("prompt-box:test-browser")];');
  const storageModule = moduleUrl('src/infra/storage.ts', { 'wxt/browser': browserModule });
  const { useLibrary } = await import(moduleUrl('src/ui/composables/useLibrary.ts', { '@/infra/storage': storageModule }));
  const { updateData } = await import(storageModule);
  const apps = [];
  function mountLibrary() {
    let library;
    const app = renderer.createApp({ setup() { library = useLibrary(); return () => null; } });
    app.mount({});
    apps.push(app);
    return library;
  }
  t.after(() => {
    for (const app of apps) app.unmount();
    if (navigatorDescriptor) Object.defineProperty(navigator, 'locks', navigatorDescriptor);
    else delete navigator.locks;
    delete globalThis[key];
  });
  const reset = async () => {
    for (const app of apps.splice(0)) app.unmount();
    database = { version: 1, prompts: [structuredClone(original)], folders: [{ id: 'f', name: '工作', createdAt: 1 }] };
    writes = 0; listeners = new Set(); failRead = false; delayedRead = null; broadcastPaused = false;
    const a = mountLibrary(), b = mountLibrary();
    await setImmediate();
    assert.equal(a.ready.value, true);
    assert.equal(b.ready.value, true);
    return [a, b];
  };

  await t.test('同时编辑只允许先保存的一方写入，另一方明确返回冲突', async () => {
    const [a, b] = await reset();
    const snapshotA = structuredClone(toRaw(a.allPrompts.value[0]));
    const snapshotB = structuredClone(toRaw(b.allPrompts.value[0]));
    const results = await Promise.all([a.savePrompt(draft('页面 A'), snapshotA), b.savePrompt(draft('页面 B'), snapshotB)]);
    assert.deepEqual(results, ['saved', 'conflict']);
    await setImmediate();
    assert.equal(writes, 1);
    assert.equal(database.prompts[0].content, '页面 A');
    assert.equal(b.allPrompts.value[0].content, '页面 A');
  });

  await t.test('另一页删除后保存返回 missing，不写入也不复活旧记录', async () => {
    const [a, b] = await reset();
    await a.deletePrompt('p');
    assert.equal(await b.savePrompt(draft('未保存的草稿'), original), 'missing');
    assert.equal(writes, 1);
    assert.deepEqual(database.prompts, []);
    assert.equal(await b.savePrompt(draft('未保存的草稿'), null), 'saved');
    assert.equal(database.prompts[0].content, '未保存的草稿');
    assert.notEqual(database.prompts[0].id, original.id);
  });

  await t.test('并行创建同名文件夹只产生一个，并共用数量统计', async () => {
    const [a, b] = await reset();
    const result = await Promise.all([a.addFolder('项目'), b.addFolder(' 项目 ')]);
    assert.ok(result[0]);
    assert.equal(result[1], null);
    assert.equal(database.folders.filter(f => f.name === '项目').length, 1);
    assert.equal(a.folderCounts.value.f, 1);
    assert.equal(a.unclassifiedCount.value, 0);
  });

  await t.test('旧的读取迟到时不能覆盖刚保存的结果，即使广播尚未到达', async () => {
    const [a] = await reset();
    let release;
    delayedRead = new Promise(resolve => { release = resolve; });
    const reload = a.reload();
    broadcastPaused = true;
    assert.equal(await a.savePrompt(draft('刚保存的内容'), original), 'saved');
    release();
    await reload;
    assert.equal(a.allPrompts.value[0].content, '刚保存的内容');
  });

  await t.test('读取失败与未来数据版本均阻止写入' , async () => {
    await reset();
    const change = current => ({ ...current, prompts: [] });
    failRead = true;
    await assert.rejects(updateData(change), /读取失败/);
    assert.equal(writes, 0);
    failRead = false;
    database.version = 2;
    await assert.rejects(updateData(change), /较新版本/);
    assert.equal(writes, 0);
    assert.equal(database.prompts[0].content, '原文');
  });
});
