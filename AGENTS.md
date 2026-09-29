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

**明确不做的事**（这是设计约束，不是待办）：

- 不往任何第三方网站注入脚本、不自动填写输入框；
- 不申请任何网站访问权限（`host_permissions` 永远为空）；
- 不上传任何数据到服务器，没有账号体系，没有社区库；
- 不做多语言（界面只有中文）。

任何新增需求如果触碰以上四条，先确认是否要推翻项目定位，而不是直接实现。

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

这些规则由 `npm run check:arch` 自动校验，提交前必须通过。

---

## 3. 目录地图

```
src/
├── entrypoints/            # WXT 入口，每个子目录 = 一个扩展入口
│   ├── background.ts       # service worker：右键菜单 + 侧边栏行为
│   ├── sidepanel/          # 侧边栏（主界面）
│   └── options/            # 设置页
├── domain/                 # 纯业务逻辑
│   ├── types.ts            # Prompt / Folder / PromptBoxData 等模型
│   ├── prompt.ts           # 提示词的增删改查、筛选、标签操作
│   └── folder.ts           # 文件夹的增删改
├── infra/                  # 浏览器 API 适配
│   ├── storage.ts          # chrome.storage.local 封装 + 脏数据修复
│   ├── clipboard.ts        # 复制，含降级方案
│   └── backup.ts           # 导入导出
├── ui/
│   ├── sidepanel/App.vue   # 侧边栏根组件
│   ├── settings/App.vue    # 设置页根组件
│   ├── components/         # 可复用组件（settings/ 下为设置页专用）
│   ├── composables/        # 状态编排
│   └── styles/global.css   # 设计令牌 + 全局样式
└── shared/                 # 常量与通用工具
```

---

## 4. 常用命令

```bash
npm install          # 安装依赖（会自动跑 wxt prepare 生成类型）
npm run dev          # 开发模式，带热更新，自动打开 Chrome
npm run build        # 生产构建，产物在 .output/chrome-mv3
npm run typecheck    # 类型检查
npm run check:arch   # 校验分层依赖方向
npm run verify       # 一次跑完 typecheck + check:arch
```

在 Chrome 里加载：`chrome://extensions` → 打开开发者模式 → 「加载已解压的扩展程序」→ 选 `.output/chrome-mv3`。

---

## 5. 开发约定

### 数据流

```
用户操作 → 组件 emit → composables 调 domain 函数算出新数据
        → infra/storage 落盘 → chrome.storage.onChanged 广播 → 各界面同步
```

**唯一写入点**是 `useLibrary` 里的 `commit()`。任何新增的写操作都要走它，
不要另起炉灶直接写 storage —— 否则侧边栏和设置页会不同步。

### 数据模型

- 存储键只有一个：`promptBox`，结构见 `domain/types.ts` 的 `PromptBoxData`。
- 结构变更时递增 `SCHEMA_VERSION`，并在 `infra/storage.ts` 的 `sanitizeData()`
  里补迁移逻辑。**永远不要**假定存储里的数据是干净的。
- 提示词用 `id`（uuid）做主键；`uuid` 是原版 Prompt Manager 的字段名，
  导入它的备份时靠 `sanitizePrompt()` 兼容。

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
| 加一个提示词字段 | `domain/types.ts` → `sanitizePrompt()` → 表单组件 |
| 加一种筛选维度 | `domain/prompt.ts` 的 `filterPrompts()` → `useFilters` → `FilterBar.vue` |
| 加一个设置项 | `ui/components/settings/` 下新建 panel → `ui/settings/App.vue` 组装 |
| 加一个右键菜单项 | `entrypoints/background.ts` 的 `buildContextMenu()` |
| 换存储后端（如 IndexedDB） | 只改 `infra/storage.ts`，上层无感 |
| 换 UI 框架（如 React） | 只改 `ui/` 与 `entrypoints/*/main.ts`，domain 与 infra 不动 |

---

## 7. 提交前自查

- [ ] `npm run verify` 全绿
- [ ] 没有把业务逻辑写进 `.vue` 组件
- [ ] 没有在 `domain/` 里引入浏览器 API
- [ ] 新增的存储字段有对应的 sanitize 逻辑
- [ ] 破坏性操作有二次确认
