// 拼音搜索支持
// 扩展拼音映射表，覆盖更多常用汉字
const pinyinMap = {
  // 基础汉字
  '一':'yi', '二':'er', '三':'san', '四':'si', '五':'wu', '六':'liu', '七':'qi', '八':'ba', '九':'jiu', '十':'shi',
  '百':'bai', '千':'qian', '万':'wan', '亿':'yi',
  '中':'zhong', '国':'guo', '人':'ren', '民':'min', '我':'wo', '你':'ni', '他':'ta', '她':'ta', '它':'ta',
  '的':'de', '是':'shi', '在':'zai', '有':'you', '和':'he', '就':'jiu', '不':'bu', '了':'le', '要':'yao',
  '上':'shang', '大':'da', '小':'xiao', '多':'duo', '少':'shao', '好':'hao', '坏':'huai',
  // 常用网站名称
  '哔':'bi', '哩':'li', '度':'du', '知':'zhi', '乎':'hu', '微':'wei', '博':'bo', '淘':'tao',
  '宝':'bao', '京':'jing', '东':'dong', '天':'tian', '猫':'mao', '网':'wang', '易':'yi', '云':'yun',
  '音':'yin', '乐':'le', '腾':'teng', '讯':'xun', '视':'shi', '频':'pin', '爱':'ai', '奇':'qi', '艺':'yi',
  '优':'you', '酷':'ku', '搜':'sou', '狐':'hu', '新':'xin', '浪':'lang', '凤':'feng', '凰':'huang',
  '今':'jin', '日':'ri', '头':'tou', '条':'tiao', '豆':'dou', '瓣':'ban', '快':'kuai', '手':'shou',
  '抖':'dou', '红':'hong', '书':'shu', '站':'zhan', '页':'ye',
  // 常见姓氏
  '张':'zhang', '王':'wang', '李':'li', '赵':'zhao', '钱':'qian', '孙':'sun', '周':'zhou', '吴':'wu',
  '郑':'zheng', '冯':'feng', '陈':'chen', '褚':'chu', '卫':'wei', '蒋':'jiang', '沈':'shen',
  // 新增常用词汇
  '学':'xue', '校':'xiao', '闻':'wen', '科':'ke', '技':'ji', '文':'wen', '档':'dang',
  '资':'zi', '料':'liao', '报':'bao', '告':'gao', '计':'ji', '划':'hua', '表':'biao', '单':'dan',
  '公':'gong', '司':'si', '产':'chan', '品':'pin', '服':'fu', '务':'wu', '关':'guan', '于':'yu',
  '帮':'bang', '助':'zhu', '设':'she', '置':'zhi', '配':'pei', '修':'xiu', '改':'gai',
  '添':'tian', '加':'jia', '删':'shan', '除':'chu', '查':'cha', '看':'kan', '编':'bian', '辑':'ji',
  // 补充常用字（扩大码表覆盖：地域/互联网/生活常用）
  '庆':'qing', '银':'yin', '业':'ye', '电':'dian', '台':'tai', '湾':'wan',
  '港':'gang', '澳':'ao', '海':'hai', '深':'shen', '广':'guang', '苏':'su',
  '杭':'hang', '南':'nan', '北':'bei', '市':'shi', '境':'jing',
  '录':'lu', '登':'deng', '注':'zhu', '册':'ce', '账':'zhang', '号':'hao',
  '邮':'you', '箱':'xiang', '信':'xin', '擎':'qing', '浏':'liu', '览':'lan',
  '器':'qi', '幕':'mu', '币':'bi', '链':'lian', '财':'cai', '税':'shui',
  '政':'zheng', '府':'fu', '院':'yuan', '党':'dang', '军':'jun', '委':'wei',
  '部':'bu', '议':'yi', '员':'yuan', '决':'jue', '策':'ce', '声':'sheng',
  '明':'ming', '词':'ci', '典':'dian', '译':'yi', '翻':'fan', '库':'ku',
  '存':'cun', '储':'chu', '备':'bei', '份':'fen', '恢':'hui', '复':'fu',
  '制':'zhi', '心':'xin', '版':'ban', '权':'quan', '所':'suo', '允':'yun',
  '许':'xu', '禁':'jin', '侵':'qin', '害':'hai', '隐':'yin', '私':'si',
  '例':'li', '障':'zhang', '碍':'ai', '友':'you', '情':'qing', '况':'kuang',
  '反':'fan', '馈':'kui', '意':'yi', '见':'jian', '建':'jian', '更':'geng',
  '全':'quan', '局':'ju', '导':'dao', '航':'hang', '图':'tu', '据':'ju',
  '预':'yu', '测':'ce', '警':'jing', '级':'ji', '别':'bie', '状':'zhuang',
  '态':'tai', '线':'xian', '离':'li', '忙':'mang', '闲':'xian', '空':'kong',
  '时':'shi', '间':'jian', '秒':'miao', '钟':'zhong', '年':'nian', '月':'yue',
  '期':'qi', '末':'mo', '初':'chu', '春':'chun', '夏':'xia', '秋':'qiu',
  '冬':'dong', '节':'jie', '旅':'lv', '游':'you', '机':'ji', '票':'piao',
  '酒':'jiu', '店':'dian', '宾':'bin', '馆':'guan', '房':'fang', '租':'zu',
  '车':'che', '路':'lu', '桥':'qiao', '口':'kou', '岸':'an', '岛':'dao',
  '江':'jiang', '河':'he', '湖':'hu', '山':'shan', '林':'lin', '园':'yuan',
  '花':'hua', '草':'cao', '树':'shu', '鸟':'niao', '鱼':'yu', '虫':'chong',
  '石':'shi', '油':'you', '气':'qi', '热':'re', '光':'guang', '波':'bo',
  '水':'shui', '火':'huo', '土':'tu', '金':'jin', '木':'mu', '钢':'gang',
  '铁':'tie', '铜':'tong', '塑':'su', '纤':'xian', '维':'wei', '保':'bao',
  '鲜':'xian', '食':'shi', '饮':'yin', '餐':'can', '厅':'ting', '厨':'chu',
  '清':'qing', '洁':'jie', '洗':'xi', '衣':'yi', '收':'shou', '纳':'na',
  '柜':'gui', '架':'jia', '椅':'yi', '桌':'zhuo', '床':'chuang', '枕':'zhen',
  '被':'bei', '力':'li', '量':'liang', '速':'su', '率':'lv',
  '值':'zhi', '单':'dan', '位':'wei', '净':'jing',
  '毛':'mao', '息':'xi', '价':'jia', '格':'ge', '折':'zhe',
  '扣':'kou', '惠':'hui', '免':'mian', '费':'fei'
};

