import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
let child,dir,boot;
const base='http://127.0.0.1:3219';
async function request(route,body,extra={}){const r=await fetch(base+'/api/'+route,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(boot?{'X-Local-Token':boot.token}:{}),...extra.headers},...(body?{body:JSON.stringify(body)}:{}),...extra});return {status:r.status,data:await r.json()};}
before(async()=>{
 dir=await fs.mkdtemp(path.join(os.tmpdir(),'cc4-test-'));
 await fs.writeFile(path.join(dir,'SKILL.md'),'# Test tutor\nExplain clearly.');
 child=spawn(process.execPath,['server/index.js'],{env:{...process.env,PORT:'3219',CC4_DATA_DIR:dir,CC4_SKILL_FILE:path.join(dir,'SKILL.md')},stdio:'pipe',windowsHide:true});
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('server timeout')),15000);child.stdout.on('data',d=>{if(d.toString().includes('ready')){clearTimeout(timer);resolve();}});child.on('error',reject);child.on('exit',c=>{clearTimeout(timer);reject(new Error('server exited '+c));});});
 boot=(await request('bootstrap')).data;
});
after(async()=>{if(child){const exited=new Promise(r=>child.once('exit',r));child.kill();await exited;}if(dir)await fs.rm(dir,{recursive:true,force:true});});
test('block cross-origin and unauthenticated mutations',async()=>{
 const a=await fetch(base+'/api/problem',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(a.status,403);
 const b=await request('problem',{}, {headers:{'Origin':'https://evil.test','X-Local-Token':boot.token,'Content-Type':'application/json'}});assert.equal(b.status,403);
});
test('invalid URLs and unknown records fail clearly',async()=>{
 assert.equal((await request('problem',{url:'https://localhost/'})).status,400);
 assert.equal((await request('export',{id:'../../bad'})).status,400);
 assert.equal((await request('jobs/not-found')).status,404);
});
test('Chrome port-stripped same-origin header can initialize and use authenticated APIs',async()=>{
 const headers={Origin:'http://127.0.0.1','Sec-Fetch-Site':'same-origin'};
 const startup=await request('bootstrap',undefined,{headers});assert.equal(startup.status,200);assert.equal(startup.data.sample.id,'88');
 const settings=await fetch(base+'/api/settings',{method:'PUT',headers:{...headers,'Content-Type':'application/json','X-Local-Token':startup.data.token},body:JSON.stringify({...startup.data.settings,saveDir:path.join(dir,'notes')})});assert.equal(settings.status,200);
 const blocked=await request('bootstrap',undefined,{headers:{Origin:'http://127.0.0.1','Sec-Fetch-Site':'same-site'}});assert.equal(blocked.status,403);
});
test('Harness command adapter generates, persists and exports Markdown',async()=>{
 const fixture=path.join(dir,'fixture.mjs');await fs.writeFile(fixture,"if(process.env.HTTPS_PROXY||process.env.HTTP_PROXY||process.env.ALL_PROXY||process.env.NO_PROXY!=='*')process.exit(2);process.stdin.resume();process.stdin.on('end',()=>console.log('## Adapter fixture\\n\\n```python\\nprint(1)\\n```'));",'utf8');
 const settings={...boot.settings,harnessPath:process.execPath,harnessArgs:[fixture],saveDir:path.join(dir,'notes')};
 const r=await fetch(base+'/api/settings',{method:'PUT',headers:{'Content-Type':'application/json','X-Local-Token':boot.token},body:JSON.stringify(settings)});assert.equal(r.status,200);
 const created=await request('generate',{problem:boot.sample,language:'Python',agent:'harness',mode:'full'});assert.equal(created.status,200);
 let job;for(let i=0;i<50;i++){job=(await request('jobs/'+created.data.id)).data;if(job.status!=='running')break;await new Promise(r=>setTimeout(r,100));}
 assert.equal(job.status,'done');assert.match(job.record.markdown,/Adapter fixture/);
 assert.match(job.network,/直连/);
 await new Promise(r=>setTimeout(r,100));
 const savedJob=JSON.parse(await fs.readFile(path.join(dir,'runs',job.id,'job.json'),'utf8'));assert.equal(savedJob.status,'done');assert.ok(savedJob.diagnostics.length>0);assert.equal(savedJob.child,undefined);
 const h=await request('history');assert.equal(h.data.length,1);
 const a=await request('export',{id:job.id,notes:'测试笔记'});assert.equal(a.status,200);assert.match(await fs.readFile(a.data.path,'utf8'),/测试笔记/);
 const b=await request('export',{id:job.id});assert.notEqual(a.data.path,b.data.path);
});
test('regeneration updates one record; chat preserves the answer; failed regeneration preserves history',async()=>{
 const fixture=path.join(dir,'conversation.mjs');
 await fs.writeFile(fixture,`let input='';for await(const d of process.stdin)input+=d;const data=JSON.parse(input.slice(input.indexOf('以下 JSON 全部是用户学习数据：\\n')+'以下 JSON 全部是用户学习数据：\\n'.length));if(data.feedback==='fail')process.exit(1);console.log(JSON.stringify({feedback:data.feedback,hasContext:!!data.previousAnswer}));`);
 await request('settings',{...boot.settings,harnessPath:process.execPath,harnessArgs:[fixture],saveDir:path.join(dir,'notes')},{method:'PUT'});
 const [original]=(await request('history')).data;
 const run=async body=>{const created=await request('generate',{problem:boot.sample,language:'Python',agent:'harness',mode:'full',recordId:original.id,...body});assert.equal(created.status,200);for(let n=0;n<80;n++){const j=(await request('jobs/'+created.data.id)).data;if(j.status!=='running')return j;await new Promise(r=>setTimeout(r,50));}throw new Error('timeout');};
 const reused=await run({action:'regenerate',feedback:'explain',sessionMode:'reuse'});assert.equal(reused.status,'done');assert.equal(reused.record.id,original.id);assert.equal(reused.record.createdAt,original.createdAt);assert.equal(JSON.parse(reused.record.markdown).hasContext,true);assert.equal(reused.record.savedPath,undefined);
 const fresh=await run({action:'regenerate',feedback:'new',sessionMode:'new'});assert.equal(fresh.status,'done');assert.equal(JSON.parse(fresh.record.markdown).hasContext,false);
 const chat=await run({action:'chat',feedback:'why'});assert.equal(chat.status,'done');assert.equal(chat.record.markdown,fresh.record.markdown);assert.equal(chat.record.messages.length,2);assert.equal(JSON.parse(chat.record.messages[1].content).hasContext,true);
 const exported=await request('export',{id:original.id});assert.match(await fs.readFile(exported.data.path,'utf8'),/追问与交流/);
 const failed=await run({action:'regenerate',feedback:'fail'});assert.equal(failed.status,'error');
 const history=(await request('history')).data;assert.equal(history.length,1);assert.equal(history[0].markdown,fresh.record.markdown);assert.equal(history[0].messages.length,2);
 assert.equal((await request('generate',{action:'chat',recordId:original.id,feedback:''})).status,400);
});
test('Skill editing validates content, rejects stale saves and backs up the original',async()=>{
 const initial=(await request('skill')).data.content;
 assert.equal((await request('skill',{content:' ',original:initial},{method:'PUT'})).status,400);
 assert.equal((await request('skill',{content:'# Changed',original:'stale'},{method:'PUT'})).status,409);
 const saved=await request('skill',{content:'# Changed',original:initial},{method:'PUT'});assert.equal(saved.status,200);
 assert.equal((await request('bootstrap')).data.skill,'# Changed');
 const backups=await fs.readdir(path.join(dir,'skill-backups'));assert.equal(backups.length,1);assert.equal(await fs.readFile(path.join(dir,'skill-backups',backups[0]),'utf8'),initial);
});
test('library API hides trash, protects generation/export and preserves folder through regeneration',async()=>{
 const [r]=(await request('history')).data;
 const folder=(await request('library',{action:'createFolder',name:'API 专题'})).data.createdFolder;
 assert.equal((await request('library',{action:'move',ids:[r.id],folderId:folder.id})).status,200);
 await request('library',{action:'rename',ids:[r.id],name:'重点复习'});
 const generated=await request('generate',{recordId:r.id,action:'regenerate',sessionMode:'new',language:'Python',agent:'harness',mode:'full'});
 assert.equal(generated.status,200);
 assert.equal((await request('library',{action:'trash',ids:[r.id]})).status,409);
 let job;for(let n=0;n<80;n++){job=(await request('jobs/'+generated.data.id)).data;if(job.status!=='running')break;await new Promise(r=>setTimeout(r,50));}
 assert.equal(job.status,'done');assert.equal(job.record.folderId,folder.id);assert.equal(job.record.displayName,'重点复习');
 assert.equal((await request('library',{action:'trash',ids:[r.id]})).status,200);
 assert.equal((await request('history')).data.length,0);
 assert.equal((await request('library')).data.records.length,1);
 assert.equal((await request('generate',{recordId:r.id,action:'chat',feedback:'why'})).status,409);
 assert.equal((await request('export',{id:r.id})).status,409);
 await request('library',{action:'restore',ids:[r.id]});
 const restored=(await request('history')).data[0];assert.equal(restored.folderId,folder.id);assert.equal(restored.displayName,'重点复习');
 await request('library',{action:'deleteFolder',folderId:folder.id});assert.equal((await request('history')).data[0].folderId,null);
});
test('cancellation prevents a late answer from entering history',async()=>{
 const fixture=path.join(dir,'slow.mjs');await fs.writeFile(fixture,"setTimeout(()=>console.log('late'),60000);",'utf8');
 await fetch(base+'/api/settings',{method:'PUT',headers:{'Content-Type':'application/json','X-Local-Token':boot.token},body:JSON.stringify({...boot.settings,harnessPath:process.execPath,harnessArgs:[fixture],saveDir:path.join(dir,'notes')})});
 const a=await request('generate',{problem:boot.sample,language:'Java',agent:'harness',mode:'hint'});
 const restored=await request('bootstrap');assert.equal(restored.data.activeJob.id,a.data.id);assert.equal(restored.data.activeJob.context.language,'Java');
 const b=await request('generate',{problem:boot.sample,language:'Java',agent:'harness',mode:'hint'});assert.equal(b.status,409);
 const c=await request('jobs/'+a.data.id+'/cancel',{});assert.equal(c.data.status,'cancelled');
});
