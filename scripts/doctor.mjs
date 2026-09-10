#!/usr/bin/env node
// CC4LetCode 本地 Agent 自检
//
// 只读检测本机的 Agent 运行环境（Codex / DeepSeek Harness），打印一份可读报告，
// 并在发现问题时给出下一步该怎么做。不会发起任何模型请求，不会消耗额度，
// 不会修改系统代理、DSH 配置或你的凭据。
//
//   npm run doctor              可读报告
//   npm run doctor -- --json    机器可读 JSON
//   npm run doctor -- --strict  存在阻断项时以退出码 1 结束
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { findCodex, codexLogin } from '../server/harness.js';
import { discoverHarness } from '../server/harness-discovery.js';
import { harnessNetwork } from '../server/harness-network.js';
import { agentNetwork } from '../server/agent-network.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const MINIMUM_NODE = [22, 12, 0];
export const DSH_PACKAGE = '@deepseek-ai/dsh';

// ── 小工具 ───────────────────────────────────────────────────────────────────

async function readText(file) { try { return await fs.readFile(file, 'utf8'); } catch { return null; } }
async function readJson(file) { try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return null; } }
async function exists(target) { try { await fs.access(target); return true; } catch { return false; } }
function expandHome(value, home) {
  if (typeof value !== 'string') return value;
  if (value === '~') return home;
  if (value.startsWith('~/') || value.startsWith('~\\')) return path.join(home, value.slice(2));
  return value;
}
/** $DSH_HOME，未设置时用 ~/.dsh —— 与官方 @deepseek-ai/dsh-home-paths 的优先级一致。 */
export function resolveDshHome(environment = process.env, home = '') {
  const configured = typeof environment.DSH_HOME === 'string' ? environment.DSH_HOME.trim() : '';
  return path.resolve(expandHome(configured || path.join(home || process.env.USERPROFILE || process.env.HOME || '', '.dsh'), home));
}
/** 列出最小 YAML 里某个顶层键下面的字面量 `键: 值`，用于读 DSH settings.yaml。 */
export function parseTopLevelMap(yaml, key) {
  const values = {};
  if (typeof yaml !== 'string') return values;
  const lines = yaml.split(/\r?\n/);
  const start = lines.findIndex(line => new RegExp(`^${key}\\s*:`).test(line));
  if (start < 0) return values;
  for (const line of lines.slice(start + 1)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    if (!/^[ \t]/.test(line)) break;
    const match = line.match(/^[ \t]+([A-Za-z0-9_.-]+)\s*:\s*(.*?)\s*$/);
    if (match) values[match[1]] = match[2].replace(/^["']|["']$/g, '');
  }
  return values;
}
export function compareVersions(left, right) {
  const a = String(left).split('.').map(Number);
  const b = String(right).split('.').map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const x = a[i] || 0; const y = b[i] || 0;
    if (x !== y) return x > y ? 1 : -1;
  }
  return 0;
}
/** 从 package.json 的 dsh.profile.bundles 里判断这是不是一个可用的 headless profile。 */
export function profileBundles(value) {
  const bundles = value?.dsh?.profile?.bundles;
  return Array.isArray(bundles) ? bundles : [];
}
function checkById(checks, id) { return checks.find(check => check.id === id); }

function run(command, args, { timeout = 20000, env = process.env, cwd = ROOT } = {}) {
  return new Promise(resolve => {
    let child;
    try { child = spawn(command, args, { cwd, shell: false, windowsHide: true, env }); } catch (error) { resolve({ code: null, stdout: '', stderr: '', error: error.message }); return; }
    let stdout = ''; let stderr = ''; let settled = false;
    const timer = setTimeout(() => { if (!settled) { settled = true; try { child.kill(); } catch {} resolve({ code: null, stdout, stderr, timeout: true }); } }, timeout);
    child.stdout?.setEncoding('utf8'); child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', chunk => { stdout = (stdout + chunk).slice(-8000); });
    child.stderr?.on('data', chunk => { stderr = (stderr + chunk).slice(-8000); });
    child.on('error', error => { if (settled) return; settled = true; clearTimeout(timer); resolve({ code: null, stdout, stderr, error: error.message }); });
    child.on('close', code => { if (settled) return; settled = true; clearTimeout(timer); resolve({ code, stdout, stderr }); });
  });
}

// ── 检测项 ───────────────────────────────────────────────────────────────────

/** 1. Node 运行时与项目依赖。 */
export async function checkRuntime({ root = ROOT, nodeVersion = process.versions.node, platform = process.platform, arch = process.arch, environment = process.env } = {}) {
  const checks = [];
  const supported = compareVersions(nodeVersion, MINIMUM_NODE.join('.')) >= 0;
  checks.push({
    id: 'node',
    ok: supported,
    blocking: true,
    title: `Node.js ${nodeVersion} · ${platform}/${arch}`,
    fix: supported ? '' : `请安装 Node.js ${MINIMUM_NODE.join('.')} 或更高版本（https://nodejs.org），然后重新运行自检。`
  });
  const installed = await exists(path.join(root, 'node_modules'));
  checks.push({
    id: 'dependencies',
    ok: installed,
    blocking: true,
    title: installed ? '依赖已安装（node_modules 存在）' : '依赖未安装（缺少 node_modules）',
    fix: installed ? '' : '在仓库根目录执行：npm ci'
  });
  const built = await exists(path.join(root, 'dist', 'index.html'));
  checks.push({
    id: 'build',
    ok: built,
    blocking: false,
    title: built ? '前端构建产物已生成（dist/index.html）' : '尚未构建前端（npm start 之前需要一次构建）',
    fix: built ? '' : '开发模式 npm run dev 不需要构建；正式运行请执行 npm run build。scripts/start.ps1 会自动完成。'
  });
  return checks;
}

/** 2. Codex：可执行文件、登录状态、生成时使用的网络策略。 */
export async function checkCodex({ settings = {}, environment = process.env, runCommand = run } = {}) {
  const configured = typeof settings.codexPath === 'string' ? settings.codexPath.trim() : '';
  const executable = configured || await findCodex(environment);
  const checks = [];
  const located = Boolean(executable);
  checks.push({
    id: 'codex-path',
    ok: located,
    blocking: false,
    title: located ? `可执行文件：${executable}${configured ? '（来自设置）' : '（自动发现）'}` : '未找到 codex，需要在设置中手动填写路径',
    fix: located ? '' : '安装 Codex CLI，或在应用「偏好设置 → Codex 可执行文件」里填写绝对路径。'
  });
  const probe = located ? codexLogin(executable, environment) : { ok: false, detail: '未找到可执行文件，跳过登录检测' };
  checks.push({
    id: 'codex-login',
    ok: probe.ok,
    blocking: false,
    title: probe.ok ? `登录状态：${probe.detail.split(/\r?\n/)[0] || '已登录'}` : `登录检测未通过：${probe.detail.split(/\r?\n/)[0] || '未知原因'}`,
    fix: probe.ok ? '' : `在终端运行 “${executable} login” 完成登录。检测只确认凭据存在，不代表模型网络可用。`,
    detail: probe.detail
  });
  const model = typeof settings.model === 'string' ? settings.model.trim() : '';
  checks.push({
    id: 'codex-model',
    ok: true,
    blocking: false,
    title: model ? `模型：${model}（设置中指定）` : '模型：沿用本机 Codex 配置',
    fix: ''
  });
  const network = agentNetwork(environment);
  checks.push({
    id: 'codex-network',
    ok: true,
    blocking: false,
    title: `生成时网络：${network.source}`,
    fix: '本应用只把代理写入 Agent 子进程环境，不会修改 Windows 代理设置。'
  });
  return { executable, checks };
}

/** 3. DeepSeek Harness：包、headless profile、模型配置与凭据。 */
export async function checkHarness({ root = ROOT, settings = {}, environment = process.env, home = '', runCommand = run, discover = discoverHarness } = {}) {
  const checks = [];
  const dshHome = resolveDshHome(environment, home);
  const configuredPath = typeof settings.harnessPath === 'string' ? settings.harnessPath.trim() : '';
  const configuredArgs = Array.isArray(settings.harnessArgs) ? settings.harnessArgs : [];

  let executable = configuredPath;
  let args = configuredArgs;
  if (!executable) {
    const discovered = await discover(root, environment);
    executable = discovered.harnessPath;
    args = discovered.harnessArgs;
  }
  const cli = args.find(argument => /(^|[\\/])@deepseek-ai[\\/]dsh[\\/]lib[\\/]bin\.js$/.test(String(argument)));
  const adapter = args.find(argument => /dsh-adapter\.mjs$/.test(String(argument)));
  const official = Boolean(cli && adapter);

  checks.push({
    id: 'harness-executable',
    ok: Boolean(executable),
    blocking: false,
    title: executable ? `调用方式：${executable}${configuredPath ? '（来自设置）' : '（自动发现）'}` : '未找到 DeepSeek Harness（dsh）',
    fix: executable ? '' : `全局安装官方 CLI：npm i -g ${DSH_PACKAGE}（需要 Node.js ${MINIMUM_NODE.join('.')}+），或安装后重开终端让 PATH 生效。`
  });

  if (!official) {
    checks.push({
      id: 'harness-adapter',
      ok: false,
      blocking: false,
      title: executable && args.length ? '当前使用的是自定义命令适配器（不是官方 headless 适配器）' : '官方 headless 适配器未配置',
      fix: '在应用「偏好设置 → DeepSeek Harness」中重新填写：可执行文件 = node 的绝对路径，参数 = ["<仓库绝对路径>/scripts/dsh-adapter.mjs","<npm 全局目录>/node_modules/@deepseek-ai/dsh/lib/bin.js"]。已安装 dsh 时留空自动发现即可。'
    });
    return { dshHome, cli: cli || '', checks, probe: { executable, args } };
  }

  checks.push({
    id: 'harness-adapter',
    ok: true,
    blocking: false,
    title: `已连接官方 headless 适配器（scripts/dsh-adapter.mjs）`,
    fix: ''
  });

  const packageFile = path.resolve(path.dirname(cli), '..', 'package.json');
  const manifest = await readJson(packageFile);
  checks.push({
    id: 'harness-package',
    ok: manifest?.name === DSH_PACKAGE,
    blocking: true,
    title: manifest?.name === DSH_PACKAGE ? `官方 CLI 版本：${manifest.version}` : `无法确认 ${DSH_PACKAGE} 的版本（${packageFile}）`,
    fix: manifest?.name === DSH_PACKAGE ? '' : `重新安装官方 CLI：npm i -g ${DSH_PACKAGE}`,
    detail: { packageFile, name: manifest?.name || '', version: manifest?.version || '' }
  });

  const profileDir = path.join(dshHome, 'profiles', 'headless');
  const profileManifest = await readJson(path.join(profileDir, 'package.json'));
  const bundles = profileBundles(profileManifest);
  const profileReady = bundles.includes('@deepseek-ai/dsh-headless');
  checks.push({
    id: 'harness-profile',
    ok: profileReady,
    blocking: false,
    title: profileReady ? `headless profile 已就绪：${profileDir}` : `headless profile 尚未初始化：${profileDir}`,
    fix: profileReady ? '' : '运行一次 “node "<npm 全局目录>/node_modules/@deepseek-ai/dsh/lib/bin.js" --profile headless --version” 即可自动创建该 profile，随后重新自检。'
  });

  const settingsYaml = await readText(path.join(dshHome, 'settings.yaml'));
  const model = parseTopLevelMap(settingsYaml, 'agent-default-model');
  const modelOk = Boolean(model.provider && model.model);
  checks.push({
    id: 'harness-model',
    ok: modelOk,
    blocking: true,
    title: modelOk ? `默认模型：${model.provider} / ${model.model}${model.reasoningEffort ? `（思考强度 ${model.reasoningEffort}）` : ''}` : `未在 ${path.join(dshHome, 'settings.yaml')} 找到 agent-default-model`,
    fix: modelOk ? '' : '打开 DSH Web（dsh web）在「设置 → 模型」里选择默认模型，或在 settings.yaml 中补上 agent-default-model。',
    detail: model
  });

  const credential = await inspectCredential({ dshHome, environment });
  checks.push({
    id: 'harness-credential',
    ok: credential.ok,
    blocking: false,
    title: credential.title,
    fix: credential.fix,
    detail: credential.detail
  });

  const network = harnessNetwork(environment);
  checks.push({
    id: 'harness-network',
    ok: true,
    blocking: false,
    title: `生成时网络：${network.source}`,
    fix: 'Harness 子进程固定直连（清除代理变量并设置 NO_PROXY=*）。如果模型请求失败，请检查直连网络而不是系统代理。'
  });

  return { dshHome, cli, checks, probe: { executable, args } };
}

/** 凭据只看“是否存在”，绝不读取或打印密钥内容。 */
export async function inspectCredential({ dshHome, environment = process.env } = {}) {
  const fromEnv = typeof environment.DEEPSEEK_API_KEY === 'string' && environment.DEEPSEEK_API_KEY.trim().length > 0;
  if (fromEnv) return { ok: true, title: '凭据：已从进程环境变量 DEEPSEEK_API_KEY 读取（内容不显示）', fix: '', detail: { source: 'environment' } };
  const file = path.join(dshHome, '.credentials.yaml');
  const text = await readText(file);
  if (text && /^\s*[\w./-]*DEEPSEEK_API_KEY\s*:/m.test(text)) return { ok: true, title: `凭据：已保存在 ${file}（内容不显示）`, fix: '', detail: { source: 'credentials-file', file } };
  const dotenvHome = await readText(path.join(dshHome, '.env'));
  const dotenvCwd = await readText(path.join(process.cwd(), '.env'));
  if (/^\s*DEEPSEEK_API_KEY\s*=/m.test(dotenvHome || '') || /^\s*DEEPSEEK_API_KEY\s*=/m.test(dotenvCwd || '')) return { ok: true, title: '凭据：已从 .env 文件读取（内容不显示）', fix: '', detail: { source: 'dotenv' } };
  if (!text) return {
    ok: false,
    title: `凭据：未发现 DEEPSEEK_API_KEY 环境变量，也没有 ${file}`,
    fix: '只有在题解生成报 “MISSING_CREDENTIAL / AUTH” 时才需要处理：运行一次 dsh web，在「设置 → 模型」中填入 DeepSeek API Key，或在启动本应用的终端里设置 DEEPSEEK_API_KEY。',
    detail: { source: 'missing' }
  };
  return {
    ok: false,
    title: `${file} 中没有 DEEPSEEK_API_KEY 记录`,
    fix: '该文件当前只保存了 Web 会话记录。如果生成题解时报凭据错误，请运行一次 dsh web 在「设置 → 模型」中填入 DeepSeek API Key，或改用 DEEPSEEK_API_KEY 环境变量。',
    detail: { source: 'credentials-file', file }
  };
}

/** 4. 官方适配器自检：只验证包与协议，不发起模型请求。 */
export async function checkAdapter({ root = ROOT, harness, environment = process.env, runCommand = run } = {}) {
  const executable = harness?.probe?.executable;
  const args = Array.isArray(harness?.probe?.args) ? harness.probe.args : [];
  if (!executable || !args.some(argument => /dsh-adapter\.mjs$/.test(String(argument)))) {
    return { ok: false, skipped: true, output: '未配置官方适配器，已跳过。' };
  }
  const result = await runCommand(executable, [...args, '--check'], { timeout: 30000, env: harnessNetwork(environment).env });
  const output = (result.stdout || '').trim() || (result.stderr || '').trim();
  return { ok: result.code === 0, skipped: false, code: result.code, output, timeout: Boolean(result.timeout) };
}

/** 5. 应用自身：是否已配置、是否正在运行、笔记目录是否可写。 */
export async function checkApp({ root = ROOT, settings = {}, environment = process.env, port = 3210, fetchImpl = fetch } = {}) {
  const checks = [];
  const saveDir = typeof settings.saveDir === 'string' && settings.saveDir ? settings.saveDir : path.join(root, 'Docs');
  let writable = false;
  try { await fs.mkdir(saveDir, { recursive: true }); await fs.access(saveDir, fs.constants?.W_OK ?? 2); writable = true; } catch {}
  checks.push({
    id: 'save-dir',
    ok: writable,
    blocking: false,
    title: `笔记保存目录：${saveDir}${writable ? '（可写）' : '（不可写）'}`,
    fix: writable ? '' : '在应用「偏好设置 → 笔记保存目录」里改成一个有写权限的绝对路径。'
  });
  let running = null;
  try {
    const response = await fetchImpl(`http://127.0.0.1:${port}/api/bootstrap`, { signal: AbortSignal.timeout(1500) });
    if (response.ok) { const payload = await response.json(); if (payload?.sample?.slug === 'merge-sorted-array') running = payload; }
  } catch {}
  checks.push({
    id: 'service',
    ok: Boolean(running),
    blocking: false,
    title: running ? `应用正在运行：http://127.0.0.1:${port}` : `应用当前未运行（端口 ${port} 无响应）`,
    fix: running ? '' : '双击 启动研习室.cmd，或执行 npm run dev（开发）/ npm run build && npm start（正式）。'
  });
  return { checks, savePath: saveDir, settingsFound: Boolean(settings.__found) };
}

// ── 编排 ─────────────────────────────────────────────────────────────────────

export async function collectReport(options = {}) {
  const root = options.root || ROOT;
  const environment = options.environment || process.env;
  const settingsFile = path.join(environment.CC4_DATA_DIR || path.join(root, '.local'), 'settings.json');
  const stored = await readJson(settingsFile);
  const settings = { ...(stored || {}), __found: Boolean(stored) };

  const runtime = await checkRuntime({ root, environment, nodeVersion: process.versions.node });
  const codex = await checkCodex({ settings, environment });
  const harness = await checkHarness({ root, settings, environment, home: options.home || '', discover: options.discoverHarness, runCommand: options.runCommand });
  const app = await checkApp({ root, settings, environment, port: Number(environment.PORT || 3210) });
  const adapter = options.skipProbe
    ? { ok: false, skipped: true, output: '已按参数跳过适配器自检。' }
    : await checkAdapter({ root, harness, environment, runCommand: options.runCommand });

  if (!adapter.skipped) {
    harness.checks.push({
      id: 'harness-probe',
      ok: adapter.ok,
      blocking: false,
      title: adapter.ok ? `适配器自检通过：${adapter.output}` : `适配器自检未通过${adapter.timeout ? '（超时）' : ''}${adapter.output ? `：${adapter.output.split(/\r?\n/)[0]}` : ''}`,
      fix: adapter.ok ? '' : '确认应用与官方 dsh 版本兼容（本仓库在 @deepseek-ai/dsh 0.1.5 系列上验证）。'
    });
  }

  const checks = [...runtime, ...codex.checks, ...harness.checks, ...app.checks];
  const blocking = checks.filter(check => check.blocking && !check.ok);
  const warnings = checks.filter(check => !check.blocking && !check.ok).sort((left, right) => Number(left.id === 'build') - Number(right.id === 'build'));
  // “可用”既要求没有阻断项，也要求定位到了 Agent 并成功握手；
  // 否则空环境变量会让每一项都被跳过而误判为就绪。
  const harnessReady = checkById(checks, 'harness-adapter')?.ok === true && harness.checks.filter(check => check.blocking).every(check => check.ok);
  const codexReady = checkById(checks, 'codex-login')?.ok === true;

  return {
    generatedAt: new Date().toISOString(),
    root,
    node: process.versions.node,
    platform: `${process.platform}/${process.arch}`,
    dshHome: harness.dshHome,
    settingsFile: stored ? settingsFile : '',
    checks,
    blocking,
    warnings,
    agents: {
      codex: { ready: codexReady, executable: codex.executable || '' },
      harness: { ready: harnessReady, executable: harness.probe?.executable || '', cli: harness.cli || '', dshHome: harness.dshHome }
    }
  };
}

/** 给出“接下来做什么”，只包含当前真正需要执行的步骤。 */
export function buildGuidance(report) {
  const steps = [];
  for (const check of report.blocking) steps.push(`[必须] ${check.title}\n         → ${check.fix}`);
  const { codex, harness } = report.agents;
  if (!codex.ready && !harness.ready) steps.push('[必须] 至少配置一个 Agent：安装 Codex CLI，或全局安装 @deepseek-ai/dsh 后重新自检。');
  else if (!codex.ready) steps.push('[可选] 想用 Codex 生成题解：安装并登录 Codex 后重新自检，或在应用设置中填写 codex.exe 绝对路径。');
  else if (!harness.ready) steps.push('[可选] 想用 DeepSeek Harness 生成题解：npm i -g @deepseek-ai/dsh，运行一次 dsh web 完成模型与密钥设置，然后重新自检。');
  for (const check of report.warnings) steps.push(`[建议] ${check.title}\n         → ${check.fix}`);
  if (!steps.length) steps.push('[完成] 本机 Agent 环境已就绪：启动研习室后即可在生成区选择对应 Agent。');
  return steps;
}

// ── 输出 ─────────────────────────────────────────────────────────────────────
const ICONS = { ok: '✓', warn: '!', fail: '×' };
function icon(check) { return check.ok ? ICONS.ok : check.blocking ? ICONS.fail : ICONS.warn; }
function line(check) { return `  ${icon(check)}  ${check.title}`; }

export function formatReport(report) {
  const out = [];
  const { codex, harness } = report.agents;
  out.push('CC4LetCode 本地 Agent 自检报告');
  out.push(`  仓库：${report.root}`);
  out.push(`  运行时：Node.js ${report.node} · ${report.platform}`);
  out.push(`  生成时间：${report.generatedAt}`);
  out.push('');
  out.push(`Agent 概览：Codex ${codex.ready ? '可用' : '不可用'} · DeepSeek Harness ${harness.ready ? '可用' : '不可用'}`);
  if (harness.dshHome) out.push(`DSH_HOME：${harness.dshHome}`);
  out.push('');

  const groups = [
    ['运行环境', id => ['node', 'dependencies', 'build'].includes(id)],
    ['Agent · Codex', id => id.startsWith('codex-')],
    ['Agent · DeepSeek Harness', id => id.startsWith('harness-')],
    ['应用状态', id => ['save-dir', 'service'].includes(id)]
  ];
  for (const [title, match] of groups) {
    const checks = report.checks.filter(check => match(check.id));
    if (!checks.length) continue;
    out.push(title);
    for (const check of checks) out.push(line(check));
    out.push('');
  }
  out.push('接下来怎么做');
  for (const step of buildGuidance(report)) out.push(`  · ${step}`);
  out.push('');
  const verdict = report.blocking.length ? `存在 ${report.blocking.length} 项必须处理的问题` : '没有必须处理的问题';
  out.push(`结论：${verdict}${report.warnings.length ? `，另有 ${report.warnings.length} 条建议` : ''}。本自检未发起模型请求，未消耗额度，未修改任何本机配置。`);
  return out.join('\n');
}

function parseArguments(argv) {
  return {
    json: argv.includes('--json'),
    strict: argv.includes('--strict'),
    noProbe: argv.includes('--no-probe') || argv.includes('--offline'),
    help: argv.includes('--help') || argv.includes('-h'),
    quiet: argv.includes('--quiet')
  };
}

async function main() {
  const flags = parseArguments(process.argv.slice(2));
  if (flags.help) {
    console.log('用法：node scripts/doctor.mjs [--json] [--strict] [--no-probe]\n\n  --json      输出机器可读 JSON\n  --strict    存在阻断项时以退出码 1 结束\n  --no-probe  跳过官方适配器自检（完全不启动子进程）');
    return;
  }
  const report = await collectReport({ skipProbe: flags.noProbe });
  if (flags.json) console.log(JSON.stringify(report, null, 2));
  else if (!flags.quiet) console.log(formatReport(report));
  if (flags.strict && report.blocking.length) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error('自检失败：' + (error?.stack || error)); process.exitCode = 1; });
}
