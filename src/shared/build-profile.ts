import type { SyncClientId } from './sync-targets';

declare const __PROMPT_BOX_BUILD_CLIENT_ID__: SyncClientId | null;
declare const __PROMPT_BOX_BUILD_SURFACE__: 'chrome' | 'gpt';

/** 构建时写入的身份，不能用展示名称推断，两个入口共用同一扩展名称。 */
export const BUILD_CLIENT_ID: SyncClientId | null =
  typeof __PROMPT_BOX_BUILD_CLIENT_ID__ === 'undefined' ? null : __PROMPT_BOX_BUILD_CLIENT_ID__;

export const BUILD_SURFACE: 'chrome' | 'gpt' =
  typeof __PROMPT_BOX_BUILD_SURFACE__ === 'undefined' ? 'chrome' : __PROMPT_BOX_BUILD_SURFACE__;
