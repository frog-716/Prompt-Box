import assert from 'node:assert/strict';
import test from 'node:test';
import { ref } from 'vue';

import { mergeBackup, previewBackup, restoreBackupIfUnchanged } from '../src/domain/backup.ts';
import { parseJsonBackup, serializeJsonBackup } from '../src/infra/json-backup.ts';
import { useBackupWorkflow } from '../src/ui/composables/useBackupWorkflow.ts';

const folder = (id, name) => ({ id, name, createdAt: 1 });
const prompt = (id, content, folderId = null) => ({
  id, title: id, content, folderId, tags: [], createdAt: 1, updatedAt: 1,
});
const data = (prompts = [], folders = []) => ({ version: 1, prompts, folders });

test('JSON 备份可往返恢复，并拒绝未知格式/数据版本', () => {
  const snapshot = data([prompt('p1', '只含假数据')], [folder('f1', '项目')]);
  const serialized = serializeJsonBackup(snapshot, '2026-10-03T00:00:00.000Z');
  const parsed = parseJsonBackup(serialized);
  assert.deepEqual(parsed.data, snapshot);
  assert.equal(parsed.exportedAt, '2026-10-03T00:00:00.000Z');

  assert.throws(() => parseJsonBackup('not json'), /无法解析/);
  assert.throws(() => parseJsonBackup(JSON.stringify({ format: 'prompt-box-backup', formatVersion: 7 })), /格式版本/);
  assert.throws(() => parseJsonBackup(JSON.stringify({
    format: 'prompt-box-backup', formatVersion: 1, schemaVersion: 99,
    exportedAt: '2026-10-03T00:00:00.000Z', data: snapshot,
  })), /数据版本/);
});

test('迁移预览显示冲突，用户选项决定保留当前或使用备份内容', () => {
  const current = data([prompt('p1', '当前版本', 'f1')], [folder('f1', '项目')]);
  const incoming = data([
    prompt('p1', '备份版本', 'f1'),
    prompt('p2', '新增记录', 'f1'),
  ], [folder('f1', '备份文件夹名')]);
  assert.deepEqual(previewBackup(current, incoming), {
    incomingPrompts: 2,
    newPrompts: 1,
    identicalPromptIds: 0,
    conflictingPrompts: 1,
    incomingFolders: 1,
    newFolders: 0,
    identicalFolderIds: 0,
    conflictingFolderIds: 1,
    sameNameFolderIds: 0,
  });

  const keepCurrent = mergeBackup(current, incoming, {
    promptConflicts: 'keep-current', folderConflicts: 'keep-current',
  });
  assert.equal(keepCurrent.prompts.find((item) => item.id === 'p1').content, '当前版本');
  assert.equal(keepCurrent.prompts.find((item) => item.id === 'p2').folderId, 'f1');
  assert.equal(keepCurrent.folders[0].name, '项目');

  const useBackup = mergeBackup(current, incoming, {
    promptConflicts: 'use-backup', folderConflicts: 'use-backup',
  });
  assert.equal(useBackup.prompts.find((item) => item.id === 'p1').content, '备份版本');
  assert.equal(useBackup.folders[0].name, '备份文件夹名');
});

test('同名不同 ID 的文件夹只合并归属，不重复创建分类', () => {
  const current = data([prompt('p1', '已有', 'f1')], [folder('f1', '工作')]);
  const incoming = data([prompt('p2', '导入', 'f2')], [folder('f2', ' 工作 ')]);
  const preview = previewBackup(current, incoming);
  assert.equal(preview.sameNameFolderIds, 1);
  const merged = mergeBackup(current, incoming, {
    promptConflicts: 'keep-current', folderConflicts: 'keep-current',
  });
  assert.equal(merged.folders.length, 1);
  assert.equal(merged.prompts.find((item) => item.id === 'p2').folderId, 'f1');
});

test('无效备份预览不会生成恢复计划或更改当前快照', async () => {
  const initial = data([prompt('current', '必须保留')], [folder('f1', '本机分类')]);
  const current = ref(initial);
  const workflow = useBackupWorkflow(current);
  const invalidFile = { size: 12, text: async () => '{invalid json' };

  await workflow.selectFile(invalidFile);

  assert.match(workflow.error.value, /无法解析/);
  assert.equal(workflow.backup.value, null);
  assert.equal(workflow.createRestorePlan(), null);
  assert.deepEqual(current.value, initial);
});

test('恢复守卫只在预览快照仍一致时返回备份数据', () => {
  const expected = data([prompt('current', '预览时')]);
  const replacement = data([prompt('backup', '备份内容')]);
  assert.deepEqual(restoreBackupIfUnchanged(expected, expected, replacement), replacement);
  assert.throws(
    () => restoreBackupIfUnchanged(data([prompt('current', '预览后新内容')]), expected, replacement),
    /预览后数据已变化/,
  );
});
