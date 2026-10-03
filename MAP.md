# Prompt-Box 项目地图

## 结构与依赖

`src/entrypoints/` 挂载扩展入口；`src/ui/` 提供侧边栏/标签页主界面与设置页；
`src/domain/` 保存提示词、文件夹、标签规则及含分类署名的 Markdown 导出格式；
`src/infra/` 封装 Chrome storage、剪贴板和下载；`src/shared/` 放通用常量。
依赖只向下流动，架构边界由 `npm run check:arch` 校验。

## 主流程

- **保存与同步**：侧边栏、设置页和右键菜单通过 `infra/storage.updateData()`
  在共享 Web Lock 中读取最新数据、修改并写回；`chrome.storage.onChanged`
  让已打开的界面刷新。编辑保存在锁内核对打开表单时的原记录；记录已删除或被修改时
  返回明确结果，不覆盖最新内容，界面保留草稿并允许另存为新提示词。
- **分类与筛选**：提示词可选一个文件夹，并带多个标签；两者互不修改，筛选条件可叠加。
  文件夹名称校验和数量统计统一由 `domain/folder.ts` 提供。
- **复制**：提示词卡片触发 `infra/clipboard.ts`，成功后由 toast 短暂反馈。
- **导出**：`domain/markdown.ts` 按最近修改时间生成标题、原文和独立的文件夹/标签署名；
  `infra/markdown-export.ts` 负责下载 `.md` 文件；Markdown 仅用于阅读，不支持从 Markdown 恢复库数据。
- **JSON 备份**：`domain/backup.ts` 计算差异和按用户选择的冲突方案合并；
  `infra/json-backup.ts` 校验并下载/读取完整 JSON。恢复先预览，再二次确认，并核对预览时快照未变化。

## 构建与存储目标

- `npm run build` 生成 `chrome-local`：存储仍只在 `chrome.storage.local`，`host_permissions` 必须为空。
- `npm run build:chrome-sync` 与 `npm run build:gpt-sync` 是本机共享目标：前者提供 Chrome 侧栏，后者不声明或调用 `sidePanel`，点击 action 会创建普通扩展标签页；两者均只请求 `http://127.0.0.1:18763/*`。当前 Mac 的每用户 LaunchAgent 在登录时启动服务并在崩溃后重启；可移植构建不会自动安装 LaunchAgent。没有 LaunchAgent 的开发机器使用 `.local-sync-test-data/` 或显式设置的测试目录。
- `tools/local-sync/server.mjs` 绑定 `127.0.0.1:18763`、限制精确扩展来源和请求大小；共享读写要求本机配对。一次性配对码限定另一扩展、5 分钟过期且仅能使用一次；各扩展凭据独立，服务只保存 SHA-256 校验值，扩展将凭据放在 `storage.local` 的 trusted contexts 内。用户可撤销设备凭据。Host、Origin 与 CORS 是纵深防护，不能防同一操作系统用户下的恶意本机进程；服务不支持局域网部署。当前 Mac 的稳定代码与数据位于 `~/Library/Application Support/Prompt-Box/`，原子写入前最多留 20 份私有快照。崩溃残留快照临时文件隔离修复已部署到稳定 Service；严格匹配的残留文件进入 `Data/Backups/Quarantine/`，陌生文件或符号链接会保留现场并阻止写入。本地服务数据不依赖 worktree。
- 共享提交使用 revision compare-and-swap、最多 256 条幂等回执及原子文件替换；客户端按间隔轮询，遇到未配对、冲突或离线不显示保存成功，也不回退到本机库。回执驱逐后的旧重试受单调递增的 revision 拦截。
- 从已有扩展迁入共享库只接受用户手动选择的 JSON 文件；选择后先预览新增项与冲突，用户选策略并二次确认。构建的导出不能读取另一扩展的存储；不得读取 Chrome profile 数据库或绕过扩展 UI。

## 重要入口

- `src/entrypoints/background.ts`：打开主界面标签页、右键保存选中文字。
- `src/entrypoints/library/main.ts` → `src/ui/sidepanel/App.vue`：主界面标签页，提供记录、筛选、复制。
- `src/entrypoints/options/main.ts` → `src/ui/settings/App.vue`：导出、文件夹与标签管理。
- `src/ui/composables/useLibrary.ts`：界面状态、数据加载和写入编排。
- `src/infra/storage.ts`：本地 `chrome.storage.local` 与同机试验适配的统一入口；共享版本和 pending retry 逻辑位于 `src/infra/sync-storage.ts`，本机配对流程位于 `src/infra/sync-pairing.ts`。
- `src/infra/sanitize.ts`：把新旧存储形状规整为标准领域数据，纯函数可独立回归；重复提示词 ID 修复时保留内容，同名文件夹合并时保留归属，未知数据版本阻止写回。
- `scripts/check-architecture.mjs`：解析 TS/Vue 语法树，检查依赖方向和违规浏览器接口调用。
- `tests/`：领域与导出格式、异常数据、双界面共享存储及架构检查回归测试。
