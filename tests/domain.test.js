import assert from 'node:assert/strict';
import test from 'node:test';

import { deleteFolder, renameFolder, validateFolderName, checkFolderRename, countByFolder } from '../src/domain/folder.ts';
import { serializeMarkdown } from '../src/domain/markdown.ts';
import { filterPrompts, normalizeTag, normalizeTags, removeTag, renameTag, upsertPrompt } from '../src/domain/prompt.ts';
import { sanitizeData } from '../src/infra/sanitize.ts';

function makePrompt(overrides = {}) {
  return {
    id: 'prompt-1',
    title: '标题',
    content: '正文',
    folderId: 'folder-1',
    tags: ['工作'],
    createdAt: 100,
    updatedAt: 100,
    ...overrides,
  };
}

test('文件夹与同名标签独立修改', () => {
  const folder = { id: 'folder-1', name: '工作', createdAt: 1 };
  const prompt = makePrompt({ folderId: folder.id, tags: ['工作'] });

  const renamedFolder = renameFolder([folder], folder.id, '项目');
  assert.equal(renamedFolder[0].name, '项目');
  assert.deepEqual(prompt.tags, ['工作']);

  const renamedTag = renameTag([prompt], '工作', '研发')[0];
  assert.equal(renamedTag.folderId, folder.id);
  assert.deepEqual(renamedTag.tags, ['研发']);

  const withoutTag = removeTag([prompt], '工作')[0];
  assert.equal(withoutTag.folderId, folder.id);
  assert.deepEqual(withoutTag.tags, []);

  const deletedFolder = deleteFolder([folder], [prompt], folder.id);
  assert.equal(deletedFolder.prompts[0].folderId, null);
  assert.deepEqual(deletedFolder.prompts[0].tags, ['工作']);
});

test('文件夹重名不覆盖已有类别', () => {
  const folders = [
    { id: 'one', name: '研发', createdAt: 1 },
    { id: 'two', name: '设计', createdAt: 2 },
  ];
  assert.deepEqual(renameFolder(folders, 'two', '  研发  '), folders);
  assert.equal(renameFolder(folders, 'two', '研发')[1].name, '设计');
});

test('筛选同时使用文件夹与标签两个维度', () => {
  const prompts = [
    makePrompt({ id: 'match', folderId: 'folder-1', tags: ['共享'] }),
    makePrompt({ id: 'other-folder', folderId: 'folder-2', tags: ['共享'] }),
    makePrompt({ id: 'other-tag', folderId: 'folder-1', tags: ['其他'] }),
  ];
  const results = filterPrompts(prompts, {
    query: '',
    folderId: 'folder-1',
    tags: ['共享'],
  });
  assert.deepEqual(results.map((prompt) => prompt.id), ['match']);
});

test('标签规范化去前缀、空格和重复', () => {
  assert.equal(normalizeTag('  ##Prompt  '), 'prompt');
  assert.deepEqual(normalizeTags(['#A', 'a', '  ', 'B']), ['a', 'b']);
});

test('从数字键对象恢复文件夹和提示词，避免界面误显示为空', () => {
  const data = sanitizeData({
    version: 1,
    folders: {
      1: { id: 'folder-2', name: '第二个', createdAt: 2 },
      0: { id: 'folder-1', name: '第一个', createdAt: 1 },
    },
    prompts: {
      0: makePrompt({ id: 'saved', folderId: 'folder-2' }),
    },
  });

  assert.deepEqual(data.folders.map((folder) => folder.name), ['第一个', '第二个']);
  assert.equal(data.prompts[0].id, 'saved');
  assert.equal(data.prompts[0].folderId, 'folder-2');
});

test('清洗保留标准数组，并拒绝非数字键对象作为集合', () => {
  const data = sanitizeData({
    folders: [{ id: 'folder-1', name: '工作', createdAt: 1 }],
    prompts: { unexpected: makePrompt() },
  });

  assert.equal(data.folders.length, 1);
  assert.equal(data.prompts.length, 0);
});

