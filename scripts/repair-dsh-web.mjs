// Narrow compatibility repair for Chrome extensions that strip the Origin port.
// Authentication and the Host/cross-site checks stay in place. Run again after
// upgrading DSH; unfamiliar upstream source fails closed instead of guessing.
import fs from 'node:fs/promises';
import path from 'node:path';
import {discoverHarness} from '../server/harness-discovery.js';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const config=await discoverHarness(root);
const cli=config.harnessArgs?.[1];
if(!cli)throw new Error('未找到官方 DSH 安装');
const target=path.resolve(path.dirname(cli),'../node_modules/@deepseek-ai/dsh-client-connection/lib/index.js');
const source=await fs.readFile(target,'utf8');
const marker='// CC4 Chrome loopback Origin compatibility';
if(source.includes(marker)){console.log('DeepSeek Web 兼容修复已安装。');process.exit(0);}
const before='\t\treturn new URL(origin).host === hostUrl.host;';
if(source.split(before).length!==2)throw new Error('DSH 来源检查结构已变更，未修改任何文件');
const after=`\t\t${marker}
\t\tconst originUrl = new URL(origin);
\t\tif (header$1(request.headers, "sec-fetch-site") === "same-origin" &&
\t\t    isLoopbackHostname(hostUrl.hostname) && originUrl.protocol === "http:" &&
\t\t    originUrl.hostname === hostUrl.hostname && originUrl.port === "" &&
\t\t    !originUrl.username && !originUrl.password && origin === originUrl.origin) return true;
\t\treturn originUrl.host === hostUrl.host;`;
await fs.copyFile(target,target+'.cc4-0913.bak',fs.constants.COPYFILE_EXCL);
await fs.writeFile(target,source.replace(before,after),'utf8');
console.log('已修复 DeepSeek Web 的本机 Origin 端口兼容问题；原文件保存在旁边的 .cc4-0913.bak。重启 dsh web 后生效。');
