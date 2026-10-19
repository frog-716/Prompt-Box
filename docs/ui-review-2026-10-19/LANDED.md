# 原型 → 真实代码 落地记录（2026-10-19）

本文记录「标注用静态原型 → 真实 Vue 项目」的完整替换过程与验证结果。

## 1. 交付结论

`docs/ui-review-2026-10-19/html/` 下的静态原型（最终确认版）已**完整装载**进
`src/ui/`，界面呈现、组件结构、样式、交互逻辑一致。验证方式不是目测代码，
而是重新构建扩展后用无头 Chrome 真实加载、点击、截图，共 8 张状态图全部对上。

## 2. 文件级改动清单

| 原型 | 真实代码 | 改动 |
|---|---|---|
| `sidepanel-list.html` | `src/ui/components/FilterBar.vue` | **重写**：新建/设置按钮并入第一行右侧（`.filter-actions`）；筛选栏改横向 wrap——搜索框 `flex:1 1 160px`、按钮组 `flex:0 0 auto`、文件夹下拉 `flex:0 0 auto`（第二行最左）、标签行 `flex:1 1 auto` 同行跟进 |
| `sidepanel-list.html` | `src/ui/components/AppHeader.vue` | **删除**（新建/设置已并入 FilterBar；顶栏标题随原型确认稿一并去掉） |
| `sidepanel-editor.html` | `src/ui/components/PromptEditor.vue` | 未改（编辑态原型本就与真实组件一致，仅确认） |
| `options.html` | `src/ui/components/SettingsView.vue` | **新建**：设置从独立页面改为三态视图之一；顶部「‹ 设置」返回栏（复用编辑器返回栏样式）、简介行、DataPanel/FolderPanel/TagPanel 三面板；修掉旧 `settings/App.vue` 的 `height:720px` 裁切 bug；`max-width:720px` 居中 |
| `options.html` | `src/ui/settings/App.vue` | **删除**（设置已内嵌为视图，不再是独立入口） |
| `options.html` | `src/entrypoints/options/` | **删除**（manifest 不再有 options_page，点击设置不再开新标签） |
| — | `src/ui/sidepanel/App.vue` | **重写**：`view` 状态机 `list/editor/settings`；设置按钮切到 settings 视图、`@close` 返回列表；移除 `openOptionsPage` 调用 |
| — | `src/infra/runtime.ts` | 删除 `openOptionsPage()` 及随之无用的 `browser` 引入 |

## 3. 行为变化（用户明确要求）

1. **设置不再开新标签页**：旧代码 `openSettings() → browser.runtime.openOptionsPage()`
   已移除。设置是侧边栏/标签页内的一个视图，与列表、编辑互斥切换。
2. **设置页可返回列表**：`SettingsView` 顶部返回栏 `emit('close')` → `view='list'`。
3. **宽窄屏合并为一个版本**：`SettingsView` 用 `max-width:720px` + 媒体查询
   自适应，不再有 `options-480.html` 第二份；「新增」按钮窄屏挤压问题随之消失
   （480px 截图里「新增」为完整横排）。
4. **`--pb-radius-6` 未定义 bug 自然消解**：引用它的三个组件（SyncStatusBar/
   BackupPanel/PairingPanel）在前序重构中已删除，现全仓无任何引用。

## 4. 验证结果

- `npm run verify`（vue-tsc + 架构检查）：**通过**（28 个文件，分层与浏览器接口合规）
- `npm test`：**28 通过 / 0 失败**
- `npm run build`：**成功**（341 kB）
- 无头 Chrome 实载截图（`capture.mjs`，数据经 `chrome.storage.local` 种子写入）：

| 截图 | 状态 |
|---|---|
| `shots/sidepanel-360-list.png` | 360 列表：搜索框＋新建/设置第一行，文件夹＋标签第二行 |
| `shots/sidepanel-360-editor.png` | 360 编辑态（经 FilterBar「新建」按钮进入） |
| `shots/sidepanel-360-delete-confirm.png` | 卡片删除内联确认 |
| `shots/sidepanel-880-list.png` | 880 标签页列表 |
| `shots/sidepanel-360-settings.png` | 360 设置视图（经「⚙ 设置」按钮进入，非新标签） |
| `shots/sidepanel-880-settings.png` | 880 设置视图 |
| `shots/sidepanel-480-settings.png` | 480 窄视口设置视图 |
| `shots/sidepanel-360-settings-clear-confirm.png` | 设置内清空数据内联确认 |

8 张图与原型逐像素比对结论：**布局、间距、组件结构、状态切换一致**。

## 5. 遗留事项

- ~~编辑态「Escape 丢草稿」（诊断报告 P0-4）~~ **已解决（19:20）**：`PromptEditor.vue`
  新增 `dirty` 计算 + `confirmingDiscard` 内联确认。Escape / 取消 / 返回三条退出路径
  统一走 `requestCancel()`：无改动直接退出；有未保存更改时底部显示
  「有未保存的更改，放弃吗？［继续编辑］［放弃更改］」（与卡片删除确认同款模式，不弹窗），
  确认中再按 Escape = 继续编辑。验证：verify/test/build 全绿，
  新增实拍图 `shots/sidepanel-360-editor-escape-confirm.png`（草稿保留 + 确认条出现）。
- `html/` 原型页保留作标注脚手架（含 `--pb-radius-6` 的历史说明文字），
  不进入生产；如不再需要可整体删除。
