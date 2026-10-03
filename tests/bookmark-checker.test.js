// bookmark-checker 核心逻辑冒烟测试（Node + vm，桩掉浏览器 API）
// 同时加载共享模块 bookmark-tree.js，getAllBookmarks 走真实树路径
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const DIR = path.join(__dirname, '..', 'chrome-menu-optimizer');
const CHECKER_FILE = path.join(DIR, 'bookmark-checker.js');
const TREE_FILE = path.join(DIR, 'bookmark-tree.js');
const I18N_FILE = path.join(DIR, 'i18n.js');

// 默认书签树（测试可通过 sandbox.__tree 覆盖）
const DEFAULT_TREE = [{
  id: '0', title: '',
  children: [{ id: '1', title: '书签栏', children: [
    { id: 'a1', title: 'GitHub', url: 'https://github.com' },
    { id: 'a2', title: 'Google', url: 'https://www.google.com' }
  ]}]
}];

// 生成包含 count 个书签的树（id/url 带前缀，便于断言）
function treeWith(count, prefix) {
  return [{
    id: '0', title: '',
    children: [{ id: '1', title: '书签栏', children:
      Array.from({ length: count }, (_, i) => ({ id: prefix + i, title: prefix + i, url: 'https://' + prefix + '.com/' + i }))
    }]
  }];
}

function makeSandbox(responder) {
  const calls = { showProgress: 0, showResults: 0, clear: 0, progress: 0, alerts: [], getTree: 0 };
  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    calls,
    setTimeout,
    clearTimeout,
    AbortController,
    Date,
    Math,
    JSON,
    Map,
    Promise,
    URL,
    URLSearchParams,
    Array,
    Object,
    String,
    Number,
    RegExp,
    Error,
    alert: (m) => calls.alerts.push(m),
    confirm: () => true,
    location: { search: '', pathname: '/popup.html' },
    document: {
      readyState: 'complete',
      createElement: () => ({}),
      getElementById: () => null,
      querySelectorAll: () => [],
      querySelector: () => null,
      addEventListener() {},
      body: { appendChild() {} }
    },
    chrome: {
      runtime: {
        lastError: null,
        sendMessage: (msg, cb) => responder(msg, cb)
      },
      bookmarks: {
        getTree(cb) { calls.getTree++; setTimeout(() => cb(JSON.parse(JSON.stringify(sandbox.__tree || DEFAULT_TREE))), 0); },
        getChildren(id, cb) { setTimeout(() => cb([]), 0); },
        get(id, cb) { setTimeout(() => cb([{ id, title: 'x', parentId: '1' }]), 0); },
        remove(id, cb) { setTimeout(() => { if (cb) cb(); }, 0); },
        create(bm, cb) { setTimeout(() => cb({ id: 'new' }), 0); }
      },
      storage: { local: { get: async () => ({}), set: async () => {} } },
      tabs: { create: () => {} }
    },
    isDangerousUrl: (url) => { try { return ['javascript:', 'data:', 'vbscript:'].includes(new URL(url).protocol); } catch (e) { return false; } }
  };
  ['onCreated', 'onRemoved', 'onChanged', 'onMoved', 'onChildrenReordered', 'onImportEnded'].forEach(name => {
    sandbox.chrome.bookmarks[name] = { addListener: () => {} };
  });
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(I18N_FILE, 'utf8'), sandbox); // i18n 助手先于模块加载
  vm.runInContext(fs.readFileSync(TREE_FILE, 'utf8'), sandbox);
  vm.runInContext(fs.readFileSync(CHECKER_FILE, 'utf8'), sandbox);
  const checker = sandbox.bookmarkChecker;
  const tree = sandbox.BMV.bookmarkTree;
  checker.showProgressDialog = () => { calls.showProgress++; };
  checker.showResultsDialog = () => { calls.showResults++; };
  checker.clearResults = () => { calls.clear++; checker.results.clear(); };
  checker.updateProgress = () => { calls.progress++; };
  return { sandbox, checker, calls, tree };
}