test('Markdown 导出分开展示文件夹和标签，并按最近修改时间倒序', () => {
  const data = {
    version: 1,
    folders: [
      { id: 'folder-1', name: '工作', createdAt: 1 },
      { id: 'empty-folder', name: '空文件夹', createdAt: 2 },
    ],
    prompts: [
      makePrompt({
        id: 'older',
        title: '较早',
        content: '普通内容',
        updatedAt: 100,
        folderId: null,
        tags: [],
      }),
      makePrompt({
        id: 'newer',
        title: '较新 [版本]',
        content: '代码：\n````\n保留结尾\n',
        updatedAt: 200,
        tags: ['工作', '灵感'],
      }),
    ],
  };

  const markdown = serializeMarkdown(data);
  assert.match(markdown, /`````text/);
  assert.match(markdown, /保留结尾\n`````/);
  assert.ok(markdown.endsWith('\n'));
  assert.ok(markdown.indexOf('## 较新 \\[版本\\]') < markdown.indexOf('## 较早'));
  assert.match(markdown, /- 文件夹：工作\n- 标签：#工作、#灵感/);
  assert.match(markdown, /- 文件夹：未归类\n- 标签：无/);
  assert.doesNotMatch(markdown, /修改时间|导出时间|空文件夹|prompt-box-markdown/);
  assert.equal(serializeMarkdown({ ...data, prompts: [] }), '');
});

// 冲突与异常数据回归：保留内容，拒绝悄悄覆盖。
const draft = { title: '新标题', content: '新内容', folderId: 'folder-1', tags: ['工作'] };

test('两个页面从同一记录编辑，第二次保存返回冲突且保留先保存的内容', () => {
  const original = makePrompt();
  const first = upsertPrompt([original], draft, original, 100, 'unused');
  assert.equal(first.status, 'saved');
  const second = upsertPrompt(first.prompts, { ...draft, content: '另一页面的内容' }, original, 100, 'unused');
  assert.equal(second.status, 'conflict');
  assert.equal(second.prompts, first.prompts);
  assert.equal(second.prompts[0].content, '新内容');
});

test('记录已删除时返回 missing，草稿可显式另存为新记录', () => {
  const original = makePrompt();
  const missing = upsertPrompt([], draft, original, 200, 'new');
  assert.equal(missing.status, 'missing');
  assert.deepEqual(missing.prompts, []);
  const saved = upsertPrompt([], draft, null, 200, 'new');
  assert.equal(saved.status, 'saved');
  assert.equal(saved.prompts[0].id, 'new');
  assert.equal(saved.prompts[0].content, draft.content);
});

test('标签整理没有改时间戳，也必须识别编辑冲突', () => {
  const original = makePrompt();
  for (const changed of [renameTag([original], '工作', '研发'), removeTag([original], '工作')]) {
    assert.equal(changed[0].updatedAt, original.updatedAt);
    assert.equal(upsertPrompt(changed, draft, original, 200, 'new').status, 'conflict');
  }
  const changed = deleteFolder([{ id: 'folder-1', name: '工作', createdAt: 1 }], [original], 'folder-1');
  assert.equal(upsertPrompt(changed.prompts, draft, original, 200, 'new').status, 'conflict');
});

test('其他记录的修改不阻止当前提示词正常保存', () => {
  const original = makePrompt();
  const result = upsertPrompt([original, makePrompt({ id: 'other', content: '另一个人的修改' })], draft, original, 200, 'unused');
  assert.equal(result.status, 'saved');
  assert.equal(result.prompts[1].content, '另一个人的修改');
});

test('重复提示词 ID 修复后全部内容保留，且不占用已有 ID', () => {
  const raw = { prompts: [makePrompt({ content: '第一条' }), makePrompt({ content: '第二条' }), makePrompt({ id: 'prompt-1~2', content: '第三条' })] };
  const data = sanitizeData(raw);
  assert.deepEqual(data.prompts.map(p => p.id), ['prompt-1', 'prompt-1~3', 'prompt-1~2']);
  assert.deepEqual(data.prompts.map(p => p.content), ['第一条', '第二条', '第三条']);
  assert.deepEqual(sanitizeData(raw), data);
  assert.deepEqual(sanitizeData(data), data);
});

test('同名文件夹合并时保留提示词归属，孤立归属仍变为未归类', () => {
  const data = sanitizeData({
    folders: [{ id: 'first', name: ' Work ', createdAt: 1 }, { id: 'second', name: 'work', createdAt: 2 }],
    prompts: [makePrompt({ folderId: 'second' }), makePrompt({ id: 'other', folderId: 'gone' })],
  });
  assert.equal(data.folders.length, 1);
  assert.equal(data.prompts[0].folderId, 'first');
  assert.equal(data.prompts[1].folderId, null);
});

test('无效时间戳使用固定默认值；空 id 仍兼容旧 uuid', () => {
  const raw = { prompts: [{ id: ' ', uuid: 'legacy', content: '原文', createdAt: NaN, updatedAt: Infinity }], folders: [{ id: 'f', name: '分类', createdAt: -1 }] };
  const data = sanitizeData(raw, 123);
  assert.equal(data.prompts[0].id, 'legacy');
  assert.equal(data.prompts[0].createdAt, 123);
  assert.equal(data.prompts[0].updatedAt, 123);
  assert.equal(data.folders[0].createdAt, 123);
  assert.equal(sanitizeData(raw).prompts[0].createdAt, 0);
  assert.equal(sanitizeData({ prompts: [makePrompt({ createdAt: 9e15, updatedAt: -1 })] }).prompts[0].updatedAt, 0);
});

test('未来数据版本拒绝清洗，避免旧扩展写回丢失新字段', () => {
  assert.throws(() => sanitizeData({ version: 2, prompts: [makePrompt()] }), /较新版本/);
  for (const version of ['2', NaN, -1, null]) assert.throws(() => sanitizeData({ version }), /版本无效/);
});

test('文件夹创建、重命名统一检查重名，并共用数量统计', () => {
  const folders = [{ id: 'f', name: 'Work Flow', createdAt: 1 }];
  assert.equal(validateFolderName(folders, '  WORK   FLOW '), 'duplicate');
  assert.equal(validateFolderName(folders, ' '), 'empty');
  assert.equal(checkFolderRename(folders, 'gone', '名称'), 'missing');
  assert.equal(checkFolderRename(folders, 'f', '  Work   Flow '), 'unchanged');
  assert.deepEqual([...countByFolder([makePrompt({ folderId: 'f' }), makePrompt({ folderId: null })])], [['f', 1], [null, 1]]);
});
