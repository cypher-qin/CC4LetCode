import {test} from 'node:test';
import assert from 'node:assert/strict';
import {harnessNetwork} from '../server/harness-network.js';
import {withSystemProxy} from '../server/agent-network.js';
test('Harness bypasses proxy variables without changing parent or Codex configuration',()=>{
 const parent={HTTPS_PROXY:'http://localhost:7897',http_proxy:'http://localhost:7897',ALL_PROXY:'socks5://localhost:7897',npm_config_proxy:'http://localhost:7897',NO_PROXY:'internal.test',DEEPSEEK_API_KEY:'fixture-key',PATH:'keep'};
 const direct=harnessNetwork(parent);
 assert.equal(direct.env.HTTPS_PROXY,undefined);assert.equal(direct.env.http_proxy,undefined);assert.equal(direct.env.ALL_PROXY,undefined);assert.equal(direct.env.npm_config_proxy,undefined);
 assert.equal(direct.env.NO_PROXY,'*');assert.equal(direct.env.no_proxy,'*');assert.equal(direct.env.DEEPSEEK_API_KEY,'fixture-key');
 assert.equal(parent.HTTPS_PROXY,'http://localhost:7897');assert.equal(parent.NO_PROXY,'internal.test');
 assert.equal(withSystemProxy(parent,{enabled:true,server:'other:1234'}).env.HTTPS_PROXY,'http://localhost:7897');
});
