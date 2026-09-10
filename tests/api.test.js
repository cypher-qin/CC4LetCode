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
 child=spawn(process.execPath,['server/index.js'],{env:{...process.env,PORT:'3219',CC4_DATA_DIR:dir},stdio:'pipe',windowsHide:true});
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
test('cancellation prevents a late answer from entering history',async()=>{
 const fixture=path.join(dir,'slow.mjs');await fs.writeFile(fixture,"setTimeout(()=>console.log('late'),60000);",'utf8');
 await fetch(base+'/api/settings',{method:'PUT',headers:{'Content-Type':'application/json','X-Local-Token':boot.token},body:JSON.stringify({...boot.settings,harnessPath:process.execPath,harnessArgs:[fixture],saveDir:path.join(dir,'notes')})});
 const a=await request('generate',{problem:boot.sample,language:'Java',agent:'harness',mode:'hint'});
 const restored=await request('bootstrap');assert.equal(restored.data.activeJob.id,a.data.id);assert.equal(restored.data.activeJob.context.language,'Java');
 const b=await request('generate',{problem:boot.sample,language:'Java',agent:'harness',mode:'hint'});assert.equal(b.status,409);
 const c=await request('jobs/'+a.data.id+'/cancel',{});assert.equal(c.data.status,'cancelled');
});
