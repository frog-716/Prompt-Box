# Prompt-Box 项目地图

## 结构与依赖

`src/entrypoints/` 挂载扩展入口；`src/ui/` 提供侧边栏与主界面标签页，
界面为三态视图（`list` 列表 / `editor` 编辑 / `settings` 设置，均在侧边栏内切换）；
`src/domain/` 保存提示词、文件夹、标签规则及 Markdown 导出格式；
`src/infra/` 封装 Chrome storage、剪贴板和下载；`src/shared/` 放通用常量。
依赖只向下流动，架构边界由 `npm run check:arch` 校验。

## 主流程

- **保存与同步**：侧边栏、设置视图和右键菜单通过 `infra/storage.updateData()`
  在共享 Web Lock 中读取最新数据、修改并写回；`chrome.storage.onChanged`
  让已打开的界面刷新。编辑保存在锁内核对打开表单时的原记录；记录已删除或被修改时
  返回明确结果，不覆盖最新内容，界面保留草稿并允许另存为新提示词。
- **分类与筛选**：提示词可选一个文件夹，并带多个标签；两者互不修改，筛选条件可叠加。
  文件夹名称校验和数量统计统一由 `domain/folder.ts` 提供。
- **复制**：提示词卡片触发 `infra/clipboard.ts`，成功后由 toast 短暂反馈。
- **导出**：`domain/markdown.ts` 按最近修改时间生成标题、原文和独立的文件夹/标签署名；
  `infra/markdown-export.ts` 负责下载 `.md` 文件；Markdown 仅用于阅读，不支持从 Markdown 恢复库数据。数据备份只通过此 Markdown 导出。

## 构建目标

- `npm run build`（wxt build）生成唯一目标 `chrome-local`：数据只在 `chrome.storage.local`，`host_permissions` 为空。
- 本项目只有这一个构建目标，不再有任何同机共享 / 同步 / 多端试验构建。

## 重要入口

- `src/entrypoints/background.ts`：打开主界面标签页、右键保存选中文字。
- `src/entrypoints/library/main.ts` → `src/ui/sidepanel/App.vue`：主界面标签页，提供记录、筛选、复制。
- `src/ui/components/SettingsView.vue`：侧边栏内设置视图（`sidepanel/App.vue` 的
  `view` 状态机 `list/editor/settings` 三态之一，可返回列表）：导出、文件夹与标签管理。
- `src/ui/composables/useLibrary.ts`：界面状态、数据加载和写入编排。
- `src/infra/storage.ts`：本地 `chrome.storage.local` 的唯一入口，Web Lock 串行读写；数据清洗在 `sanitize.ts`。
- `src/infra/sanitize.ts`：把新旧存储形状规整为标准领域数据，纯函数可独立回归；重复提示词 ID 修复时保留内容，同名文件夹合并时保留归属，未知数据版本阻止写回。
- `scripts/check-architecture.mjs`：解析 TS/Vue 语法树，检查依赖方向和违规浏览器接口调用。
- `tests/`：领域与导出格式、异常数据、并发写入与架构检查回归测试。
