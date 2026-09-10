import fs from 'node:fs/promises';
import path from 'node:path';
// 发现顺序就是 doctor 在报告里描述的顺序：PATH 的每个目录 → Node 可执行文件所在目录 → %APPDATA%\npm。
// processExecPath 可注入，便于测试；默认与运行中的应用完全一致。
export async function discoverHarness(root,environment=process.env,processExecPath=process.execPath) {
  const directories=[...(environment.PATH||environment.Path||'').split(path.delimiter),path.dirname(processExecPath),environment.APPDATA?path.join(environment.APPDATA,'npm'):''].filter(Boolean);
  for(const directory of [...new Set(directories)]){
    const cli=path.join(directory,'node_modules','@deepseek-ai','dsh','lib','bin.js');
    try{await fs.access(cli);return {harnessPath:processExecPath,harnessArgs:[path.join(root,'scripts','dsh-adapter.mjs'),cli]};}catch{}
  }
  return {harnessPath:'',harnessArgs:[]};
}