const results = [];
function check(name, cond) {
  results.push({ name, pass: !!cond });
  console.log((cond ? '  PASS ' : '  FAIL ') + name);
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  // ===== 1. _classifyResult 分类 =====
  console.log('[1] _classifyResult');
  {
    const { checker } = makeSandbox(() => {});
    const c = (r) => checker._classifyResult(r).status;
    check('200 -> valid', c({ ok: true, status: 200 }) === 'valid');
    check('301 -> valid', c({ ok: true, status: 301 }) === 'valid');
    check('404 -> invalid', c({ ok: true, status: 404 }) === 'invalid');
    check('410 -> invalid', c({ ok: true, status: 410 }) === 'invalid');
    check('403 -> blocked（不再算无效）', c({ ok: true, status: 403 }) === 'blocked');
    check('401 -> blocked', c({ ok: true, status: 401 }) === 'blocked');
    check('500 -> server_error', c({ ok: true, status: 500 }) === 'server_error');
    check('opaque(0) -> reachable（不再算有效）', c({ ok: true, status: 0, opaque: true }) === 'reachable');
    check('timeout -> timeout', c({ ok: false, error: 'timeout' }) === 'timeout');
    check('网络错误 -> unreachable', c({ ok: false, error: 'Failed to fetch' }) === 'unreachable');
  }

  // ===== 2. escapeHtml 引号转义 =====
  console.log('[2] escapeHtml');
  {
    const { checker } = makeSandbox(() => {});
    const out = checker.escapeHtml('<img src=x onerror="alert(1)">&\'');
    check('不含裸 < >', !out.includes('<') && !out.includes('>'));
    check('不含裸双引号', !out.includes('"'));
    check('不含裸单引号', !out.includes("'"));
    check('& 已转义', out.includes('&amp;'));
    check('null/undefined 安全', checker.escapeHtml(null) === '' && checker.escapeHtml(undefined) === '');
  }

  // ===== 3. cancel 语义 =====
  console.log('[3] cancel 语义');
  {
    const { checker } = makeSandbox((msg, cb) => { setTimeout(() => cb({ ok: true, status: 200 }), 20); });
    const items = Array.from({ length: 30 }, (_, i) => ({ id: 'id' + i, url: 'https://x.com/' + i, title: 't' + i, parentId: '1' }));
    const p = checker.checkBatch(items, () => {});
    await sleep(50);
    checker.cancel();
    const outcome = await p;
    check('outcome.cancelled === true', outcome.cancelled === true);
    check('取消时已完成数 < 总数', outcome.checked < 30);
    const sizeAtCancel = checker.results.size;
    await sleep(300); // 等在途请求全部落地
    check('取消后 results 不再增长', checker.results.size === sizeAtCancel);
  }

  // ===== 4. 取消后立即重开（真实入口路径）：旧批次不污染新批次 =====
  console.log('[4] 取消后立即重开');
  {
    const { sandbox, checker, calls, tree } = makeSandbox((msg, cb) => { setTimeout(() => cb({ ok: true, status: 200 }), 20); });
    sandbox.__tree = treeWith(40, 'A'); tree.invalidateBookmarkTree();
    const pA = checker.checkAllBookmarks();
    await sleep(50);
    checker.cancelCheck();                       // 取消 A（isRunning 立即释放）
    sandbox.__tree = treeWith(5, 'B'); tree.invalidateBookmarkTree();
    const pB = checker.checkAllBookmarks();      // 立即重开 B
    await Promise.all([pA, pB]);
    await sleep(300);                            // 等 A 的在途请求全部落地
    const ids = Array.from(checker.results.keys());
    check('取消后可立即重开（B 未被拦截）', ids.length === 5);
    check('results 只含新批次 B*', ids.every(id => id.startsWith('B')));
    check('取消的 A 不弹结果框、B 弹一次', calls.showResults === 1);
    check('isRunning 最终复位', checker.isRunning === false);
  }

  // ===== 5. _runCheck：取消后不弹结果框 + isRunning 防重入 =====
  console.log('[5] _runCheck');
  {
    const { sandbox, checker, calls, tree } = makeSandbox((msg, cb) => { setTimeout(() => cb({ ok: true, status: 200 }), 20); });
    sandbox.__tree = treeWith(30, 'u'); tree.invalidateBookmarkTree();
    const p = checker.checkAllBookmarks();
    await sleep(60);
    checker.cancelCheck();
    await p;
    check('取消后不调用 showResultsDialog', calls.showResults === 0);
    check('finally 复位 isRunning', checker.isRunning === false);
  }
  {
    const { sandbox, checker, calls, tree } = makeSandbox((msg, cb) => { setTimeout(() => cb({ ok: true, status: 200 }), 10); });
    sandbox.__tree = treeWith(10, 'v'); tree.invalidateBookmarkTree();
    const p1 = checker.checkAllBookmarks();
    const p2 = checker.checkAllBookmarks(); // 立即第二次进入
    await Promise.all([p1, p2]);
    check('重复进入被 isRunning 拦截（只弹一次结果框）', calls.showResults === 1);
  }

  // ===== 6. 正常完成路径 =====
  console.log('[6] 正常完成');
  {
    const { sandbox, checker, calls, tree } = makeSandbox((msg, cb) => { setTimeout(() => cb({ ok: true, status: 200 }), 5); });
    sandbox.__tree = treeWith(8, 'w'); tree.invalidateBookmarkTree();
    await checker.checkAllBookmarks();
    check('完成后弹出结果框', calls.showResults === 1);
    check('results 数量正确', checker.results.size === 8);
    const s = checker.getStats();
    check('统计 valid=8', s.valid === 8 && s.total === 8);
  }

  // ===== 7. openCheckerPage 生成正确 URL =====
  console.log('[7] openCheckerPage');
  {
    const { sandbox, checker } = makeSandbox(() => {});
    const opened = [];
    sandbox.chrome.tabs.create = (opts) => opened.push(opts.url);
    sandbox.chrome.runtime.getURL = (p) => 'chrome-extension://test/' + p;
    checker.openCheckerPage({ bookmark: 'b1' });
    checker.openCheckerPage({ folder: 'f1' });
    checker.openCheckerPage();
    check('单个书签检查 URL 正确', opened[0] === 'chrome-extension://test/checker.html?bookmark=b1', opened[0]);
    check('文件夹检查 URL 正确', opened[1] === 'chrome-extension://test/checker.html?folder=f1', opened[1]);
    check('全量检查 URL 正确', opened[2] === 'chrome-extension://test/checker.html', opened[2]);
  }

  // ===== 汇总 =====
  const failed = results.filter(r => !r.pass);
  console.log(`\n===== ${results.length - failed.length}/${results.length} 通过 =====`);
  if (failed.length) { console.log('失败项:', failed.map(f => f.name).join(' | ')); process.exit(1); }
})().catch(e => { console.error('测试执行异常:', e); process.exit(1); });
