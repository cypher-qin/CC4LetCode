import express from 'express';
import {createLibrary} from './library.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { parseProblemUrl, cleanHtml, plainText, exportMarkdown, exportPath } from './core.js';
import { sample } from './sample.js';
import { isTrustedOrigin } from './request-security.js';
import { agentNetwork } from './agent-network.js';
import { harnessNetwork } from './harness-network.js';
import { discoverHarness, findCodex } from './harness.js';
import { parseAgentEvent, safeDiagnostic } from './agent-progress.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const DATA = process.env.CC4_DATA_DIR || path.join(ROOT,'.local');
const PORT = Number(process.env.PORT || 3210);
await fs.mkdir(path.join(DATA,'runs'),{recursive:true});
await fs.mkdir(path.join(DATA,'history'),{recursive:true});
async function readJson(file, fallback) {try{return JSON.parse(await fs.readFile(file,'utf8'));}catch(error){if(error.code==='ENOENT')return fallback;throw error;}}
// Windows refuses rename-over-existing (EPERM/EACCES/EBUSY) while an antivirus
// scan, indexer or open reader still holds a handle, so retry briefly and always
// remove the temporary file instead of leaving it behind.
async function writeJson(file, value) {
  const tmp=file+'.'+randomUUID()+'.tmp';
  try{
    await fs.writeFile(tmp,JSON.stringify(value,null,2),'utf8');
    for(let attempt=0;;attempt++){
      try{await fs.rename(tmp,file);return;}
      catch(error){
        if(!['EPERM','EACCES','EBUSY'].includes(error.code)||attempt>=4)throw error;
        await new Promise(resolve=>setTimeout(resolve,20*2**attempt));
      }
    }
  }finally{await fs.rm(tmp,{force:true}).catch(()=>{});}
}
const defaults={saveDir:path.join(ROOT,'Docs'),codexPath:await findCodex(),model:'',...await discoverHarness(ROOT),timeoutSeconds:300};
let settings = {...defaults,...await readJson(path.join(DATA,'settings.json'),{})};
// Desktop updates rotate the bundled binary directory. Repair only stale
// auto-discovered desktop paths; leave custom commands and paths untouched.
if(process.platform==='win32'&&process.env.LOCALAPPDATA&&path.isAbsolute(settings.codexPath)){
  const bundled=path.join(process.env.LOCALAPPDATA,'OpenAI','Codex','bin')+path.sep;
  if(settings.codexPath.toLowerCase().startsWith(bundled.toLowerCase()))try{await fs.access(settings.codexPath);}catch{settings.codexPath=defaults.codexPath;}
}
const token=randomBytes(24).toString('hex');
const jobs = new Map();
const SKILL = process.env.CC4_SKILL_FILE || path.join(ROOT,'skills/algorithm-tutor/SKILL.md');
let skillSaving=false;
let generationAdmission=false;
const library=await createLibrary(DATA,{isBusy:()=>generationAdmission||[...jobs.values()].some(j=>j.status==='running')});
const jobWrites = new Map();
function jobFile(id){return path.join(DATA,'runs',id,'job.json');}
function persistSnapshot(job, snapshot){
  const previous=jobWrites.get(job.id)||Promise.resolve();
  const pending=previous.then(()=>writeJson(jobFile(job.id),snapshot)).catch(async error=>{
    // The atomic rename can stay blocked (Windows antivirus holding the file):
    // rewrite in place so a recorded state is never lost, and only then report.
    console.error('保存任务状态失败，改用直接写入：'+error.message);
    try{await fs.writeFile(jobFile(job.id),JSON.stringify(snapshot,null,2),'utf8');}
    catch(fallback){job.persistError=`任务状态未能写入磁盘：${fallback.message}`;console.error('保存任务状态失败：'+fallback.message);}
  });
  jobWrites.set(job.id,pending);return pending;
}
function persistJob(job){return persistSnapshot(job,publicJob(job));}
function progress(job,stage,detail){
  job.stage=stage;job.lastActivityAt=new Date().toISOString();
  job.diagnostics=[...(job.diagnostics||[]),{at:job.lastActivityAt,stage,...(detail?{detail:safeDiagnostic(detail)}:{})}].slice(-25);
  void persistJob(job);
}
// Job snapshots are the only state a restarted service can read, so a terminal
// state is written to disk before it becomes visible in memory; anything that
// observes a finished job then finds the same state in runs/<id>/job.json.
async function settleJob(job,status,error,stage,detail){
  const at=new Date().toISOString();
  const diagnostics=[...(job.diagnostics||[]),{at,stage,...(detail?{detail:safeDiagnostic(detail)}:{})}].slice(-25);
  await persistSnapshot(job,publicJob({...job,status,error,stage,lastActivityAt:at,diagnostics}));
  job.status=status;job.error=error;job.stage=stage;job.lastActivityAt=at;job.diagnostics=diagnostics;
}
const app=express();
app.disable('x-powered-by');
app.use((req,res,next)=>{
  const hosts=[`127.0.0.1:${PORT}`,`localhost:${PORT}`];
  if(!hosts.includes(req.headers.host))return res.status(403).json({error:'仅允许本机访问'});
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  if(req.path.startsWith('/api/')){
    res.setHeader('Cache-Control','no-store');
    if(!isTrustedOrigin(req.headers,PORT)){
      const details={at:new Date().toISOString(),method:req.method,path:req.path,host:req.headers.host,origin:req.headers.origin||'(未发送)',fetchSite:req.headers['sec-fetch-site']||'(未发送)'};
      fs.appendFile(path.join(DATA,'access-denials.log'),JSON.stringify(details)+'\n','utf8').catch(()=>{});
      return res.status(403).json({code:'UNTRUSTED_ORIGIN',error:`浏览器请求来源校验失败。请直接打开 http://127.0.0.1:${PORT}/ 后重试。若仍失败，请检查浏览器中修改请求头的扩展。`,origin:details.origin,fetchSite:details.fetchSite});
    }
    if(!['GET','HEAD'].includes(req.method) && req.headers['x-local-token']!==token)return res.status(403).json({error:'会话已更新，请刷新页面'});
  }
  next();
});
app.use(express.json({limit:'1mb'}));
app.get('/api/skill',async(req,res)=>res.json({content:await fs.readFile(SKILL,'utf8')}));
app.put('/api/skill',async(req,res)=>{
  const {content,original}=req.body;
  if(typeof content!=='string'||!content.trim()||content.length>100000)return res.status(400).json({error:'Skill 不能为空，且不能超过 100000 字'});
  if(skillSaving)return res.status(409).json({error:'正在保存，请稍后重试'});
  skillSaving=true;
  try{
    const previous=await fs.readFile(SKILL,'utf8');
    if(original!==previous)return res.status(409).json({error:'Skill 已在其他窗口或本地修改，请重新打开后编辑'});
    await fs.mkdir(path.join(DATA,'skill-backups'),{recursive:true});
    await fs.writeFile(path.join(DATA,'skill-backups',Date.now()+'.md'),previous,'utf8');
    const tmp=SKILL+'.tmp';await fs.writeFile(tmp,content,'utf8');await fs.rename(tmp,SKILL);res.json({content});
  }finally{skillSaving=false;}
});
app.get('/api/bootstrap',async(req,res)=>res.json({token,settings,sample,activeJob:[...jobs.values()].filter(j=>j.status==='running').map(publicJob)[0]||null,skill:await fs.readFile(SKILL,'utf8')}));
app.put('/api/settings',async(req,res)=>{
  const s=req.body;
  if(typeof s.saveDir!=='string'||!path.isAbsolute(s.saveDir))return res.status(400).json({error:'保存目录必须是绝对路径'});
  if(!Array.isArray(s.harnessArgs)||s.harnessArgs.some(a=>typeof a!=='string'))return res.status(400).json({error:'Harness 参数必须是字符串数组'});
  for(const key of ['codexPath','model','harnessPath'])if(typeof s[key]!=='string'||s[key].length>1000)return res.status(400).json({error:'Agent 配置不合法'});
  settings={saveDir:path.resolve(s.saveDir),codexPath:s.codexPath.trim()||defaults.codexPath,model:s.model.trim(),harnessPath:s.harnessPath.trim(),harnessArgs:s.harnessArgs,timeoutSeconds:Math.max(30,Math.min(900,Number(s.timeoutSeconds)||300))};
  await writeJson(path.join(DATA,'settings.json'),settings);res.json(settings);
});
app.post('/api/agent/check',async(req,res)=>{
  const executable=req.body.agent==='harness'?settings.harnessPath:settings.codexPath;
  if(!executable)return res.status(400).json({error:'请先在设置中填写 Agent 可执行文件路径'});
  const args=req.body.agent==='harness'?[...settings.harnessArgs,...(settings.harnessArgs[0]===path.join(ROOT,'scripts','dsh-adapter.mjs')?['--check']:['--help'])]:['login','status'];
  const child=spawn(executable,args,{shell:false,windowsHide:true,...(req.body.agent==='harness'?{env:harnessNetwork().env}:{})});let output='',ended=false;
  const finish=(code,error)=>{if(ended)return;ended=true;clearTimeout(timer);res.json({ok:code===0,detail:error||output.trim().slice(-2000)||`退出码 ${code}`});};
  const timer=setTimeout(()=>{child.kill();finish(-1,'检测超时，请检查可执行文件');},15000);
  child.stdout.on('data',d=>{output=(output+d).slice(-4000);});child.stderr.on('data',d=>{output=(output+d).slice(-4000);});child.on('error',e=>finish(-1,e.message));child.on('close',c=>finish(c));
});
app.post('/api/problem',async(req,res)=>{
  const parsed=parseProblemUrl(req.body.url);
  const chinese=parsed.origin.endsWith('.cn');
  const query=`query questionData($titleSlug: String!) { question(titleSlug: $titleSlug) { questionFrontendId title content difficulty ${chinese?'translatedTitle translatedContent':''} topicTags { name ${chinese?'translatedName':''} } } }`;
  try{
    const response=await fetch(parsed.origin+'/graphql/',{method:'POST',redirect:'error',headers:{'Content-Type':'application/json','Referer':parsed.url,'User-Agent':'Mozilla/5.0'},body:JSON.stringify({query,variables:{titleSlug:parsed.slug}}),signal:AbortSignal.timeout(20000)});
    if(!response.ok)throw new Error(`LeetCode 返回 HTTP ${response.status}`);
    const json=await response.json();const q=json.data?.question;
    if(!q?.content&&!q?.translatedContent)throw new Error('题目不存在、需要登录或暂时无法读取');
    res.json({...parsed,id:q.questionFrontendId,title:q.translatedTitle||q.title,titleEn:q.title,content:cleanHtml(q.translatedContent||q.content),difficulty:q.difficulty,tags:q.topicTags?.map(t=>t.translatedName||t.name)||[],source:'LeetCode · 实时读取'});
  }catch(error){res.status(422).json({error:`读取失败：${error.message}。可以从浏览器复制题面，使用“粘贴题面”继续。`});}
});
app.get('/api/library',async(req,res)=>res.json(await library.snapshot()));
app.post('/api/library',async(req,res)=>res.json(await library.mutate(req.body)));
app.get('/api/history',async(req,res)=>res.json((await library.snapshot()).records.filter(r=>!r.deletedAt)));
function publicJob(job){const {child,...value}=job;return {...value,record:library.decorate(value.record)};}
function stopChild(child){if(!child?.pid)return;if(process.platform==='win32')spawn('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});else child.kill('SIGTERM');}
app.post('/api/generate',(req,res,next)=>{
  if(library.isWriting())return res.status(409).json({error:'正在保存记录整理结果，请稍后重试'});
  if(generationAdmission)return res.status(409).json({error:'已有请求正在启动，请稍后重试'});
  generationAdmission=true;res.once('finish',()=>{generationAdmission=false;});res.once('close',()=>{generationAdmission=false;});next();
},async(req,res)=>{
  if([...jobs.values()].some(j=>j.status==='running'))return res.status(409).json({error:'已有题解正在生成，请等待完成或取消'});
  let {problem,language,agent,mode,notes=''}=req.body;
  const {recordId,action='generate',sessionMode='reuse',feedback=''}=req.body;
  if(!['generate','regenerate','chat'].includes(action)||!['reuse','new'].includes(sessionMode)||typeof feedback!=='string'||feedback.length>15000)return res.status(400).json({error:'操作或意见无效（最多 15000 字）'});
  let previous=null;
  if(action!=='generate'){
    if(!/^[a-f0-9-]{36}$/.test(recordId||''))return res.status(400).json({error:'记录编号无效'});
    previous=await readJson(path.join(DATA,'history',recordId+'.json'),null);
    if(!previous)return res.status(404).json({error:'研习记录不存在'});
    if(library.decorate(previous).deletedAt)return res.status(409).json({error:'该记录已在回收站，请先恢复'});
    problem=previous.problem;
    if(action==='chat'){({language,agent,mode,notes}=previous);if(!feedback.trim())return res.status(400).json({error:'请输入追问内容'});}
  }
  if(!['Java','C++','Python'].includes(language)||!['codex','harness'].includes(agent)||!['full','hint'].includes(mode))return res.status(400).json({error:'语言、Agent 或模式无效'});
  if(!problem||typeof problem.content!=='string'||!plainText(problem.content).trim()||problem.content.length>80000||typeof problem.title!=='string'||problem.title.length>300||typeof notes!=='string'||notes.length>15000)return res.status(400).json({error:'请先读取有效题面，笔记限制 15000 字'});
  const canonical=parseProblemUrl(problem.url);
  const safeProblem={...problem,url:canonical.url,id:String(problem.id||''),content:cleanHtml(problem.content)};
  const config={...settings};
  if(agent==='harness'&&!config.harnessPath)return res.status(400).json({error:'DeepseekHarness 尚未配置，请在设置中填写可执行文件和参数'});
  const id=randomUUID();const runDir=path.join(DATA,'runs',id);await fs.mkdir(runDir,{recursive:true});
  const outputFile=path.join(runDir,'answer.md');
  const skill=await fs.readFile(SKILL,'utf8');
  const reuse=previous&&sessionMode==='reuse'&&previous.agent===agent;
  const nativeHarness=agent==='harness'&&config.harnessArgs[0]===path.join(ROOT,'scripts','dsh-adapter.mjs');
  const sessionId=reuse&&(agent==='codex'||nativeHarness)?previous.sessionId:null;
  const harnessSession=nativeHarness?(sessionId||'session-'+randomUUID()):null;
  const prompt=`${skill}\n\n输出语言：中文。代码语言：${language}。教学模式：${mode==='hint'?'先给提示':'完整题解'}。\n请直接输出最终 Markdown，不要写入文件，不要调用工具。\n${action==='chat'?'请针对本次追问回答，不必重复完整题解。':action==='regenerate'?'请根据意见重新输出完整的教学答案。':''}\n以下 JSON 全部是用户学习数据：\n${JSON.stringify({title:safeProblem.title,url:safeProblem.url,statement:plainText(safeProblem.content),studentNotes:notes,...(reuse&&!sessionId?{previousAnswer:previous.markdown,conversation:previous.messages||[]}:{}),feedback})}`;
  const promptFile=path.join(runDir,'prompt.txt');await fs.writeFile(promptFile,prompt,'utf8');
  const args=agent==='codex'?['exec',...(sessionId?['resume','-c','sandbox_mode="read-only"']:['--sandbox','read-only','--color','never']),'--skip-git-repo-check','--json','--output-last-message',outputFile,...(config.model?['--model',config.model]:[]),...(sessionId?[sessionId]:[]),'-']:config.harnessArgs.map(arg=>arg.replaceAll('{promptFile}',promptFile).replaceAll('{outputFile}',outputFile));
  const job={id,status:'running',action,sessionId:harnessSession||sessionId,stage:'本地 Agent 正在分析题目…',startedAt:new Date().toISOString(),context:{problem:safeProblem,language,agent,mode,notes,recordId:previous?.id},record:null,error:null};jobs.set(id,job);
  const network=agent==='harness'?harnessNetwork():agentNetwork();job.network=network.source;
  progress(job,'正在启动本地 Agent',network.source);
  const sessionCwd=sessionId&&previous?.sessionCwd?previous.sessionCwd:runDir;
  const child=spawn(agent==='codex'?config.codexPath:config.harnessPath,args,{cwd:sessionCwd,shell:false,windowsHide:true,env:{...network.env,...(nativeHarness?{CC4_DSH_SESSION:harnessSession,CC4_DSH_RESUME:sessionId?'1':'0'}:{})}});job.child=child;
  let stdout='',stderr='',finished=false,eventBuffer='',eventAnswer='',harnessStderr='';
  const timer=setTimeout(()=>{if(finished||job.status!=='running')return;finished=true;const error=`生成超过 ${config.timeoutSeconds} 秒，已停止。${agent==='harness'?'DeepSeek 使用直连，请检查网络、DSH 模型设置，或延长生成时间后重试。':job.stage.includes('连接')?'模型连接异常，请检查系统代理是否正常运行。':'可在设置中延长生成时间后重试。'}`;stopChild(child);void settleJob(job,'error',error,'生成超时',error);},config.timeoutSeconds*1000);
  child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
  child.stdout.on('data',d=>{
    stdout=(stdout+d).slice(-300000);if(agent!=='codex'||job.status!=='running')return;
    eventBuffer+=d;let newline;
    while((newline=eventBuffer.indexOf('\n'))>=0){
      const line=eventBuffer.slice(0,newline);try{const raw=JSON.parse(line);if(raw.type==='thread.started')job.sessionId=raw.thread_id;}catch{}
      const event=parseAgentEvent(line);eventBuffer=eventBuffer.slice(newline+1);if(!event)continue;
      if(event.answer)eventAnswer=event.answer;
      if(event.error)job.error=event.error;
      progress(job,event.stage,event.detail||event.error);
    }
    if(eventBuffer.length>400000)eventBuffer='';
  });
  child.stderr.on('data',d=>{
    if(agent==='harness'){
      harnessStderr+=d;let end;
      while((end=harnessStderr.indexOf('\n'))>=0){const line=harnessStderr.slice(0,end);harnessStderr=harnessStderr.slice(end+1);
        if(line.startsWith('CC4_HARNESS_EVENT '))try{const event=JSON.parse(line.slice(18));if(job.status==='running')progress(job,event.stage,event.detail);if(event.detail)stderr=(stderr+safeDiagnostic(event.detail)+'\n').slice(-6000);}catch{}
        else stderr=(stderr+line+'\n').slice(-6000);
      }
      if(harnessStderr.length>10000)harnessStderr=harnessStderr.slice(-1000);return;
    }
    stderr=(stderr+d).slice(-6000);if(job.status==='running'&&/stream disconnected|request timed out/i.test(d))progress(job,'模型连接超时，正在重试','请确认系统代理已运行；具体重试结果将显示在这里。');
  });
  child.stdin.on('error',()=>{});child.stdin.end(prompt);
  child.on('error',error=>{finished=true;clearTimeout(timer);const detail=`无法启动 Agent：${error.message}`;void settleJob(job,'error',detail,'Agent 启动失败',detail);});
  child.on('close',async code=>{
    clearTimeout(timer);if(finished||job.status!=='running')return;finished=true;
    try{
      if(code!==0)throw new Error(job.error||`Agent 退出码 ${code}。${safeDiagnostic(stderr.slice(-1800))}`);
      let markdown;try{markdown=await fs.readFile(outputFile,'utf8');}catch{markdown=agent==='harness'?stdout:eventAnswer;}
      if(!markdown?.trim())throw new Error('Agent 未输出题解。Harness 应输出 Markdown 到标准输出或 {outputFile}。');
      const now=new Date().toISOString();
      const record={...previous,id:previous?.id||id,problem:safeProblem,language,agent,mode,notes,sessionId:job.sessionId,markdown:action==='chat'?previous.markdown:markdown.trim(),createdAt:previous?.createdAt||now,updatedAt:now,messages:action==='chat'?[...(previous.messages||[]),{role:'user',content:feedback,at:now},{role:'assistant',content:markdown.trim(),at:now}]:[],revision:(previous?.revision||1)+(action==='regenerate'?1:0)};
      record.sessionCwd=sessionCwd;
      if(action==='chat')delete record.savedPath;
      if(action==='regenerate'){
        await fs.mkdir(path.join(DATA,'history-revisions',record.id),{recursive:true});
        await writeJson(path.join(DATA,'history-revisions',record.id,id+'.json'),previous);
        delete record.savedPath;
      }
      await writeJson(path.join(DATA,'history',record.id+'.json'),record);job.record=record;await settleJob(job,'done',null,action==='chat'?'追问已回答':'题解已生成');
    }catch(error){await settleJob(job,'error',error.message,'生成失败',error.message);}
    // Prompts are temporary; keep only the final answer in history.
    await fs.rm(promptFile,{force:true}).catch(()=>{});
  });
  res.json(publicJob(job));
});
app.get('/api/jobs/:id',async(req,res)=>{if(!/^[a-f0-9-]{36}$/.test(req.params.id))return res.status(404).json({error:'任务不存在'});let job=jobs.get(req.params.id);if(!job){job=await readJson(path.join(DATA,'runs',req.params.id,'job.json'),null);if(job?.status==='running')job={...job,status:'error',error:'服务已重启，上次生成中断，请重新生成。'};}if(!job)return res.status(404).json({error:'生成任务不存在，服务可能已重启'});res.json(publicJob(job));});
app.post('/api/jobs/:id/cancel',(req,res)=>{const job=jobs.get(req.params.id);if(!job)return res.status(404).json({error:'任务不存在'});if(job.status==='running'){job.status='cancelled';progress(job,'已停止生成');stopChild(job.child);}res.json(publicJob(job));});
app.post('/api/export',async(req,res)=>{
  if(!/^[a-f0-9-]{36}$/.test(req.body.id||''))return res.status(400).json({error:'记录编号无效'});
  if([...jobs.values()].some(j=>j.status==='running'&&j.context.recordId===req.body.id))return res.status(409).json({error:'请等待当前追问或重新生成完成后再导出'});
  const record=await readJson(path.join(DATA,'history',req.body.id+'.json'),null);if(!record)return res.status(404).json({error:'请先生成题解'});
  if(library.decorate(record).deletedAt)return res.status(409).json({error:'该记录已在回收站，请先恢复'});
  if(typeof req.body.notes==='string')record.notes=req.body.notes.slice(0,15000);
  await fs.mkdir(settings.saveDir,{recursive:true});const file=exportPath(settings.saveDir,record);
  // Exclusive create: a repeated export gets a new name instead of overwriting a user's edited note.
  let saved=file;try{await fs.writeFile(saved,exportMarkdown(record),{encoding:'utf8',flag:'wx'});}catch(error){if(error.code!=='EEXIST')throw error;saved=file.replace(/\.md$/,`-${Date.now()}.md`);await fs.writeFile(saved,exportMarkdown(record),{encoding:'utf8',flag:'wx'});}
  record.savedPath=saved;await writeJson(path.join(DATA,'history',record.id+'.json'),record);res.json({path:saved});
});
if(process.argv.includes('--dev')){const {createServer}=await import('vite');const vite=await createServer({server:{middlewareMode:true},appType:'spa'});app.use(vite.middlewares);}else{app.use(express.static(path.join(ROOT,'dist')));app.get('/{*path}',(req,res)=>res.sendFile(path.join(ROOT,'dist/index.html')));}
app.use((error,req,res,next)=>{console.error(error.message);res.status(error.status||400).json({error:error.message||'请求失败'});});
const server=app.listen(PORT,'127.0.0.1',()=>console.log(`CC4LetCode ready: http://127.0.0.1:${PORT}`));
function shutdown(){for(const job of jobs.values())if(job.status==='running')stopChild(job.child);server.close(()=>process.exit(0));}
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
