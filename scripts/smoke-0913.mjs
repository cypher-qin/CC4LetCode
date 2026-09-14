// Real DSH verification. Start the app with an isolated CC4_DATA_DIR first.
// Uses model quota. No Codex calls and no production history edits.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const base=process.env.CC4_TEST_URL||'http://127.0.0.1:3221';
const boot=await (await fetch(base+'/api/bootstrap')).json();
async function api(route,body){const r=await fetch(base+'/api/'+route,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','X-Local-Token':boot.token},...(body?{body:JSON.stringify(body)}:{})});const data=await r.json();assert.equal(r.status,200,JSON.stringify(data));return data;}
async function run(body){const created=await api('generate',body);console.log('Started',body.action,created.id);for(let n=0;n<330;n++){await new Promise(r=>setTimeout(r,1000));const j=await api('jobs/'+created.id);if(j.status==='running')continue;assert.equal(j.status,'done',j.error);return j.record;}throw new Error('Timed out');}
const history=await api('history');
let record=history.find(r=>r.agent==='harness');
if(!record)record=await run({problem:boot.sample,language:'Python',agent:'harness',mode:'hint'});
const id=record.id,session=record.sessionId,count=(await api('history')).length;
record=await run({recordId:id,action:'regenerate',sessionMode:'reuse',language:'Python',agent:'harness',mode:'hint',feedback:'请用三个简短提示重新讲解，不输出完整代码。'});
assert.equal(record.id,id);assert.equal(record.sessionId,session);
record=await run({recordId:id,action:'regenerate',sessionMode:'new',language:'Python',agent:'harness',mode:'hint',feedback:'请用两个简短提示帮助理解方向选择。'});
assert.equal(record.id,id);assert.notEqual(record.sessionId,session);
const freshSession=record.sessionId,answer=record.markdown;
record=await run({recordId:id,action:'chat',feedback:'第二个提示是什么意思？请用一句话解释。'});
assert.equal(record.sessionId,freshSession);assert.equal(record.markdown,answer);assert.equal(record.messages.length,2);assert.equal((await api('history')).length,count);
const exported=await api('export',{id});assert.match(await fs.readFile(exported.path,'utf8'),/追问与交流/);
console.log(JSON.stringify({ok:true,recordId:id,originalSession:session,newSession:freshSession,historyCount:count,checks:['reuse regeneration','fresh regeneration','native followup','single history record','export conversation']},null,2));
