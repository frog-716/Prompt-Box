/**
 * 后台服务。
 *
 * 这个扩展的后台刻意做得很薄 —— 只负责打开主界面和右键保存。
 *
 * 同机共享构建只向本机回环服务发请求；不会注入网站脚本。
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
  const manifest = browser.runtime.getManifest() as { side_panel?: { default_path?: string } };
  if (manifest.side_panel) {
    const sidePanel = (browser as unknown as {
      sidePanel?: { setPanelBehavior: (options: { openPanelOnActionClick: boolean }) => Promise<void> };
    }).sidePanel;
    if (sidePanel) {
      void sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
        .catch((error: unknown) => console.error('[Prompt Box] 启用 Chrome 侧边栏失败：', error));
    } else {
      openLibraryInTab();
    }
  } else {
    // GPT 内置浏览器使用普通扩展标签页，不读取或调用侧边栏 API。
    openLibraryInTab();
  }

  browser.runtime.onInstalled.addListener(buildContextMenu);
  browser.runtime.onStartup.addListener(buildContextMenu);

  browser.contextMenus.onClicked.addListener((info) => {
    if (info.menuItemId !== MENU_SAVE_SELECTION_ID) return;
    if (typeof info.selectionText !== 'string') return;
    void saveSelection(info.selectionText);
  });
});

function openLibraryInTab(): void {
  browser.action.onClicked.addListener(() => {
    void browser.tabs
      .create({ url: browser.runtime.getURL('/library.html') })
      .catch((error: unknown) => console.error('[Prompt Box] 打开提示词本失败：', error));
  });
}
