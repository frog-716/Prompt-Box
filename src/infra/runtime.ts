/**
 * 扩展运行环境适配。
 *
 * 表现层不直接碰浏览器 API，需要「打开设置页」这类扩展级操作时走这里。
 * 这样 ui 层的依赖清单里不会出现任何浏览器接口，换宿主环境时只改这一个文件。
 */

import { browser } from 'wxt/browser';
import { BUILD_CLIENT_ID, BUILD_SURFACE } from '@/shared/build-profile';
import type { SyncClientId } from '@/shared/sync-targets';

export interface BuildProfile {
  surface: 'chrome' | 'gpt';
  storage: 'local' | 'shared';
  clientId: SyncClientId | null;
}

/** 使用构建时固定的目标，不从可见名称或当前页面推断扩展身份。 */
export function getBuildProfile(): BuildProfile {
  return {
    surface: BUILD_CLIENT_ID ? BUILD_SURFACE : 'chrome',
    storage: BUILD_CLIENT_ID ? 'shared' : 'local',
    clientId: BUILD_CLIENT_ID,
  };
}

/** 本地测试与 composable 读取该值时，未提供 WXT runtime 的情况按本地模式处理。 */
export function isSharedSyncBuild(): boolean {
  try {
    return getBuildProfile().storage === 'shared';
  } catch {
    return false;
  }
}

/** 打开扩展的设置页。 */
export function openOptionsPage(): void {
  void browser.runtime.openOptionsPage();
}
