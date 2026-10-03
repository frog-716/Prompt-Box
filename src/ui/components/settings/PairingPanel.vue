<script setup lang="ts">
/** 同机共享配对只由用户在扩展界面发起和确认。 */

import { computed, onMounted, ref } from 'vue';

import {
  createSyncPairingInvite,
  getSyncPairingStatus,
  joinSyncPairing,
  revokeSyncPairing,
  startSyncPairing,
} from '@/infra/storage';
import type { PairingInvite, PairingStatus } from '@/infra/sync-pairing';

const emit = defineEmits<{ paired: [] }>();

const status = ref<PairingStatus | null>(null);
const loading = ref(true);
const busy = ref(false);
const codeInput = ref('');
const invite = ref<PairingInvite | null>(null);
const errorMessage = ref('');
const notice = ref('');
const confirmingRevoke = ref(false);
const expanded = ref(true);

const canStart = computed(() => status.value !== null && !status.value.paired && !status.value.peerPaired && !status.value.pairingInProgress);
const canJoin = computed(() => status.value !== null && !status.value.paired);

async function refreshStatus(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    status.value = await getSyncPairingStatus();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '无法读取配对状态；请确认服务已启动。';
  } finally {
    loading.value = false;
  }
}

async function beginPairing(): Promise<void> {
  if (busy.value) return;
  busy.value = true;
  errorMessage.value = '';
  notice.value = '';
  try {
    invite.value = await startSyncPairing();
    status.value = { paired: true, peerPaired: false, pairingInProgress: true };
    notice.value = '此扩展已配对。请在另一端 Prompt-Box 配对面板输入下方配对码。';
    emit('paired');
  } catch (error) {
    const failure = error instanceof Error ? error.message : '生成配对码失败，请重试。';
    await refreshStatus();
    errorMessage.value = failure;
  } finally {
    busy.value = false;
  }
}

async function generateInvite(): Promise<void> {
  if (busy.value) return;
  busy.value = true;
  errorMessage.value = '';
  notice.value = '';
  try {
    invite.value = await createSyncPairingInvite();
    notice.value = '配对码已生成，可在另一端 Prompt-Box 配对面板输入。旧配对码已失效。';
  } catch (error) {
    const failure = error instanceof Error ? error.message : '生成配对码失败，请重试。';
    await refreshStatus();
    errorMessage.value = failure;
  } finally {
    busy.value = false;
  }
}

async function submitInvite(): Promise<void> {
  if (busy.value) return;
  busy.value = true;
  errorMessage.value = '';
  notice.value = '';
  try {
    await joinSyncPairing(codeInput.value);
    codeInput.value = '';
    invite.value = null;
    notice.value = '此扩展已配对，共享数据已连接。';
    await refreshStatus();
    emit('paired');
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '配对未完成，请检查配对码后重试。';
  } finally {
    busy.value = false;
  }
}

async function revokePairing(): Promise<void> {
  if (!confirmingRevoke.value || busy.value) {
    confirmingRevoke.value = true;
    return;
  }
  busy.value = true;
  errorMessage.value = '';
  notice.value = '';
  try {
    await revokeSyncPairing();
    status.value = { paired: false, peerPaired: Boolean(status.value?.peerPaired), pairingInProgress: false };
    invite.value = null;
    notice.value = '此设备的共享权限已撤销。';
    confirmingRevoke.value = false;
    emit('paired');
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '撤销配对失败，请重试。';
  } finally {
    busy.value = false;
  }
}

onMounted(() => void refreshStatus());
</script>

<template>
  <section class="pairing-panel" aria-labelledby="pairing-title">
    <div class="pairing-heading">
      <div>
        <p class="eyebrow">仅此 Mac · 本机回环连接</p>
        <h2 id="pairing-title">安全配对</h2>
      </div>
      <div class="heading-actions">
        <span v-if="status?.paired" class="pairing-state pairing-state--online">此设备已配对</span>
        <span v-else class="pairing-state">{{ loading ? '正在检查…' : '尚未配对' }}</span>
        <button type="button" class="toggle" :aria-expanded="expanded" @click="expanded = !expanded">{{ expanded ? '收起' : '管理' }}</button>
      </div>
    </div>

    <div v-if="expanded" class="pairing-body">
    <p class="pairing-copy">
      配对后，Chrome 与 GPT 标签页构建会通过本机服务共享同一份数据。配对码只对另一端有效，5 分钟后过期且只能使用一次；服务仅保存凭据校验值。
    </p>
    <p class="pairing-copy pairing-copy--muted">
      凭据只保存在扩展可信本机存储中；撤销此设备会立即停止它访问共享数据。请只在你自己的两个 Prompt-Box 扩展之间传递配对码。
    </p>

    <p v-if="errorMessage" class="pairing-feedback pairing-feedback--error" role="alert">{{ errorMessage }}</p>
    <p v-else-if="notice" class="pairing-feedback" role="status">{{ notice }}</p>

    <div v-if="invite" class="invite-box">
      <label for="generated-pairing-code">一次性配对码</label>
      <input id="generated-pairing-code" :value="invite.code" readonly spellcheck="false" @focus="($event.target as HTMLInputElement).select()">
      <p>有效至 {{ new Date(invite.expiresAt).toLocaleTimeString() }}。请手动复制到另一端的配对输入框；代码不会写入服务日志。</p>
    </div>

    <div class="pairing-actions">
      <button v-if="canStart" type="button" class="primary" :disabled="busy || loading" @click="beginPairing">
        {{ busy ? '正在生成…' : '在此设备开始配对' }}
      </button>
      <button v-if="status?.paired" type="button" :disabled="busy" @click="generateInvite">
        {{ busy ? '正在生成…' : '生成另一端配对码' }}
      </button>
      <button v-if="status?.paired" type="button" class="danger" :disabled="busy" @click="revokePairing">
        {{ confirmingRevoke ? '确认撤销此设备配对' : '撤销此设备配对' }}
      </button>
      <button v-if="errorMessage && !status" type="button" :disabled="busy" @click="refreshStatus">重新检查</button>
    </div>

    <form v-if="canJoin" class="join-form" @submit.prevent="submitInvite">
      <label for="pairing-code-input">输入另一端显示的一次性配对码</label>
      <div class="join-row">
        <input
          id="pairing-code-input"
          v-model="codeInput"
          type="password"
          inputmode="text"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          maxlength="43"
          placeholder="43 位配对码"
        >
        <button type="submit" class="primary" :disabled="busy || codeInput.length === 0">
          {{ busy ? '正在配对…' : '确认配对' }}
        </button>
      </div>
      <p v-if="status?.peerPaired">另一端已有配对权限；完成后会替换此扩展旧凭据（若有）。</p>
    </form>
    </div>
  </section>
