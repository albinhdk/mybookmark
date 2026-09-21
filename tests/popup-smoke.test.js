// 浏览器级冒烟测试：通过 CDP 驱动 Edge 打开 popup.html（file:// 模式，走内置 mock 数据）
// 验证第三批重构：渲染 / 事件委托 / 防抖搜索 / 分批加载 / 右键菜单 / 无控制台报错
// 前置条件：Edge 已以下列命令启动（本脚本只负责连接）：
//   msedge --headless=new --remote-debugging-port=9333 --user-data-dir=%TEMP%\dsh-popup-smoke ^
//     --no-first-run file:///D:/workspace/mybookmark/chrome-menu-optimizer/popup.html
const PORT = 9333;
const POPUP_URL_MARK = 'popup.html';

const results = [];
function check(name, cond, extra) {
  results.push(cond);
  console.log((cond ? '  PASS ' : '  FAIL ') + name + (extra !== undefined ? ` -> ${extra}` : ''));
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  // 1. 等待 CDP 端口就绪
  let list = null;
  for (let i = 0; i < 20; i++) {
    try {
      list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      if (list.some(t => t.type === 'page' && t.url.includes(POPUP_URL_MARK))) break;
    } catch (e) { /* 端口未起 */ }
    await sleep(500);
  }
  const page = (list || []).find(t => t.type === 'page' && t.url.includes(POPUP_URL_MARK));
  if (!page) { console.log('找不到 popup.html 页面目标（Edge 是否已按前置条件启动？）'); process.exit(1); }

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  const pending = new Map();
  const consoleErrors = [];
  let msgId = 0;
  ws.addEventListener('message', (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      consoleErrors.push((msg.params.args || []).map(a => a.value || a.description || '').join(' '));
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      consoleErrors.push(msg.params.exceptionDetails.text + ' ' + (msg.params.exceptionDetails.exception?.description || ''));
    }
  });
  const send = (method, params) => new Promise((resolve) => {
    const id = ++msgId;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
  await new Promise((r, reject) => { ws.addEventListener('open', r); setTimeout(() => reject(new Error('ws 超时')), 5000); });
  await send('Runtime.enable');
  await send('Page.enable');
  // 重新加载页面，保证测试从初始状态开始（可重复运行）
  await send('Page.navigate', { url: page.url });
  await sleep(1500);

  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: `(async () => { ${expr} })()`, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) return { __error: r.result.exceptionDetails.text };
    return r.result?.result?.value;
  };

  // ===== 冒烟项 =====
  console.log('[A] 初始渲染（mock 数据）');
  const itemCount = await evalJs(`return document.querySelectorAll('.bookmark-item').length;`);
  check('根目录渲染 4 项（2 文件夹 + 2 书签）', itemCount === 4, itemCount);
  const nestedCount = await evalJs(`return document.querySelectorAll('.nested-item').length;`);
  check('文件夹预览嵌套项存在', nestedCount >= 5, nestedCount);
  const stats = await evalJs(`return document.getElementById('bookmark-count').textContent + '/' + document.getElementById('folder-count').textContent;`);
  check('统计数字正确（2 书签 / 2 文件夹）', stats === '2/2', stats);

  console.log('[B] 事件委托：点击书签');
  await evalJs(`window.__opened = []; window.open = (u) => { window.__opened.push(u); return null; };`);
  await evalJs(`document.querySelectorAll('.bookmark-link')[0].click(); return true;`);
  await sleep(200);
  const opened = await evalJs(`return window.__opened;`);
  check('点击书签链接触发了打开（委托生效）', Array.isArray(opened) && opened.length === 1, JSON.stringify(opened));

  console.log('[C] 事件委托：点击文件夹进入');
  await evalJs(`document.querySelector('.folder-title').click(); return true;`);
  await sleep(600);
  const afterFolder = await evalJs(`return { items: document.querySelectorAll('.bookmark-item').length, crumb: document.getElementById('breadcrumb').textContent };`);
  check('点击文件夹标题后重新渲染', afterFolder.items === 3 && afterFolder.crumb.includes('开发工具'), JSON.stringify(afterFolder));

  console.log('[D] 右键菜单委托');
  await evalJs(`
    const li = document.querySelector('.bookmark-item');
    li.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    return document.getElementById('context-menu').style.display;
  `);
  const menuDisplay = await evalJs(`return document.getElementById('context-menu').style.display;`);
  check('右键弹出菜单（委托生效）', menuDisplay === 'block', menuDisplay);

  console.log('[E] 搜索（防抖 + 委托渲染）');
  await evalJs(`
    const box = document.getElementById('search-box');
    box.value = 'git';
    box.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  `);
  await sleep(600); // 等 200ms 防抖 + 渲染
  const searchCount = await evalJs(`return document.querySelectorAll('.search-result-item').length;`);
  check('搜索 "git" 命中 1 条（GitHub）', searchCount === 1, searchCount);
  const crumbSearch = await evalJs(`return document.getElementById('breadcrumb').textContent;`);
  check('面包屑切换为搜索状态', crumbSearch.includes('搜索结果'), crumbSearch);

  console.log('[F] 分批加载（300 个大文件夹）');
  await evalJs(`
    // 构造 300 个书签的大树并替换 mock
    const big = [{ id: '0', title: '', children: [{ id: '1', title: '书签栏', children:
      Array.from({ length: 300 }, (_, i) => ({ id: 'b' + i, title: '书签' + i, url: 'https://example.com/' + i }))
    }] }];
    chrome.bookmarks.getTree = (cb) => cb(big);
    BMV.bookmarkTree.invalidateBookmarkTree();
    return true;
  `);
  await evalJs(`await renderBookmarks('1'); return true;`);
  await sleep(400);
  const firstBatch = await evalJs(`return { items: document.querySelectorAll('.bookmark-item:not(.load-more-item)').length, loadMore: !!document.querySelector('.load-more-item') };`);
  check('首批只渲染 100 项', firstBatch.items === 100, firstBatch.items);
  check('出现"加载更多"按钮', firstBatch.loadMore === true);
  await evalJs(`document.querySelector('.load-more-item').click(); return true;`);
  await sleep(400);
  const secondBatch = await evalJs(`return document.querySelectorAll('.bookmark-item:not(.load-more-item)').length;`);
  check('点击后追加到 200 项', secondBatch === 200, secondBatch);
  const moreText = await evalJs(`return document.querySelector('.load-more-item')?.textContent || '';`);
  check('加载更多提示剩余数量', moreText.includes('还有 100 个'), moreText);

  console.log('[G] 键盘导航');
  await evalJs(`
    const box = document.getElementById('search-box');
    box.value = '';
    box.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  `);
  await sleep(500); // 等恢复文件夹视图
  await evalJs(`
    document.getElementById('search-box').focus();
    document.getElementById('search-box').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    return true;
  `);
  const kbFocus = await evalJs(`return { has: !!document.querySelector('.keyboard-focus'), tag: document.querySelector('.keyboard-focus')?.className || '' };`);
  check('↓ 键在书签项间移动焦点', kbFocus.has === true, kbFocus.tag);
  await evalJs(`
    const box = document.getElementById('search-box');
    box.value = 'git';
    box.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  `);
  await sleep(500);
  await evalJs(`
    document.getElementById('search-box').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    return true;
  `);
  await sleep(500);
  const afterEsc = await evalJs(`return { value: document.getElementById('search-box').value, items: document.querySelectorAll('.bookmark-item').length, results: document.querySelectorAll('.search-result-item').length };`);
  // 步骤 C 已进入"开发工具"文件夹（3 项），Esc 后应恢复到该文件夹视图
  check('Esc 清空搜索并恢复视图', afterEsc.value === '' && afterEsc.results === 0 && afterEsc.items === 3, JSON.stringify(afterEsc));

  console.log('[H] 右键菜单定位（fixed + 视口坐标）');
  await evalJs(`
    const li = document.querySelector('.bookmark-item');
    const r = li.getBoundingClientRect();
    li.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 5, clientY: r.top + 5 }));
    const menu = document.getElementById('context-menu');
    const mr = menu.getBoundingClientRect();
    return { pos: getComputedStyle(menu).position, inView: mr.left >= 0 && mr.top >= 0 && mr.right <= window.innerWidth && mr.bottom <= window.innerHeight };
  `);
  const menuPos = await evalJs(`return { pos: getComputedStyle(document.getElementById('context-menu')).position };`);
  check('菜单为 fixed 定位', menuPos.pos === 'fixed', menuPos.pos);

  console.log('[J] 检查器独立页（checker.html，不再受 popup 生命周期影响）');
  await send('Page.navigate', { url: 'file:///D:/workspace/mybookmark/chrome-menu-optimizer/checker.html' });
  await sleep(1000);
  // 轮询等待检查完成（结果表格出现）；网络可达与否都会产生结果行
  let rows = 0;
  for (let i = 0; i < 40; i++) {
    rows = await evalJs(`return document.querySelectorAll('.checker-table tbody tr').length;`) || 0;
    if (rows > 0) break;
    await sleep(500);
  }
  check('检查器自动启动并渲染结果表格', rows === 7, rows);
  const checkerSummary = await evalJs(`return { dialog: !!document.getElementById('checker-dialog'), summary: (document.querySelector('.checker-summary')?.textContent || '').trim(), recheck: !!document.getElementById('checker-recheck-btn'), restore: !!document.getElementById('checker-restore-btn') };`);
  check('结果对话框含统计/重新检查/恢复备份', checkerSummary.dialog === true && checkerSummary.recheck === true && checkerSummary.restore === true, JSON.stringify(checkerSummary));
  check('统计行包含有效计数', /有效/.test(checkerSummary.summary), checkerSummary.summary);

  console.log('[K] 无控制台错误');
  check('加载与交互全程无 JS 错误', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

  ws.close();
  const failed = results.filter(r => !r).length;
  console.log(`\n===== ${results.length - failed}/${results.length} 通过 =====`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('冒烟测试异常:', e); process.exit(1); });
