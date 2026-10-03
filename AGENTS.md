# AGENTS.md — Prompt-Box 工程规范

> 这份文件是本项目**唯一的工程规范**。任何 AI 编码工具接手时，先读这里。
>
> 不在别处维护副本。`AGENTS.md` 是跨工具通用约定 —— Claude Code、Cursor、
> Codex、Zed、Gemini CLI、Windsurf 等都已支持直接读取它。要改规范，只改这一份。

---

## 1. 这个项目是什么

Prompt-Box 是一个 Chrome 扩展（Manifest V3），只做三件事：

1. **记** —— 随时把提示词存下来；
2. **分** —— 用文件夹（单选归属）和标签（多选标记）分类；
3. **取** —— 点一下就复制到剪贴板。

**正式本地版明确不做的事**（这是设计约束，不是待办）：

- 不往任何第三方网站注入脚本、不自动填写输入框；
- 正式本地版不申请网站访问权限（`host_permissions` 为空）；
- 不上传任何数据到服务器，没有账号体系，没有社区库；
- 不做多语言（界面只有中文）。

任何正式版新增需求如果触碰以上边界，先确认是否要推翻项目定位，而不是直接实现。

### 隔离同机共享试验例外

只有用户明确要求的隔离试验构建可以运行本机共享服务。这个例外不能改变默认 `chrome-local` 构建，也不能进入正式发布而未经单独审批：

- `chrome-local` 仍只用 `chrome.storage.local`，生成的 `host_permissions` 必须为空。
- `chrome-sync` 与 `gpt-sync` 只请求 `http://127.0.0.1:18763/*`，只连接绑定到 `127.0.0.1` 的本机服务；没有远程地址、注入脚本或自动填表。
- 共享试验版数据与正式本地扩展数据分离。开发手动服务默认使用 `.local-sync-test-data/`；当前 Mac 经用户批准另行配置了每用户 LaunchAgent，将稳定服务数据放在 `~/Library/Application Support/Prompt-Box/Data/`，代码与数据均不依赖试验 worktree。LaunchAgent 登录时启动并在进程退出后重启；仓库构建不会自动安装此配置。服务只绑定 `127.0.0.1:18763`。共享读写要求用户在扩展界面完成配对：一次性配对码只授权指定的另一构建，5 分钟过期且仅使用一次；每个扩展有独立随机设备凭据，服务只保存校验值，扩展凭据存于 `storage.local` 的 trusted contexts 中并可撤销。Origin allowlist、Host 与 CORS 是纵深防护；同一操作系统用户下的恶意本机进程仍不在信任范围内，禁止开放给局域网。
- 不从正式扩展自动读入、迁移或覆盖数据。当前已安装的正式本地版只有 Markdown 导出，没有完整 JSON 备份；Markdown 不是可恢复备份。试验构建的 JSON 导出只访问当前构建自己的存储，不能代替原扩展的导出。不得读取 Chrome profile 数据库或绕过扩展 UI；在原扩展具备受支持的 JSON 导出入口前，迁移路径不可用。以后迁移只能由用户手动选择 JSON 文件开始，显示预览与冲突选择后再次确认。
- 不在其他机器或常规仓库安装中自动启动/安装系统服务；当前用户配置的每用户 LaunchAgent 是本次明确授权的本机例外。不得在聊天、日志或截图传递配对码。共享试验数据仍不会自动读取或迁移正式扩展的数据。

---

## 2. 架构与依赖方向（铁律）

分层是单向的，**下层永远不知道上层的存在**：

```
entrypoints  →  ui  →  infra  →  domain
                  ↘      ↓        ↙
                     shared
```

| 层 | 目录 | 职责 | 允许依赖 |
|---|---|---|---|
| 领域层 | `src/domain/` | 类型定义 + 纯业务规则。无副作用、无异步、无外部 API | 仅自身 |
| 基础设施层 | `src/infra/` | 浏览器 API 的唯一入口（storage、clipboard、文件下载） | domain, shared |
| 表现层 | `src/ui/` | Vue 组件与 composables，把用户动作翻译成领域操作 | domain, infra, shared |
| 入口层 | `src/entrypoints/` | 只做挂载与事件接线，不放业务逻辑 | ui, infra, domain |
| 公共层 | `src/shared/` | 常量与通用工具，与业务无关 | 仅自身 |

