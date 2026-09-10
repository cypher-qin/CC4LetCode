import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseProblemUrl,cleanHtml,plainText,safeFilename,exportMarkdown,exportPath} from '../server/core.js';
import {extractSolutionCode} from '../src/markdown.js';
test('accept Chinese and global LeetCode URLs, canonicalize suffix and tracking query',()=>{
 assert.equal(parseProblemUrl('https://leetcode.cn/problems/merge-sorted-array/description/?x=1').slug,'merge-sorted-array');
 assert.equal(parseProblemUrl('https://leetcode.com/problems/two-sum/solutions/').url,'https://leetcode.com/problems/two-sum/');
});
test('reject SSRF, credentials, alternate ports and malformed problem paths',()=>{
 for(const value of ['http://localhost:3210/','https://leetcode.cn.evil.test/problems/test','https://user:pass@leetcode.cn/problems/test','https://leetcode.cn:999/problems/test','file:///etc/passwd','https://leetcode.cn/discuss/','garbage'])assert.throws(()=>parseProblemUrl(value));
});
test('remove active content and external images while preserving question formatting',()=>{
 const content=cleanHtml('<p onclick="alert(1)">题目 <code>x</code></p><script>alert(1)</script><img src="https://tracker"><iframe src="x"></iframe>');
 assert.equal(content,'<p>题目 <code>x</code></p>');
});
test('preserve exponents, comparisons and line breaks when sending the question to an Agent',()=>{
 assert.equal(plainText('<p>-10<sup>9</sup> &lt;= x &amp; x &lt;= 10<sup>9</sup><br>n &gt; 0</p>'),'-10^(9) <= x & x <= 10^(9)\nn > 0\n');
});
test('extract the requested code language, skip text examples and fence endings',()=>{
 const markdown='Example:\n```text\na = [1,2]\n```\nExplanation here\n```java\nclass Solution {}\n```\nMore text';
 assert.equal(extractSolutionCode(markdown,'Java'),'class Solution {}\n');assert.equal(extractSolutionCode(markdown,'Python'),null);
});
test('export readable Markdown with fenced code and notes; contain generated filenames',()=>{
 const record={id:'test-id',problem:{id:'88',title:'../合并:数组',url:'https://leetcode.cn/problems/merge-sorted-array/'},language:'C++',agent:'codex',mode:'full',createdAt:'2026-09-10',markdown:'## 思路\n\n```cpp\nint i = 0;\n```',notes:'从后向前'};
 const md=exportMarkdown(record);assert.match(md,/```cpp/);assert.match(md,/我的思考/);assert.match(md,/从后向前/);assert.match(exportPath('C:/Docs',record),/Cpp/);assert.ok(!safeFilename(record.problem.title).includes('/'));
});
