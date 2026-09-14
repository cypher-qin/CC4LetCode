import fs from 'node:fs/promises';
import path from 'node:path';
// processExecPath 可注入，便于自检脚本测试；默认值与运行中的应用完全一致。
export async function discoverHarness(root,environment=process.env,processExecPath=process.execPath) {
  const directories=[...(environment.PATH||environment.Path||'').split(path.delimiter),path.dirname(processExecPath),environment.APPDATA?path.join(environment.APPDATA,'npm'):''].filter(Boolean);
  for(const directory of [...new Set(directories)]){
    const cli=path.join(directory,'node_modules','@deepseek-ai','dsh','lib','bin.js');
    try{await fs.access(cli);return {harnessPath:processExecPath,harnessArgs:[path.join(root,'scripts','dsh-adapter.mjs'),cli]};}catch{}
  }
  return {harnessPath:'',harnessArgs:[]};
}
