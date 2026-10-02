import assert from 'node:assert/strict';
import test from 'node:test';

import { deleteFolder, renameFolder } from '../src/domain/folder.ts';
import { serializeMarkdown } from '../src/domain/markdown.ts';
import { filterPrompts, normalizeTag, normalizeTags, removeTag, renameTag } from '../src/domain/prompt.ts';
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
