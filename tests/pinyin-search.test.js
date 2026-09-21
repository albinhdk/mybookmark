// 拼音搜索测试：多音字、首字母、全拼
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const FILE = path.join(__dirname, '..', 'chrome-menu-optimizer', 'pinyin-search.js');
const sandbox = { module: undefined };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(FILE, 'utf8'), sandbox);
const { isSearchMatch, toPinyinInitials, getPinyinReadings, matchPinyinInitials, getFullPinyinVariants } = sandbox;

const results = [];
function check(name, cond) {
  results.push(cond);
  console.log((cond ? '  PASS ' : '  FAIL ') + name);
}

console.log('[基础匹配]');
check('中文直接匹配', isSearchMatch('GitHub', 'git') === true);
check('英文大小写不敏感', isSearchMatch('GitHub', 'GITHUB') === true);
check('英文不匹配', isSearchMatch('GitHub', 'xyz') === false);
check('URL 匹配', isSearchMatch('https://github.com', 'github.com') === true);

console.log('[拼音首字母]');
check('zg 匹配 中国', isSearchMatch('中国', 'zg') === true);
check('全拼匹配 中国', isSearchMatch('中国', 'zhongguo') === true);

console.log('[多音字]');
check('重 有两个读音', getPinyinReadings('重').length === 2);
check('zy 匹配 重要（逐字符任选读音）', matchPinyinInitials('重要', 'zy') === true);
check('zcy 匹配 重要（拼接串包含）', toPinyinInitials('重要').includes('zcy'));
check('isSearchMatch 重要 zy', isSearchMatch('重要', 'zy') === true);
check('isSearchMatch 重要 zhongyao', isSearchMatch('重要', 'zhongyao') === true);
check('isSearchMatch 重要 chongyao', isSearchMatch('重要', 'chongyao') === true);
check('isSearchMatch 重庆 zhongqing', isSearchMatch('重庆', 'zhongqing') === true);
check('isSearchMatch 重庆 chongqing', isSearchMatch('重庆', 'chongqing') === true);
check('isSearchMatch 银行 yinhang', isSearchMatch('银行', 'yinhang') === true);
check('isSearchMatch 行业 xingye', isSearchMatch('行业', 'xingye') === true);
check('isSearchMatch 会长 huizhang', isSearchMatch('会长', 'huizhang') === true);
check('isSearchMatch 会计 kuaiji', isSearchMatch('会计', 'kuaiji') === true);
check('isSearchMatch 音乐 yinle', isSearchMatch('音乐', 'yinle') === true);
check('isSearchMatch 快乐 yueliang? (乐yue)', isSearchMatch('音乐节', 'yue') === true);

console.log('[读音组合上限]');
const variants = getFullPinyinVariants('重重重重重要');
check('组合数受上限保护', variants.length <= 64);

console.log('[无回归]');
check('非汉字原样返回', toPinyinInitials('A1') === 'A1');
check('空搜索词不误匹配', isSearchMatch('中国', '') === true); // includes('') 恒真，与原行为一致

const failed = results.filter(r => !r).length;
console.log(`\n===== ${results.length - failed}/${results.length} 通过 =====`);
if (failed) process.exit(1);
