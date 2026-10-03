<script setup lang="ts">
/** JSON 备份和迁移预览界面；文件解析与合并计划由 composable 完成。 */

import { ref, toRef } from 'vue';

import type { PromptBoxData } from '@/domain/types';
import { useBackupWorkflow } from '@/ui/composables/useBackupWorkflow';

const props = defineProps<{
  data: PromptBoxData;
  syncMode: boolean;
  exportOnly?: boolean;
}>();

const emit = defineEmits<{
  restore: [expected: PromptBoxData, replacement: PromptBoxData];
}>();

const workflow = useBackupWorkflow(toRef(props, 'data'));
const confirming = ref(false);

async function handleFileChange(event: Event): Promise<void> {
  confirming.value = false;
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) return;
  const file = input.files?.[0] ?? null;
  await workflow.selectFile(file);
  input.value = '';
}

function clearSelectedFile(): void {
  confirming.value = false;
  void workflow.selectFile(null);
}

function requestApply(): void {
  if (!workflow.backup.value) return;
  if (!confirming.value) {
    confirming.value = true;
    return;
  }
  const plan = workflow.createRestorePlan();
  if (!plan) return;
  emit('restore', plan.expected, plan.replacement);
  confirming.value = false;
}
</script>

<template>
  <section class="section">
    <h2 class="section-title">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0 4-4m-4 4-4-4"/><path d="M5 17v3h14v-3"/></svg>
      {{ exportOnly ? 'JSON 完整备份' : `JSON 备份与${syncMode ? '迁移预览' : '恢复'}` }}
    </h2>
    <div class="backup-panel">
      <p class="backup-copy">
        {{ exportOnly
          ? '导出当前本地库的完整 JSON 文件，只读取数据，不会修改或迁移原库。请先保存并确认备份文件。'
          : syncMode
          ? '共享库不会自动读取旧扩展的本地数据。请手动选择 JSON 文件，先预览差异，再确认恢复。'
          : 'JSON 备份可在以后恢复。选择文件后先预览新增项与冲突，确认后才写入当前本地库。' }}
      </p>

      <div class="backup-actions">
        <button type="button" class="backup-primary" @click="workflow.download">导出 JSON 备份</button>
        <label v-if="!exportOnly" class="file-button">
          选择 JSON 备份
          <input type="file" accept=".json,application/json" @change="handleFileChange">
        </label>
      </div>

      <p v-if="!exportOnly && workflow.error.value" class="backup-error" role="alert">{{ workflow.error.value }}</p>

      <div v-if="!exportOnly && workflow.preview.value" class="backup-preview">
        <div class="preview-heading">
          <strong>{{ workflow.fileName.value }}</strong>
          <button type="button" class="text-button" @click="clearSelectedFile">取消选择</button>
        </div>
        <p class="preview-line">
          备份含 {{ workflow.preview.value.incomingPrompts }} 条提示词、
          {{ workflow.preview.value.incomingFolders }} 个文件夹；
          将新增 {{ workflow.preview.value.newPrompts }} 条提示词、
          {{ workflow.preview.value.newFolders }} 个文件夹。
        </p>
        <p class="preview-line">
          提示词 ID 冲突 {{ workflow.preview.value.conflictingPrompts }} 项，
          文件夹 ID 冲突 {{ workflow.preview.value.conflictingFolderIds }} 项，
          同名文件夹 {{ workflow.preview.value.sameNameFolderIds }} 项。
        </p>

        <div v-if="workflow.preview.value.conflictingPrompts > 0" class="policy-row">
          <label for="prompt-policy">提示词冲突</label>
          <select id="prompt-policy" v-model="workflow.promptPolicy.value">
            <option value="keep-current">保留当前内容</option>
            <option value="use-backup">使用备份内容</option>
          </select>
        </div>
        <div v-if="workflow.preview.value.conflictingFolderIds > 0 || workflow.preview.value.sameNameFolderIds > 0" class="policy-row">
          <label for="folder-policy">文件夹冲突</label>
          <select id="folder-policy" v-model="workflow.folderPolicy.value">
            <option value="keep-current">保留当前名称</option>
            <option value="use-backup">使用备份名称</option>
          </select>
        </div>

        <div v-if="confirming" class="restore-confirm" role="alert">
          <span>请确认以上预览和冲突选择；写入后会更新当前数据源。</span>
          <button type="button" class="cancel-button" @click="confirming = false">返回</button>
        </div>
        <button
          type="button"
          class="restore-button"
          :disabled="workflow.preview.value.incomingPrompts === 0 && workflow.preview.value.incomingFolders === 0"
          @click="requestApply"
        >
          {{ confirming ? '确认恢复到当前数据源' : syncMode ? '确认迁入共享库' : '恢复此备份' }}
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.section { display: flex; flex-direction: column; gap: var(--pb-space-16); }
.section-title { display: flex; align-items: center; gap: var(--pb-space-8); margin: 0; font-family: var(--pb-font-display); font-size: 18px; font-weight: 500; }
.section-title svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
.backup-panel { display: flex; flex-direction: column; gap: var(--pb-space-12); border: 1px solid var(--pb-border-card); border-radius: var(--pb-radius); padding: var(--pb-space-20); background: var(--pb-surface); box-shadow: var(--pb-shadow-card); }
.backup-copy, .preview-line { margin: 0; color: var(--pb-text-muted); font-size: 12px; line-height: 1.6; }
.backup-actions { display: flex; flex-wrap: wrap; gap: var(--pb-space-10); }
.backup-actions button, .file-button, .restore-button { display: inline-flex; align-items: center; justify-content: center; min-height: 34px; padding: 0 var(--pb-space-14); border: 1px solid var(--pb-border-card); border-radius: var(--pb-radius-6); font: inherit; font-size: 12px; cursor: pointer; }
.backup-primary { border-color: var(--pb-accent); background: var(--pb-accent); color: var(--pb-on-accent); }
.file-button { position: relative; overflow: hidden; background: var(--pb-surface); color: var(--pb-text); }
.file-button input { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; }
.backup-error { margin: 0; color: var(--pb-danger-text-strong); font-size: 12px; }
.backup-preview { display: flex; flex-direction: column; gap: var(--pb-space-10); margin-top: var(--pb-space-4); padding: var(--pb-space-14); border: 1px solid var(--pb-info-border); border-radius: var(--pb-radius-6); background: var(--pb-info-bg); }
.preview-heading { display: flex; align-items: center; justify-content: space-between; gap: var(--pb-space-10); color: var(--pb-info-text); font-size: 12px; }
.text-button { border: 0; background: transparent; color: var(--pb-info-text); font: inherit; font-size: 11px; cursor: pointer; }
.policy-row { display: flex; align-items: center; justify-content: space-between; gap: var(--pb-space-12); color: var(--pb-text); font-size: 12px; }
.policy-row select { max-width: 190px; min-height: 32px; border: 1px solid var(--pb-border); border-radius: var(--pb-radius-6); padding: 0 var(--pb-space-8); background: var(--pb-surface); color: var(--pb-text); font: inherit; }
.restore-confirm { display: flex; flex-wrap: wrap; align-items: center; gap: var(--pb-space-8); color: var(--pb-danger-text); font-size: 12px; }
.cancel-button { border: 0; background: transparent; color: var(--pb-text-muted); font: inherit; cursor: pointer; }
.restore-button { align-self: flex-start; border-color: var(--pb-accent); background: var(--pb-accent); color: var(--pb-on-accent); }
.restore-button:disabled { opacity: .55; cursor: not-allowed; }
@media (max-width: 480px) { .backup-panel { padding: var(--pb-space-16); } }
</style>
