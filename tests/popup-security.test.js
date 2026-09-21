// popup.js 安全函数测试：从真实源码提取 escapeHtml / isDangerousUrl 执行
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const FILE = path.join(__dirname, '..', 'chrome-menu-optimizer', 'popup.js');
const src = fs.readFileSync(FILE, 'utf8');

// 提取两个函数定义（从注释头到函数体结束的大括号）
function extract(name) {
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`未找到 ${name}`);
  let i = src.indexOf('{', start);
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) break; }
  }
  return src.slice(start, i + 1);
}

const sandbox = { URL, String, RegExp };
vm.createContext(sandbox);
vm.runInContext(extract('escapeHtml') + '\n' + extract('isDangerousUrl'), sandbox);

const results = [];
function check(name, cond) {
  results.push(cond);
  console.log((cond ? '  PASS ' : '  FAIL ') + name);
}

console.log('[escapeHtml]');
const e = sandbox.escapeHtml;
check('转义 < >', e('<b>') === '&lt;b&gt;');
check('转义双引号', e('a"b') === 'a&quot;b');
check('转义单引号', e("a'b") === 'a&#39;b');
check('转义 &', e('a&b') === 'a&amp;b');
check('属性上下文安全：title=" 无法突破', !e('x" onmouseover="alert(1)').includes('"'));
check('null/undefined 返回空串', e(null) === '' && e(undefined) === '');
check('数字安全', e(123) === '123');

console.log('[isDangerousUrl]');
const d = sandbox.isDangerousUrl;
check('javascript: 拦截', d('javascript:alert(1)') === true);
check('大写 JavaScript: 拦截', d('JavaScript:alert(1)') === true);
check('带制表符混淆的 jav\\tascript: 拦截', d('jav\tascript:alert(1)') === true);
check('data: 拦截', d('data:text/html,<script>alert(1)</script>') === true);
check('vbscript: 拦截', d('vbscript:msgbox(1)') === true);
check('https 放行', d('https://example.com/a?b=1') === false);
check('http 放行', d('http://example.com') === false);
check('ftp 放行（浏览器自行处理）', d('ftp://example.com') === false);
check('相对路径/非法 URL 放行', d('not a url') === false && d('/relative/path') === false);

const failed = results.filter(r => !r).length;
console.log(`\n===== ${results.length - failed}/${results.length} 通过 =====`);
if (failed) process.exit(1);
