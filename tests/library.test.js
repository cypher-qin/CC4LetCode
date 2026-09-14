import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createLibrary} from '../server/library.js';

async function fixture(run){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'cc4-library-'));try{await fs.mkdir(path.join(dir,'history'));const records=[1,2,3].map(n=>({id:randomUUID(),problem:{id:String(n),title:'题目'+n},language:n===1?'Java':'Python',markdown:'# 原题解',notes:'我的想法',messages:[{role:'user',content:'追问'}],sessionId:'session-test',createdAt:'2026-09-01T00:00:00.000Z'}));for(const r of records)await fs.writeFile(path.join(dir,'history',r.id+'.json'),JSON.stringify(r));await run({dir,records,store:await createLibrary(dir)});}finally{await fs.rm(dir,{recursive:true,force:true});}}

test('legacy records start unfiled; management persists without touching answers or sessions',()=>fixture(async({dir,records,store})=>{
 const original=await fs.readFile(path.join(dir,'history',records[0].id+'.json'),'utf8');
 assert.ok((await store.snapshot()).records.every(r=>r.folderId===null&&!r.deletedAt));
 const f=(await store.mutate({action:'createFolder',name:'动态规划'})).createdFolder;
 await store.mutate({action:'move',ids:records.slice(0,2).map(r=>r.id),folderId:f.id});
 await store.mutate({action:'rename',ids:[records[0].id],name:'经典入门题'});
 const reopened=await createLibrary(dir),r=reopened.decorate(records[0]);assert.equal(r.folderId,f.id);assert.equal(r.displayName,'经典入门题');assert.equal(r.problem.title,'题目1');assert.equal(r.sessionId,'session-test');
 assert.equal(await fs.readFile(path.join(dir,'history',records[0].id+'.json'),'utf8'),original);
 assert.equal(reopened.decorate({...records[0],markdown:'重新生成的答案'}).folderId,f.id);
}));

test('trash restores original folder and falls back to unfiled when that folder was deleted',()=>fixture(async({records,store})=>{
 const ids=records.map(r=>r.id);const f=(await store.mutate({action:'move',ids,newFolderName:'二叉树'})).createdFolder;
 await store.mutate({action:'trash',ids});assert.ok((await store.snapshot()).records.every(r=>r.deletedAt));
 await store.mutate({action:'restore',ids:[ids[0]]});assert.equal(store.decorate(records[0]).folderId,f.id);
 await store.mutate({action:'deleteFolder',folderId:f.id});assert.equal(store.decorate(records[0]).folderId,null);
 await store.mutate({action:'restore',ids:ids.slice(1)});assert.ok((await store.snapshot()).records.every(r=>!r.deletedAt&&r.folderId===null));
}));

test('invalid batch and stale revision have no partial effects, including new folder creation',()=>fixture(async({records,store})=>{
 const f=(await store.mutate({action:'createFolder',name:'图论'})).createdFolder;
 await assert.rejects(store.mutate({action:'createFolder',name:' 图论 '}),/同名/);
 await assert.rejects(store.mutate({action:'renameFolder',folderId:f.id,name:' '}),/不能为空/);
 const before=await store.snapshot();
 await assert.rejects(store.mutate({action:'move',ids:[records[0].id,randomUUID()],newFolderName:'不应创建'}),/不存在/);
 assert.deepEqual(await store.snapshot(),before);
 await assert.rejects(store.mutate({action:'trash',ids:[records[0].id],revision:0}),/其他窗口/);
 await assert.rejects(store.mutate({action:'trash',ids:['../../settings']}),/有效记录/);
 await store.mutate({action:'trash',ids:[records[0].id]});
 await assert.rejects(store.mutate({action:'move',ids:[records[0].id,records[1].id],folderId:f.id}),/回收站/);
 assert.equal(store.decorate(records[1]).folderId,null);
}));

test('concurrent writes serialize and active generation blocks mutations',()=>fixture(async({dir,records,store})=>{
 await Promise.all([store.mutate({action:'createFolder',name:'数组'}),store.mutate({action:'createFolder',name:'链表'})]);
 assert.equal((await store.snapshot()).folders.length,2);
 await store.mutate({action:'renameFolder',folderId:(await store.snapshot()).folders[0].id,name:'数组练习'});
 const locked=await createLibrary(dir,{isBusy:()=>true});await assert.rejects(locked.mutate({action:'trash',ids:[records[0].id]}),/生成或追问/);
 assert.equal(locked.decorate(records[0]).deletedAt,null);
}));
