const base='http://127.0.0.1:3210';
const boot=await (await fetch(base+'/api/bootstrap')).json();
async function post(endpoint,data){const response=await fetch(base+'/api/'+endpoint,{method:'POST',headers:{'Content-Type':'application/json','X-Local-Token':boot.token},body:JSON.stringify(data)});const result=await response.json();if(!response.ok)throw new Error(JSON.stringify(result));return result;}
const problem=await post('problem',{url:boot.sample.url});console.log('LIVE PROBLEM',problem.id,problem.title,problem.source);
const check=await post('agent/check',{agent:'codex'});console.log('CODEX CHECK',check);
const job=await post('generate',{problem,language:'Java',agent:'codex',mode:'full',notes:'请特别解释为什么要从后向前合并。'});console.log('JOB',job.id);
const interval=setInterval(async()=>{
 try{
  const result=await (await fetch(base+'/api/jobs/'+job.id)).json();
  if(result.status==='running'){console.log('RUNNING',Math.round((Date.now()-new Date(job.startedAt))/1000));return;}
  clearInterval(interval);
  if(result.status!=='done')throw new Error(result.error||result.status);
  console.log('GENERATED',result.record.markdown.length,'chars',result.record.markdown.slice(0,200));
  const exported=await post('export',{id:result.record.id,notes:result.record.notes});console.log('EXPORTED',exported.path);
 }catch(error){clearInterval(interval);console.error(error.message);process.exitCode=1;}
},5000);
