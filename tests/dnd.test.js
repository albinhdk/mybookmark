// 拖拽移动功能测试：
// [1] bookmark-tree.js isSelfOrAncestorOf —— 禁止把文件夹移入自身/子树（循环校验）
// [2] popup.js normalizeMoveIndex / computeDropIndex —— 同父排序 index 归一化。
//     语义基线由 tests/dnd-semantics.js 在真实 Edge 153 实证：move(A, {index:2})
//     于 [A,B,C,D] 得 BACD —— index 以"移除前"数组为基准，同父向下移动 Chromium 自动 -1。
// [3] mock-chrome-api.js move —— file:// 测试环境的书签移动（镜像上述语义 + 变更事件）
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', 'chrome-menu-optimizer');

const results = [];
function check(name, cond) {
  results.push(cond);
  console.log((cond ? '  PASS ' : '  FAIL ') + name);
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// 从真实 popup.js 源码提取函数定义（从 function 到函数体闭合括号）
function extract(src, name) {
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

// ===== [1] isSelfOrAncestorOf =====
console.log('[1] isSelfOrAncestorOf（拖拽循环校验）');
{
  const TREE = [{
    id: '0', title: '',
    children: [
      {
        id: '1', title: '书签栏', children: [
          {
            id: '2', title: '开发工具', children: [
              { id: '3', title: 'GitHub', url: 'https://github.com' },
              {
                id: '11', title: '前端', children: [
                  { id: '12', title: 'MDN', url: 'https://developer.mozilla.org' }
                ]
              }
            ]
          },
          {
            id: '6', title: '搜索引擎', children: [
              { id: '7', title: 'Google', url: 'https://www.google.com' }
            ]
          },
          { id: '9', title: 'YouTube', url: 'https://www.youtube.com' }
        ]
      },
      { id: '10', title: '其他书签', children: [] }
    ]
  }];

  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    setTimeout,
    Date,
    Map,
    Promise,
    URL,
    chrome: {
      runtime: { lastError: null },
      bookmarks: {
        getTree(cb) { setTimeout(() => cb(JSON.parse(JSON.stringify(TREE))), 0); }
      }
    }
  };
  ['onCreated', 'onRemoved', 'onChanged', 'onMoved', 'onChildrenReordered', 'onImportEnded'].forEach(name => {
    sandbox.chrome.bookmarks[name] = { addListener() {} };
  });
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'bookmark-tree.js'), 'utf8'), sandbox);

  (async () => {
    await sandbox.BMV.bookmarkTree.ensureBookmarkTree();
    const T = sandbox.BMV.bookmarkTree;
    check('文件夹对自身 → true', T.isSelfOrAncestorOf('2', '2') === true);
    check('父目录 → true', T.isSelfOrAncestorOf('2', '12') === true); // 前端 的父是 开发工具
    check('祖父目录 → true', T.isSelfOrAncestorOf('1', '12') === true); // 书签栏 是 前端 的祖父
    check('根节点 → true', T.isSelfOrAncestorOf('0', '9') === true);
    check('兄弟目录 → false', T.isSelfOrAncestorOf('6', '2') === false); // 搜索引擎 不是 开发工具 的祖先
    check('旁支远亲 → false', T.isSelfOrAncestorOf('2', '7') === false); // 开发工具 不是 Google 的祖先
    check('后代对祖先 → false', T.isSelfOrAncestorOf('11', '2') === false); // 前端 不是 开发工具 的祖先
    check('空参数 → false', T.isSelfOrAncestorOf(null, '2') === false && T.isSelfOrAncestorOf('2', '') === false);

    // ===== [2] index 归一化 =====
    console.log('[2] normalizeMoveIndex / computeDropIndex（同父排序 index 语义）');
    const popupSrc = fs.readFileSync(path.join(ROOT, 'popup.js'), 'utf8');
    const sandbox2 = { console };
    vm.createContext(sandbox2);
    vm.runInContext(
      extract(popupSrc, 'normalizeMoveIndex') + '\n' + extract(popupSrc, 'computeDropIndex'),
      sandbox2
    );
    const { normalizeMoveIndex, computeDropIndex } = sandbox2;

    // 按实证语义执行移动：index 为移除前坐标；同父且向下移动时 Chromium 自动 -1
    const applyMoveSim = (list, fromIndex, apiIndex) => {
      const l = list.slice();
      const [item] = l.splice(fromIndex, 1);
      const idx = apiIndex > fromIndex ? apiIndex - 1 : apiIndex;
      l.splice(idx, 0, item);
      return l;
    };
    // 断言：视觉拖动语义（拖 X 到某张卡的前/后方）→ 最终顺序
    const expectVisual = (name, list, fromIndex, cardIndex, position, expected) => {
      const dropIndex = computeDropIndex(fromIndex, cardIndex, position);
      if (dropIndex === fromIndex) {
        check(name + '（原地不动，跳过 move）', list.join('') === expected);
        return;
      }
      const apiIndex = normalizeMoveIndex(fromIndex, dropIndex, true);
      const actual = applyMoveSim(list, fromIndex, apiIndex).join('');
      check(`${name}（apiIndex=${apiIndex}）`, actual === expected);
    };

    // [A,B,C,D]，索引 0..3
    expectVisual('A 拖到 B 之后', ['A', 'B', 'C', 'D'], 0, 1, 'after', 'BACD'); // 与实证用例一致
    expectVisual('A 拖到 C 之前（落点同 B 之后）', ['A', 'B', 'C', 'D'], 0, 2, 'before', 'BACD');
    expectVisual('A 拖到末尾', ['A', 'B', 'C', 'D'], 0, 3, 'after', 'BCDA');
    expectVisual('D 拖到 B 之前', ['A', 'B', 'C', 'D'], 3, 1, 'before', 'ADBC');
    expectVisual('D 拖到 A 之前', ['A', 'B', 'C', 'D'], 3, 0, 'before', 'DABC');
    expectVisual('B 拖到末尾', ['A', 'B', 'C', 'D'], 1, 3, 'after', 'ACDB');
    expectVisual('C 拖到 A 之前', ['A', 'B', 'C', 'D'], 2, 0, 'before', 'CABD');
    expectVisual('B 拖到 B 之前（原地）', ['A', 'B', 'C', 'D'], 1, 1, 'before', 'ABCD');
    expectVisual('A 拖到 B 之前（紧贴原位）', ['A', 'B', 'C', 'D'], 0, 1, 'before', 'ABCD');

    check('跨父移动不做回补（直接用落点）', normalizeMoveIndex(0, 1, false) === 1);
    check('向上移动不做回补', normalizeMoveIndex(3, 0, true) === 0);
    check('原地（落点=起点）不做回补', normalizeMoveIndex(2, 2, true) === 2);
    check('向下移动回补 +1', normalizeMoveIndex(0, 2, true) === 3);

    // ===== [3] mock move =====
    console.log('[3] mock-chrome-api.js move（file:// 测试环境）');
    const localStorageStub = {
      getItem() { return null; },
      setItem() {},
      removeItem() {}
    };
    const mockSandbox = {
      console: { log() {}, warn() {}, error() {} },
      setTimeout,
      localStorage: localStorageStub,
      URL,
      window: null
    };
    mockSandbox.window = mockSandbox;
    vm.createContext(mockSandbox);
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'mock-chrome-api.js'), 'utf8'), mockSandbox);
    const mock = mockSandbox.chrome.bookmarks;

    const getTitles = (folderId) => new Promise(res => {
      mock.getChildren(folderId, (children) => res(children.map(c => c.title)));
    });

    (async () => {
      await sleep(60);
      const moved = [];
      mock.onMoved.addListener((id, info) => moved.push({ id, ...info }));
      const barTitles = await getTitles('1');
      check('mock 初始书签栏顺序', barTitles.join(',') === '开发工具,搜索引擎,YouTube,Wikipedia', barTitles.join(','));

      // YouTube(idx 2) 拖到 Wikipedia(idx 3) 之后 → 视觉 [开发工具,搜索引擎,Wikipedia,YouTube]
      // popup 计算的 apiIndex = normalizeMoveIndex(2, 3, true) = 4
      const apiIdx = normalizeMoveIndex(2, 3, true);
      await new Promise(res => mock.move('9', { index: apiIdx }, res));
      await sleep(30);
      let bar2 = await getTitles('1');
      check('同父排序：YouTube 移到最后（apiIndex=4 + 自动 -1）', bar2.join(',') === '开发工具,搜索引擎,Wikipedia,YouTube', bar2.join(','));

      // 不传 index → 追加到末尾（默认值同样走"移除前坐标"）
      await new Promise(res => mock.move('2', {}, res));
      await sleep(30);
      bar2 = await getTitles('1');
      check('move 无 index 时追加到末尾', bar2.join(',') === '搜索引擎,Wikipedia,YouTube,开发工具', bar2.join(','));
      check('onMoved 事件以调整后 index 触发', moved.some(m => m.id === '2' && m.index === 3), JSON.stringify(moved[moved.length - 1]));

      // 跨父移动：YouTube 拖入 开发工具
      await new Promise(res => mock.move('9', { parentId: '2' }, res));
      await sleep(30);
      bar2 = await getTitles('1');
      const devTitles = await getTitles('2');
      check('跨父移动：源目录移除该卡', bar2.join(',') === '搜索引擎,Wikipedia,开发工具', bar2.join(','));
      check('跨父移动：目标目录追加该卡', devTitles.includes('YouTube'), devTitles.join(','));

      // 循环移动仍允许 API 层面发生（校验在 popup 层），这里只验证树结构一致
      const node2 = await new Promise(res => mock.get('11', res));
      check('get 返回空数组（不存在节点）', Array.isArray(node2) && node2.length === 0);

      const failed = results.filter(r => !r).length;
      console.log(`\n===== ${results.length - failed}/${results.length} 通过 =====`);
      if (failed) process.exit(1);
    })().catch(e => { console.error('测试执行异常:', e); process.exit(1); });
  })().catch(e => { console.error('测试执行异常:', e); process.exit(1); });
}
