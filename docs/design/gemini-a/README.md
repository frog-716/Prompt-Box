# Gemini A「温润纸感」

将 Gemini 原型中选定的 A 版布局与样式映射到 Prompt-Box 现有 Vue 页面。原型文件目前在 `/Users/frog/Downloads/prompt_box_prototype.tsx`，本目录不复制其他主题或原型。

## 页面映射

- 侧边栏：`src/ui/sidepanel/App.vue`、`src/ui/components/`
- 设置页：`src/ui/settings/App.vue`、`src/ui/components/settings/`
- A 版样式变量：`src/ui/styles/global.css`

提示词读取、保存、筛选、复制、Markdown 导出和文件夹/标签管理继续走现有 composable、infra 与 domain 接口。本次只改表现层，没有改存储、导出格式、权限或数据模型。

颜色、圆角和间距变量集中在 `src/ui/styles/global.css`；本项目唯一工程规范仍是根目录 `AGENTS.md`。
