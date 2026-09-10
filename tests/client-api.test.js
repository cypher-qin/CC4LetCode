import {test} from 'node:test';
import assert from 'node:assert/strict';
import {api,setSessionToken} from '../src/api.js';
test('bootstrap uses same-origin mode and omits unnecessary custom headers',async t=>{
 t.mock.method(globalThis,'fetch',async(url,options)=>{
  assert.equal(url,'/api/bootstrap');assert.equal(options.mode,'same-origin');assert.equal(options.referrerPolicy,'same-origin');assert.equal(options.method,'GET');assert.deepEqual(options.headers,{});
  return Response.json({token:'test'});
 });
 assert.equal((await api('bootstrap')).token,'test');
});
test('mutations retain token and JSON body',async t=>{
 setSessionToken('test-session');
 t.mock.method(globalThis,'fetch',async(url,options)=>{assert.equal(options.headers['X-Local-Token'],'test-session');assert.equal(options.headers['Content-Type'],'application/json');assert.equal(options.body,'{"id":"example"}');return Response.json({ok:true});});
 assert.equal((await api('export',{id:'example'})).ok,true);
});
test('surface rejection, unavailable service and timeouts as readable errors',async t=>{
 const mock=t.mock.method(globalThis,'fetch',async()=>Response.json({error:'来源校验失败'},{status:403}));
 await assert.rejects(api('bootstrap'),/来源校验失败/);
 mock.mock.mockImplementation(async()=>{throw new TypeError('Failed to fetch');});await assert.rejects(api('bootstrap'),/无法连接本地服务/);
 mock.mock.mockImplementation(async()=>{throw new DOMException('Timeout','TimeoutError');});await assert.rejects(api('bootstrap'),/响应超时/);
});
