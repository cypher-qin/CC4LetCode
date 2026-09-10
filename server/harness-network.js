// This is deliberately independent of Codex's system-proxy inheritance.
export function harnessNetwork(environment=process.env) {
  const env={...environment,PYTHONIOENCODING:'utf-8'};
  for(const name of Object.keys(env))if(/^(https?|all|ftp)_proxy$/i.test(name)||/^npm_config_(https?_)?proxy$/i.test(name))delete env[name];
  env.NO_PROXY='*';env.no_proxy='*';
  return {env,source:'DeepSeek Harness · 直连（不使用系统代理）'};
}