// 多音字补充（多个读音用逗号分隔，覆盖书标题常见字）
const polyphonicMap = {
  '重':'zhong,chong', '行':'xing,hang', '长':'chang,zhang', '会':'hui,kuai',
  '乐':'le,yue', '差':'cha,chai', '数':'shu,shuo', '藏':'cang,zang',
  '朝':'chao,zhao', '传':'chuan,zhuan', '大':'da,dai', '地':'di,de',
  '都':'dou,du', '得':'de,dei', '了':'le,liao', '着':'zhe,zhao',
  '的':'de,di', '和':'he,huo', '还':'hai,huan', '觉':'jue,jiao',
  '没':'mei,mo', '弄':'nong,long', '色':'se,shai', '盛':'sheng,cheng',
  '识':'shi,zhi', '说':'shuo,shui', '系':'xi,ji', '血':'xue,xie',
  '落':'luo,la', '圈':'quan,juan', '省':'sheng,xing', '种':'zhong,chong',
  '弹':'dan,tan', '便':'bian,pian', '降':'jiang,xiang', '强':'qiang,jiang',
  '校':'xiao,jiao', '屏':'ping,bing', '度':'du,duo'
};
// 合并：多音字覆盖单读音
Object.assign(pinyinMap, polyphonicMap);
const HAS_CJK_CHAR = /[\u3400-\u9fff]/;
const PINYIN_CACHE_LIMIT = 4096;
const pinyinSearchCache = new Map();

