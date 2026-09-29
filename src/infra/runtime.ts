/**
 * 扩展运行环境适配。
 *
 * 表现层不直接碰浏览器 API，需要「打开设置页」这类扩展级操作时走这里。
 * 这样 ui 层的依赖清单里不会出现任何浏览器接口，换宿主环境时只改这一个文件。
 */

import { browser } from 'wxt/browser';

/** 打开扩展的设置页。 */
export function openOptionsPage(): void {
  void browser.runtime.openOptionsPage();
}
