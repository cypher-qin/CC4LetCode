import {execFileSync} from 'node:child_process';

export function withSystemProxy(environment, proxy) {
  const env={...environment,PYTHONIOENCODING:'utf-8'};
  if(['HTTPS_PROXY','HTTP_PROXY','ALL_PROXY','https_proxy','http_proxy','all_proxy'].some(k=>env[k]))return {env,source:'环境变量代理'};
  if(!proxy?.enabled||!proxy.server)return {env,source:'未配置代理，直接连接'};
  const entries=Object.fromEntries(proxy.server.split(';').filter(s=>s.includes('=')).map(s=>s.trim().split('=')));
  const normalize=value=>{
    if(!value)return undefined;
    try{const url=new URL(value.includes('://')?value:'http://'+value);return ['http:','https:','socks5:','socks5h:'].includes(url.protocol)?url.href:undefined;}catch{return undefined;}
  };
  const shared=proxy.server.includes('=')?undefined:normalize(proxy.server);
  const https=normalize(entries.https)||normalize(entries.http)||shared;
  const http=normalize(entries.http)||https;
  if(!https&&!http)return {env,source:'系统代理格式不支持，直接连接'};
  if(https)env.HTTPS_PROXY=https;
  if(http)env.HTTP_PROXY=http;
  env.NO_PROXY=[environment.NO_PROXY||environment.no_proxy,'localhost','127.0.0.1','::1'].filter(Boolean).join(',');
  return {env,source:'已继承 Windows 系统代理'};
}
export function agentNetwork(environment=process.env) {
  let proxy;
  if(process.platform==='win32')try{
    const value=execFileSync('reg.exe',['query','HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','ignore'],timeout:3000});
    proxy={enabled:/ProxyEnable\s+REG_DWORD\s+0x1\b/i.test(value),server:value.match(/ProxyServer\s+REG_SZ\s+([^\r\n]+)/i)?.[1]?.trim()};
  }catch{}
  return withSystemProxy(environment,proxy);
}
