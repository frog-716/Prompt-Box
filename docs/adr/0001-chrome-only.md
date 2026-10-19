Status: accepted

# Prompt-Box 仅保留 Chrome 本地版，移除同机共享试验

同机共享试验（`chrome-sync` / `gpt-sync` 双端构建、`tools/local-sync` 本机服务、设备配对与轮询同步）的维护成本超过了它带来的收益，且与「数据不出本机」的产品定位相悖。2026-10-19 决定将其彻底移除，仓库只保留 `chrome-local` 一个构建目标。移除前先把共享库完整导出为 JSON 备份（留存于桌面，供一次性迁移回正式版）；**JSON 备份/恢复功能一并删除**，仅保留 Markdown 导出作为备份手段。系统级 LaunchAgent（同步服务的开机自启配置）已在本轮单独卸载，共享库数据原样保留于 `~/Library/Application Support/Prompt-Box/`，桌面备份在迁移完成后删除。