</template>

<style scoped>
.pairing-panel { display: flex; flex-direction: column; gap: var(--pb-space-10); padding: var(--pb-space-18); border: 1px solid var(--pb-info-border); border-radius: var(--pb-radius); background: var(--pb-surface); box-shadow: var(--pb-shadow-card); }
.pairing-heading { display: flex; align-items: center; justify-content: space-between; gap: var(--pb-space-10); }
.heading-actions { display: flex; align-items: center; gap: var(--pb-space-6); }
.toggle { min-height: 27px; padding: 0 var(--pb-space-8); border: 1px solid var(--pb-border-card); border-radius: var(--pb-radius-6); background: var(--pb-bg); color: var(--pb-text-muted); font: inherit; font-size: 11px; cursor: pointer; }
.pairing-body { display: flex; flex-direction: column; gap: var(--pb-space-10); }
.pairing-heading h2 { margin: var(--pb-space-2) var(--pb-space-0) var(--pb-space-0); font-family: var(--pb-font-display); font-size: 17px; font-weight: 600; }
.eyebrow { margin: 0; color: var(--pb-accent); font-size: 10px; font-weight: 600; letter-spacing: .04em; }
.pairing-state { flex: 0 0 auto; padding: var(--pb-space-4) var(--pb-space-8); border-radius: var(--pb-radius-6); background: var(--pb-danger-surface-soft); color: var(--pb-danger-text); font-size: 11px; }
.pairing-state--online { background: var(--pb-info-bg); color: var(--pb-info-text); }
.pairing-copy, .invite-box p, .join-form > p { margin: 0; color: var(--pb-text); font-size: 12px; line-height: 1.55; }
.pairing-copy--muted { color: var(--pb-text-muted); }
.pairing-feedback { margin: 0; color: var(--pb-info-text); font-size: 12px; }
.pairing-feedback--error { color: var(--pb-danger-text); }
.pairing-actions { display: flex; flex-wrap: wrap; gap: var(--pb-space-8); }
.pairing-actions button, .join-row button { min-height: 32px; padding: 0 var(--pb-space-10); border: 1px solid var(--pb-border-card); border-radius: var(--pb-radius-6); background: var(--pb-bg); color: var(--pb-text); font: inherit; font-size: 12px; cursor: pointer; }
.pairing-actions button:disabled, .join-row button:disabled { opacity: .55; cursor: default; }
.pairing-actions .primary, .join-row .primary { border-color: var(--pb-accent); background: var(--pb-accent); color: var(--pb-on-accent); }
.pairing-actions .danger { border-color: var(--pb-danger-border); color: var(--pb-danger-text); }
.invite-box { display: flex; flex-direction: column; gap: var(--pb-space-6); padding: var(--pb-space-10); border: 1px solid var(--pb-border-card); border-radius: var(--pb-radius-6); background: var(--pb-bg); }
.invite-box label, .join-form label { font-size: 11px; font-weight: 600; }
.invite-box input, .join-row input { width: 100%; min-width: 0; min-height: 34px; padding: 0 var(--pb-space-8); border: 1px solid var(--pb-border-card); border-radius: var(--pb-radius-6); background: var(--pb-surface); color: var(--pb-text); font: 12px ui-monospace, SFMono-Regular, Menlo, monospace; }
.invite-box input { user-select: all; }
.invite-box p, .join-form > p { color: var(--pb-text-muted); font-size: 11px; }
.join-form { display: flex; flex-direction: column; gap: var(--pb-space-6); }
.join-row { display: flex; gap: var(--pb-space-8); }
.join-row button { flex: 0 0 auto; }
</style>
