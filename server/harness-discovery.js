import fs from 'node:fs/promises';
import path from 'node:path';
export async function discoverHarness(root,environment=process.env) {
  const directories=[...(environment.PATH||environment.Path||'').split(path.delimiter),path.dirname(process.execPath),environment.APPDATA?path.join(environment.APPDATA,'npm'):''].filter(Boolean);
  for(const directory of [...new Set(directories)]){
    const cli=path.join(directory,'node_modules','@deepseek-ai','dsh','lib','bin.js');
    try{await fs.access(cli);return {harnessPath:process.execPath,harnessArgs:[path.join(root,'scripts','dsh-adapter.mjs'),cli]};}catch{}
  }
  return {harnessPath:'',harnessArgs:[]};
}
