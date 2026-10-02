# Prompt-Box 项目地图

## 结构与依赖

`src/entrypoints/` 挂载扩展入口；`src/ui/` 提供侧边栏与设置页；
`src/domain/` 保存提示词、文件夹、标签规则及只含标题和原文的 Markdown 导出格式；
`src/infra/` 封装 Chrome storage、剪贴板和下载；`src/shared/` 放通用常量。
依赖只向下流动，架构边界由 `npm run check:arch` 校验。

## 主流程

- **保存与同步**：侧边栏、设置页和右键菜单通过 `infra/storage.updateData()`
  在共享 Web Lock 中读取最新数据、修改并写回；`chrome.storage.onChanged`
  让已打开的界面刷新。
- **分类与筛选**：提示词可选一个文件夹，并带多个标签；两者互不修改，筛选条件可叠加。
- **复制**：提示词卡片触发 `infra/clipboard.ts`，成功后由 toast 短暂反馈。
- **导出**：`domain/markdown.ts` 按最近修改时间生成标题和原文；
  `infra/markdown-export.ts` 负责下载 `.md` 文件。没有导入流程。

## 重要入口

- `src/entrypoints/background.ts`：侧边栏点击行为、右键保存选中文字。
- `src/entrypoints/sidepanel/main.ts` → `src/ui/sidepanel/App.vue`：记录、筛选、复制。
- `src/entrypoints/options/main.ts` → `src/ui/settings/App.vue`：导出、文件夹与标签管理。
- `src/ui/composables/useLibrary.ts`：界面状态、数据加载和写入编排。
- `src/infra/storage.ts`：唯一的本地数据读写与跨界面同步入口。
- `src/infra/sanitize.ts`：把新旧存储形状规整为标准领域数据，纯函数可独立回归。
- `tests/domain.test.js`：分类边界、筛选、存储修复和 Markdown 导出格式回归测试。