### 硬性禁止项

- `domain/` 里出现 `chrome.*`、`window`、`document`、`vue` —— **一律禁止**。
  领域函数必须是纯函数，给定输入必定得到相同输出。
- `ui/` 里直接调用 `chrome.storage.*` —— 禁止，必须走 `infra/storage.ts`。
- `infra/` 里 import 任何 `.vue` 文件 —— 禁止。
- 任何层反向依赖上层 —— 禁止。

这些规则由 `npm run check:arch` 解析 TS/Vue 语法树自动校验（包含模板表达式），提交前必须通过。

---

## 3. 目录地图

```
src/
├── entrypoints/            # WXT 入口，每个子目录 = 一个扩展入口
│   ├── background.ts       # service worker：右键菜单 + 侧栏/标签页入口行为
│   ├── library/            # 图标打开的独立主界面标签页
│   ├── sidepanel/          # Chrome 侧边栏挂载入口
│   └── options/            # 设置页
├── domain/                 # 纯业务逻辑
│   ├── types.ts            # Prompt / Folder / PromptBoxData 等模型
│   ├── prompt.ts           # 提示词的增删改查、筛选、标签操作
│   ├── folder.ts           # 文件夹的增删改
│   └── markdown.ts         # Markdown 导出格式
├── infra/                  # 浏览器 API 适配
│   ├── storage.ts          # chrome.storage.local 封装与跨界面同步
│   ├── sync-storage.ts     # 仅共享试验构建使用的轮询、幂等重试与版本冲突适配
│   ├── sanitize.ts         # 旧格式兼容与脏数据修复
│   ├── clipboard.ts        # 复制，含降级方案
│   └── markdown-export.ts  # Markdown 文件下载
├── ui/
│   ├── sidepanel/App.vue   # 侧边栏根组件
│   ├── settings/App.vue    # 设置页根组件
│   ├── components/         # 可复用组件（settings/ 下为设置页专用）
│   ├── composables/        # 状态编排
│   └── styles/global.css   # 设计令牌 + 全局样式
└── shared/                 # 常量与通用工具
```

完整结构与数据流见 [`MAP.md`](./MAP.md)。领域与导出格式测试位于 `tests/`。

`tools/local-sync/server.mjs` 是仅供同机共享构建使用的回环服务；`chrome-local` 不会使用它。
开发手动服务可通过 `PROMPT_BOX_SYNC_DATA_DIR` 指定试验目录；默认目录为 `.local-sync-test-data/`。当前 Mac 的已批准 LaunchAgent 使用独立稳定目录 `~/Library/Application Support/Prompt-Box/Data/`，生产 CLI 端口固定为 `18763`。
`src/domain/backup.ts` 与 `src/infra/json-backup.ts` 提供用户主动选择的 JSON 备份预览及恢复。

---

## 4. 常用命令

```bash
npm install          # 安装依赖（会自动跑 wxt prepare 生成类型）
npm run dev          # 开发模式，带热更新，自动打开 Chrome
npm run build        # 正式本地构建，产物在 .output/chrome-local/chrome-mv3
npm run build:chrome-sync # 隔离 Chrome 侧栏 + 同机共享试验构建
npm run build:gpt-sync    # 隔离 GPT 兼容标签页 + 同机共享试验构建
npm run sync:start        # 手动启动 127.0.0.1 隔离测试服务；按 Ctrl+C 停止
npm run typecheck    # 类型检查
npm run check:arch   # 校验分层依赖方向
npm test             # 领域逻辑与导出格式回归测试
npm run verify       # 一次跑完 typecheck + check:arch
```

