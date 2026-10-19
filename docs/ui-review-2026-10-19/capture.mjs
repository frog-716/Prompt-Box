/**
 * 基线截图脚本：用无头 Chrome 加载构建产物扩展，
 * 向 chrome.storage.local 写入示例数据，再对界面截图。
 * 仅用于本次 UI 评审取证，不进入构建流程。
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const EXT_DIR = resolve('/Users/frog/Projects/Prompt-Box/.output/chrome-local/chrome-mv3');
const OUT_DIR = resolve('/Users/frog/Projects/Prompt-Box/docs/ui-review-2026-10-19/shots');

const CHROME_CANDIDATES = [
  // 品牌版 Chrome 137+ 已忽略 --load-extension，优先用 Playwright 缓存的 Chromium
  `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`,
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
];
const chromePath = CHROME_CANDIDATES.find((p) => { try { readFileSync(p); return true; } catch { return false; } });
if (!chromePath) { console.error('未找到 Chrome'); process.exit(1); }

// Chrome 对未打包扩展按路径哈希生成 ID
function extensionIdFromPath(path) {
  const hash = createHash('sha256').update(path).digest();
  let id = '';
  for (const byte of hash.subarray(0, 16)) {
    id += String.fromCharCode(97 + (byte >> 4));
    id += String.fromCharCode(97 + (byte & 15));
  }
  return id;
}
const extId = extensionIdFromPath(EXT_DIR);

const now = Date.now();
const DAY = 86400000;
const fixture = {
  promptBox: {
    version: 1,
    folders: [
      { id: 'f-writing', name: '写作助手', createdAt: now - 30 * DAY },
      { id: 'f-coding', name: '编程开发', createdAt: now - 20 * DAY },
      { id: 'f-translate', name: '翻译润色', createdAt: now - 10 * DAY },
    ],
    prompts: [
      {
        id: 'p1', title: '技术博客大纲生成器', folderId: 'f-writing',
        content: '你是一名资深技术作家。请根据我给出的主题，生成一份结构清晰的博客大纲，包含引言、三个核心章节和总结，每个章节给出要点列表。',
        tags: ['写作', '博客'], createdAt: now - 9 * DAY, updatedAt: now - 2 * DAY,
      },
      {
        id: 'p2', title: '代码审查清单', folderId: 'f-coding',
        content: '请审查以下代码，重点关注：1) 潜在的边界条件错误；2) 命名是否清晰；3) 是否有重复逻辑可以抽取。用简体中文给出具体修改建议。',
        tags: ['编程', 'review'], createdAt: now - 8 * DAY, updatedAt: now - 1 * DAY,
      },
      {
        id: 'p3', title: '中英互译润色', folderId: 'f-translate',
        content: '将以下文本翻译成地道的英文，保持原意的同时让表达更符合母语者习惯，避免逐字直译。完成后用一句话说明主要改动。',
        tags: ['翻译'], createdAt: now - 7 * DAY, updatedAt: now - 3 * DAY,
      },
      {
        id: 'p4', title: '周报摘要', folderId: null,
        content: '把下面的工作内容整理成一份简洁的周报，按项目分组，突出进展、阻塞和下周计划。',
        tags: ['写作', '效率'], createdAt: now - 6 * DAY, updatedAt: now - 5 * DAY,
      },
      {
        id: 'p5', title: 'SQL 查询优化', folderId: 'f-coding',
        content: '分析以下 SQL 查询的性能问题，给出索引建议和重写方案，并解释执行计划。',
        tags: ['编程', 'sql', '性能优化', '数据库'], createdAt: now - 5 * DAY, updatedAt: now - 4 * DAY,
      },
      {
        id: 'p6', title: '一段超长标题用来测试卡片标题在窄屏下的截断表现是否正常工作', folderId: 'f-writing',
        content: '这条提示词用来测试预览文本的截断。' + '很长的内容。'.repeat(20),
        tags: ['测试', '边界情况'], createdAt: now - 4 * DAY, updatedAt: now - 6 * DAY,
      },
    ],
  },
};

// ---------- 启动 Chrome ----------
const profile = mkdtempSync(join(tmpdir(), 'pb-review-'));
const chrome = spawn(chromePath, [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-crash-reporter',
  '--remote-debugging-port=0', `--user-data-dir=${profile}`,
  `--load-extension=${EXT_DIR}`, '--no-first-run', '--no-default-browser-check',
  '--hide-scrollbars', '--mute-audio', 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });

function wsFromPortFile() {
  try {
    const [port, path] = readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n').map((s) => s.trim());
    return /^\d+$/.test(port) ? `ws://127.0.0.1:${port}${path}` : null;
  } catch { return null; }
}
const wsUrl = await new Promise((ok, no) => {
  const t0 = Date.now();
  const poll = setInterval(() => {
    const u = wsFromPortFile();
    if (u) { clearInterval(poll); ok(u); }
    else if (Date.now() - t0 > 30000) { clearInterval(poll); no(new Error('Chrome 启动超时')); }
  }, 100);
});

// ---------- 极简 CDP 客户端 ----------
let seq = 0;
const pending = new Map();
const ws = new WebSocket(wsUrl);
await new Promise((ok) => { ws.onopen = ok; });
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { const { ok, no } = pending.get(m.id); pending.delete(m.id); m.error ? no(new Error(m.error.message)) : ok(m.result); }
};
function cdp(method, params = {}, sessionId) {
  const id = ++seq;
  return new Promise((ok, no) => {
    pending.set(id, { ok, no });
    ws.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
  });
}

async function openPage(urlPath, width, height) {
  const { targetId } = await cdp('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp('Target.attachToTarget', { targetId, flatten: true });
  await cdp('Page.enable', {}, sessionId);
  await cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }, sessionId);
  await cdp('Page.navigate', { url: `chrome-extension://${extId}/${urlPath}` }, sessionId);
  await new Promise((r) => setTimeout(r, 1200));
  return { targetId, sessionId };
}

async function evalIn(sessionId, expression) {
  const r = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
  if (r.exceptionDetails) throw new Error(`页面脚本失败: ${JSON.stringify(r.exceptionDetails).slice(0, 200)}`);
  return r.result?.value;
}

async function shoot(targetId, sessionId, name) {
  const shot = await cdp('Page.captureScreenshot', { format: 'png' }, sessionId);
  writeFileSync(join(OUT_DIR, `${name}.png`), Buffer.from(shot.data, 'base64'));
  console.log(`已截 ${name}.png`);
  await cdp('Target.closeTarget', { targetId });
}

// ---------- 写入示例数据（经扩展页面上下文） ----------
{
  const { targetId, sessionId } = await openPage('sidepanel.html', 360, 760);
  const diag = await evalIn(sessionId, 'JSON.stringify({href: location.href, title: document.title, chrome: typeof chrome, keys: typeof chrome === "object" ? Object.keys(chrome).slice(0, 20) : []})');
  console.log('诊断:', diag);
  await evalIn(sessionId, `chrome.storage.local.set(${JSON.stringify(fixture)})`);
  await cdp('Target.closeTarget', { targetId });
}

// ---------- 截图 ----------
// 侧边栏 360 宽：列表 / 编辑 / 删除确认
{
  const { targetId, sessionId } = await openPage('sidepanel.html', 360, 760);
  await shoot(targetId, sessionId, 'sidepanel-360-list');
}
{
  const { targetId, sessionId } = await openPage('sidepanel.html', 360, 760);
  await evalIn(sessionId, `document.querySelector('.header-icon-btn[aria-label="新建提示词"]').click()`);
  await new Promise((r) => setTimeout(r, 400));
  await shoot(targetId, sessionId, 'sidepanel-360-editor');
}
{
  const { targetId, sessionId } = await openPage('sidepanel.html', 360, 760);
  await evalIn(sessionId, `document.querySelector('.card-action[aria-label="删除"]').click()`);
  await new Promise((r) => setTimeout(r, 400));
  await shoot(targetId, sessionId, 'sidepanel-360-delete-confirm');
}
// 编辑态误按 Escape：有未保存更改 → 内联确认（不再直接丢草稿）
{
  const { targetId, sessionId } = await openPage('sidepanel.html', 360, 760);
  await evalIn(sessionId, `document.querySelector('.header-icon-btn[aria-label="新建提示词"]').click()`);
  await new Promise((r) => setTimeout(r, 400));
  await evalIn(sessionId, `(() => {
    const form = document.querySelector('.editor');
    const area = form.querySelector('textarea');
    area.value = '写了一半点 Escape，看看会不会直接丢掉。';
    area.dispatchEvent(new Event('input', { bubbles: true }));
    form.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  })()`);
  await new Promise((r) => setTimeout(r, 300));
  await shoot(targetId, sessionId, 'sidepanel-360-editor-escape-confirm');
}
// 标签页 880 宽
{
  const { targetId, sessionId } = await openPage('sidepanel.html', 880, 760);
  await shoot(targetId, sessionId, 'sidepanel-880-list');
}
// 设置视图（不再是独立页面，而是侧边栏内的一个视图）：
// 360 侧边栏 / 880 标签页 / 480 窄视口 / 清空确认态
{
  const { targetId, sessionId } = await openPage('sidepanel.html', 360, 760);
  await evalIn(sessionId, `document.querySelector('.header-icon-btn[aria-label="打开设置"]').click()`);
  await new Promise((r) => setTimeout(r, 400));
  await shoot(targetId, sessionId, 'sidepanel-360-settings');
}
{
  const { targetId, sessionId } = await openPage('sidepanel.html', 880, 900);
  await evalIn(sessionId, `document.querySelector('.header-icon-btn[aria-label="打开设置"]').click()`);
  await new Promise((r) => setTimeout(r, 400));
  await shoot(targetId, sessionId, 'sidepanel-880-settings');
}
{
  const { targetId, sessionId } = await openPage('sidepanel.html', 480, 900);
  await evalIn(sessionId, `document.querySelector('.header-icon-btn[aria-label="打开设置"]').click()`);
  await new Promise((r) => setTimeout(r, 400));
  await shoot(targetId, sessionId, 'sidepanel-480-settings');
}
{
  const { targetId, sessionId } = await openPage('sidepanel.html', 360, 760);
  await evalIn(sessionId, `document.querySelector('.header-icon-btn[aria-label="打开设置"]').click()`);
  await new Promise((r) => setTimeout(r, 300));
  await evalIn(sessionId, `document.querySelector('.danger').click()`);
  await new Promise((r) => setTimeout(r, 400));
  await shoot(targetId, sessionId, 'sidepanel-360-settings-clear-confirm');
}

ws.close();
chrome.kill();
try { rmSync(profile, { recursive: true, force: true }); } catch { /* 临时目录由系统回收 */ }
console.log('完成');
