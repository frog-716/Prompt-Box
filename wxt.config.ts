import { defineConfig } from 'wxt';

declare const process: { env: Record<string, string | undefined> };

/**
 * Prompt-Box 构建配置。
 *
 * 只保留 chrome-local 一个目标：仅申请本地存储、右键菜单、剪贴板写入，
 * host_permissions 为空，数据只在本地。
 */
export default defineConfig({
  srcDir: 'src',
  outDir: `${process.env.PROMPT_BOX_OUTPUT_ROOT ?? '.output'}/chrome-local`,
  modules: ['@wxt-dev/module-vue'],
  manifest: {
    name: 'Prompt Box',
    description: '随时记录提示词，分类管理，一键复制取用。',
    permissions: ['storage', 'contextMenus', 'clipboardWrite'],
    host_permissions: [],
    minimum_chrome_version: '114',
    action: {
      default_title: '打开提示词本',
    },
  },
});