WXT 输出目录为 `.output/<target>/chrome-mv3`。正常本地构建 target 是 `chrome-local`。
仅进行隔离试验时，先审阅两份 manifest 和本规范，再在终端手动运行 `npm run sync:start`，加载对应的 `.output/chrome-sync/chrome-mv3` 与 `.output/gpt-sync/chrome-mv3`。
这些共享构建与正式本地版 ID 和数据源分离。当前 Mac 的持久 LaunchAgent 使用 `~/Library/Application Support/Prompt-Box/Data/library.json`，每次持久写入前将完整原始服务容器快照到 `Data/Backups/`，最多保留 20 份有效快照（目录 700、文件 600）；若主库缺失但备份仍在，必须停止并先人工校验恢复，不得创建空库。稳定 Service 已部署严格的崩溃残留临时文件隔离：仅将精确匹配格式、PID 已退出、属主为当前用户且权限为 600 的普通文件移入私有 `Data/Backups/Quarantine/`；检查点比较设备号、inode、大小、mtime 与 ctime。不要跟随或主动删除符号链接、陌生文件、权限不符、仍运行或检查点状态不符的文件，遇到这些文件必须保留现场并阻止写入。最后一次检查和 rename/unlink 间仍存在同一 OS 用户竞争窗口；此代码不防恶意同用户进程。稳定 Node runtime 位于 `~/Library/Application Support/Prompt-Box/Runtime/`，LaunchAgent 不依赖 Feishu 路径。迁移基线副本保存在 `MigrationBackup/library.json`。删除 worktree 不会删除 Application Support 数据；卸载或删除该 Data 目录会丢失当前共享库及配对状态。

---

## 5. 开发约定

### 数据流

```
正式本地版：用户操作 → composables 调 domain 函数
        → infra/storage 在共享锁内读改写 chrome.storage.local
        → chrome.storage.onChanged 广播 → 各界面同步

隔离共享试验版：用户操作 → composables 调 domain 函数
        → infra/sync-storage 带 baseRevision 与 requestId 提交至本机服务
        → 服务端串行校验版本并原子写入 .local-sync-test-data
        → 各扩展界面轮询刷新；冲突/离线明确显示，不回退到另一份本地库
```

界面的写操作统一经过 `useLibrary.commit()`；右键菜单也调用
`infra/storage.updateData()`。该方法使用共享 Web Lock 串行读改写，
避免并行打开侧边栏和设置页时用旧快照覆盖新数据。不要直接写 storage。编辑保存必须携带打开表单时的原记录；如果最新记录已变化或被删除，
返回冲突或缺失结果，保留草稿，不显示保存成功。

### 数据模型

- 正式本地版存储键只有一个：`promptBox`，结构见 `domain/types.ts` 的 `PromptBoxData`。
- 同机试验服务另有版本化 JSON 容器和请求回执；不能改变领域数据格式，不能假设客户端来源标记是认证。
- 结构变更时递增 `SCHEMA_VERSION`，并在 `infra/sanitize.ts` 的 `sanitizeData()`
  里补迁移逻辑。未知版本必须阻止写回，避免旧版本覆盖新结构。
  **永远不要**假定存储里的数据是干净的。
- 提示词用 `id`（uuid）做主键；`sanitizePrompt()` 兼容旧版本地数据里的
  `uuid` 字段。Markdown 文件不能直接恢复分类数据；JSON 备份恢复必须先预览、选择冲突方案并二次确认。

### 界面

- 颜色、圆角、间距一律用 `global.css` 里的 CSS 变量，**不要写死色值**。
- 组件只负责渲染与事件转发，状态放在 composables。
- 破坏性操作（删除）用内联二次确认，不用 `window.confirm`。
- 反馈用底部 toast，不用 alert。

### 文案

界面文字用简体中文，注释也用中文。代码标识符用英文。

---

## 6. 扩展点

| 想做什么 | 改哪里 |
|---|---|
| 加一个提示词字段 | `domain/types.ts` → `infra/sanitize.ts` 的 `sanitizePrompt()` → 表单组件 |
| 加一种筛选维度 | `domain/prompt.ts` 的 `filterPrompts()` → `useFilters` → `FilterBar.vue` |
| 加一个设置项 | `ui/components/settings/` 下新建 panel → `ui/settings/App.vue` 组装 |
| 加一个右键菜单项 | `entrypoints/background.ts` 的 `buildContextMenu()` |
| 换存储后端（如 IndexedDB） | 只改 `infra/storage.ts`，上层无感 |
| 换 UI 框架（如 React） | 只改 `ui/` 与 `entrypoints/*/main.ts`，domain 与 infra 不动 |

---

## 7. 提交前自查

- [ ] `npm test` 与 `npm run verify` 全绿；改动试验目标时另外审阅三份构建 manifest
- [ ] 没有把业务逻辑写进 `.vue` 组件
- [ ] 没有在 `domain/` 里引入浏览器 API
- [ ] 新增的存储字段有对应的 sanitize 逻辑
- [ ] 破坏性操作有二次确认
