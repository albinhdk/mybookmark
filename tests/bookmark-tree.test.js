// 共享书签树模块测试：vm 加载真实 bookmark-tree.js
// 覆盖：树构建、ensure 去重、零 IPC、变更监听失效、书签栏根ID、API 回退
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const FILE = path.join(__dirname, '..', 'chrome-menu-optimizer', 'bookmark-tree.js');

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

function makeSandbox() {
  const calls = { getTree: 0, getChildren: 0 };
  const listeners = {};
  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    calls,
    setTimeout,
    Date,
    Map,
    Promise,
    URL,
    chrome: {
      runtime: { lastError: null },
      bookmarks: {
        getTree(cb) { calls.getTree++; setTimeout(() => cb(JSON.parse(JSON.stringify(TREE))), 0); },
        getChildren(id, cb) { calls.getChildren++; setTimeout(() => cb([]), 0); }
      }
    }
  };
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
  // ===== 1. 模块挂载与树构建 =====
  console.log('[1] 模块挂载与树构建');
  {
    const { sandbox } = makeSandbox();
    check('挂载到 window.BMV.bookmarkTree', !!(sandbox.window.BMV && sandbox.BMV.bookmarkTree));
    const tree = sandbox.BMV.bookmarkTree.buildTreeIndex(TREE);
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
    const T = sandbox.BMV.bookmarkTree;
    await T.ensureBookmarkTree();
    await T.ensureBookmarkTree();
    check('重复 ensure 只拉一次 getTree', calls.getTree === 1);
    T.invalidateBookmarkTree();
    await T.ensureBookmarkTree();
    check('失效后重新拉取', calls.getTree === 2);
  }

  // ===== 3. 数据访问零 IPC =====
  console.log('[3] 零 IPC 数据访问');
  {
    const { sandbox, calls } = makeSandbox();
    const T = sandbox.BMV.bookmarkTree;
    await T.ensureBookmarkTree();
    const children = await T.getBookmarks('2');
    check('getBookmarks 返回子项', children.length === 2 && children[0].id === '3');
    const path = await T.buildBreadcrumbPath('3');
    check('面包屑路径正确', path.length === 3 && path[0].title === '书签栏' && path[2].title === 'GitHub');
    const folderPath = await T.getFolderPath('2');
    check('文件夹路径字符串正确', folderPath === '书签栏 › 开发工具');
    const all = await T.getAllBookmarks();
    check('getAllBookmarks 展平且排除根', all.length === 6 && !all.some(b => b.id === '0'));
    check('展平项带 parentId', all.find(b => b.id === '3').parentId === '2');
    check('getChildren 零调用（原 N+1 路径）', calls.getChildren === 0);
  }

  // ===== 4. 变更监听 =====
  console.log('[4] 变更监听');
  {
    const { sandbox, calls, listeners } = makeSandbox();
    const T = sandbox.BMV.bookmarkTree;
    T.registerBookmarkTreeListeners();
    check('注册了 onRemoved 等监听', ['onCreated', 'onRemoved', 'onChanged', 'onMoved'].every(n => listeners[n].length === 1));
    await T.ensureBookmarkTree();
    listeners.onRemoved.forEach(fn => fn('3'));
    await T.ensureBookmarkTree();
    check('onRemoved 触发后索引失效并重建', calls.getTree === 2);
    T.registerBookmarkTreeListeners();
    check('重复注册被拦截', listeners.onRemoved.length === 1);
  }

  // ===== 5. 书签栏根ID =====
  console.log('[5] 书签栏根ID');
  {
    const { sandbox } = makeSandbox();
    const T = sandbox.BMV.bookmarkTree;
    await T.ensureBookmarkTree();
    check('取根节点第一个子节点', T.getBookmarkBarRootId() === '1');
  }

  // ===== 6. 树缺失时 getBookmarks 回退 API =====
  console.log('[6] API 回退');
  {
    const { sandbox, calls } = makeSandbox();
    sandbox.chrome.bookmarks.getTree = (cb) => { calls.getTree++; setTimeout(() => cb(null), 0); };
    const children = await sandbox.BMV.bookmarkTree.getBookmarks('2');
    check('树不可用时回退 getChildren', calls.getChildren === 1 && Array.isArray(children));
  }

  // ===== 7. invalidate 幂等与并发 =====
  console.log('[7] invalidate 健壮性');
  {
    const { sandbox, calls } = makeSandbox();
    const T = sandbox.BMV.bookmarkTree;
    const p1 = T.ensureBookmarkTree();
    T.invalidateBookmarkTree(); // 加载中途失效
    await p1;
    await T.ensureBookmarkTree();
    check('加载中途失效后能重新拉取', calls.getTree === 2);
  }

  const failed = results.filter(r => !r).length;
  console.log(`\n===== ${results.length - failed}/${results.length} 通过 =====`);
  if (failed) process.exit(1);
})().catch(e => { console.error('测试执行异常:', e); process.exit(1); });
