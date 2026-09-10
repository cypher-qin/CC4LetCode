import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {discoverHarness} from '../server/harness-discovery.js';
import {checkHarness} from '../scripts/doctor.mjs';

/** 造一个假的全局 npm 安装：<dir>/node_modules/@deepseek-ai/dsh/lib/bin.js */
async function fakeGlobalInstall(directory) {
  const cli = path.join(directory, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js');
  await fs.mkdir(path.dirname(cli), {recursive: true});
  await fs.writeFile(cli, 'export async function runCli(){}\n');
  return cli;
}

test('discover the official CLI from PATH, from the Node directory, or from %APPDATA%\\npm', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cc4-app-'));
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'cc4-globals-'));
  try {
    const pathDir = path.join(workspace, 'on-path');
    const nodeDir = path.join(workspace, 'node-bin');
    const appData = path.join(workspace, 'appdata');
    const expected = ['node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'];

    // 1) PATH 命中
    const pathCli = await fakeGlobalInstall(pathDir);
    const fromPath = await discoverHarness(root, {PATH: [pathDir, nodeDir].join(path.delimiter), APPDATA: appData}, path.join(nodeDir, 'node.exe'));
    assert.equal(fromPath.harnessPath, path.join(nodeDir, 'node.exe'));
    assert.deepEqual(fromPath.harnessArgs, [path.join(root, 'scripts', 'dsh-adapter.mjs'), pathCli]);

    // 2) PATH 未命中、Node 可执行文件所在目录命中（与文档描述的检查顺序一致）
    const emptyPathDir = path.join(workspace, 'empty-path');
    await fs.mkdir(emptyPathDir, {recursive: true});
    const nodeCli = path.join(nodeDir, ...expected);
    await fs.mkdir(path.dirname(nodeCli), {recursive: true});
    await fs.writeFile(nodeCli, 'export async function runCli(){}\n');
    const fromNode = await discoverHarness(root, {PATH: emptyPathDir, APPDATA: appData}, path.join(nodeDir, 'node.exe'));
    assert.equal(fromNode.harnessArgs[1], nodeCli);

    // 3) 只有 %APPDATA%\npm 命中
    const appDataCli = await fakeGlobalInstall(path.join(appData, 'npm'));
    const fromAppData = await discoverHarness(root, {PATH: '', APPDATA: appData}, path.join(workspace, 'nowhere', 'node.exe'));
    assert.equal(fromAppData.harnessArgs[1], appDataCli);

    // 4) 全都没有 → 明确返回空，让应用提示用户手动配置
    const none = await discoverHarness(root, {PATH: '', APPDATA: path.join(workspace, 'empty')}, path.join(workspace, 'nowhere', 'node.exe'));
    assert.deepEqual(none, {harnessPath: '', harnessArgs: []});
  } finally {
    await fs.rm(root, {recursive: true, force: true});
    await fs.rm(workspace, {recursive: true, force: true});
  }
});

test('self-check reuses the app discovery order and reports the discovered CLI', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cc4-parity-'));
  const userHome = await fs.mkdtemp(path.join(os.tmpdir(), 'cc4-parity-home-'));
  const globals = await fs.mkdtemp(path.join(os.tmpdir(), 'cc4-parity-globals-'));
  try {
    // 只把 dsh 放在「Node 可执行文件所在目录」，用来验证第二条发现路径在自检里同样生效。
    const nodeDir = path.join(globals, 'node-bin');
    const cli = path.join(nodeDir, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js');
    await fs.mkdir(path.dirname(cli), {recursive: true});
    await fs.writeFile(cli, 'export async function runCli(){}\n');
    const dshHome = path.join(userHome, '.dsh');
    await fs.mkdir(path.join(dshHome, 'profiles', 'headless'), {recursive: true});
    await fs.writeFile(path.join(dshHome, 'profiles', 'headless', 'package.json'), JSON.stringify({dsh: {profile: {bundles: ['@deepseek-ai/dsh-headless']}}}));
    await fs.writeFile(path.join(dshHome, 'settings.yaml'), 'agent-default-model:\n  provider: deepseek-official\n  model: deepseek-flash\n');

    const result = await checkHarness({root, home: userHome, environment: {DSH_HOME: dshHome, PATH: '', APPDATA: ''}, settings: {}, runCommand: async () => ({code: 0, stdout: '', stderr: ''}), processExecPath: path.join(nodeDir, 'node.exe')});
    assert.equal(result.cli, cli);
    assert.equal(result.probe.executable, path.join(nodeDir, 'node.exe'));
    assert.equal(result.probe.args[1], cli);
    assert.equal(result.checks.find(check => check.id === 'harness-adapter').ok, true);
  } finally {
    await fs.rm(root, {recursive: true, force: true});
    await fs.rm(userHome, {recursive: true, force: true});
    await fs.rm(globals, {recursive: true, force: true});
  }
});
