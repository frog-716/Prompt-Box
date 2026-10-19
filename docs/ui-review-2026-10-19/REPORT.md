# Prompt-Box 前端设计诊断报告

- 日期：2026-10-19
- 范围：侧边栏（sidepanel）、独立标签页（library）、设置页（options）三个界面 + 共享组件 + `src/ui/styles/global.css` 设计令牌
- 证据：7 张基线截图（`shots/`）+ 全部 UI 源码通读 + 令牌引用审计脚本
- 评审方式：**自检（未独立评审）**——独立评审子代理因使用频率限制不可用，本轮诊断由主执行者自查完成，标注可信度差异
- 结论先行：**纸感暖色方向成立、执行基本在线，但有 1 个真实样式 bug（圆角静默失效）、1 处设置页内容裁切、1 处窄屏按钮挤压；更深层的问题是设计令牌泛滥（85 个令牌、35 个只被一个文件用）导致"改一处要懂全局"，建议第二阶段做一轮令牌治理 + 删除确认组件统一。**

---

## 0. 现状规范（评审基准）

从 `global.css` 与各组件实际用法归纳，本项目的既有设计资产（保留不动）：

- **色彩**：米白纸面 `--pb-bg: #f9f8f6`、卡面 `--pb-surface: #fffdfc`、陶土橙强调 `--pb-accent: #c77560`、文字 `--pb-text: #2c2a29`，危险色系 `--pb-danger: #b85b50`
- **字体**：正文 `-apple-system` 系，展示标题用衬线 `--pb-font-display`（Georgia / Songti SC）
- **圆角**：默认 6px（`--pb-radius`）、小按钮 4px、胶囊 999px
- **间距**：`--pb-space-*` 系列，实际使用区间 4–24px 为主
- **阴影**：`--pb-shadow-card`（卡片静止）、`--pb-shadow-raised`（hover）
- **交互铁律**：卡片整卡点击=复制；删除内联二次确认；不用 window.confirm/alert；反馈走底部 toast

以下所有问题都在这套规范框架内评判，不建议换色、换字体。

---

## 1. 阻断级（P0）

### P0-1 圆角令牌 `--pb-radius-6` 未定义，三处按钮圆角静默失效

- **位置**：`SyncStatusBar.vue`（第 72 行）、`BackupPanel.vue`（第 130/135/139 行）、`PairingPanel.vue`（第 194/198/205/209/211 行）共 7 处引用 `var(--pb-radius-6)`
- **证据**：令牌审计脚本确认 `--pb-radius-6` 在 `global.css` 中**只有使用、没有定义**；截图 `options-760.png` 中「导出 JSON 备份」按钮、配对面板按钮为直角，而「导出 Markdown」按钮是 6px 圆角——同一页面圆角不一致
- **影响**：CSS 变量失效时属性回退到 initial（border-radius 0），不是渲染报错，肉眼容易被当成"设计如此"。属于代码 bug，不是风格问题
- **改法**：在 `global.css` 补 `--pb-radius-6: 6px`，或直接全局替换为既有 `--pb-radius-sm`（同为 6px）；替换后重截设置页核对圆角一致

### P0-2 设置页固定高度 720px，内容被裁切

- **位置**：`src/ui/settings/App.vue` `.settings { height: 720px; }`，兜底媒体查询 `@media (max-height: 719px)` 才变成 100vh
- **证据**：截图 `options-760.png`（视口 760×900）：「文件夹管理」面板的「未归类 / 编程开发」两行在容器底部 720px 边界处被横向切断，下方还有内容但完全看不到；720px 以下视口才会有滚动条
- **影响**：用户看不到完整内容，且无任何"下面还有"的暗示
- **改法**：`height: 100vh`（或 `min-height: 100vh` + 内容自然撑开），删除 720px 写死值和那条迟到的媒体查询

### P0-3 设置页 480px 窄屏「新增」按钮被挤成竖排

- **位置**：`FolderPanel.vue` `.add-row { display: flex; gap: 12px }`，按钮无 `flex-shrink: 0`
- **证据**：截图 `options-480.png`：「新增」两字被挤成竖排（`新`/`增` 两行）
- **改法**：`.add-row { flex-wrap: wrap }`，按钮 `flex: 0 0 auto`；输入框 `flex: 1; min-width: 0`

### P0-4 编辑页 Escape 直接退出，草稿丢失

