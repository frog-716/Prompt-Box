import { defineConfig } from 'wxt';
import {
  SYNC_MANIFEST_NAME,
  SYNC_CLIENTS,
  SYNC_HOST_PERMISSION,
} from './src/shared/sync-targets';

declare const process: { env: Record<string, string | undefined> };
const target = process.env.PROMPT_BOX_BUILD_TARGET ?? 'chrome-local';
const build = target === 'chrome-sync'
  ? { sync: true, surface: 'chrome', clientId: 'chrome-sync' as const }
  : target === 'gpt-sync'
    ? { sync: true, surface: 'gpt', clientId: 'gpt-sync' as const }
    : target === 'chrome-local'
      ? { sync: false, surface: 'chrome', clientId: null }
      : null;

if (!build) throw new Error(`未知 Prompt-Box 构建目标：${target}`);

const syncConfig = build.sync && build.clientId ? SYNC_CLIENTS[build.clientId] : null;

/**
 * Prompt-Box 构建配置。
 *
 * 设计要点：
 * - chrome-local 只申请本地存储、右键菜单、剪贴板写入，host_permissions 为空；
 *   两个共享目标另只请求本机回环服务权限。
 * - srcDir 指向 src，使入口、领域层、基础设施层、表现层都在同一根下，
 *   目录即分层，一眼能看出依赖方向。
 */
export default defineConfig({
  srcDir: 'src',
    outDir: `${process.env.PROMPT_BOX_OUTPUT_ROOT ?? '.output'}/${target}`,
  filterEntrypoints: build.surface === 'gpt'
    ? ['background', 'library', 'options']
    : ['background', 'library', 'options', 'sidepanel'],
  modules: ['@wxt-dev/module-vue'],
  vite: () => ({
    define: {
      __PROMPT_BOX_BUILD_CLIENT_ID__: JSON.stringify(build.clientId),
      __PROMPT_BOX_BUILD_SURFACE__: JSON.stringify(build.surface),
    },
  }),
  manifest: {
    // 保留正式本地版原名称，两个独立共享扩展使用用户指定的相同名称。
    name: syncConfig ? SYNC_MANIFEST_NAME : 'Prompt Box',
    description: syncConfig
      ? '使用这台 Mac 的本机共享服务；后台服务已设为自动启动，数据不会上传到远端。'
      : '随时记录提示词，分类管理，一键复制取用。',
    ...(syncConfig ? { key: syncConfig.publicKey } : {}),
    permissions: ['storage', 'contextMenus', 'clipboardWrite'],
    host_permissions: syncConfig ? [SYNC_HOST_PERMISSION] : [],
    minimum_chrome_version: '114',
    action: {
      default_title: '打开提示词本',
    },
  },
});