// 搜索输入变化时复用文本派生出的拼音数据；Map 顺序用于实现有界 LRU。
function getPinyinSearchIndex(text, lowerText) {
  const cached = pinyinSearchCache.get(text);
  if (cached) {
    pinyinSearchCache.delete(text);
    pinyinSearchCache.set(text, cached);
    return cached;
  }

  const index = {
    lowerText,
    initials: toPinyinInitials(text).toLowerCase(),
    fullPinyin: getFullPinyinVariants(text).map(variant => variant.toLowerCase())
  };
  pinyinSearchCache.set(text, index);
  if (pinyinSearchCache.size > PINYIN_CACHE_LIMIT) {
    pinyinSearchCache.delete(pinyinSearchCache.keys().next().value);
  }
  return index;
}

// 获取一个汉字的全部读音（无读音返回空数组）
function getPinyinReadings(char) {
  const pinyin = pinyinMap[char];
  return pinyin ? pinyin.split(',') : [];
}

// 将中文转换为拼音首字母串（多音字包含所有读音的首字母）
function toPinyinInitials(text) {
  return text.split('').map(char => {
    const readings = getPinyinReadings(char);
    return readings.length > 0 ? readings.map(r => r[0]).join('') : char;
  }).join('');
}

// 逐字符首字母匹配：每个汉字可匹配其任一读音的首字母（覆盖 "zy" 匹配 "重要"）
function matchPinyinInitials(text, searchLower) {
  let si = 0;
  for (const char of text) {
    if (si >= searchLower.length) break;
    const readings = getPinyinReadings(char);
    if (readings.length === 0) {
      if (char.toLowerCase() === searchLower[si]) si++;
      continue;
    }
    if (readings.some(r => r[0] === searchLower[si])) si++;
  }
  return si === searchLower.length;
}

// 生成全拼的所有读音组合（多音字展开，设上限防止组合爆炸）
function getFullPinyinVariants(text) {
  let variants = [''];
  for (const char of text) {
    const readings = getPinyinReadings(char);
    if (readings.length === 0) {
      variants = variants.map(v => v + char);
      continue;
    }
    const next = [];
    for (const v of variants) {
      for (const r of readings) next.push(v + r);
    }
    variants = next.slice(0, 64);
  }
  return variants;
}

// 增强的搜索匹配函数
function isSearchMatch(text, searchTerm) {
  const hasCjk = HAS_CJK_CHAR.test(text);
  let cachedPinyinIndex = null;
  if (hasCjk) {
    cachedPinyinIndex = pinyinSearchCache.get(text) || null;
    if (cachedPinyinIndex) {
      pinyinSearchCache.delete(text);
      pinyinSearchCache.set(text, cachedPinyinIndex);
    }
  }
  const textLower = cachedPinyinIndex ? cachedPinyinIndex.lowerText : text.toLowerCase();
  const searchLower = searchTerm.toLowerCase();
  
  // 1. 直接文本匹配
  if (textLower.includes(searchLower)) {
    return true;
  }

  // 纯拉丁/数字等文本无需逐字查拼音表，也无需生成全拼组合；
  // 保留首字母子序列匹配（例如 "gh" 可匹配 "github"）。
  if (!hasCjk) {
    return matchPinyinInitials(text, searchLower);
  }
  
  // 2. 拼音首字母匹配（两种策略都覆盖：拼接串包含 + 逐字符任选读音）
  const pinyinIndex = cachedPinyinIndex || getPinyinSearchIndex(text, textLower);
  if (pinyinIndex.initials.includes(searchLower)) {
    return true;
  }
  if (matchPinyinInitials(text, searchLower)) {
    return true;
  }
  
  // 3. 拼音全拼匹配（任一读音组合包含）
  if (pinyinIndex.fullPinyin.some(variant => variant.includes(searchLower))) {
    return true;
  }
  
  return false;
}

// 导出函数供popup.js使用
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { isSearchMatch, toPinyinInitials, getPinyinReadings, matchPinyinInitials, getFullPinyinVariants };
}
