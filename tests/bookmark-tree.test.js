// 内存书签树索引测试：vm 加载真实 popup.js，桩掉浏览器 API
// 重点验证：一次 getTree 之后，面包屑/文件夹预览/搜索路径零 IPC；变更监听与 CRUD 正确失效
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const FILE = path.join(__dirname, '..', 'chrome-menu-optimizer', 'popup.js');

// 固定书签树 fixtures
const TREE = [{
  id: '0', title: '',
  children: [
    {
      id: '1', title: '书签栏', children: [
        {
          id: '2', title: '开发工具', children: [
            { id: '3', title: 'GitHub', url: 'https://github.com' },
            { id: '4', title: 'Stack Overflow', url: 'https://stackoverflow.com' }
          ]
        },
        { id: '9', title: 'YouTube', url: 'https://www.youtube.com' }
      ]
    },
    { id: '10', title: '其他书签', children: [] }
  ]
}];

function makeElementStub() {
  return {
    dataset: {},
    style: {},
    title: '',
    textContent: '',
    innerHTML: '',
    classList: { add() {}, remove() {}, contains: () => false },
    appendChild() {},
    remove() {},
    addEventListener() {},
    setAttribute() {},
    querySelector: () => null,
    querySelectorAll: () => [],
    closest: () => null
  };
}

function makeSandbox() {
  const calls = { getTree: 0, getChildren: 0, get: 0, remove: 0 };
  const listeners = {};
  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    calls,
    listeners,
    setTimeout,
    clearTimeout,
    Date,
    Map,
    Promise,
    URL,
    Array,
    Object,
    String,
    Number,
    RegExp,
    Error,
    alert() {},
    confirm: () => true,
    navigator: { clipboard: { writeText: async () => {} } },
    document: {
      addEventListener() {},
      getElementById: () => makeElementStub(),
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: () => makeElementStub(),
      body: { appendChild() {} }
    },
    bookmarkUsageManager: {
      getUsageCount: () => 0,
      formatUsageCount: () => '',
      getLastUsed: () => null,
      formatLastUsed: () => '',
      recordUsage() {},
      sortBookmarksByUsage: (arr) => arr
    },
    chrome: {
      runtime: { lastError: null, sendMessage() {} },
      bookmarks: {
        getTree(cb) { calls.getTree++; setTimeout(() => cb(JSON.parse(JSON.stringify(TREE))), 0); },
        getChildren(id, cb) { calls.getChildren++; setTimeout(() => cb([]), 0); },
        get(id, cb) { calls.get++; setTimeout(() => cb([]), 0); },
        update(id, data, cb) { setTimeout(() => cb({ id }), 0); },
        remove(id, cb) { calls.remove++; setTimeout(() => { if (cb) cb(); }, 0); },
        create(bm, cb) { setTimeout(() => cb({ id: 'new' }), 0); }
      },
      tabs: { create() {}, query() {} },
      storage: { local: { get: async () => ({}), set: async () => {} } }
    }
  };
  // on* 事件桩：记录监听器供测试触发
  ['onCreated', 'onRemoved', 'onChanged', 'onMoved', 'onChildrenReordered', 'onImportEnded'].forEach(name => {
    listeners[name] = [];
    sandbox.chrome.bookmarks[name] = { addListener: (fn) => listeners[name].push(fn) };
  });
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(FILE, 'utf8'), sandbox);
  return { sandbox, calls, listeners };
}

