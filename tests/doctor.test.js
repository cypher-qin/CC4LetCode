import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {
  MINIMUM_NODE,
  resolveDshHome,
  parseTopLevelMap,
  compareVersions,
  profileBundles,
  inspectCredential,
  checkRuntime,
  checkCodex,
  checkHarness,
  checkApp,
  collectReport,
  buildGuidance,
  formatReport
} from '../scripts/doctor.mjs';

const noProbe = async () => ({code: 0, stdout: '', stderr: ''});
const tempDir = () => fs.mkdtemp(path.join(os.tmpdir(), 'cc4-doctor-'));
const checkById = (checks, id) => checks.find(check => check.id === id);

test('resolve $DSH_HOME with ~ expansion and the ~/.dsh fallback', () => {
  const home = 'C:\\Users\\tester';
  assert.equal(resolveDshHome({DSH_HOME: 'F:\\dsh-home'}, home), path.resolve('F:\\dsh-home'));
  assert.equal(resolveDshHome({DSH_HOME: '~/custom'}, home), path.resolve(path.join(home, 'custom')));
  assert.equal(resolveDshHome({DSH_HOME: '   '}, home), path.resolve(path.join(home, '.dsh')));
  assert.equal(resolveDshHome({}, home), path.resolve(path.join(home, '.dsh')));
});

test('read the DSH default model without a YAML dependency', () => {
  const yaml = ['ui-onboarding:', '  welcomeNoticeVersion: 2026-08-13.1', 'agent-default-model:', '  provider: deepseek-official', '  model: deepseek-flash', '  reasoningEffort: high', 'other-key:', '  value: 1'].join('\n');
  const model = parseTopLevelMap(yaml, 'agent-default-model');
  assert.equal(model.provider, 'deepseek-official');
  assert.equal(model.model, 'deepseek-flash');
  assert.equal(model.reasoningEffort, 'high');
  assert.deepEqual(parseTopLevelMap(yaml, 'missing-key'), {});
});

test('compare Node versions against the documented minimum', () => {
  assert.equal(compareVersions('24.19.0', MINIMUM_NODE.join('.')), 1);
  assert.equal(compareVersions(MINIMUM_NODE.join('.'), MINIMUM_NODE.join('.')), 0);
  assert.equal(compareVersions('22.11.0', MINIMUM_NODE.join('.')), -1);
});

test('runtime check blocks only for unsupported Node or missing dependencies', async () => {
  const root = await tempDir();
  try {
    const stale = await checkRuntime({root, nodeVersion: '20.11.0'});
    assert.equal(checkById(stale, 'node').blocking, true);
    assert.equal(checkById(stale, 'node').ok, false);
    assert.match(checkById(stale, 'node').fix, /Node\.js 22\.12\.0/);
    assert.equal(checkById(stale, 'dependencies').blocking, true);
    assert.equal(checkById(stale, 'build').blocking, false);
    await fs.mkdir(path.join(root, 'node_modules'));
    const ready = await checkRuntime({root, nodeVersion: '22.12.0'});
    assert.equal(checkById(ready, 'dependencies').ok, true);
    assert.equal(checkById(ready, 'node').ok, true);
  } finally { await fs.rm(root, {recursive: true, force: true}); }
});

test('Codex check reports a missing executable as guidance, not a crash', async () => {
  const result = await checkCodex({settings: {codexPath: 'C:\\missing\\codex.exe'}, environment: {}});
  assert.equal(checkById(result.checks, 'codex-path').ok, true);
  assert.equal(checkById(result.checks, 'codex-path').blocking, false);
  assert.equal(checkById(result.checks, 'codex-login').ok, false);
  assert.match(checkById(result.checks, 'codex-login').fix, /login/);
  assert.equal(result.executable, 'C:\\missing\\codex.exe');
});

