let sessionToken = '';
export function setSessionToken(token) { sessionToken = token; }
export async function api(url, body, method = 'POST') {
  const hasBody = body !== undefined;
  const headers = hasBody ? {'Content-Type':'application/json','X-Local-Token':sessionToken} : {};
  let response;
  try {
    response = await fetch('/api/'+url, {
      method:hasBody?method:'GET',
      mode:'same-origin',
      credentials:'same-origin',
      referrerPolicy:'same-origin',
      cache:'no-store',
      signal:AbortSignal.timeout(30000),
      headers,
      ...(hasBody?{body:JSON.stringify(body)}:{})
    });
  } catch(error) {
    if(error.name==='TimeoutError'||error.name==='AbortError')throw new Error('本地服务响应超时，请重试或重新启动研习室。');
    throw new Error('无法连接本地服务。请先启动研习室，再点击重试。');
  }
  let data;try {data=await response.json();}catch{throw new Error('本地服务返回了无效内容，请重新启动研习室。');}
  if(!response.ok)throw new Error(data.error||'请求失败');
  return data;
}
