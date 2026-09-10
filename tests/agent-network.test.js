import {test} from 'node:test';
import assert from 'node:assert/strict';
import {withSystemProxy} from '../server/agent-network.js';
import {parseAgentEvent,safeDiagnostic} from '../server/agent-progress.js';
test('inherit enabled Windows proxy only in the child environment',()=>{
 const parent={PATH:'example',NO_PROXY:'internal.test'};
 const result=withSystemProxy(parent,{enabled:true,server:'127.0.0.1:7897'});
 assert.equal(result.env.HTTPS_PROXY,'http://127.0.0.1:7897/');assert.equal(result.env.HTTP_PROXY,result.env.HTTPS_PROXY);assert.match(result.env.NO_PROXY,/internal.test,localhost,127.0.0.1/);assert.equal(parent.HTTPS_PROXY,undefined);
});
test('preserve explicit proxy environment and respect disabled Windows proxy',()=>{
 assert.equal(withSystemProxy({HTTPS_PROXY:'http://existing:8000'},{enabled:true,server:'other:9000'}).env.HTTPS_PROXY,'http://existing:8000');
 assert.equal(withSystemProxy({}, {enabled:false,server:'localhost:7897'}).env.HTTPS_PROXY,undefined);
 const perProtocol=withSystemProxy({},{enabled:true,server:'http=localhost:8000;https=localhost:8001'});
 assert.equal(perProtocol.env.HTTP_PROXY,'http://localhost:8000/');assert.equal(perProtocol.env.HTTPS_PROXY,'http://localhost:8001/');
});
test('recognize connection retries, final answer and failure without treating retry as terminal',()=>{
 const retry=parseAgentEvent(JSON.stringify({type:'error',message:'Reconnecting... 2/5 (request timed out)'}));assert.match(retry.stage,/重试/);assert.equal(retry.error,undefined);
 assert.equal(parseAgentEvent(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'## Answer'}})).answer,'## Answer');
 assert.equal(parseAgentEvent(JSON.stringify({type:'turn.failed',error:{message:'connection failed'}})).error,'connection failed');
 assert.equal(parseAgentEvent('not json'),null);
});
test('redact common credential formats from diagnostics',()=>{
 const text=safeDiagnostic('Bearer topsecret https://user:pass@proxy.test sk-test-secret');assert.ok(!text.includes('topsecret'));assert.ok(!text.includes('user:pass'));assert.ok(!text.includes('sk-test'));
});
