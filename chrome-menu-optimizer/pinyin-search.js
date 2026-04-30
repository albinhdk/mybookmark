// 拼音搜索支持
// 扩展拼音映射表，覆盖更多常用汉字
const pinyinMap = {
  // 基础汉字
  '一':'yi', '二':'er', '三':'san', '四':'si', '五':'wu', '六':'liu', '七':'qi', '八':'ba', '九':'jiu', '十':'shi',
  '百':'bai', '千':'qian', '万':'wan', '亿':'yi',
  '中':'zhong', '国':'guo', '人':'ren', '民':'min', '我':'wo', '你':'ni', '他':'ta', '她':'ta', '它':'ta',
  '的':'de', '是':'shi', '在':'zai', '有':'you', '和':'he', '就':'jiu', '不':'bu', '了':'le', '要':'yao',
  '上':'shang', '大':'da', '中':'zhong', '小':'xiao', '多':'duo', '少':'shao', '好':'hao', '坏':'huai',
  // 常用网站名称
  '哔':'bi', '哩':'li', '百':'bai', '度':'du', '知':'zhi', '乎':'hu', '微':'wei', '博':'bo', '淘':'tao',
  '宝':'bao', '京':'jing', '东':'dong', '天':'tian', '猫':'mao', '网':'wang', '易':'yi', '云':'yun',
  '音':'yin', '乐':'le', '腾':'teng', '讯':'xun', '视':'shi', '频':'pin', '爱':'ai', '奇':'qi', '艺':'yi',
  '优':'you', '酷':'ku', '搜':'sou', '狐':'hu', '新':'xin', '浪':'lang', '凤':'feng', '凰':'huang',
  '今':'jin', '日':'ri', '头':'tou', '条':'tiao', '豆':'dou', '瓣':'ban', '快':'kuai', '手':'shou',
  '抖':'dou', '音':'yin', '小':'xiao', '红':'hong', '书':'shu', '网':'wang', '站':'zhan', '页':'ye',
  // 常见姓氏
  '张':'zhang', '王':'wang', '李':'li', '赵':'zhao', '钱':'qian', '孙':'sun', '周':'zhou', '吴':'wu',
  '郑':'zheng', '冯':'feng', '陈':'chen', '褚':'chu', '卫':'wei', '蒋':'jiang', '沈':'shen',
  // 新增常用词汇
  '学':'xue', '校':'xiao', '新':'xin', '闻':'wen', '科':'ke', '技':'ji', '文':'wen', '档':'dang',
  '资':'zi', '料':'liao', '报':'bao', '告':'gao', '计':'ji', '划':'hua', '表':'biao', '单':'dan',
  '公':'gong', '司':'si', '产':'chan', '品':'pin', '服':'fu', '务':'wu', '关':'guan', '于':'yu',
  '帮':'bang', '助':'zhu', '设':'she', '置':'zhi', '配':'pei', '置':'zhi', '修':'xiu', '改':'gai',
  '添':'tian', '加':'jia', '删':'shan', '除':'chu', '查':'cha', '看':'kan', '编':'bian', '辑':'ji'
};

// 将中文转换为拼音首字母
function toPinyinInitials(text) {
  return text.split('').map(char => {
    const pinyin = pinyinMap[char];
    return pinyin ? pinyin[0] : char;
  }).join('');
}

// 增强的搜索匹配函数
function isSearchMatch(text, searchTerm) {
  const textLower = text.toLowerCase();
  const searchLower = searchTerm.toLowerCase();
  
  // 1. 直接文本匹配
  if (textLower.includes(searchLower)) {
    return true;
  }
  
  // 2. 拼音首字母匹配
  const pinyinInitials = toPinyinInitials(text);
  if (pinyinInitials.toLowerCase().includes(searchLower)) {
    return true;
  }
  
  // 3. 拼音全拼匹配
  const fullPinyin = text.split('').map(char => pinyinMap[char] || char).join('');
  if (fullPinyin.toLowerCase().includes(searchLower)) {
    return true;
  }
  
  return false;
}

// 导出函数供popup.js使用
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { isSearchMatch, toPinyinInitials };
}