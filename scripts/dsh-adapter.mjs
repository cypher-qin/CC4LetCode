// Bridge CC4LetCode's UTF-8 stdin protocol to the installed official DSH CLI.
// Importing the CLI in this process avoids Windows command-line length limits.
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {harnessNetwork} from '../server/harness-network.js';
import {safeDiagnostic} from '../server/agent-progress.js';
import {registerHooks} from 'node:module';

const cli=process.argv[2];
const check=process.argv.includes('--check');
const rawStderr=process.stderr.write.bind(process.stderr);
const event=(stage,detail)=>rawStderr('CC4_HARNESS_EVENT '+JSON.stringify({stage,...(detail?{detail:safeDiagnostic(detail)}:{})})+'\n');
try {
  if(!cli||!path.isAbsolute(cli))throw new Error('未指定 dsh 的 lib/bin.js 绝对路径');
  await fs.access(cli);
  const pkg=JSON.parse(await fs.readFile(path.resolve(path.dirname(cli),'..','package.json'),'utf8'));
  if(pkg.name!=='@deepseek-ai/dsh')throw new Error('指定路径不是官方 @deepseek-ai/dsh CLI');
  if(check){console.log(`DeepSeek Harness ${pkg.version}，headless 适配器已就绪；生成使用本地 DSH 配置与直连网络。此检测不发起模型请求。`);}
  else {
    let prompt='';process.stdin.setEncoding('utf8');for await(const chunk of process.stdin)prompt+=chunk;
    if(!prompt.trim())throw new Error('题解提示词为空');
    if(prompt.length>200000)throw new Error('题解提示词过长');
    const direct=harnessNetwork();
    for(const name of Object.keys(process.env))if(/^(https?|all|ftp)_proxy$/i.test(name)||/^npm_config_(https?_)?proxy$/i.test(name))delete process.env[name];
    Object.assign(process.env,direct.env);
    event('正在启动 DeepSeek Harness headless');
    let reasoning=false,lineBuffer='';
    // DSH's headless stderr includes private reasoning. Report activity only;
    // never forward those deltas to the app's diagnostics or final Markdown.
    process.stderr.write=(chunk,encoding,callback)=>{
      const text=Buffer.isBuffer(chunk)?chunk.toString('utf8'):String(chunk);
      lineBuffer+=text;
      if(!reasoning&&lineBuffer.includes('dsh: reasoning:')){reasoning=true;event('DeepSeek 已开始分析题目');}
      let end;while((end=lineBuffer.indexOf('\n'))>=0){
        const line=lineBuffer.slice(0,end);lineBuffer=lineBuffer.slice(end+1);
        if(/^dsh: (?!reasoning:)/.test(line))event('DeepSeek Harness 返回错误',line);
        else if(!reasoning&&/error|failed|timeout/i.test(line))event('DeepSeek Harness 启动诊断',line);
      }
      if(lineBuffer.length>10000)lineBuffer=lineBuffer.slice(-1000);
      const done=typeof encoding==='function'?encoding:callback;if(done)done();return true;
    };
    // Skill frontmatter begins with "---"; Commander otherwise treats it as
    // a CLI option when parsing the headless task a second time.
    process.argv=[process.execPath,cli,'--profile','headless','任务要求：\n'+prompt];
    // The installed headless runner is one-shot. Adapt only its in-process
    // module to the official agents.resume API; do not modify the installation.
    if(process.env.CC4_DSH_SESSION){
      const session=process.env.CC4_DSH_SESSION;
      if(!/^session-[a-f0-9-]{36}$/.test(session))throw new Error('无效的 DeepSeek 会话编号');
      registerHooks({load(url,context,nextLoad){
        const result=nextLoad(url,context);
        if(url.endsWith('/dsh-headless/lib/index.js')){
          let source=String(result.source);
          const identity='sessionId: brandString(`session-${randomUUID()}`)';
          if(!source.includes(identity)||!source.includes('await agents.create({'))throw new Error('DSH headless 结构已变更，请更新会话适配器');
          source=source.replace(identity,(process.env.CC4_DSH_RESUME==='1'?'resumeSessionId':'sessionId')+': brandString('+JSON.stringify(session)+')');
          if(process.env.CC4_DSH_RESUME==='1')source=source.replace('await agents.create({','await agents.resume({');
          return {...result,source};
        }
        return result;
      }});
    }
    const entry=await import(pathToFileURL(cli).href);
    if(typeof entry.runCli!=='function')throw new Error('当前 DSH 版本不提供 runCli，请检查适配器兼容性');
    await entry.runCli();
  }
} catch(error) {
  event('DeepSeek Harness 适配失败',error.message);process.exitCode=1;
}
