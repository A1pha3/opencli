#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mainFile = path.join(repoRoot, 'dist', 'src', 'main.js');
const runtime = process.env.OPENCLI_TEST_RUNTIME || 'node';
const title = process.env.OPENCLI_ZHIHU_PUBLISH_TITLE?.trim() || '';
const bodyFile = process.env.OPENCLI_ZHIHU_PUBLISH_FILE?.trim() || '';
const confirm = process.env.OPENCLI_ZHIHU_PUBLISH_CONFIRM;
const timeout = Number(process.env.OPENCLI_ZHIHU_PUBLISH_TIMEOUT || '180000');
const skipDoctor = process.env.OPENCLI_ZHIHU_PUBLISH_SKIP_DOCTOR === '1';

function fail(message) {
  console.error(`[zhihu-publish-check] ${message}`);
  process.exit(1);
}

function runStep(label, args) {
  console.log(`\n==> ${label}`);
  const result = spawnSync(runtime, [mainFile, ...args], {
    cwd: repoRoot,
    env: {
      ...process.env,
      FORCE_COLOR: '0',
      NO_COLOR: '1',
    },
    encoding: 'utf-8',
    timeout,
  });

  if (result.error) {
    fail(`${label} failed to start: ${result.error.message}`);
  }
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout || '');
    fail(`${label} exited with code ${result.status ?? 1}`);
  }
  return result.stdout;
}

if (confirm !== 'YES') {
  fail('Refusing to perform a real publish without OPENCLI_ZHIHU_PUBLISH_CONFIRM=YES');
}

if (!fs.existsSync(mainFile)) {
  fail(`Missing built CLI entry: ${mainFile}. Run npm run build first.`);
}

if (!title) {
  fail('Missing OPENCLI_ZHIHU_PUBLISH_TITLE');
}

if (!bodyFile) {
  fail('Missing OPENCLI_ZHIHU_PUBLISH_FILE');
}

const resolvedBodyFile = path.resolve(repoRoot, bodyFile);
if (!fs.existsSync(resolvedBodyFile) || !fs.statSync(resolvedBodyFile).isFile()) {
  fail(`Publish body file does not exist or is not a file: ${resolvedBodyFile}`);
}

if (!skipDoctor) {
  runStep('Doctor', ['doctor']);
}

const stdout = runStep('Zhihu publish', [
  'zhihu',
  'publish',
  '--title',
  title,
  '--file',
  resolvedBodyFile,
  '--execute',
  '-f',
  'json',
]);

let payload;
try {
  payload = JSON.parse(stdout.trim());
} catch {
  fail(`Publish command did not return valid JSON:\n${stdout}`);
}

if (!Array.isArray(payload) || payload.length !== 1) {
  fail(`Expected a single-row JSON array, received: ${JSON.stringify(payload, null, 2)}`);
}

const row = payload[0] || {};
if (row.status !== 'success') {
  fail(`Expected status=success, received: ${JSON.stringify(row, null, 2)}`);
}
if (row.outcome !== 'created') {
  fail(`Expected outcome=created, received: ${JSON.stringify(row, null, 2)}`);
}
if (row.target_type !== 'article') {
  fail(`Expected target_type=article, received: ${JSON.stringify(row, null, 2)}`);
}
if (typeof row.created_target !== 'string' || !row.created_target.startsWith('article:')) {
  fail(`Expected created_target like article:<id>, received: ${JSON.stringify(row, null, 2)}`);
}
if (typeof row.created_url !== 'string' || !/^https:\/\/zhuanlan\.zhihu\.com\/p\/\d+/.test(row.created_url)) {
  fail(`Expected created_url under https://zhuanlan.zhihu.com/p/<id>, received: ${JSON.stringify(row, null, 2)}`);
}

console.log('\nZhihu publish validation succeeded.');
console.log(JSON.stringify({
  created_target: row.created_target,
  created_url: row.created_url,
  author_identity: row.author_identity ?? null,
}, null, 2));