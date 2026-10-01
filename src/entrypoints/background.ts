/**
 * 后台服务。
 *
 * 这个扩展的后台刻意做得很薄 —— 只有两件事：
 *   1. 让点击工具栏图标时打开侧边栏；
 *   2. 提供右键「保存到提示词本」。
 *
 * 没有任何网络请求，没有任何定时任务，没有任何网站注入。
 * 侧边栏自己不依赖后台存活，所以 service worker 被回收也不影响使用。
 */

import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';

import { createPrompt } from '@/domain/prompt';
import { updateData } from '@/infra/storage';
import { AUTO_TITLE_MAX_LENGTH, MENU_SAVE_SELECTION_ID } from '@/shared/constants';
import { createId, deriveTitle, timestamp } from '@/shared/utils';

/** 重建右键菜单。onInstalled 与 onStartup 都会调用，因此先清空再建。 */
function buildContextMenu(): void {
  browser.contextMenus.removeAll(() => {
    browser.contextMenus.create({
      id: MENU_SAVE_SELECTION_ID,
      title: '保存到提示词本',
      contexts: ['selection'],
    });
  });
}

/** 把选中的文字存成一条提示词，归入「未归类」，标题自动取首行。 */
async function saveSelection(text: string): Promise<void> {
  const content = text.trim();
  if (!content) return;

  try {
    const prompt = createPrompt(
      {
        title: deriveTitle(content, AUTO_TITLE_MAX_LENGTH),
        content,
        folderId: null,
        tags: [],
      },
      createId(),
      timestamp(),
    );
    await updateData((current) => ({
      ...current,
      prompts: [prompt, ...current.prompts],
    }));
  } catch (error) {
    console.error('[Prompt Box] 保存选中文字失败：', error);
  }
}

export default defineBackground(() => {
  // 点击工具栏图标直接打开侧边栏，不再需要先弹一个空面板。
  browser.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error: unknown) => console.error('[Prompt Box] 侧边栏行为设置失败：', error));

  browser.runtime.onInstalled.addListener(buildContextMenu);
  browser.runtime.onStartup.addListener(buildContextMenu);

  browser.contextMenus.onClicked.addListener((info) => {
    if (info.menuItemId !== MENU_SAVE_SELECTION_ID) return;
    if (typeof info.selectionText !== 'string') return;
    void saveSelection(info.selectionText);
  });
});
