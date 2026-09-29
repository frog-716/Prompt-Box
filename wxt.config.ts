import { defineConfig } from 'wxt';

/**
 * Prompt-Box 构建配置。
 *
 * 设计要点：
 * - 权限最小化：只需要侧边栏、本地存储、右键菜单、剪贴板四项，
 *   不申请任何网站访问权限（host_permissions 为空）。
 * - srcDir 指向 src，使入口、领域层、基础设施层、表现层都在同一根下，
 *   目录即分层，一眼能看出依赖方向。
 */
export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-vue'],
  manifest: {
    name: 'Prompt Box',
    description: '随时记录提示词，分类管理，一键复制取用。',
    permissions: ['sidePanel', 'storage', 'contextMenus', 'clipboardWrite'],
    action: {
      default_title: '打开提示词本',
    },
    minimum_chrome_version: '114',
  },
});
