import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const allowedTargets = new Set(['chrome-local', 'chrome-sync', 'gpt-sync']);
const target = process.argv[2] ?? '';
if (!allowedTargets.has(target)) {
  console.error(`用法：node scripts/build-target.mjs ${[...allowedTargets].join('|')}`);
  process.exit(2);
}

const wxtCli = resolve('node_modules/wxt/bin/wxt.mjs');
const result = spawnSync(process.execPath, [wxtCli, 'build'], {
  stdio: 'inherit',
  env: { ...process.env, PROMPT_BOX_BUILD_TARGET: target },
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
