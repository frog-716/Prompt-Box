<script setup lang="ts">
/** 共享服务状态提示；操作转交给 composable。 */

import { ref } from 'vue';

import type { StorageStatus } from '@/infra/sync-storage';

defineProps<{ status: StorageStatus }>();
const emit = defineEmits<{
  retry: [];
  discard: [];
  exportPending: [];
}>();

const confirmingDiscard = ref(false);

function requestDiscard(): void {
  if (!confirmingDiscard.value) {
    confirmingDiscard.value = true;
    return;
  }
  emit('discard');
  confirmingDiscard.value = false;
}
</script>

<template>
  <aside v-if="status.mode === 'shared'" class="sync-status" :class="`sync-status--${status.state}`" :role="status.state === 'offline' || status.state === 'conflict' || status.state === 'incompatible' || status.state === 'unpaired' ? 'alert' : 'status'">
    <div class="status-copy">
      <strong>{{ status.message }}</strong>
      <span v-if="status.revision !== null">共享版本 {{ status.revision }}</span>
      <span class="local-only-note">提示词保存在此 Mac 的本机共享服务中；仅已配对扩展可读取，不上传到远端。</span>
      <span v-if="confirmingDiscard" class="discard-note">仅清除本机重试记录，不会撤销服务端已写入的数据；请先下载待确认草稿。</span>
    </div>
    <div class="status-actions">
      <button v-if="status.state === 'offline' || status.pending" type="button" @click="emit('retry')">重新连接</button>
      <button v-if="status.pending" type="button" @click="emit('exportPending')">下载待确认草稿</button>
      <button v-if="status.pending" type="button" class="discard-button" @click="requestDiscard">
        {{ confirmingDiscard ? '确认清除待确认请求' : '清除待确认请求' }}
      </button>
    </div>
  </aside>
</template>

<style scoped>
.sync-status { display: flex; align-items: center; justify-content: space-between; gap: var(--pb-space-10); padding: var(--pb-space-8) var(--pb-space-14); border-bottom: 1px solid var(--pb-border); background: var(--pb-info-bg); color: var(--pb-info-text); font-size: 11px; }
.sync-status--offline, .sync-status--conflict, .sync-status--incompatible, .sync-status--unpaired { background: var(--pb-danger-surface-soft); color: var(--pb-danger-text); }
.status-copy { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--pb-space-6) var(--pb-space-12); min-width: 0; }
.status-copy strong { font-weight: 600; }
.status-copy span { color: var(--pb-text-muted); }
.status-copy .local-only-note { color: var(--pb-text-muted); }
.status-copy .discard-note { flex-basis: 100%; color: var(--pb-danger-text); }
.status-actions { display: flex; flex: 0 0 auto; gap: var(--pb-space-6); }
.status-actions button { min-height: 28px; padding: 0 var(--pb-space-8); border: 1px solid var(--pb-border-card); border-radius: var(--pb-radius-6); background: var(--pb-surface); color: inherit; font: inherit; cursor: pointer; }
.status-actions .discard-button { border-color: var(--pb-danger-border); }
@media (max-width: 440px) { .sync-status { align-items: flex-start; flex-direction: column; } }
</style>
