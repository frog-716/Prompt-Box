/**
 * 存储适配层：唯一直接读写 chrome.storage.local 的地方。
 * 数据清洗在纯函数模块中完成，便于单独回归各种旧存储形状。
 */

import { browser } from 'wxt/browser';

import type { PromptBoxData } from '@/domain/types';
import { STORAGE_KEY } from '@/shared/constants';
import { sanitizeData } from '@/infra/sanitize';

const DATA_LOCK = 'prompt-box:data-write';

/** 读取全部数据。读取失败必须向上报告，不能把暂时不可读误当成空库。 */
export async function readData(): Promise<PromptBoxData> {
  const stored = await browser.storage.local.get(STORAGE_KEY);
  return sanitizeData(stored[STORAGE_KEY]);
}

/** 在跨界面共享的 Web Lock 中读取最新快照、应用改动并一次写回。 */
export async function updateData(
  change: (current: PromptBoxData) => PromptBoxData,
): Promise<PromptBoxData> {
  return navigator.locks.request(DATA_LOCK, { mode: 'exclusive' }, async () => {
    const current = await readData();
    const changed = change(current);
    if (changed === current) return current;
    const next = sanitizeData(changed);
    await browser.storage.local.set({ [STORAGE_KEY]: next });
    return next;
  });
}

/**
 * 订阅数据变化。
 *
 * 侧边栏与设置页同时打开时，任何一侧的修改都会通过这里同步到另一侧。
 * 右键菜单保存的提示词也是靠它让侧边栏自动刷新。
 */
export function onDataChanged(listener: (data: PromptBoxData) => void): () => void {
  let latestRequest = 0;
  const handler = (
    changes: Record<string, { newValue?: unknown }>,
    areaName: string,
  ): void => {
    if (areaName !== 'local') return;
    const change = changes[STORAGE_KEY];
    if (!change) return;
    // 事件可能跨界面延迟抵达。重新读取最新值，避免旧事件覆盖新状态。
    const request = ++latestRequest;
    void readData()
      .then((data) => {
        if (request === latestRequest) listener(data);
      })
      .catch((error: unknown) => console.error('[Prompt Box] 同步本地数据失败：', error));
  };

  browser.storage.onChanged.addListener(handler);
  return () => browser.storage.onChanged.removeListener(handler);
}
