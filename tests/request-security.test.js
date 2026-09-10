import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isTrustedOrigin} from '../server/request-security.js';
test('trust local browser origins and requests with no Origin',()=>{
 for(const origin of ['http://127.0.0.1:3210','http://localhost:3210',undefined])assert.equal(isTrustedOrigin({origin,'sec-fetch-site':'same-origin'},3210),true);
});
test('opaque Origin is accepted only with browser same-origin metadata',()=>{
 assert.equal(isTrustedOrigin({origin:'null','sec-fetch-site':'same-origin'},3210),true);
 for(const site of [undefined,'none','same-site','cross-site'])assert.equal(isTrustedOrigin({origin:'null','sec-fetch-site':site},3210),false);
});
test('regression: Chrome omits the loopback port but certifies same-origin',()=>{
 for(const origin of ['http://127.0.0.1','http://localhost']){
  assert.equal(isTrustedOrigin({origin,'sec-fetch-site':'same-origin'},3210),true);
  for(const site of [undefined,'same-site','cross-site','none'])assert.equal(isTrustedOrigin({origin,'sec-fetch-site':site},3210),false);
 }
});
test('reject foreign origins and cross-site requests even without Origin',()=>{
 for(const origin of ['https://evil.test','http://127.0.0.1:9000','http://127.0.0.1:3210.evil.test','file://'])assert.equal(isTrustedOrigin({origin,'sec-fetch-site':'same-origin'},3210),false);
 assert.equal(isTrustedOrigin({'sec-fetch-site':'cross-site'},3210),false);
});
