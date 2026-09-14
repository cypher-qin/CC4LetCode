import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

const uuid=/^[a-f0-9-]{36}$/;
function fail(message,status=400){throw Object.assign(new Error(message),{status});}
function name(value){if(typeof value!=='string'||!value.trim()||value.trim().length>100)fail('名称不能为空，且不能超过 100 字');return value.trim();}

// Classification is kept separately from answers so generation/export cannot
// overwrite management changes. One atomic metadata write commits each batch.
export async function createLibrary(dataDir,{isBusy=()=>false}={}){
 const file=path.join(dataDir,'library.json');
 let state={version:1,revision:0,folders:[],records:{}};
 try{state=JSON.parse(await fs.readFile(file,'utf8'));if(state.version!==1||!Array.isArray(state.folders)||!state.records)fail('专题管理数据格式不支持',500);}catch(e){if(e.code!=='ENOENT')throw e;}
 let queue=Promise.resolve(),pending=0;
 function decorate(record,source=state){if(!record)return record;const m=source.records[record.id]||{};return {...record,folderId:source.folders.some(f=>f.id===m.folderId)?m.folderId:null,displayName:m.displayName||'',deletedAt:m.deletedAt||null,updatedAt:m.updatedAt&&m.updatedAt>(record.updatedAt||record.createdAt)?m.updatedAt:(record.updatedAt||record.createdAt)};}
 async function records(source){const files=(await fs.readdir(path.join(dataDir,'history'))).filter(f=>f.endsWith('.json'));return Promise.all(files.map(async f=>decorate(JSON.parse(await fs.readFile(path.join(dataDir,'history',f),'utf8')),source)));}
 async function snapshot(){const source=state;return {revision:source.revision,folders:source.folders,records:(await records(source)).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))};}
 function mutate(input){pending++;const operation=queue.then(async()=>{
  if(isBusy())fail('请等待当前生成或追问完成后再整理记录',409);
  if(input.revision!==undefined&&input.revision!==state.revision)fail('记录已在其他窗口更新，请刷新列表后重试',409);
  const next=structuredClone(state),now=new Date().toISOString();
  const folder=id=>{const f=next.folders.find(f=>f.id===id);if(!f)fail('专题不存在，请刷新列表',404);return f;};
  const unique=(value,except)=>{const n=name(value);if(next.folders.some(f=>f.id!==except&&f.name.toLocaleLowerCase()===n.toLocaleLowerCase()))fail('已存在同名专题',409);return n;};
  let createdFolder=null;
  switch(input.action){
   case 'createFolder':createdFolder={id:randomUUID(),name:unique(input.name),createdAt:now};next.folders.push(createdFolder);break;
   case 'renameFolder':folder(input.folderId).name=unique(input.name,input.folderId);break;
   case 'deleteFolder':folder(input.folderId);next.folders=next.folders.filter(f=>f.id!==input.folderId);for(const m of Object.values(next.records))if(m.folderId===input.folderId)m.folderId=null;break;
   case 'move':case 'rename':case 'trash':case 'restore':{
    if(!Array.isArray(input.ids)||!input.ids.length||input.ids.length>5000||input.ids.some(id=>typeof id!=='string'||!uuid.test(id))||new Set(input.ids).size!==input.ids.length)fail('请选择有效记录（单次最多 5000 条）');
    if(input.action==='rename'&&input.ids.length!==1)fail('每次只能重命名一条记录');
    let target=input.folderId??null;
    if(input.action==='move'){
     if(input.newFolderName!==undefined){createdFolder={id:randomUUID(),name:unique(input.newFolderName),createdAt:now};next.folders.push(createdFolder);target=createdFolder.id;}
     else if(target!==null)folder(target);
    }
    // Validate every record before committing any part of the batch.
    for(const id of input.ids){
     try{await fs.access(path.join(dataDir,'history',id+'.json'));}catch(e){if(e.code==='ENOENT')fail('记录不存在，请刷新列表',404);throw e;}
     const m=next.records[id]||{};
     if(input.action==='restore'?!m.deletedAt:!!m.deletedAt)fail(input.action==='restore'?'只能恢复回收站中的记录':'该记录已在回收站，请先恢复',409);
     if(input.action==='move')m.folderId=target;
     if(input.action==='rename')m.displayName=name(input.name);
     if(input.action==='trash')m.deletedAt=now;
     if(input.action==='restore'){delete m.deletedAt;if(!next.folders.some(f=>f.id===m.folderId))m.folderId=null;}
     m.updatedAt=now;next.records[id]=m;
    }
    break;
   }
   default:fail('不支持的管理操作');
  }
  next.revision++;
  const tmp=file+'.'+randomUUID()+'.tmp';
  try{try{await fs.copyFile(file,file+'.bak');}catch(e){if(e.code!=='ENOENT')throw e;}await fs.writeFile(tmp,JSON.stringify(next,null,2),'utf8');await fs.rename(tmp,file);}finally{await fs.rm(tmp,{force:true}).catch(()=>{});}
  state=next;return {...await snapshot(),createdFolder};
 }).finally(()=>{pending--;});queue=operation.catch(()=>{});return operation;}
 return {decorate,snapshot,mutate,isWriting:()=>pending>0};
}
