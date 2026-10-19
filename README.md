# Prompt-Box

**把好用的提示词留得住、找得回、拿得走。**

Prompt-Box 是一款中文 Chrome 扩展，围绕提示词的日常积累设计：保存、分类、搜索，最后由你决定复制到哪里使用。

![Prompt-Box 主列表：温润纸感界面与虚构提示词](docs/screenshots/prompt-box-showcase.png)

![Prompt-Box 搜索、文件夹和标签组合筛选界面](docs/screenshots/prompt-box-filters.png)

![Prompt-Box 编辑标题、原文、文件夹和标签的界面](docs/screenshots/prompt-box-editor.png)

> 三张图都由项目内的隔离预览加载真实 Vue 主界面生成，条目是虚构演示数据。预览只在内存中修改示例内容；图外的浅边框、圆角和阴影是展示装饰，不改实际界面。窄屏查看时可点图打开原尺寸。截图没有扩展管理页、真实提示词、账号信息或配对码。

## 为什么做

常用提示词容易散落在聊天记录、便签和文档里。需要复用时，往往要重新搜索、手动整理，或者凭记忆再写一遍。Prompt-Box 把这些片段收进一个轻量小本子，让分类和取用保持简单，也让用户清楚数据存在哪里。

## 适用场景

- 把反复使用的写作、总结、调研提示词集中保存。
- 用文件夹整理主题，再用标签交叉标记；筛选条件可以叠加。
- 在页面中选中一段文字，通过右键菜单保存为新条目。
- 需要时复制原文，再自行粘贴到任意工具中。
- 在 Chrome 侧栏里快速查看，或用独立标签页打开主界面。

## 产品亮点

- **小而直接**：主流程只有记、分、取；列表、编辑和设置围绕提示词本身展开。
- **分类灵活**：一条提示词归属一个文件夹，也可以带多个标签。
- **编辑有保护**：保存时会核对打开编辑时的原记录；如果另一页面已修改或删除它，保留草稿并提示用户处理。
- **数据在本地**：所有数据存于扩展自己的 `chrome.storage.local`，不申请任何网站访问权限，不上传、无账号。
- **按需备份**：可导出 Markdown 供阅读与整体复制保存；Markdown 不含可恢复的分类数据，仅作备份参考。

## 架构

正式构建 `chrome-local` 只使用扩展自己的 `chrome.storage.local`，不请求网站访问权限。代码依赖按单向分层组织：

`entrypoints/` 负责挂载与事件接线，`ui/` 处理 Vue 渲染和状态编排，`infra/` 封装浏览器存储、剪贴板与导出，`domain/` 提供纯业务规则，`shared/` 存放通用常量和工具。`domain/` 不依赖浏览器 API、DOM 或 Vue。

分层依赖由 `npm run check:arch` 检查。更多数据流与目录说明见 [MAP.md](./MAP.md)，跨工具工程规范见 [AGENTS.md](./AGENTS.md)。

## 本地运行

需要 Node.js 和 npm。

```bash
npm install
npm run verify
npm test
npm run build
```

构建产物位于 `.output/chrome-local/chrome-mv3`。在 Chrome 扩展管理页开启开发者模式后，选择该目录加载未打包扩展。首次安装和更新时请保持加载目录及扩展身份稳定；更换目录不等同于迁移现有扩展数据。

## 演示截图

```bash
npm run showcase:screenshot
```

脚本使用隔离的临时 Chrome 配置和虚构内存数据，加载项目真实的 `src/ui/sidepanel/App.vue`，通过界面控件生成主列表、组合筛选和编辑三张 2× 演示截图。脚本关闭后删除临时浏览器配置；它不会加载、读取或改写用户扩展数据，也不会打开扩展管理页。

## 数据与边界

- 不向任何网站注入脚本，不自动填写输入框。
- 不申请网站访问权限（`host_permissions` 为空）。
- 没有账号、云同步或社区提示词库；不上传用户数据。
- 数据仅存放于对应扩展的 `chrome.storage.local`，不读取或迁移任何其他扩展的存储。
- 界面目前使用简体中文。

## 技术栈

Vue 3、TypeScript、WXT、Vite；业务逻辑使用原生 composables，不依赖额外状态管理库。

```bash
npm run verify   # TypeScript + 架构检查
npm test         # 领域、存储适配与导出回归测试
npm run build    # 正式本地构建
```

## 来源

本项目参考 [Open Prompt Manager](https://github.com/jonathanbertholet/promptmanager)，并按本项目的本地优先边界重新组织。

## License

MIT
