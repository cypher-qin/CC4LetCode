#!/usr/bin/env node
// 原型同步审计：对比一个原型目录与本仓库，列出「原型有而仓库没有」的文件，
// 以及两者内容不一致的共享文件。用于原型更新后确认同步是否完整。
//
//   node scripts/sync-audit.mjs                    # 对比作者本机的原型目录
//   node scripts/sync-audit.mjs "D:\\path\\原型"    # 对比指定目录
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_REFERENCE = 'C:\\Users\\LENOVO\\Desktop\\CC4LetCode';
const reference = path.resolve(process.argv[2] || process.env.CC4_PROTOTYPE_DIR || DEFAULT_REFERENCE);

// 运行期产物与依赖目录不参与比对。
const SKIP_DIRS = new Set(['node_modules', 'dist', '.local', '.git', '.github']);

function walk(dir, base = dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, base, out);
    else out.push(path.relative(base, full));
  }
  return out;
}
function hash(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function withoutEol(buffer) { return buffer.toString('utf8').replace(/\r\n/g, '\n'); }

/** 用仓库自己的 .gitignore 判断某个原型文件是否本来就不该入库（例如 Docs 目录里导出的笔记）。 */
function isGitIgnored(rel) {
  try {
    execFileSync('git', ['check-ignore', '--quiet', '--', rel.replaceAll('\\', '/')], { cwd: ROOT, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

if (!fs.existsSync(reference)) {
  console.error(`找不到要对比的原型目录：${reference}`);
  console.error('用法：node scripts/sync-audit.mjs "<原型目录>"');
  process.exitCode = 1;
} else {
  const referenceFiles = walk(reference).sort();
  const repoFiles = walk(ROOT).sort();
  const repoSet = new Set(repoFiles);

  const missingAll = referenceFiles.filter(rel => !repoSet.has(rel));
  const missing = missingAll.filter(rel => !isGitIgnored(rel));
  const ignored = missingAll.filter(isGitIgnored);
  const shared = referenceFiles.filter(rel => repoSet.has(rel));
  const differing = shared.filter(rel => hash(path.join(reference, rel)) !== hash(path.join(ROOT, rel)));
  const eolOnly = differing.filter(rel => withoutEol(fs.readFileSync(path.join(reference, rel))) === withoutEol(fs.readFileSync(path.join(ROOT, rel))));
  const contentDiffering = differing.filter(rel => !eolOnly.includes(rel));
  const repoOnly = repoFiles.filter(rel => !referenceFiles.includes(rel));

  console.log(`原型目录：${reference}`);
  console.log(`仓库目录：${ROOT}`);
  console.log(`原型文件 ${referenceFiles.length} 个，仓库文件 ${repoFiles.length} 个\n`);

  console.log(`原型有、仓库没有（${missing.length}）`);
  for (const rel of missing) console.log('  MISSING  ' + rel);
  if (!missing.length) console.log('  （无：原型所有源文件都已在仓库中）');

  console.log(`\n按 .gitignore 排除、无需入库（${ignored.length}）`);
  for (const rel of ignored) console.log('  IGNORED  ' + rel);
  if (!ignored.length) console.log('  （无）');

  console.log(`\n内容不一致的共享文件（${contentDiffering.length}）`);
  for (const rel of contentDiffering) console.log('  DIFFERS  ' + rel);
  if (!contentDiffering.length) console.log('  （无）');

  console.log(`\n仅行尾不同（${eolOnly.length}）`);
  for (const rel of eolOnly) console.log('  EOL      ' + rel);
  if (!eolOnly.length) console.log('  （无）');

  console.log(`\n仓库独有的文件（${repoOnly.length}，含自检脚本、文档与许可）`);
  for (const rel of repoOnly) console.log('  ONLY     ' + rel);

  console.log(`\n完全一致：${shared.length - differing.length} / ${shared.length} 个共享文件`);

  // 只有「原型有而仓库没有」才算同步缺口；内容差异可能是刻意的仓库适配，仅供参考。
  if (missing.length) {
    console.log('\n结论：存在未同步的文件（见 MISSING），请补齐后重新审计。');
    process.exitCode = 1;
  } else {
    console.log('\n结论：同步完整。没有缺失的源文件；DIFFERS 为仓库适配（README、package.json 等），EOL 仅为行尾风格差异。');
  }
}