- **位置**：`PromptEditor.vue` `onKeydown`：Escape → `emit('cancel')` → `closeEditor()`，表单内容被清空且不保留
- **证据**：代码审查。项目自己的约定（AGENTS.md §5）是"编辑保存必须携带打开表单时的原记录；冲突时保留草稿"——保存冲突场景都保留草稿，按一下 Escape 却直接丢，不一致
- **改法**：内容非空时 Escape 先进入内联确认（"退出将丢弃当前草稿，确定退出？"），与项目删除确认同款交互；空表单直接退出

---

## 2. 明显问题（P1）

### P1-1 删除确认有三种互不一致的实现

- **位置与证据**：
  - 卡片 `PromptCard.vue`：右上角红色小浮层「确认删除？ 是 / 否」，11px，3 秒自动取消
  - 文件夹 `FolderPanel.vue`：行内「条目将移至未归类 取消 / 确认」，10px
  - 标签 `TagPanel.vue`：胶囊上方弹出「将从关联提示词中移除 取消 / 确认」，10px，圆角 8px 带阴影
  - 另有设置页 `DataPanel.vue` 整条清空确认（12px，样式又不同）
- **影响**：四处破坏性确认，四种样式、三套字号、两种交互节奏（自动取消 vs 显式取消）；维护时要改四处。10px 中文可读性差，点击目标 20–22px 偏小
- **改法**：抽一个共享的内联确认组件（统一 12px、统一「取消/确认」文案节奏、统一 3 秒自动取消或统一显式取消——建议统一显式取消 + Esc 关闭），四处调用

### P1-2 设计令牌泛滥，改一处要懂全局

- **证据**（令牌审计脚本实测）：
  - 共 85 个令牌，其中 **35 个只被一个文件引用**（`--pb-danger-surface-subtle`、`--pb-edit-underline` 等均为一次性令牌）
  - 间距令牌 25 个阶梯（0/1/2/3/4/5/6/7/8/9/10/12/14/16/18/20/22/24/28/30/32/36/40/44），基本等于"每个像素值一个变量"，没有形成比例阶梯
  - danger 色系 14 个变体（danger / danger-text / danger-text-strong / danger-text-soft / danger-hover / danger-button / danger-button-hover / danger-border / danger-border-strong / danger-border-soft / danger-surface / danger-surface-soft / danger-surface-hover / danger-surface-subtle）
  - `--pb-radius`（6px）与 `--pb-radius-sm`（6px）同值并存；`--pb-radius-3/-4/-5` 按像素值命名
- **影响**：调间距要在一堆 1px 差的变量里挑；新组件不知道用哪个令牌，倾向于再手写；评审/回归时无法判断某个值是"故意的"还是"随手写的"
- **改法**（第二阶段治理）：间距收敛为 4/8/12/16/24/32 六级阶梯 + `--pb-space-px`；danger 收敛为 surface / border / text / button 四个语义层；同值令牌合并；一次性令牌内联为具体值或删除。字号同理补 11/12/13/16 四个令牌（见 P1-3）

### P1-3 字号无令牌，10px 文字出现在三处

- **位置**：`FolderPanel.vue` 文件夹计数（10px）、`TagPanel.vue` 删除确认（10px）、`PromptCard.vue` 卡片标签/时间（11px）
- **影响**：10px 中文笔画密集处（如「编程开发」）发虚，低于常规可读下限；且全局没有字号令牌，每个组件自己定
- **改法**：定义 `--pb-text-xs: 11px`（辅助）/ `--pb-text-sm: 12px`（次要正文）/ `--pb-text-md: 13px`（正文）/ `--pb-text-lg: 16px`（标题）；10px 全部升到 11px；卡片元信息统一 11px

### P1-4 卡片交互语义两处反直觉

- **位置**：`PromptCard.vue`
  - `.card:hover { border-color: var(--pb-text) }`：hover 时卡片描边变成近黑色 `#2c2a29`，视觉过重，像"被选中"而非"可点击"
  - `.card-action:hover { color: var(--pb-accent) }`：**删除**按钮 hover 用陶土橙——与主操作（保存/复制）同色，危险操作缺少颜色语义区分
- **改法**：hover 描边改用 `--pb-border-strong`；删除 hover 改用 danger 色系；编辑保持中性

### P1-5 卡片编辑/删除按钮常态 40% 透明度，弱可见

- **位置**：`.card-actions { opacity: .4 }`，仅 hover/focus-within 时全显
- **证据**：截图 `sidepanel-360-list.png` 各卡片的编辑/删除图标明显发虚
- **影响**：用户不知道卡片上有操作入口；触屏/触控板无 hover 场景（Chrome 触屏设备）几乎不可见
- **改法**：常态 `opacity: .65` 或直接可见，hover 时提亮；保留 focus-within 逻辑

