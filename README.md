# Prompt-Box

一个自己用的提示词小本子。Chrome 扩展，只做三件事：**记、分、取**。

- **记** —— 随时把提示词存下来，网页上选中文字右键也能直接入库
- **分** —— 文件夹管大类，标签做交叉标记，两个维度叠加筛选
- **取** —— 点一下就复制到剪贴板，粘贴到哪儿都行

## 它不是什么

这是刻意划的边界，不是还没做：

- 不往 ChatGPT、Claude 之类网站注入脚本，不自动填输入框
- 不申请任何网站访问权限（`host_permissions` 为空）
- 不上传数据、没有账号、没有社区库
- 只有中文界面

## 安装

```bash
npm install
npm run build
```

然后打开 `chrome://extensions`，开启右上角「开发者模式」，点「加载已解压的扩展程序」，
选择 `.output/chrome-mv3` 目录。

装好后点浏览器工具栏上的图标，右侧就会滑出侧边栏。

## 开发

```bash
npm run dev        # 带热更新，会自动打开一个装了扩展的 Chrome
npm test           # 领域逻辑与 Markdown 格式回归测试
npm run verify     # 类型检查 + 分层依赖校验，提交前跑这个
npm run build      # 生产构建
```

## 技术栈

| | |
|---|---|
| 扩展框架 | [WXT](https://wxt.dev) — 自动生成 manifest，支持多浏览器构建 |
| 界面 | Vue 3 + TypeScript |
| 构建 | Vite |
| 状态 | 原生 composables，没有引入状态库 |

## 架构

分层是单向的，下层不知道上层的存在：

```
entrypoints  →  ui  →  infra  →  domain
                  ↘      ↓        ↙
                     shared
```

- `domain/` 是纯函数区 —— 不碰 `chrome`、不碰 DOM、不碰 Vue，因此可测试、可复用
- `infra/` 是浏览器 API 的唯一入口 —— 换存储后端只改这里
- `ui/` 只管渲染与事件转发
- `entrypoints/` 只做挂载

这条规则不靠自觉：`npm run check:arch` 会扫描全部源码，发现跨层引用就报错。

项目结构与主流程见 [`MAP.md`](./MAP.md)。

**完整的工程规范见 [`AGENTS.md`](./AGENTS.md)** —— 那也是所有 AI 编码工具的入口。

## 数据与隐私

所有提示词存在 `chrome.storage.local` 里，也就是这台电脑的浏览器里。
卸载扩展会删除这些数据；设置页可导出 Markdown 文件。

Markdown 导出规范：

- 文件为 UTF-8，名称为 `prompt-box-YYYYMMDD-HHmmss-SSS.md`，时间使用本机时区；
- 提示词按最近修改时间倒序排列；相邻条目之间空一行，文件以换行符结束；
- 每条提示词包含二级标题 `## 标题`、`text` 围栏中的原文，以及原文下方独立的文件夹和标签行；
- 分类格式为 `- 文件夹：名称`、`- 标签：#标签一、#标签二`；无文件夹时标为“未归类”，无标签时标为“无”；
- 文件夹和标签各自署名，不会合并；同名时仍分别列出；
- 标题中的 Markdown 特殊字符会转义；空标题显示为“未命名提示词”；
- 围栏至少三个反引号，并比原文中最长的连续反引号多一个；
- 文件不含时间或统计信息；空库时禁用导出。

导出用于阅读和复用，不用于恢复扩展内的分类信息。

设置页只保留 Markdown 导出，不提供导入。

## 数据模型

存储只有一个键 `promptBox`：

```ts
{
  version: 1,
  prompts: [{ id, title, content, folderId, tags, createdAt, updatedAt }],
  folders: [{ id, name, createdAt }]
}
```

读取时会走一遍 `sanitizeData()` 修复旧版本残留和异常数据。读取失败会明确提示，
不会误显示为空库。界面修改使用共享锁基于最新快照写入，避免侧边栏与设置页互相覆盖。

## 来源

本项目是对 [jonathanbertholet/promptmanager](https://github.com/jonathanbertholet/promptmanager)
（Open Prompt Manager，MIT）的精简重构。

原版约 1.2 万行代码，其中九成用于「在 20 个 AI 网站上自动填输入框」——
需要申请全网访问权限，且每个网站改版都可能失效。本项目砍掉了整层注入能力，
只保留提示词库本身，代码量降到约 1 千行，权限从 6 项 + 全网访问降到 4 项 + 零网站权限。

## License

MIT