test('Harness check walks CLI, profile, model and credential state', async () => {
  const root = await tempDir();
  const userHome = await tempDir();
  try {
    // resolveDshHome() appends `.dsh` when $DSH_HOME is unset, so create the real home below it.
    const home = path.join(userHome, '.dsh');
    const profileDir = path.join(home, 'profiles', 'headless');
    const cliDir = path.join(userHome, 'cli', 'node_modules', '@deepseek-ai', 'dsh', 'lib');
    await fs.mkdir(profileDir, {recursive: true});
    await fs.mkdir(cliDir, {recursive: true});
    await fs.writeFile(path.join(cliDir, 'bin.js'), '');
    await fs.writeFile(path.join(userHome, 'cli', 'node_modules', '@deepseek-ai', 'dsh', 'package.json'), JSON.stringify({name: '@deepseek-ai/dsh', version: '0.1.5-rc.1'}));
    await fs.writeFile(path.join(profileDir, 'package.json'), JSON.stringify({dsh: {profile: {bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-headless']}}}));
    await fs.writeFile(path.join(home, 'settings.yaml'), 'agent-default-model:\n  provider: deepseek-official\n  model: deepseek-flash\n');

    const cli = path.join(cliDir, 'bin.js');
    const missing = await checkHarness({root, home: userHome, environment: {}, settings: {harnessPath: process.execPath, harnessArgs: []}, discover: async () => ({harnessPath: '', harnessArgs: []}), runCommand: noProbe});
    assert.equal(checkById(missing.checks, 'harness-executable').ok, true);
    assert.equal(checkById(missing.checks, 'harness-adapter').ok, false);
    assert.equal(missing.checks.some(check => check.id === 'harness-package'), false);

    const configured = await checkHarness({root, home: userHome, environment: {}, settings: {harnessPath: process.execPath, harnessArgs: [path.join(root, 'scripts', 'dsh-adapter.mjs'), cli]}, discover: async () => ({harnessPath: '', harnessArgs: []}), runCommand: noProbe});
    assert.equal(checkById(configured.checks, 'harness-package').ok, true);
    assert.match(checkById(configured.checks, 'harness-package').title, /0\.1\.5-rc\.1/);
    assert.equal(checkById(configured.checks, 'harness-profile').ok, true);
    assert.equal(checkById(configured.checks, 'harness-model').ok, true);
    assert.equal(checkById(configured.checks, 'harness-network').ok, true);
    assert.equal(configured.cli, cli);
    assert.equal(configured.dshHome, path.resolve(home));

    const unconfigured = await checkHarness({root, home: userHome, environment: {}, settings: {}, discover: async () => ({harnessPath: '', harnessArgs: []}), runCommand: noProbe});
    assert.equal(checkById(unconfigured.checks, 'harness-executable').ok, false);
    assert.match(checkById(unconfigured.checks, 'harness-executable').fix, /npm i -g @deepseek-ai\/dsh/);
  } finally { await fs.rm(root, {recursive: true, force: true}); await fs.rm(userHome, {recursive: true, force: true}); }
});

test('profile bundles decide whether the headless profile is initialized', () => {
  assert.deepEqual(profileBundles({dsh: {profile: {bundles: ['a']}}}), ['a']);
  assert.deepEqual(profileBundles(null), []);
  assert.deepEqual(profileBundles({dsh: {profile: {bundles: 'a'}}}), []);
});

test('credentials are detected by presence and never printed', async () => {
  const home = await tempDir();
  try {
    const absent = await inspectCredential({dshHome: home, environment: {}});
    assert.equal(absent.ok, false);
    assert.equal(absent.detail.source, 'missing');

    const fromEnv = await inspectCredential({dshHome: home, environment: {DEEPSEEK_API_KEY: 'sk-live-secret'}});
    assert.equal(fromEnv.ok, true);
    assert.equal(JSON.stringify(fromEnv).includes('sk-live-secret'), false);

    await fs.writeFile(path.join(home, '.credentials.yaml'), 'version: 1\nrecords:\n  agent/deepseek-official/DEEPSEEK_API_KEY:\n    kind: api-key\n    payload:\n      version: 1\n      secret: sk-file-secret\n');
    const fromFile = await inspectCredential({dshHome: home, environment: {}});
    assert.equal(fromFile.ok, true);
    assert.equal(fromFile.detail.source, 'credentials-file');
    assert.equal(JSON.stringify(fromFile).includes('sk-file-secret'), false);

    await fs.rm(path.join(home, '.credentials.yaml'));
    await fs.writeFile(path.join(home, '.env'), 'DEEPSEEK_API_KEY=sk-dotenv-secret\n');
    const fromDotenv = await inspectCredential({dshHome: home, environment: {}});
    assert.equal(fromDotenv.ok, true);
    assert.equal(fromDotenv.detail.source, 'dotenv');
    assert.equal(JSON.stringify(fromDotenv).includes('sk-dotenv-secret'), false);
  } finally { await fs.rm(home, {recursive: true, force: true}); }
});

test('app check reports the save directory and a stopped service without failing', async () => {
  const root = await tempDir();
  try {
    const result = await checkApp({root, settings: {saveDir: path.join(root, 'Docs')}, environment: {}, port: 3210, fetchImpl: async () => { throw new Error('offline'); }});
    assert.equal(checkById(result.checks, 'save-dir').ok, true);
    assert.equal(checkById(result.checks, 'service').ok, false);
    assert.equal(checkById(result.checks, 'service').blocking, false);
    assert.match(checkById(result.checks, 'service').fix, /启动研习室/);
  } finally { await fs.rm(root, {recursive: true, force: true}); }
});

test('collectReport never throws on a machine without any Agent and only recommends future steps', async () => {
  const root = await tempDir();
  const userHome = await tempDir();
  try {
    await fs.mkdir(path.join(root, 'node_modules'));
    const dshHome = path.join(userHome, 'dsh-home');
    const report = await collectReport({
      root,
      environment: {DSH_HOME: dshHome, PATH: '', APPDATA: ''},
      home: userHome,
      discoverHarness: async () => ({harnessPath: '', harnessArgs: []}),
      runCommand: noProbe,
      skipProbe: true
    });
    assert.equal(report.blocking.length, 0);
    assert.ok(report.checks.length >= 10);
    assert.equal(report.agents.codex.ready, false);
    assert.equal(report.agents.harness.ready, false);
    assert.equal(report.checks.find(check => check.id === 'harness-adapter').ok, false);
    assert.equal(report.dshHome, path.resolve(dshHome));
    assert.equal(report.checks.some(check => check.id === 'harness-probe'), false);
    const guidance = buildGuidance(report).join('\n');
    assert.match(guidance, /至少配置一个 Agent/);
    const text = formatReport(report);
    assert.match(text, /CC4LetCode 本地 Agent 自检报告/);
    assert.match(text, /接下来怎么做/);
    assert.match(text, /未发起模型请求/);
  } finally { await fs.rm(root, {recursive: true, force: true}); await fs.rm(userHome, {recursive: true, force: true}); }
});

test('self-check CLI prints JSON and honours --strict only for blocking findings', async () => {
  const run = args => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/doctor.mjs', ...args], {cwd: path.resolve('.'), windowsHide: true});
    let stdout = ''; let stderr = '';
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => resolve({code, stdout, stderr}));
  });
  const json = await run(['--json', '--no-probe']);
  assert.equal(json.code, 0);
  const report = JSON.parse(json.stdout);
  assert.equal(report.root, path.resolve('.'));
  assert.equal(report.agents.harness.dshHome.length > 0, true);
  assert.equal(report.checks.some(check => check.id === 'harness-probe'), false);
  const text = await run(['--no-probe']);
  assert.equal(text.code, 0);
  assert.match(text.stdout, /本自检未发起模型请求/);
  const strict = await run(['--strict', '--no-probe']);
  assert.equal(strict.code, report.blocking.length ? 1 : 0);
});