const results = [];
function check(name, cond) {
  results.push(cond);
  console.log((cond ? '  PASS ' : '  FAIL ') + name);
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  // ===== 1. 树索引构建 =====
  console.log('[1] 树索引构建');
  {
    const { sandbox } = makeSandbox();
    const tree = sandbox.buildTreeIndex(TREE);
    check('rootId 正确', tree.rootId === '0');
    check('nodeById 覆盖全部节点', tree.nodeById.size === 7);
    check('书签栏 parentId=根', tree.nodeById.get('1').parentId === '0');
    check('嵌套书签 parentId 正确', tree.nodeById.get('3').parentId === '2');
    check('根节点 parentId=null', tree.nodeById.get('0').parentId === null);
  }

  // ===== 2. ensure 去重 + 失效重建 =====
  console.log('[2] ensure / invalidate');
  {
    const { sandbox, calls } = makeSandbox();
    await sandbox.ensureBookmarkTree();
    await sandbox.ensureBookmarkTree();
    check('并发/重复 ensure 只拉一次 getTree', calls.getTree === 1);
    sandbox.invalidateBookmarkTree();
    await sandbox.ensureBookmarkTree();
    check('失效后重新拉取', calls.getTree === 2);
  }

  // ===== 3. 数据访问零 IPC =====
  console.log('[3] 零 IPC 数据访问');
  {
    const { sandbox, calls } = makeSandbox();
    await sandbox.ensureBookmarkTree();
    const children = await sandbox.getBookmarks('2');
    check('getBookmarks 返回子项', children.length === 2 && children[0].id === '3');
    const path = await sandbox.buildBreadcrumbPath('3');
    check('面包屑路径正确', path.length === 3 && path[0].title === '书签栏' && path[2].title === 'GitHub');
    const folderPath = await sandbox.getFolderPath('2');
    check('文件夹路径字符串正确', folderPath === '书签栏 › 开发工具');
    const all = await sandbox.getAllBookmarks();
    check('getAllBookmarks 展平且排除根', all.length === 6 && !all.some(b => b.id === '0'));
    check('展平项带 parentId', all.find(b => b.id === '3').parentId === '2');
    check('getChildren 零调用（原 N+1 路径）', calls.getChildren === 0);
    check('bookmarks.get 零调用（原面包屑路径）', calls.get === 0);
  }

  // ===== 4. 变更监听失效 =====
  console.log('[4] 变更监听');
  {
    const { sandbox, calls, listeners } = makeSandbox();
    sandbox.registerBookmarkTreeListeners();
    check('注册了 onRemoved 等监听', ['onCreated', 'onRemoved', 'onChanged', 'onMoved'].every(n => listeners[n].length === 1));
    await sandbox.ensureBookmarkTree();
    listeners.onRemoved.forEach(fn => fn('3'));   // 模拟外部删除
    await sandbox.ensureBookmarkTree();
    check('onRemoved 触发后索引失效并重建', calls.getTree === 2);
    // 幂等：重复注册不叠加
    sandbox.registerBookmarkTreeListeners();
    check('重复注册被拦截', listeners.onRemoved.length === 1);
  }

  // ===== 5. CRUD 后失效（delete） =====
  console.log('[5] CRUD 失效');
  {
    const { sandbox, calls } = makeSandbox();
    await sandbox.ensureBookmarkTree();
    sandbox.handleContextMenuAction('delete', { id: '3', title: 'GitHub', url: 'https://github.com' });
    await sleep(30);
    await sandbox.ensureBookmarkTree();
    check('删除成功后索引失效并重建', calls.getTree === 2);
  }

  // ===== 6. 书签栏根 ID =====
  console.log('[6] 书签栏根ID');
  {
    const { sandbox } = makeSandbox();
    await sandbox.ensureBookmarkTree();
    check('取根节点第一个子节点', sandbox.getBookmarkBarRootIdFromTree() === '1');
  }

  // ===== 7. 树缺失时 getBookmarks 回退 API =====
  console.log('[7] API 回退');
  {
    const { sandbox, calls } = makeSandbox();
    sandbox.chrome.bookmarks.getTree = (cb) => { calls.getTree++; setTimeout(() => cb(null), 0); }; // 树为空
    const children = await sandbox.getBookmarks('2');
    check('树不可用时回退 getChildren', calls.getChildren === 1 && Array.isArray(children));
  }

  const failed = results.filter(r => !r).length;
  console.log(`\n===== ${results.length - failed}/${results.length} 通过 =====`);
  if (failed) { console.log('失败项数:', failed); process.exit(1); }
})().catch(e => { console.error('测试执行异常:', e); process.exit(1); });
