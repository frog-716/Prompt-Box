#!/usr/bin/env node
/**
 * 分层依赖校验。
 *
 * AGENTS.md 里写的依赖方向如果只靠人自觉，三个月后一定烂掉。
 * 这个脚本把它变成可执行的门禁：扫描 src 下所有源码，解析每条 import，
 * 判断它有没有跨层乱引。
 *
 * 用法：node scripts/check-architecture.mjs
 * 退出码 0 = 通过，1 = 有违规。
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');

/** 每一层允许引用的目标层，以及允许的外部包前缀。 */
const RULES = {
  domain: {
    allowLayers: ['domain', 'shared'],
    allowPackages: [],
    note: '领域层必须是纯函数，不碰浏览器 API、不碰 Vue',
  },
  shared: {
    allowLayers: ['shared'],
    allowPackages: [],
    note: '公共层不依赖任何业务层',
  },
  infra: {
    allowLayers: ['domain', 'shared', 'infra'],
    allowPackages: ['wxt'],
    note: '基础设施层是浏览器 API 的唯一入口',
  },
  ui: {
    allowLayers: ['domain', 'infra', 'shared', 'ui'],
    allowPackages: ['vue'],
    note: '表现层不能引入入口层',
  },
  entrypoints: {
    allowLayers: ['domain', 'infra', 'shared', 'ui', 'entrypoints'],
    allowPackages: ['vue', 'wxt'],
    note: '入口层可以依赖所有下层',
  },
};

const SOURCE_EXT = /\.(ts|vue|mts|js|mjs)$/;
const SKIP_DIR = new Set(['node_modules', '.output', '.wxt']);

/** 递归收集 src 下的源码文件。 */
function collectFiles(dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIR.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...collectFiles(full));
    } else if (SOURCE_EXT.test(entry)) {
      found.push(full);
    }
  }
  return found;
}

/** 文件属于哪一层（src 下的一级目录名）。 */
function layerOf(absPath) {
  const rel = relative(SRC, absPath);
  return rel.split(sep)[0];
}

/** 提取源码里所有的 import / export-from 来源。 */
function extractSpecifiers(code) {
  const specs = [];
  const patterns = [
    /\bimport\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g,
    /\bexport\s+(?:type\s+)?[\s\S]*?\s+from\s+['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of code.matchAll(pattern)) {
      if (match[1]) specs.push(match[1]);
    }
  }
  return specs;
}

/** 把 import 说明符解析成 src 下的绝对路径；外部包返回 null。 */
function resolveSpecifier(spec, fromFile) {
  if (spec.startsWith('@/')) return join(SRC, spec.slice(2));
  if (spec.startsWith('.')) return join(dirname(fromFile), spec);
  return null;
}

function check() {
  const violations = [];
  const files = collectFiles(SRC);

  for (const file of files) {
    const layer = layerOf(file);
    const rule = RULES[layer];
    if (!rule) continue;

    const code = readFileSync(file, 'utf8');
    const relFile = relative(ROOT, file);

    for (const spec of extractSpecifiers(code)) {
      const target = resolveSpecifier(spec, file);

      if (target === null) {
        const pkg = spec.startsWith('@')
          ? spec.split('/').slice(0, 2).join('/')
          : spec.split('/')[0];
        const allowed = rule.allowPackages.some(
          (name) => pkg === name || pkg.startsWith(`${name}/`),
        );
        if (!allowed) {
          violations.push({
            file: relFile,
            layer,
            spec,
            reason: `不允许引入外部包「${pkg}」`,
            note: rule.note,
          });
        }
        continue;
      }

      const targetLayer = layerOf(target);
      if (!rule.allowLayers.includes(targetLayer)) {
        violations.push({
          file: relFile,
          layer,
          spec,
          reason: `「${layer}」层不允许引用「${targetLayer}」层`,
          note: rule.note,
        });
      }
    }
  }

  return { files, violations };
}

const { files, violations } = check();

if (violations.length === 0) {
  console.log(`架构校验通过：扫描 ${files.length} 个文件，依赖方向全部合规。`);
  process.exit(0);
}

console.error(`架构校验失败：发现 ${violations.length} 处违规。\n`);
for (const item of violations) {
  console.error(`  ${item.file}`);
  console.error(`    import '${item.spec}'`);
  console.error(`    → ${item.reason}`);
  console.error(`    → 规则：${item.note}\n`);
}
process.exit(1);
