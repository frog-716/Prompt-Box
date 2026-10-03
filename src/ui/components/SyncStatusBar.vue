<script setup lang="ts">
/** 共享服务状态提示；操作转交给 composable。 */

import { computed, ref } from 'vue';

import type { StorageStatus } from '@/infra/sync-storage';
import { getStorageStatusPresentation } from '@/ui/composables/storage-status-presentation';

const props = withDefaults(defineProps<{ status: StorageStatus; settingsLink?: boolean }>(), {
  settingsLink: false,
});
const emit = defineEmits<{
  retry: [];
  discard: [];
  exportPending: [];
  openSettings: [];
}>();

const confirmingDiscard = ref(false);
const presentation = computed(() => getStorageStatusPresentation(props.status));

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
  <aside
    v-if="presentation.visible"
    class="sync-status"
    :class="[`sync-status--${status.state}`, { 'sync-status--compact': presentation.compact }]"
    :role="status.pending || status.state === 'offline' || status.state === 'conflict' || status.state === 'incompatible' || status.state === 'unpaired' ? 'alert' : 'status'"
    aria-live="polite"
  >
    <div class="status-copy">
      <strong>{{ presentation.label }}</strong>
      <template v-if="!presentation.compact">
        <span v-if="status.revision !== null">共享版本 {{ status.revision }}</span>
        <span v-if="confirmingDiscard" class="discard-note">仅清除本机重试记录，不会撤销服务端已写入的数据；请先下载待确认草稿。</span>
      </template>
    </div>
    <div class="status-actions">
      <button v-if="presentation.showRetry" type="button" @click="emit('retry')">
        {{ status.state === 'offline' ? '重新连接' : '重试待处理请求' }}
      </button>
      <button v-if="settingsLink && presentation.showPairingAction" type="button" @click="emit('openSettings')">
        打开设置完成配对
      </button>
      <button v-if="presentation.showPendingActions" type="button" @click="emit('exportPending')">下载待确认草稿</button>
      <button v-if="presentation.showPendingActions" type="button" class="discard-button" @click="requestDiscard">
        {{ confirmingDiscard ? '确认清除待确认请求' : '清除待确认请求' }}
      </button>
    </div>
  </aside>
</template>

<style scoped>
.sync-status { display: flex; align-items: center; justify-content: space-between; gap: var(--pb-space-10); padding: var(--pb-space-8) var(--pb-space-14); border-bottom: 1px solid var(--pb-border); background: var(--pb-info-bg); color: var(--pb-info-text); font-size: 11px; }
.sync-status--offline, .sync-status--conflict, .sync-status--incompatible, .sync-status--unpaired { background: var(--pb-danger-surface-soft); color: var(--pb-danger-text); }
.sync-status--compact { min-height: 34px; padding-block: var(--pb-space-6); align-items: center; }
.status-copy { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--pb-space-6) var(--pb-space-12); min-width: 0; }
.status-copy strong { font-weight: 600; }
.sync-status--compact .status-copy strong { white-space: nowrap; }
.status-copy span { color: var(--pb-text-muted); }
.status-copy .discard-note { flex-basis: 100%; color: var(--pb-danger-text); }
.status-actions { display: flex; flex: 0 0 auto; gap: var(--pb-space-6); }
.status-actions button { min-height: 28px; padding: 0 var(--pb-space-8); border: 1px solid var(--pb-border-card); border-radius: var(--pb-radius-6); background: var(--pb-surface); color: inherit; font: inherit; cursor: pointer; }
.status-actions .discard-button { border-color: var(--pb-danger-border); }
@media (max-width: 440px) { .sync-status:not(.sync-status--compact) { align-items: flex-start; flex-direction: column; } }
</style>
