import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import {Maximize2,X,Copy,Minus,Plus} from 'lucide-react';

function ReaderWindow({record,onClose,onCopy}){
 const dialog=useRef(null),[fontSize,setFontSize]=useState(18);
 useEffect(()=>{
  const node=dialog.current,previousOverflow=document.body.style.overflow;
  node.showModal();document.body.style.overflow='hidden';
  return()=>{node.close();document.body.style.overflow=previousOverflow;};
 },[]);
 return createPortal(<dialog ref={dialog} className="answer-reader" aria-labelledby="answer-reader-title" onClose={onClose}>
  <header className="reader-header"><div><small>题解 · 专注阅读</small><h2 id="answer-reader-title">{record.problem.id?record.problem.id+'. ':''}{record.problem.title}</h2></div><button autoFocus className="icon-button" aria-label="关闭放大题解" title="关闭（Esc）" onClick={onClose}><X size={22}/></button></header>
  <div className="reader-toolbar"><span>{record.language} · {record.agent==='harness'?'DeepSeek Harness':'Codex'} · {record.mode==='hint'?'渐进提示':'完整题解'}</span><div className="reader-actions"><button className="icon-button" aria-label="缩小题解字号" disabled={fontSize<=16} onClick={()=>setFontSize(s=>s-1)}><Minus size={16}/></button><span aria-live="polite">{fontSize}px</span><button className="icon-button" aria-label="放大题解字号" disabled={fontSize>=24} onClick={()=>setFontSize(s=>s+1)}><Plus size={16}/></button><button className="secondary" onClick={()=>onCopy(record.markdown)}><Copy size={15}/> 复制题解</button></div></div>
  <div className="reader-scroll" tabIndex={0} aria-label="放大题解正文" style={{'--reader-font-size':fontSize+'px'}}><article className="markdown"><Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>{record.markdown}</Markdown></article></div>
 </dialog>,document.body);
}

export function AnswerReader({record,onCopy}){
 const [open,setOpen]=useState(false);
 useEffect(()=>{setOpen(false);},[record?.id]);
 return <><button className="save-button reader-open" title="在独立悬浮窗中放大阅读题解" aria-label="放大题解" disabled={!record} onClick={()=>setOpen(true)}><Maximize2 size={16}/> 放大</button>{open&&record&&<ReaderWindow record={record} onCopy={onCopy} onClose={()=>setOpen(false)}/>}</>;
}
