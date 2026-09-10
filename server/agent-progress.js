export function safeDiagnostic(text) {
  return String(text).replace(/Bearer\s+\S+/gi,'Bearer [redacted]').replace(/sk-[\w-]+/g,'[redacted]').replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/g,'$1[redacted]@').slice(-1200);
}
export function parseAgentEvent(line) {
  let e;try{e=JSON.parse(line);}catch{return null;}
  if(e.type==='thread.started')return {stage:'Codex 已启动，正在连接模型服务'};
  if(e.type==='turn.started')return {stage:'正在等待模型响应'};
  if(e.type==='error')return {stage:/Reconnecting|retry|timed out/i.test(e.message)?'连接超时或中断，Codex 正在重试':'模型服务返回错误',detail:safeDiagnostic(e.message||'未知错误')};
  if(e.type==='turn.failed')return {stage:'模型调用失败',error:safeDiagnostic(e.error?.message||e.message||'模型调用失败')};
  if(e.type==='item.completed'&&e.item?.type==='agent_message')return {stage:'已收到模型答复，正在整理题解',answer:e.item.text};
  if(e.type==='turn.completed')return {stage:'模型响应完成，正在保存题解'};
  return null;
}
