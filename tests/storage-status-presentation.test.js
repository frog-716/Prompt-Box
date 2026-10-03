import test from 'node:test';
import assert from 'node:assert/strict';
import { getStorageStatusPresentation } from '../src/ui/composables/storage-status-presentation.ts';

function status(overrides = {}) {
  return {
    mode: 'shared',
    state: 'online',
    message: '同机共享服务在线',
    revision: 8,
    pending: false,
    ...overrides,
  };
}

test('paired shared status is a single compact row with its revision', () => {
  assert.deepEqual(getStorageStatusPresentation(status()), {
    visible: true,
    compact: true,
    label: '同机共享服务在线 · 共享版本 8',
    showRetry: false,
    showPendingActions: false,
    showPairingAction: false,
  });
});

test('offline, unpaired, conflict, and pending states keep their actions visible', () => {
  const offline = getStorageStatusPresentation(status({ state: 'offline', message: '离线，本次修改未报告成功' }));
  assert.equal(offline.compact, false);
  assert.equal(offline.showRetry, true);

  const unpaired = getStorageStatusPresentation(status({ state: 'unpaired', message: '此设备尚未配对', revision: null }));
  assert.equal(unpaired.showPairingAction, true);

  const conflict = getStorageStatusPresentation(status({ state: 'conflict', message: '共享数据已变化', pending: true }));
  assert.equal(conflict.compact, false);
  assert.equal(conflict.showPendingActions, true);
  assert.equal(conflict.showRetry, false);

  const pending = getStorageStatusPresentation(status({ pending: true }));
  assert.equal(pending.compact, false);
  assert.equal(pending.showRetry, true);
  assert.equal(pending.showPendingActions, true);
});

test('local storage status is hidden from the shared status row', () => {
  const presentation = getStorageStatusPresentation(status({ mode: 'local' }));
  assert.equal(presentation.visible, false);
  assert.equal(presentation.compact, false);
  assert.equal(presentation.showPairingAction, false);
});
