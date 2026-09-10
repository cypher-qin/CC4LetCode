// Local Agent discovery shared by the app and the self-check script
// (scripts/doctor.mjs), so both always agree on what "已配置" means.
import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

/** Run a probe and return its trimmed stdout, or '' when it cannot be run. */
function readCommand(executable,args,options={}) {
  try{return execFileSync(executable,args,{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','ignore'],...options}).trim();}catch{return '';}
}

/**
 * Locate the Codex CLI the same way the app does.
 * Explorer-launched apps do not inherit the Codex desktop app's augmented PATH,
 * so `%LOCALAPPDATA%\OpenAI\Codex\bin` is searched as a fallback.
 */
export async function findCodex(environment=process.env) {
  const found=readCommand(process.platform==='win32'?'where.exe':'which',['codex'],{env:environment}).split(/\r?\n/).find(p=>process.platform!=='win32'||p.toLowerCase().endsWith('.exe'));
  if(found)return found;
  const localAppData=environment.LOCALAPPDATA;
  if(process.platform==='win32'&&localAppData){
    const bin=path.join(localAppData,'OpenAI','Codex','bin');
    try{
      const entries=await fs.readdir(bin,{withFileTypes:true});
      const candidates=await Promise.all(entries.filter(e=>e.isDirectory()).map(async e=>{const executable=path.join(bin,e.name,'codex.exe');try{return {executable,modified:(await fs.stat(executable)).mtimeMs};}catch{return null;}}));
      const newest=candidates.filter(Boolean).sort((a,b)=>b.modified-a.modified)[0];if(newest)return newest.executable;
    }catch{}
  }
  return 'codex';
}

/** Read `codex login status`; a failure is reported, never treated as fatal. */
export function codexLogin(executable,environment=process.env) {
  try{
    const output=execFileSync(executable,['login','status'],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe'],timeout:15000,env:environment});
    return {ok:true,detail:output.trim()};
  }catch(error){
    const detail=String(error.stderr||error.stdout||error.message||'').trim();
    return {ok:false,detail:detail||`无法执行 ${executable} login status`};
  }
}
