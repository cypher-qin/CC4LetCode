import path from 'node:path';
import sanitizeHtml from 'sanitize-html';
import { decodeHTML } from 'entities';

export function parseProblemUrl(input) {
  let url; try { url = new URL(input); } catch { throw new Error('请输入完整的 LeetCode 题目链接'); }
  if (url.protocol !== 'https:' || !['leetcode.cn','leetcode.com','www.leetcode.cn','www.leetcode.com'].includes(url.hostname) || url.username || url.password || url.port) throw new Error('仅支持 https://leetcode.cn 或 leetcode.com 的题目链接');
  const slug = url.pathname.match(/^\/problems\/([a-z0-9-]+)(?:\/|$)/)?.[1];
  if (!slug) throw new Error('链接中缺少 /problems/题目名称');
  return {slug, origin:url.origin, url:`${url.origin}/problems/${slug}/`};
}
export function cleanHtml(html) {
  return sanitizeHtml(html,{allowedTags:['p','br','strong','em','code','pre','ul','ol','li','sup','sub','table','thead','tbody','tr','td','th','blockquote'],allowedAttributes:{}});
}
export function plainText(html) {
  const formatted=html.replace(/<sup\b[^>]*>/gi,'^(').replace(/<\/sup>/gi,')').replace(/<sub\b[^>]*>/gi,'_(').replace(/<\/sub>/gi,')').replace(/<br\s*\/?>/gi,'\n').replace(/<\/(p|li|pre|div|tr)>/gi,'\n').replace(/<\/(td|th)>/gi,' | ');
  return decodeHTML(sanitizeHtml(formatted,{allowedTags:[],allowedAttributes:{}}));
}
export function safeFilename(title) { return title.replace(/[<>:"/\\|?*\x00-\x1f]/g,'-').replace(/[. ]+$/g,'').slice(0,90) || '题解'; }
export function exportMarkdown(record) {
  return `# ${record.problem.id ? record.problem.id + '. ' : ''}${record.problem.title}\n\n- 题目：${record.problem.url}\n- 语言：${record.language}\n- Agent：${record.agent}\n- 模式：${record.mode === 'hint' ? '渐进提示' : '完整题解'}\n- 时间：${record.createdAt}\n\n---\n\n${record.markdown}\n${record.messages?.length?'\n---\n\n## 追问与交流\n\n'+record.messages.map(m=>'### '+(m.role==='user'?'我的问题':'Agent 回答')+'\n\n'+m.content).join('\n\n')+'\n':''}${record.notes ? '\n---\n\n## 我的思考\n\n'+record.notes+'\n' : ''}`;
}
export function exportPath(folder, record) {return path.join(folder, `${safeFilename(record.problem.id + '-' + record.problem.title)}-${record.language.replace(/\+/g,'p')}-${record.id}.md`);}