### P1-6 Toast 长文案会被截断

- **位置**：`ToastBar.vue` `white-space: nowrap` + `text-overflow: ellipsis`
- **影响**：共享服务的错误提示（如「仍无法确认共享服务请求，请稍后重试」）在 360px 侧栏约 100px 处开始省略，错误信息读不全恰恰是最需要看清的时候
- **改法**：`white-space: normal` + 最多两行，或缩短文案到 20 字以内

---

## 3. 细节问题（P2）

- **P2-1 空列表是死胡同**：`PromptList.vue` 空态只有一句「暂无匹配的提示词」，没有「新建」入口——新用户第一次打开看到的就是这个画面（截图 `sidepanel-360-editor.png` 之后的流程）。建议空态放一个主按钮「新建第一条提示词」
- **P2-2 编辑页「归类至」占半行**：`PromptEditor.vue` `.field-row` 是两列网格但只放了一个字段，下拉框只占约 50% 宽度（截图 `sidepanel-360-editor.png`）。改单列
- **P2-3 断点散乱**：340px（AppHeader/FilterBar/Editor）、360px（PromptCard）、440px（SyncStatusBar）、480px（各设置面板）、580px（DataPanel）五套断点并存。建议统一为 340 / 480 两档，按内容需要再留 580 一档
- **P2-4 卡片日期用字符串切片**：`PromptCard.vue` `formatDateTime(prompt.updatedAt).slice(5, 10)` 取 MM-DD，一旦 `formatDateTime` 格式变化日期就错；且跨年看不到年份。改法：`formatDateTime` 增加 `shortDate` 模式或在 domain 提供稳定的月日格式化
- **P2-5 筛选区占首屏约三分之一**：360px 下搜索框 + 文件夹下拉 + 两行标签约占 210px（截图 `sidepanel-360-list.png`），首屏只剩一半给列表。建议标签行支持横向滚动 + 折叠「更多」，或默认只显示前 8 个
- **P2-6 删除确认出现时焦点不动**：键盘用户点删除后，焦点还在删除按钮上，要再 Tab 才能到「是」。确认态出现时应把焦点移入确认按钮
- **P2-7 筛选标签 23px 高**：`--pb-space` 体系外的手工值，略低于 24px 舒适点击区，统一到 `--pb-space-6` 撑高
- **P2-8 四个设置面板重复定义同一段基础样式**：`.section { display:flex; flex-direction:column; gap:16px }`、`.section-title`（含图标 20px、衬线 18px）、`.panel`（边框/圆角/内边距/阴影）在 DataPanel / BackupPanel / FolderPanel / TagPanel 中各写一遍，共 4 份。建议抽成共享样式类（如 `.section` / `.section-title` / `.panel` 放进 global.css 或一个 `SettingsSection.vue` 壳组件）

---

## 4. 建议的第二阶段改动范围（待确认）

按优先级排，建议分两批交付：

**第一批（P0 修复 + 令牌治理，约 1 轮改动）**
1. 补 `--pb-radius-6` 或全局替换（P0-1）
2. 设置页 `height: 720px` → 100vh（P0-2）
3. FolderPanel 窄屏按钮挤压修复（P0-3）
4. Escape 草稿保护（P0-4）
5. 令牌治理：间距收敛 6 级、danger 收敛 4 语义层、合并同值令牌、补字号令牌，一次性删除 35 个单文件令牌中的死重（P1-2、P1-3）

**第二批（组件统一 + 交互修正，约 1 轮改动）**
6. 抽共享内联确认组件，替换四处删除确认（P1-1）
7. 卡片 hover/删除语义修正 + 按钮可见性（P1-4、P1-5）
8. Toast 允许多行（P1-6）
9. 空态主按钮、编辑页单列、断点统一为两档（P2-1/2/3）
10. 抽设置面板共享壳样式（P2-8）

每批改完后重跑 `npm run verify` + `npm test`，并用 `capture.mjs` 重截全部 7 张状态图做前后对比。

## 5. 未覆盖与风险

- **未独立评审**：独立评审者不可用，本报告为自检结论，视觉判断部分可信度低于双人评审
- **动效未验证**：本轮只有静态截图，toast 过渡、卡片 hover 过渡未录屏验证；第二阶段改动时补录
- **共享试验构建**（chrome-sync / gpt-sync）的界面差异未逐一核对，令牌治理需确认对这两个构建同样生效（它们共用 `ui/`，预期无差异）
- 交互回归（刷新后读回、保存失败保留草稿）在第二阶段按项目现有验证脚本跑通
