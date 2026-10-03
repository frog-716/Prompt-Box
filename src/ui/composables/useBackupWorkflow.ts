/** 备份选择、冲突预览与显式恢复计划。 */

import { computed, ref, type Ref } from 'vue';

import { mergeBackup, previewBackup, type BackupConflictPolicy, type BackupPreview, type PromptBoxBackup } from '../../domain/backup.ts';
import type { PromptBoxData } from '../../domain/types.ts';
import { readJsonBackupFile, downloadJsonBackup } from '../../infra/json-backup.ts';

export function useBackupWorkflow(current: Readonly<Ref<PromptBoxData>>) {
  const backup = ref<PromptBoxBackup | null>(null);
  const fileName = ref('');
  const error = ref('');
  const promptPolicy = ref<BackupConflictPolicy>('keep-current');
  const folderPolicy = ref<BackupConflictPolicy>('keep-current');

  const preview = computed<BackupPreview | null>(() => backup.value
    ? previewBackup(current.value, backup.value.data)
    : null);
  const plannedData = computed(() => backup.value
    ? mergeBackup(current.value, backup.value.data, {
      promptConflicts: promptPolicy.value,
      folderConflicts: folderPolicy.value,
    })
    : null);

  function download(): void {
    downloadJsonBackup(current.value);
  }

  async function selectFile(file: File | null): Promise<void> {
    error.value = '';
    backup.value = null;
    fileName.value = '';
    if (!file) return;
    try {
      backup.value = await readJsonBackupFile(file);
      fileName.value = file.name;
      promptPolicy.value = 'keep-current';
      folderPolicy.value = 'keep-current';
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : '读取备份失败。';
    }
  }

  function createRestorePlan(): { expected: PromptBoxData; replacement: PromptBoxData } | null {
    if (!plannedData.value) return null;
    return { expected: current.value, replacement: plannedData.value };
  }

  return {
    backup,
    fileName,
    error,
    promptPolicy,
    folderPolicy,
    preview,
    plannedData,
    download,
    selectFile,
    createRestorePlan,
  };
}
