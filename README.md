<div align="center">

# CC4LetCode · 本地算法研习室

**输入 LeetCode 链接，让本机 Agent 结合教学 Skill 逐题讲解 —— 生成过程、题面与笔记全部留在你自己的电脑上。**

[![Node](https://img.shields.io/badge/Node.js-%E2%89%A522.12-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![Local only](https://img.shields.io/badge/network-127.0.0.1%20only-2f6feb)](#安全与隐私)
[![Agents](https://img.shields.io/badge/agents-Codex%20%C2%B7%20DeepSeek%20Harness-6f42c1)](#本地-agent)
[![Tests](https://img.shields.io/badge/tests-45%20passing-2ea043)](#测试与验证)

</div>

---

## 这是什么

CC4LetCode 是一个运行在本机的算法教学工作台，面向准备求职算法面试的计算机专业学生。

它不做在线判题，也不替你提交代码。它解决的是更小但更具体的问题：**读题、理解、对照代码、沉淀笔记这四件事被拆散在不同工具里**。在这里，你粘贴一个 LeetCode 链接，左侧读题、写下自己的直觉，右侧由本机 Agent 按一份可编辑的教学规范生成中文题解（思路 → 步骤 → 完整代码 → 示例推演 → 复杂度与边界 → 自测问题），最后导出为可导入思源笔记的 Markdown。

三个设计取向：

- **本地优先**：应用与 Agent 进程都跑在本机，服务只监听 `127.0.0.1`，不发布到互联网；题面、题解、笔记、运行诊断都保存在仓库的 `.local/` 目录。
- **Skill 驱动**：`skills/algorithm-tutor/SKILL.md` 是每次生成都会重新读取的真实教学规范，不是界面装饰。改文件即可改风格，无需重启后端。
- **复用已有账号**：不要求你把 API Key 填进网页。Codex 复用本机登录，DeepSeek Harness 复用 DSH 自己的模型设置与凭据。

> "本地"指的是应用与 Agent 进程在本机运行，**不代表模型离线推理**。生成时提示词仍会发送到 Codex 或 DeepSeek 所配置的服务商。

---

## 功能

| 能力 | 说明 |
| --- | --- |
| 题目读取 | 支持 `leetcode.cn` 与 `leetcode.com` 题解链接，走公开 GraphQL 接口；失败时可手动粘贴题面 |
| 语言选择 | Java / C++ / Python，提示词与代码块按所选语言生成 |
| Agent 选择 | Codex 或 DeepSeek Harness，二者可共存，随用随切 |
| 教学模式 | 「完整题解」或「先给提示」——后者只给三层渐进提示，不直接给答案 |
| 我的思考 | 生成前写下直觉与疑问，随题面一起发送，导出时一并保留 |
| 三视图阅读 | 阅读 / 代码 / Markdown，代码视图只提取对应语言的代码块 |
| 实时进度 | 显示启动、等待响应、连接重试、超时等真实状态；刷新页面可恢复进度；可随时停止生成 |
| 继续追问 | 答案下方的悬浮窗里直接和同一个 Agent 交流，边看答案边提问；交流记录随答案保存与导出 |
| 智能重新生成 | 不满意时可「延续之前的会话」或「在新会话中重新生成」，都能先写下修改意见；结果更新同一条研习记录，不新增 |
| 专题与记录管理 | 自建专题、重命名、移动、语言筛选、最近更新排序；删除进回收站可恢复，批量操作一次提交 |
| 教学 Skill 编辑 | 侧栏直接编辑与预览教学规范，保存带并发检查并自动备份旧版本 |
| 本地历史 | 每次成功生成自动入库，支持搜索、重开、重新生成 |
| 导出笔记 | UTF-8 `.md`，保留代码围栏、表格、题目链接、追问交流与个人思考；重复导出自动改名，不覆盖你已编辑的笔记 |
| 本地自检 | `npm run doctor` 一条命令给出本机 Agent 环境报告与配置引导 |

---

## 快速开始

### 环境要求

- **Node.js 22.12 或更高版本**（本仓库在 24.19.0 上验证）
- Windows / macOS / Linux；一键启动脚本目前仅提供 Windows 版本
- 至少一个可用的本地 Agent（见 [本地 Agent](#本地-agent)）

### 安装与启动

```powershell
git clone https://github.com/cypher-qin/CC4LetCode.git
cd CC4LetCode
npm ci
npm run build
npm start          # http://127.0.0.1:3210
```

Windows 下可双击 **启动研习室.cmd**：脚本会按需自动执行 `npm ci` 与 `npm run build`，后台启动服务并打开浏览器；双击 **停止研习室.cmd** 可停止该后台服务及其正在运行的 Agent 进程。

### 开发模式

```powershell
npm run dev        # Vite 中间件模式，改前端源码即时生效，Ctrl+C 停止
```

`npm run dev` 不需要预先构建；正式的 `npm start` 读取 `dist/`，改动前端后需要重新 `npm run build`。后端改动在重启服务后生效。

### 第一步：先跑自检

```powershell
npm run doctor
```

自检脚本会告诉你本机是否已经具备生成题解的条件，并直接给出需要执行的命令。**建议在第一次使用前运行一次**，详细说明见下一节。

---

## 本地 Agent 自检（`npm run doctor`）

`scripts/doctor.mjs` 是一个**只读**的诊断脚本：它不发起任何模型请求，不消耗额度，也不会修改系统代理、DSH 配置或你的凭据。它回答三个问题：

1. 运行环境是否就绪（Node 版本、依赖、构建产物）？
2. 本机两个 Agent 各自处于什么状态，缺什么？
3. 接下来该执行哪条命令？

### 用法

```powershell
npm run doctor                  # 可读报告（默认）
npm run doctor -- --json        # 机器可读 JSON，便于脚本消费
npm run doctor -- --strict      # 存在必须处理的问题时以退出码 1 结束
npm run doctor -- --no-probe    # 跳过官方适配器自检，完全不启动子进程
node scripts/doctor.mjs --help  # 参数说明
```

### 输出示例

下面是本机（Windows + Node 24.19.0）的真实输出，其中路径已替换为占位符：

```text
CC4LetCode 本地 Agent 自检报告
  仓库：<仓库绝对路径>
  运行时：Node.js 24.19.0 · win32/x64
  生成时间：2026-09-10T13:21:13.961Z

Agent 概览：Codex 可用 · DeepSeek Harness 可用
DSH_HOME：<DSH_HOME>

运行环境
  ✓  Node.js 24.19.0 · win32/x64
  ✓  依赖已安装（node_modules 存在）
  ✓  前端构建产物已生成（dist/index.html）

Agent · Codex
  ✓  可执行文件：<...>\OpenAI\Codex\bin\<hash>\codex.exe（自动发现）
  ✓  登录状态：已登录
  ✓  模型：沿用本机 Codex 配置
  ✓  生成时网络：未配置代理，直接连接

Agent · DeepSeek Harness
  ✓  调用方式：<...>\node.exe（自动发现）
  ✓  已连接官方 headless 适配器（scripts/dsh-adapter.mjs）
  ✓  官方 CLI 版本：0.1.5-rc.1
  ✓  headless profile 已就绪：<DSH_HOME>\profiles\headless
  ✓  默认模型：deepseek-official / deepseek-flash（思考强度 high）
  !  <DSH_HOME>\.credentials.yaml 中没有 DEEPSEEK_API_KEY 记录
  ✓  生成时网络：DeepSeek Harness · 直连（不使用系统代理）
  ✓  适配器自检通过：DeepSeek Harness 0.1.5-rc.1，headless 适配器已就绪；生成使用本地 DSH 配置与直连网络。此检测不发起模型请求。

应用状态
  ✓  笔记保存目录：<仓库绝对路径>\Docs（可写）
  ✓  应用正在运行：http://127.0.0.1:3210

接下来怎么做
  · [建议] <DSH_HOME>\.credentials.yaml 中没有 DEEPSEEK_API_KEY 记录
         → 该文件当前只保存了 Web 会话记录。如果生成题解时报凭据错误，请运行一次 dsh web 在「设置 → 模型」中填入 DeepSeek API Key，或改用 DEEPSEEK_API_KEY 环境变量。

结论：没有必须处理的问题，另有 1 条建议。本自检未发起模型请求，未消耗额度，未修改任何本机配置。
```

### 它检查什么

| 分组 | 检查项 | 级别 |
| --- | --- | --- |
| 运行环境 | Node.js 版本 ≥ 22.12 | 阻断 |
| 运行环境 | 依赖已安装（`node_modules`） | 阻断 |
| 运行环境 | 前端构建产物（`dist/index.html`） | 建议 |
| Codex | 可执行文件（设置中的路径，或 `where codex` / `%LOCALAPPDATA%\OpenAI\Codex\bin` 自动发现） | 建议 |
| Codex | `codex login status` 登录状态 | 建议 |
| Codex | 模型设置、生成时使用的网络来源 | 信息 |
| Harness | 调用方式（`node.exe` + `scripts/dsh-adapter.mjs` + 官方 `lib/bin.js`） | 建议 |
| Harness | 官方 CLI 版本（读取包内 `package.json`，校验包名） | 阻断 |
| Harness | `headless` profile 是否已初始化 | 建议 |
| Harness | `settings.yaml` 中的 `agent-default-model` | 阻断 |
| Harness | 凭据是否存在（**只看是否存在，绝不读取或打印内容**） | 建议 |
| Harness | 生成时网络策略（直连，不使用系统代理） | 信息 |
| Harness | 适配器自检 `dsh-adapter.mjs --check`（不起模型请求） | 建议 |
| 应用状态 | 笔记保存目录可写、服务是否在 `127.0.0.1:3210` 上运行 | 建议 |

**级别含义**：`阻断` 表示缺了就无法生成题解，会以 `×` 标出并计入 `--strict` 的退出码；`建议` / `信息` 只提示，不会让脚本失败。

### 按自检结果配置

自检报告末尾的「接下来怎么做」是按当前状态动态生成的，只列出真正需要执行的步骤。常见情形：

- **找不到 `codex`** → 安装 Codex CLI，或在应用「偏好设置 → Codex 可执行文件」中填写 `codex.exe` 的绝对路径，然后重新自检。
- **`codex login status` 失败** → 在终端执行 `codex login`。检测只确认凭据存在，不代表模型网络连通。
- **找不到 `dsh`** → `npm i -g @deepseek-ai/dsh`，然后重开终端让 PATH 生效（自检会依次检查 PATH、Node 可执行文件所在目录、`%APPDATA%\npm`，与应用内的自动发现逻辑一致）。
- **`headless profile 尚未初始化`** → 运行一次 `dsh --profile headless --version`，DSH 会自动创建该 profile。
- **缺少 `agent-default-model`** → 运行一次 `dsh web`，在「设置 → 模型」中选择默认模型。
- **凭据提示** → 只有在生成题解真的报 `MISSING_CREDENTIAL` / `AUTH` 时才需要处理：在 `dsh web` 的「设置 → 模型」中填入 DeepSeek API Key，或在启动本应用的终端里设置 `DEEPSEEK_API_KEY`。

> 自检只比较文件与进程环境，不会真的调用模型。因此「全部通过」代表配置齐备，不等于网络一定连通；真正的连通性只有第一次生成时才能确认。

### 在代码中使用

`scripts/doctor.mjs` 导出的函数可以在自己的脚本里复用：

```js
import { collectReport, buildGuidance, formatReport } from './scripts/doctor.mjs';

const report = await collectReport({ skipProbe: true });
console.log(formatReport(report));
console.log(report.agents.harness.ready);   // true / false
```

导出的还有 `checkRuntime`、`checkCodex`、`checkHarness`、`checkAdapter`、`checkApp`、`inspectCredential`、`resolveDshHome`、`parseTopLevelMap` 等细粒度检测函数，全部支持注入环境变量与命令执行器，便于测试。

---

## 本地 Agent

### Codex

应用自动查找本机的 `codex.exe`（先查 PATH，再查 `%LOCALAPPDATA%\OpenAI\Codex\bin` 下最新的版本目录，因为从资源管理器启动的应用不会继承 Codex 桌面版增强过的 PATH），并复用 Codex 自己的登录与模型配置。

- 调用方式：非交互式 `codex exec`，只读沙箱、独立运行目录、`--ephemeral`，提示词走标准输入，最终答复用 `--output-last-message` 读取。
- 可在「偏好设置」中覆盖可执行文件路径与模型名；**不需要把密钥填进网页**。
- Windows 下生成任务会优先继承已有的 `HTTP(S)_PROXY` / `ALL_PROXY` 环境变量；没有这些变量时，读取当前已启用的 Windows 手动代理，**仅为 Agent 子进程**设置代理变量。不修改系统设置，PAC 自动配置暂不解析。
- 每次调用都会消耗本机 Codex 账户额度。

### DeepSeek Harness

已适配官方 [`@deepseek-ai/dsh`](https://www.npmjs.com/package/@deepseek-ai/dsh)（本仓库在 `0.1.5-rc.1` 上验证）。应用从 PATH 中自动发现 npm 全局安装的 dsh，用 Node.js 调用 `scripts/dsh-adapter.mjs`，通过官方 `headless` profile 生成题解 —— **不需要先启动 `dsh web`**。

- 复用现有 `DSH_HOME`、模型设置、凭据与 `DEEPSEEK_API_KEY`，不改写 Codex 或 DSH 的 Web 配置。
- 每次生成创建独立进程。DeepSeek 专用环境**移除全部代理变量并设置 `NO_PROXY=*`**：即使 Codex 走 Windows 代理，DeepSeek 仍直连。这是刻意设计——直连 DeepSeek 官方端点通常更稳定。
- 提示词通过 UTF-8 标准输入送到桥接脚本，再在进程内调用官方 `runCli()`，避免 Windows 命令行长度限制。
- `headless` 的 stderr 含模型私有推理内容。适配器只把活动状态转成应用内提示，**不转发也不保存原始推理内容**。
- `dsh` 的自定义 Web profile 插件不会自动复制到 `headless`；本应用每次会传入自己的教学 Skill。

自动发现成功后，「偏好设置 → DeepSeek Harness」显示可执行文件为 `node.exe`、参数包含 `scripts/dsh-adapter.mjs` 与官方 `.../dsh/lib/bin.js` 路径，这是预期配置。若曾手动保存过空配置，可填入这两个路径，或清空后重新自动发现。

> **npm 全局目录不在 PATH 时**：自动发现会依次检查 PATH 的每个目录、Node 可执行文件所在目录、`%APPDATA%\npm`（Windows）。如果 `npm prefix -g` 指向别处（例如改过 npm 全局目录），把该目录加进 PATH 后重开终端，或在「偏好设置」中手动填写这两个路径：
>
> - 可执行文件：`node.exe` 的绝对路径（终端执行 `where node` 获取）
> - 参数：`["<仓库绝对路径>/scripts/dsh-adapter.mjs","<npm 全局目录>/node_modules/@deepseek-ai/dsh/lib/bin.js"]`

**自定义命令适配器**仍然保留：参数是 JSON 字符串数组，支持 `{promptFile}` / `{outputFile}` 占位符，从输出文件或 stdout 读取最终 Markdown。程序应把诊断写到 stderr，退出码须为 0；不支持 shell 管道与直接执行 `.cmd` / `.bat`（Python 脚本请用 `python.exe` 作为可执行文件）。

---

## 使用流程

1. 粘贴 `https://leetcode.cn/problems/merge-sorted-array/` 之类的题目链接，点击 **读取题目**。支持中文站与国际站。
2. 切到 **我的思考**，写下你的解法或卡住的位置（生成时会一起发送）。
3. 选择语言（Java / C++ / Python）、Agent（Codex / DeepSeek Harness）与教学模式（完整题解 / 先给提示）。
4. 点击 **生成题解**。生成区显示真实阶段、耗时与网络策略；可随时 **停止生成**，失败后可重试。
5. 在 阅读 / 代码 / Markdown 三个视图间切换，或复制题解与代码。
6. 点击 **保存笔记**，导出到设置中的目录（默认仓库下的 `Docs`），再在思源笔记里用 **导入 → Markdown** 打开。

首页第 88 题是明确标注的**内置示例**，用于离线打开工作台；点击「读取题目」才会取得实时题面。每次成功生成的内容自动存入本机历史，刷新后可从 **研习记录** 打开。

### 不满意就继续聊

答案不是一次成型的。生成完成后有两条继续的路：

- **继续追问**：答案下方打开右下角悬浮窗，一边看答案一边提问，支持 `Ctrl+Enter` 发送、收起与历史回看。追问沿用这条答案原本的 Agent、语言与教学模式。
- **重新生成**：可选 **延续之前的会话** 或 **在新会话中重新生成**，两种方式都能先写下你的修改意见。延续会话时 Agent 记得之前的讨论（适合「第 3 步再展开讲讲」「换个思路」）；换 Agent 或选新会话则从零开始。

两者都**更新同一条研习记录**，不会堆出一串重复条目。旧答案与交流备份在 `.local/history-revisions/<记录编号>/`；重新生成或新增追问后需要重新导出笔记，已经导出的旧文件不会被覆盖。

### 整理你的研习记录

进入 **研习记录**，左侧可在「全部记录」「未分类」、自建专题与「回收站」之间切换：

- 点「我的专题」旁的文件夹加号新建专题；进入专题后可重命名或删除。专题是单层目录，每条记录只属于一个专题。
- 每条记录右侧的「⋯」可移动到专题、改显示名称、放入回收站；原题名始终保留，搜索对新旧名称都有效。
- 勾选后可批量移动或批量放入回收站，移动时能直接「新建专题并移入」；全选只作用于当前筛选结果。
- 支持语言筛选与排序（最近更新 / 最新创建，回收站可按最近删除）。
- 删除专题不会删掉题解，记录回到未分类；回收站可单条或批量恢复，不会自动清空。
- 训练工作台的「所属专题」下拉框可直接调整当前记录的归属。

管理信息存在 `.local/library.json`（旁边留 `.bak` 备份），原始题面与答案仍在 `.local/history/`，互不覆盖。专题不是真实文件夹，不会移动你已经导出的 Markdown。

---

## 教学 Skill

`skills/algorithm-tutor/SKILL.md` 是真实参与每次生成的规范，每次请求都会重新读取，**修改文件后不必重启后端**。除了直接改文件，也可以点侧栏的 **教学 Skill** 在网页里编辑与预览：保存会检查是否被其他窗口或本地改过，并把旧版本备份到 `.local/skill-backups/`；未保存的草稿留在当前标签页，关掉弹窗还能接着写。

它要求按固定结构输出：

1. 读懂题目 —— 用自己的话解释输入、输出、限制与易误解处
2. 从直觉到最优解 —— 先讲朴素解法的代价，再讲推荐算法与不变量
3. 分步拆解 —— 编号步骤与完整代码中的同编号注释一一对应
4. 完整代码 —— 可直接提交到 LeetCode 的完整代码块，清晰命名，不用炫技语法
5. 跟着示例走一遍 —— 用表格展示关键变量变化
6. 复杂度与边界 —— 明确时间/空间复杂度与变量定义，覆盖空输入、重复元素等
7. 自测一下 —— 两个问题，不立即给答案

「先给提示」模式只输出三层渐进提示与边界提醒，不给完整答案。题面与个人笔记被包装为**数据**，与教学指令严格分开；Skill 明确要求忽略题面中试图改变角色或执行命令的内容。生成代码仅供学习与复制，不自动执行，也不自动提交到 LeetCode。

---

## 项目结构

```text
src/                        React 工作台（main.jsx 界面、style.css 样式、api.js 请求、markdown.js 代码块提取）
server/
  index.js                  Express API、Agent 进程编排、历史与导出
  core.js                   URL 校验、题面清理、Markdown 与文件名生成
  harness.js                Codex 发现、dsh 发现与登录探测（应用与自检共用）
  harness-discovery.js      从 PATH / Node 同目录 / %APPDATA%\npm 发现官方 dsh 的 lib/bin.js
  library.js                专题、显示名称、回收站等管理元数据（独立于答案，单次原子写入）
  harness-network.js        DeepSeek 直连环境构造
  agent-network.js          Codex 的 Windows 系统代理继承
  agent-progress.js         Codex JSON 事件解析与诊断脱敏
  request-security.js       Host / Origin / 同源校验
  sample.js                 第 88 题内置示例题面
skills/algorithm-tutor/       可编辑的教学 Skill（SKILL.md），也可在网页里改
scripts/
  doctor.mjs                  本地 Agent 自检（只读，无模型请求）
  dsh-adapter.mjs             UTF-8 stdin ↔ 官方 DSH headless 的桥接（含会话延续）
  repair-dsh-web.mjs          修复 DSH Web 在本机 Chrome 下的 Origin 端口兼容问题
  start.ps1 / stop.ps1        Windows 一键启动与停止
  smoke.mjs / smoke-0913.mjs  真实网络 + 真实 Agent 端到端验证（会消耗额度）
  sync-audit.mjs               对比原型目录，检查同步是否完整（只读）
tests/                        Node 内置测试运行器，覆盖核心逻辑、API 集成、专题管理与自检
启动研习室.cmd / 停止研习室.cmd   Windows 双击入口（调用 scripts/*.ps1）
```

前端：`src/main.jsx` 是工作台外壳，`src/AnswerReader.jsx` 负责答案阅读与追问悬浮窗，`src/StudyTools.jsx` 提供教学 Skill 编辑器，`src/LibraryManager.jsx` 提供专题与回收站管理。

### 运行时生成的文件（默认不纳入版本控制）

| 路径 | 内容 |
| --- | --- |
| `.local/settings.json` | 本地配置（保存目录、Agent 路径与参数、超时）。**不保存模型 API Key** |
| `.local/history/` | 题面、题解、语言、模式、个人笔记、追问交流、Agent 会话编号与导出路径 |
| `.local/history-revisions/<记录编号>/` | 重新生成前的旧答案与交流备份，不另计为研习记录 |
| `.local/library.json` | 专题、显示名称、归属与回收站状态（旁边留 `.bak` 备份） |
| `.local/skill-backups/` | 网页端保存教学 Skill 前自动备份的旧版本 |
| `.local/runs/<任务编号>/` | 单次 Agent 运行目录与 `job.json` 诊断摘要；正常完成后删除临时提示词 |
| `.local/access-denials.log` | 被拒绝的跨来源请求记录 |
| `Docs/` | 默认导出目录，可在设置中改成任意有写权限的绝对路径 |

---

## 配置

「偏好设置」中的字段（写入 `.local/settings.json`）：

| 字段 | 含义 | 校验 |
| --- | --- | --- |
| `saveDir` | 笔记导出目录 | 必须是绝对路径 |
| `codexPath` | Codex 可执行文件 | 留空则自动发现 |
| `model` | Codex 模型 | 留空则沿用本机 Codex 配置 |
| `harnessPath` | Harness 可执行文件（通常为 `node.exe`） | 留空则自动发现 |
| `harnessArgs` | Harness 参数数组 | 必须是字符串数组 |
| `timeoutSeconds` | 单次生成超时 | 限制在 30–900 秒，默认 300 |

「偏好设置 → 检测已保存的 Agent」只检查已保存的适配器安装信息、**不发起模型请求**，不消耗额度（改完配置要先点「保存设置」，再点检测）。

### 环境变量

| 变量 | 作用 | 默认值 |
| --- | --- | --- |
| `PORT` | HTTP 端口（`scripts/start.ps1` 固定用 3210） | `3210` |
| `CC4_DATA_DIR` | 运行时数据目录（替代仓库内 `.local`） | `<仓库>/.local` |
| `CC4_SKILL_FILE` | 改用其他文件作为教学 Skill（自动测试用它隔离夹具） | `skills/algorithm-tutor/SKILL.md` |
| `DSH_HOME` | DSH 用户数据根目录，由 DSH 自己读取；未设置时自检按 `~/.dsh` 处理 | `~/.dsh` |
| `DEEPSEEK_API_KEY` | DSH 凭据来源之一（优先级最高） | 未设置 |

### 运行与生命周期

- 关掉网页**不会**停止后台服务：用 `启动研习室.cmd` 启动的服务要靠 `停止研习室.cmd` 停止，前台启动的服务按 `Ctrl+C` 停止。
- 生成过程中刷新页面可以恢复进度与取消入口；停止服务会终止当前任务。
- 后端改动在重启服务后生效；前端改动在 `npm run build` 后生效（`npm run dev` 自动生效）。
- 服务重启时若上次生成还在运行，该任务会被标记为「服务已重启，上次生成中断」，直接重新生成即可。
- 生成过程中不能整理记录（移动、回收站等会被拒绝），避免误操作正在写入的记录。
- 任务完成时临时提示词被删除；取消或异常时可能留下 `.local/runs/<任务编号>/prompt.txt` 供排查。

### HTTP API

服务只监听 `127.0.0.1`，并校验 `Host` 与来源；写操作要求当前会话 token（页面从 `GET /api/bootstrap` 获取，经 `X-Local-Token` 发送）。
| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/bootstrap` | 会话 token、设置、内置示例、进行中的任务、教学 Skill 全文 |
| PUT | `/api/settings` | 保存设置 |
| POST | `/api/agent/check` | 检测 Agent 可执行文件（不起模型请求） |
| POST | `/api/problem` | 按 LeetCode 链接读取题面 |
| GET / PUT | `/api/skill` | 读取 / 保存教学 Skill（保存前校验并发修改并备份旧版本） |
| GET | `/api/history` | 本地历史列表（已排除回收站中的记录） |
| GET / POST | `/api/library` | 读取 / 修改专题与记录管理元数据 |
| POST | `/api/generate` | 启动生成、重新生成（`regenerate`）或追问（`chat`） |
| GET | `/api/jobs/:id` | 查询任务状态与结果（刷新后可恢复进度） |
| POST | `/api/jobs/:id/cancel` | 停止生成 |
| POST | `/api/export` | 导出 Markdown 到保存目录（含追问交流） |

---

## 测试与验证

```powershell
npm test                          # 45 项自动测试：核心逻辑、API 集成、顺序研习、专题管理、自检与安全校验
npm run build                     # 前端生产构建
npm run doctor                    # 本地 Agent 自检（只读）
node scripts/smoke.mjs            # 真实 LeetCode + 真实 Codex 端到端（会消耗模型额度，需应用已运行）
node scripts/smoke-0913.mjs       # 真实 DeepSeek 连续研习联调：首轮、两种再生成、同会话追问与导出
npm run repair:dsh-web            # 修复 DSH Web 在本机 Chrome 下的 Origin 端口兼容问题（见「常见问题」）
node scripts/sync-audit.mjs       # 原型更新后检查同步是否完整（只读，需要原型目录存在）
```

自动测试覆盖：URL 限制与 SSRF 防护、题面 HTML 白名单清理、Markdown 与文件名生成、跨来源请求拒绝（含 Chrome 去掉端口号的回归场景）、Harness 输入输出协议与长提示词、推理内容不外泄、代理继承与直连策略、dsh 三条发现路径与自检一致性、持久化、重复导出不覆盖、并发限制与取消、记录去重（重新生成不新增条目）、两种再生成方式、连续追问、失败时保留原答案、导出追问交流、教学 Skill 的并发冲突与备份、DSH 会话延续参数，以及自检脚本在「什么都没有的机器」上不崩溃、不误判、不打印密钥。

真实 LeetCode / Codex / DeepSeek 联调与模拟适配器测试分开记录，`npm test` 不会消耗任何模型额度。

---

## 安全与隐私

- 服务只监听 `127.0.0.1`；`Host` 必须是本机回环地址，API 请求还需通过 Host / Origin / `Sec-Fetch-Site` 同源校验。
- 写操作（设置、生成、导出、Skill 编辑、记录整理）要求当前会话 token；token 每次启动重新生成。
- 题面 HTML 经白名单清理（移除脚本、iframe、事件属性与外链图片）；题解 Markdown 不执行原始 HTML。
- LeetCode URL 限制在 `leetcode.cn` / `leetcode.com` 两个官方域名，拒绝凭据、非标准端口与重定向。
- 诊断信息会脱敏：`Bearer`、`sk-` 形式的密钥与带凭据的代理 URL 在写入 `.local/runs/*/job.json` 前被替换。
- 自检脚本只判断凭据**是否存在**，任何情况下都不读取、不打印密钥内容。
- `scripts/repair-dsh-web.mjs` 会修改你本机已安装的 DSH 文件，运行前请留意：它先在旁边保留 `.cc4-0913.bak` 备份，遇到不认识的 DSH 版本会**拒绝修改**而不是猜测。
- 面向个人本机使用设计。**不要改成对外监听后直接公开。**

---

## 已知限制

- **LeetCode 登录态**：普通本地后端无法自动继承 Chrome 中的登录 Cookie，会员题或触发风控的页面可能读取失败。此时在浏览器复制完整题面，点击题目卡片右上角的 **粘贴题面** 继续生成。应用未提取 Chrome Cookie，也不会绕过会员权限。
- **代理**：Codex 继承环境变量或 Windows 手动代理；PAC 自动配置不解析。DeepSeek Harness 固定直连，不走任何代理。
- **模型内容**：生成内容需要你结合题面核对，应用不虚构评测通过结果，也不宣称代码已运行。
- **一键脚本**：`scripts/start.ps1` / `stop.ps1` 目前仅支持 Windows。
- **启动脚本的进程识别**：`stop.ps1` 会核对保存的 PID 是否仍是本应用的 `server/index.js`，不是则不做任何操作。

---

## 项目来源

本仓库整理自作者本机的原型项目 `C:\Users\LENOVO\Desktop\CC4LetCode`，并与该原型的最新版本保持同步（最近一次同步包含 0913「连续研习」与 0914「专题与研习记录管理」两次功能更新）。

同步过程只做**复制**：原目录从未被修改或删除，两份内容可以并存。

### 与原型的差异

除了原型的最新代码，本仓库额外含有以下内容（这些是原型所没有的）：

| 变更 | 说明 |
| --- | --- |
| 新增 `scripts/doctor.mjs` | 本地 Agent 自检脚本，只读、不发起模型请求 |
| 新增 `tests/doctor.test.js`、`tests/harness-discovery.test.js` | 自检脚本与 dsh 发现路径的测试 |
| 新增 `server/harness.js` | 把 Codex 发现与 dsh 发现收拢成应用与自检共用的出口（**行为不变**） |
| `harness-discovery.js` 增加可注入的 `processExecPath` | 仅为让自检可测试，默认值与应用完全一致 |
| `package.json` | 增加 `description`、`engines`、`license`、`repository` 与 `doctor` / `smoke` / `repair` 脚本 |
| 新增 `README.md`、`LICENSE`、`.gitattributes`、`.github/workflows/ci.yml`、`Docs/.gitkeep` | 文档、MIT 许可、行尾规范、CI 与导出目录占位 |
| 新增 `启动研习室.cmd`、`停止研习室.cmd` | Windows 双击入口 |
| 新增 `需求0907.txt`、`需求0913.txt` | 原型的需求文档原样保留，便于对照功能来源与后续迭代 |

初版需求与取舍：核心定位是求职算法学习助手，优先把读题、理解、代码对照与知识沉淀串起来；加入提示模式与个人思考以帮助主动训练；暂不做在线判题、自动提交、刷题统计或复杂课程体系。

可继续迭代的方向：通过用户主动点击的浏览器扩展，把已登录页面的题面送入工作台；在支持 WebMCP 的浏览器中验证已注册的两个工具（读取工作台、打开历史记录）。

---

## 常见问题

**端口 3210 被占用（`EADDRINUSE`）**
先确认是不是上一次的服务还在：打开 <http://127.0.0.1:3210> 能看到工作台就说明已在运行，直接用即可。确实被别的程序占用时，换端口启动（自检报告中的「应用正在运行」也按同一端口判断）：

```powershell
$env:PORT=3211
npm start
```

注意：一键脚本 `scripts/start.ps1` 固定使用 3210，改端口后请改用命令行启动。

**怎么停止服务**
`npm start` / `npm run dev` 在前台运行，按 `Ctrl+C` 停止。只有通过 **启动研习室.cmd** 启动的后台服务才用 **停止研习室.cmd** 关闭（它按 `.local/server.pid` 核对进程，不是本应用就什么都不做）。停止服务会一并终止正在生成的 Agent 任务。

**双击启动后窗口一闪而过**
`start.ps1` 出错时会打印原因并停在 `Press Enter to close`；如果窗口直接消失，说明脚本没被调用成功。改为在终端手动执行 `powershell -ExecutionPolicy Bypass -File scripts\start.ps1`，或逐条执行 `npm ci`、`npm run build`、`npm start` 查看完整报错（Windows PowerShell 5.1 不支持 `&&` 连接命令，请分行执行）。

**生成一直卡住或提示连接失败**
- Codex 报连接超时：先确认代理软件在运行。应用只把 Windows 手动代理写进 Agent 子进程的环境变量，不修改系统设置；PAC 自动配置不解析，需要在代理软件里改用固定端口模式。
- DeepSeek Harness 报错：它固定直连、不使用任何代理，请直接检查能否访问 DeepSeek 端点，并确认 DSH 里的模型设置。超时可在「偏好设置 → 生成超时」中调大（上限 900 秒）。

**重新生成会多出一条记录吗**
不会。延续会话或在会话中重新生成都更新同一条研习记录，旧的答案与交流备份在 `.local/history-revisions/`。想看更早的版本可以到那里取。

**DSH Web 只能在 Chrome 访客模式下用**
这是 DSH Web 严格匹配 Origin 端口、而本机部分 Chrome 配置会去掉回环地址端口号造成的。仓库自带修复脚本：

```powershell
npm run repair:dsh-web
```

它会先备份原文件（`.cc4-0913.bak`）再打补丁，遇到不认识的 DSH 版本会直接报错退出、不做任何改动。升级 `dsh` 后可能需要重新运行。修复后仍用 `dsh web` 启动，并使用它打开的带启动认证流程的页面；只访问裸地址遇到 401 时，重新打开启动链接即可。本应用生成题解并不需要 `dsh web` 保持运行。

**改了 Skill 需要重启吗**
不需要，保存后下一次生成就会生效。网页端保存会把旧版本备份到 `.local/skill-backups/`。

**换了电脑/重新克隆后要做什么**
`npm ci` → `npm run doctor`（重新确认 Agent 路径）→ `npm run build` → `npm start`。`.local/`、`dist/`、`node_modules/` 都不在版本控制内，不会随 `git clone` 带过来；**研习记录、专题与设置都保存在 `.local/`，需要自行备份这个目录**。

---

## 许可

本项目以 [MIT 许可证](LICENSE) 发布，Copyright (c) 2026 cypher-qin。

你可以自由使用、修改、分发和再发布本项目（包括用于商业用途），只需在副本或实质性部分中保留上述版权声明与许可声明。软件按「原样」提供，不附带任何担保。

`package.json` 中的 `"private": true` 只是防止这个本地应用被误发布到 npm，与许可证无关，不影响你 fork 或分发。

第三方依赖各自的许可证（全部为宽松许可：MIT、BSD-2-Clause、ISC）见 `node_modules/<包名>/LICENSE`，本项目的 MIT 许可不改变这些依赖的授权条款。

> 你使用本应用生成的题解、代码与笔记属于你自己的内容，MIT 许可不对此主张任何权利；但这些内容由模型生成，仍受你所使用的 Codex 或 DeepSeek 服务商条款约束。
