import { spawn } from 'node:child_process';
import { createServer } from 'vite';
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const chrome = process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const screenshots = [
  { name: 'prompt-box-showcase.png', scenario: '', height: 820 },
  { name: 'prompt-box-filters.png', scenario: 'filters', height: 360 },
  { name: 'prompt-box-editor.png', scenario: 'editor', height: 840 },
];

if (!existsSync(chrome)) {
  throw new Error(`找不到 Chrome：${chrome}。可通过 CHROME_BIN 指定浏览器路径。`);
}

const server = await createServer({
  configFile: resolve(projectRoot, 'tools/showcase/vite.config.mjs'),
  server: { host: '127.0.0.1', port: 0, strictPort: false },
});
const profile = mkdtempSync(join(tmpdir(), 'prompt-box-showcase-'));

try {
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === 'string') throw new Error('组件预览服务未分配本机端口。');

  const outputDirectory = resolve(projectRoot, 'docs/screenshots');
  mkdirSync(outputDirectory, { recursive: true });
  const url = `http://127.0.0.1:${address.port}/`;
  for (const screenshot of screenshots) {
    const output = resolve(outputDirectory, screenshot.name);
    const targetUrl = screenshot.scenario ? `${url}?scenario=${screenshot.scenario}` : url;
    rmSync(output, { force: true });
    const child = spawn(chrome, [
      '--headless=new',
      '--disable-gpu',
      '--disable-extensions',
      '--disable-background-networking',
      '--no-first-run',
      '--no-default-browser-check',
      '--force-device-scale-factor=2',
      `--user-data-dir=${profile}`,
      `--window-size=1108,${screenshot.height + 28}`,
      '--hide-scrollbars',
      `--screenshot=${output}`,
      '--virtual-time-budget=5000',
      targetUrl,
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    let closed = false;
    let exitCode = null;
    const childClosed = new Promise((resolveExit, reject) => {
      child.once('error', reject);
      child.once('close', (code) => {
        closed = true;
        exitCode = code;
        resolveExit(code);
      });
    });
    const deadline = Date.now() + 30000;
    while (!closed && Date.now() < deadline) {
      if (existsSync(output) && statSync(output).size > 0) break;
      await new Promise((resolveWait) => setTimeout(resolveWait, 200));
    }
    if (!existsSync(output) || statSync(output).size === 0) {
      child.kill('SIGKILL');
      await childClosed;
      throw new Error(`Chrome 未在时限内生成截图（${screenshot.name}）：${stderr}`);
    }
    if (!closed) {
      child.kill('SIGTERM');
      await childClosed;
    }
    if (exitCode !== 0 && exitCode !== null) throw new Error(`Chrome 截图失败（${screenshot.name}，退出码 ${exitCode}）：${stderr}`);
    console.log(`已生成实际 Vue 界面演示截图：${output}`);
  }
} finally {
  await server.close();
  rmSync(profile, { recursive: true, force: true });
}
