import { createApp } from 'vue';

import '../../src/ui/styles/global.css';
import './showcase.css';
import App from '../../src/ui/sidepanel/App.vue';

createApp(App).mount('#prompt-app');

// 只在隔离的截图预览中通过真实控件切换演示场景，不进入扩展构建。
const scenario = new URLSearchParams(window.location.search).get('scenario');

if (scenario) {
  void (async () => {
    await nextFrames(2);

    if (scenario === 'filters') {
      const search = document.querySelector<HTMLInputElement>('.search-input');
      const folder = document.querySelector<HTMLSelectElement>('.folder-select');
      if (!search || !folder) throw new Error('截图预览尚未显示筛选控件。');

      search.value = '访谈';
      search.dispatchEvent(new Event('input', { bubbles: true }));
      folder.value = 'demo-folder-research';
      folder.dispatchEvent(new Event('change', { bubbles: true }));
      [...document.querySelectorAll<HTMLButtonElement>('.tag-pill')]
        .find((button) => button.textContent?.trim() === '#访谈')
        ?.click();
    } else if (scenario === 'editor') {
      const editButton = document.querySelector<HTMLButtonElement>('.card-action[aria-label="编辑"]');
      if (!editButton) throw new Error('截图预览尚未显示编辑控件。');
      editButton.click();
    }

    await nextFrames(2);
  })();
}

function nextFrames(count: number): Promise<void> {
  return new Promise((resolve) => {
    const advance = (): void => {
      if (count-- <= 0) resolve();
      else window.requestAnimationFrame(advance);
    };
    window.requestAnimationFrame(advance);
  });
}
