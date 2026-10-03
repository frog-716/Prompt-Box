import type { StorageStatus } from '../../infra/sync-storage';

export interface StorageStatusPresentation {
  visible: boolean;
  compact: boolean;
  label: string;
  showRetry: boolean;
  showPendingActions: boolean;
  showPairingAction: boolean;
}

export function getStorageStatusPresentation(status: StorageStatus): StorageStatusPresentation {
  const visible = status.mode === 'shared';
  const compact = visible && status.state === 'online' && !status.pending;

  return {
    visible,
    compact,
    label: compact && status.revision !== null
      ? `${status.message} · 共享版本 ${status.revision}`
      : status.message,
    showRetry: visible && (status.state === 'offline' || (status.pending && status.state !== 'conflict')),
    showPendingActions: visible && status.pending,
    showPairingAction: visible && status.state === 'unpaired',
  };
}
