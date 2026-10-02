#!/usr/bin/env node
/** 分层与浏览器接口检查。解析语法树，避免把注释和字符串误认成代码。 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { parse, compileTemplate } from 'vue/compiler-sfc';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');
const RULES = {
  domain: { layers: ['domain'], packages: [] },
  shared: { layers: ['shared'], packages: [] },
  infra: { layers: ['domain', 'shared', 'infra'], packages: ['wxt'] },
  ui: { layers: ['domain', 'infra', 'shared', 'ui'], packages: ['vue'] },
  entrypoints: { layers: ['domain', 'infra', 'shared', 'ui', 'entrypoints'], packages: ['vue', 'wxt'] },
};
const SOURCE_EXT = /\.(ts|vue|mts|js|mjs)$/;
const DOMAIN_GLOBALS = new Set(['chrome', 'browser', 'window', 'document', 'navigator', 'globalThis', 'self', 'crypto', 'localStorage', 'sessionStorage', 'fetch', 'setTimeout', 'setInterval']);

function collectFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    // 不跟随符号链接，避免扫描到项目之外。
    if (entry.isSymbolicLink()) return [];
    if (entry.isDirectory()) return collectFiles(full);
    return SOURCE_EXT.test(entry.name) ? [full] : [];
  });
}

function accessPath(node) {
  if (ts.isIdentifier(node)) return [node.text];
  if (ts.isPropertyAccessExpression(node)) return [...accessPath(node.expression), node.name.text];
  if (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression)) {
    return [...accessPath(node.expression), node.argumentExpression.text];
  }
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isNonNullExpression(node)) {
    return accessPath(node.expression);
  }
  return [];
}

function isReference(node) {
  const parent = node.parent;
  if (ts.isPropertyAccessExpression(parent) && parent.name === node) return false;
  if ((ts.isPropertyAssignment(parent) || ts.isPropertyDeclaration(parent) || ts.isPropertySignature(parent) || ts.isMethodDeclaration(parent)) && parent.name === node) return false;
  if ((ts.isVariableDeclaration(parent) || ts.isParameter(parent) || ts.isFunctionDeclaration(parent) || ts.isClassDeclaration(parent) || ts.isBindingElement(parent)) && parent.name === node) return false;
  if (ts.isImportSpecifier(parent) || ts.isImportClause(parent) || ts.isNamespaceImport(parent)) return false;
  if (ts.isTypeReferenceNode(parent)) return false;
  return true;
}

/** 可独立调用，回归测试无需创建源码临时文件。 */
export function checkSource(code, file, srcDir = SRC) {
  const layer = relative(srcDir, file).split(sep)[0];
  const rule = RULES[layer];
  const violations = [];
  const seen = new Set();
  function report(reason, spec = '') {
    const key = `${reason}:${spec}`;
    if (seen.has(key)) return;
    seen.add(key);
    violations.push({ file: relative(srcDir, file), reason, spec });
  }
  if (!rule) {
    report(`未声明的源码层「${layer}」`);
    return violations;
  }

  function checkSpecifier(spec) {
    const target = spec.startsWith('@/') ? resolve(srcDir, spec.slice(2))
      : spec.startsWith('.') ? resolve(dirname(file), spec) : null;
    if (target === null) {
      const pkg = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
      if (!rule.packages.includes(pkg)) report(`不允许引入外部包「${pkg}」`, spec);
      return;
    }
    const targetLayer = relative(srcDir, target).split(sep)[0];
    if (!rule.layers.includes(targetLayer)) report(`「${layer}」层不允许引用「${targetLayer}」层`, spec);
    if (layer === 'infra' && /\.vue$/.test(target)) report('基础设施层不能引用 Vue 组件', spec);
  }

  const scripts = file.endsWith('.vue') ? (() => {
    const { descriptor, errors } = parse(code, { filename: file });
    if (errors.length) report('Vue 文件解析失败');
    for (const block of [descriptor.script, descriptor.scriptSetup]) {
      if (block?.src) checkSpecifier(block.src);
    }
    const blocks = [descriptor.script?.content, descriptor.scriptSetup?.content].filter(Boolean);
    if (descriptor.template) {
      const template = compileTemplate({
        source: descriptor.template.content, filename: file, id: 'architecture-scan',
        compilerOptions: { expressionPlugins: ['typescript'] },
      });
      if (template.errors.length) report('Vue 模板解析失败');
      blocks.push(template.code);
    }
    return blocks;
  })() : [code];

  for (const script of scripts) {
    const source = ts.createSourceFile(file + '.ts', script, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    if (source.parseDiagnostics.length) report('源码语法解析失败');
    function visit(node) {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) {
        checkSpecifier(node.moduleSpecifier.text);
      }
      if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference) && node.moduleReference.expression && ts.isStringLiteralLike(node.moduleReference.expression)) {
        checkSpecifier(node.moduleReference.expression.text);
      }
      if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteralLike(node.argument.literal)) checkSpecifier(node.argument.literal.text);
      if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) {
        const spec = node.arguments[0];
        if (spec && ts.isStringLiteralLike(spec)) checkSpecifier(spec.text);
        else report('动态模块路径无法校验，请使用明确的导入路径');
      }
      if (ts.isIdentifier(node) && isReference(node)) {
        if (layer === 'domain' && DOMAIN_GLOBALS.has(node.text)) report(`领域层不能使用「${node.text}」`);
        if (layer === 'ui' && ['chrome', 'browser'].includes(node.text)) report('表现层的扩展接口必须经过 infra');
      }
      if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
        const path = accessPath(node);
        if (path[0] === '_ctx') path.shift();
        if (layer === 'domain' && (path.join('.') === 'Date.now' || path.join('.') === 'Math.random')) report('领域层的时间和随机值必须由调用方传入');
        if (layer === 'ui' && (
          ['chrome', 'browser'].includes(path[0]) ||
          (['window', 'globalThis', 'self'].includes(path[0]) && ['chrome', 'browser'].includes(path[1])) ||
          (path[0] === 'navigator' && ['clipboard', 'locks', 'storage'].includes(path[1]))
        )) report('表现层的浏览器接口必须经过 infra');
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  return violations;
}

export function checkProject(srcDir = SRC) {
  const files = collectFiles(srcDir);
  return { files, violations: files.flatMap((file) => checkSource(readFileSync(file, 'utf8'), file, srcDir)) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { files, violations } = checkProject();
  if (!violations.length) console.log(`架构校验通过：扫描 ${files.length} 个文件，分层与浏览器接口均合规。`);
  else {
    console.error(`架构校验失败：发现 ${violations.length} 处违规。`);
    for (const item of violations) console.error(`  ${item.file}: ${item.reason}${item.spec ? ` (${item.spec})` : ''}`);
    process.exitCode = 1;
  }
}
