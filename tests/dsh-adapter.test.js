import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
test('DSH native session bridge uses resumeSessionId and leaves installed source untouched',async()=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'cc4-resume-'));
 try{
  const runnerDir=path.join(temp,'node_modules','dsh-headless','lib');await fs.mkdir(runnerDir,{recursive:true});await fs.mkdir(path.join(temp,'lib'));
  await fs.writeFile(path.join(temp,'package.json'),JSON.stringify({name:'@deepseek-ai/dsh',version:'fixture',type:'module'}));
  await fs.writeFile(path.join(temp,'node_modules','dsh-headless','package.json'),'{"type":"module"}');
  const runner=path.join(runnerDir,'index.js');
  const source='const brandString=x=>x; const randomUUID=()=>"unexpected"; export async function run(){const agents={create:async x=>console.log(JSON.stringify({method:"create",...x})),resume:async x=>{if(!x.resumeSessionId)throw new Error("missing resumeSessionId");console.log(JSON.stringify({method:"resume",...x}));}}; await agents.create({sessionId: brandString(`session-${randomUUID()}`)});}';
  await fs.writeFile(runner,source);
  await fs.writeFile(path.join(temp,'lib','bin.js'),'export async function runCli(){await (await import("../node_modules/dsh-headless/lib/index.js")).run();}');
  const session='session-12345678-1234-1234-1234-123456789012';
  for(const resume of ['0','1']){
   const child=spawn(process.execPath,['scripts/dsh-adapter.mjs',path.join(temp,'lib','bin.js')],{windowsHide:true,env:{...process.env,CC4_DSH_SESSION:session,CC4_DSH_RESUME:resume}});
   let stdout='',stderr='';child.stdout.on('data',d=>stdout+=d);child.stderr.on('data',d=>stderr+=d);child.stdin.end('Explain the algorithm');
   const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve);});assert.equal(code,0,stderr);
   const value=JSON.parse(stdout);assert.equal(value.method,resume==='1'?'resume':'create');assert.equal(value[resume==='1'?'resumeSessionId':'sessionId'],session);
  }
  assert.equal(await fs.readFile(runner,'utf8'),source);
 }finally{await fs.rm(temp,{recursive:true,force:true});}
});
test('DSH adapter passes long UTF-8 prompts without OS argument limits and hides reasoning',async()=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'cc4-dsh-'));
 try {
  await fs.mkdir(path.join(temp,'lib'));
  await fs.writeFile(path.join(temp,'package.json'),JSON.stringify({name:'@deepseek-ai/dsh',version:'fixture',type:'module'}));
  await fs.writeFile(path.join(temp,'lib','bin.js'),`export async function runCli(){process.stderr.write('dsh: reasoning:\\nprivate-fixture-reasoning\\n');console.log(JSON.stringify({length:process.argv[4].length,profile:process.argv[3],unicode:process.argv[4].endsWith('结束'),https:process.env.HTTPS_PROXY,noProxy:process.env.NO_PROXY}));}`);
  const prompt='---\nname: tutor\n---\n'+'算法题'.repeat(18000)+'结束';
  const child=spawn(process.execPath,['scripts/dsh-adapter.mjs',path.join(temp,'lib','bin.js')],{windowsHide:true,env:{...process.env,HTTPS_PROXY:'http://proxy.invalid:1234'}});
  let stdout='',stderr='';child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');child.stdout.on('data',d=>stdout+=d);child.stderr.on('data',d=>stderr+=d);child.stdin.end(prompt);
  const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve);});
  assert.equal(code,0);const value=JSON.parse(stdout);assert.equal(value.length,prompt.length+'任务要求：\n'.length);assert.equal(value.profile,'headless');assert.equal(value.unicode,true);assert.equal(value.https,undefined);assert.equal(value.noProxy,'*');
  assert.ok(!stderr.includes('private-fixture-reasoning'));assert.match(stderr,/已开始分析/);
 }finally{await fs.rm(temp,{recursive:true,force:true});}
});
