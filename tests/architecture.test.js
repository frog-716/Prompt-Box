import assert from 'node:assert/strict';
import test from 'node:test';
import { resolve } from 'node:path';
import { checkSource } from '../scripts/check-architecture.mjs';

const root = resolve('src');
const scan = (code, layer = 'domain', ext = 'ts') => checkSource(code, resolve(root, layer, `example.${ext}`), root);

test('检查领域层全局 API，并忽略字符串、注释和普通属性名', () => {
  for (const code of ['window.location', 'document.body', 'chrome.storage.local', 'navigator.clipboard', 'Date.now()', 'Math.random()', 'globalThis["window"]']) assert.ok(scan(code).length, code);
  assert.deepEqual(scan(`// import Vue from 'vue'; window.location\nconst text = 'document.body'; const record = { window: '普通属性' }; record.window;`), []);
});

test('检查 UI 直接调用、别名和方括号访问浏览器接口', () => {
  for (const code of ['chrome.storage.local.get()', 'const store = chrome.storage; store.local.get()', 'const { storage } = browser;', 'window["chrome"]["storage"]', 'navigator.clipboard.writeText("x")']) assert.ok(scan(code, 'ui').length, code);
});

test('静态、动态、类型导入与 re-export 均遵循分层，domain 不引用 shared', () => {
  for (const code of ["import { x } from '@/ui/x';", "export { x } from '@/ui/x';", "import('@/ui/x');", "type X = import('@/ui/x').X;", "import { x } from '@/shared/x';"]) assert.ok(scan(code).length, code);
  assert.ok(scan('import(path);').length);
  assert.deepEqual(scan("import type { Prompt } from './types'; export function size(items: Prompt[]) { return items.length; }"), []);
});

test('infra 不引入 Vue 组件，即使组件位于同一层', () => {
  assert.ok(scan("import A from './A.vue';", 'infra').some(v => v.reason.includes('Vue 组件')));
});

test('Vue script setup 也检查直接调用，正常界面代码可通过', () => {
  assert.ok(scan('<script setup>chrome.storage.local.get()</script><template><p>提示词</p></template>', 'ui', 'vue').length);
  assert.deepEqual(scan('<script setup>import { ref } from "vue"; const title = ref("原文");</script><template><p>{{title}}</p></template>', 'ui', 'vue'), []);
});


test('Vue 模板事件和模板中的浏览器访问也必须经过 infra', () => {
  for (const template of ['<button @click="chrome.storage.local.clear()">清空</button>', '<p>{{ window["chrome"].storage }}</p>', `<button @click="navigator.clipboard.writeText('原文')">复制</button>`]) {
    assert.ok(scan(`<template>${template}</template>`, 'ui', 'vue').length, template);
  }
});
