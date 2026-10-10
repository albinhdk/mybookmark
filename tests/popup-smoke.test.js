// 浏览器级冒烟测试：通过 CDP 驱动 Edge 打开 popup.html（file:// 模式，走内置 mock 数据）
// 验证第三批重构：渲染 / 事件委托 / 防抖搜索 / 分批加载 / 右键菜单 / 无控制台报错，
// 以及拖拽移动（拖入文件夹 / 网格内排序 / 面包屑放置，合成 DragEvent 驱动真实委托链）
// 前置条件：Edge 已以下列命令启动（本脚本只负责连接）：
//   msedge --headless=new --remote-debugging-port=9333 --user-data-dir=%TEMP%\dsh-popup-smoke ^
//     --no-first-run file:///D:/workspace/mybookmark/chrome-menu-optimizer/popup.html
const PORT = 9333;
const POPUP_URL = 'file:///D:/workspace/mybookmark/chrome-menu-optimizer/popup.html';
const CHECKER_URL = 'file:///D:/workspace/mybookmark/chrome-menu-optimizer/checker.html';

const results = [];
function check(name, cond, extra) {
  results.push(cond);
  console.log((cond ? '  PASS ' : '  FAIL ') + name + (extra !== undefined ? ` -> ${extra}` : ''));
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  // 1. 等待 CDP 端口就绪；连接任意页面目标（上次运行可能停在 checker.html）
  let list = null;
  for (let i = 0; i < 20; i++) {
    try {
      list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      if (list.some(t => t.type === 'page')) break;
    } catch (e) { /* 端口未起 */ }
    await sleep(500);
  }
  // 优先连接我们的页面目标（popup.html / checker.html）；
  // 都没有时（比如停在 sync-confirmation 页）取首个页面目标，由后续 Page.navigate 纠正
  const ourPage = (list || []).find(t => t.type === 'page' && (t.url.includes('popup.html') || t.url.includes('checker.html')));
  const page = ourPage || (list || []).find(t => t.type === 'page');
  if (!page) { console.log('找不到页面目标（Edge 是否已按前置条件启动？）'); process.exit(1); }

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
  await send('Page.navigate', { url: POPUP_URL });
  await sleep(1200);
  // 清空 localStorage（mock storage 的后备），保证默认值断言确定性
  await send('Runtime.evaluate', { expression: 'localStorage.clear()' });
  await send('Page.navigate', { url: POPUP_URL });
  await sleep(1500);

  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: `(async () => { ${expr} })()`, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) return { __error: r.result.exceptionDetails.text };
    return r.result?.result?.value;
  };

  // 轮询等待页面条件满足（页面重载后元素就绪比固定 sleep 可靠）
  async function waitFor(condFn, timeoutMs, label) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      let ok = false;
      try { ok = await condFn(); } catch (e) { ok = false; }
      if (ok) return true;
      await sleep(300);
    }
    const diag = await evalJs(`return { href: location.href, ready: document.readyState, hasRow: !!document.getElementById('view-settings'), body: (document.body ? document.body.innerHTML.length : -1) };`);
    console.log(`  [waitFor 超时] ${label}: ${JSON.stringify(diag)}`);
    return false;
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
  const rowHiddenInSearch = await evalJs(`return document.getElementById('view-settings').style.display;`);
  check('搜索时视图设置行隐藏', rowHiddenInSearch === 'none', rowHiddenInSearch);
  await evalJs(`
    const box = document.getElementById('search-box');
    box.value = '';
    box.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  `);
  await sleep(600);
  const rowRestored = await evalJs(`return document.getElementById('view-settings').style.display;`);
  check('清空搜索后设置行恢复', rowRestored !== 'none', rowRestored);

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

  console.log('[I] 视图设置（列数可配置：popup 定宽 800px，卡片动态均分）');
  // 重载页面：恢复原始 mock 树（[F] 替换成了 300 条大数据树）与默认设置，
  // 并回到根目录视图（预览断言需要根视图里的文件夹卡片）
  await send('Page.navigate', { url: POPUP_URL });
  await waitFor(() => evalJs(`return !!document.getElementById('setting-columns') && !!document.querySelector('.bookmark-grid');`), 8000, '视图设置行');
  const geom = () => evalJs(`
    const card = document.querySelector('.bookmark-item');
    const grid = document.querySelector('.bookmark-grid');
    return {
      bodyW: document.body.style.width,
      cssBodyW: getComputedStyle(document.body).width,
      tracks: getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length,
      cardW: card ? getComputedStyle(card).width : null,
      bodyOverflow: document.body.scrollWidth - document.body.clientWidth
    };
  `);
  const setDefaults = await evalJs(`return { row: !!document.getElementById('view-settings'), columns: document.getElementById('setting-columns').value, preview: document.getElementById('setting-preview').value };`);
  check('设置行存在且默认 3 列 / 5 预览', setDefaults.row === true && setDefaults.columns === '3' && setDefaults.preview === '5', JSON.stringify(setDefaults));
  const g3 = await geom();
  check('popup 定宽 800px（浏览器上限），默认 3 列 3 轨道、内容不溢出',
    g3.cssBodyW === '800px' && g3.tracks === 3 && g3.bodyOverflow <= 0, JSON.stringify(g3));
  const cardW3 = parseFloat(g3.cardW);
  // 改列数为 2 → 2 轨道、卡片变宽（动态均分）
  await evalJs(`const s = document.getElementById('setting-columns'); s.value = '2'; s.dispatchEvent(new Event('change', { bubbles: true })); return true;`);
  await sleep(400);
  const g2 = await geom();
  check('选 2 列：2 轨道、卡片动态变宽、宽度仍是 800px、不溢出',
    g2.tracks === 2 && g2.cssBodyW === '800px' && parseFloat(g2.cardW) > cardW3 && g2.bodyOverflow <= 0, JSON.stringify(g2));
  // 改列数为 5 → 5 轨道、卡片变窄
  await evalJs(`const s = document.getElementById('setting-columns'); s.value = '5'; s.dispatchEvent(new Event('change', { bubbles: true })); return true;`);
  await sleep(400);
  const g5 = await geom();
  check('选 5 列：5 轨道、卡片动态变窄、宽度仍是 800px、不溢出',
    g5.tracks === 5 && g5.cssBodyW === '800px' && parseFloat(g5.cardW) < cardW3 && g5.bodyOverflow <= 0, JSON.stringify(g5));
  const hint5 = await evalJs(`return document.getElementById('view-settings-hint').textContent;`);
  check('提示文案反映当前列数', hint5.includes('5 列'), hint5);
  // 回到 2 列继续后续断言
  await evalJs(`const s = document.getElementById('setting-columns'); s.value = '2'; s.dispatchEvent(new Event('change', { bubbles: true })); return true;`);
  await sleep(400);
  // 预览改为 0 → 嵌套预览消失
  await evalJs(`const s = document.getElementById('setting-preview'); s.value = '0'; s.dispatchEvent(new Event('change', { bubbles: true })); return true;`);
  await sleep(500);
  const nested0 = await evalJs(`return { nested: document.querySelectorAll('.nested-item').length, more: document.querySelectorAll('.more-items-link').length };`);
  check('预览=0 时嵌套项与"还有X个"都消失', nested0.nested === 0 && nested0.more === 0, JSON.stringify(nested0));
  // 预览改为 3 → 每个文件夹卡片最多 3 个嵌套项
  await evalJs(`const s = document.getElementById('setting-preview'); s.value = '3'; s.dispatchEvent(new Event('change', { bubbles: true })); return true;`);
  await sleep(500);
  const nested3 = await evalJs(`
    const lists = Array.from(document.querySelectorAll('.nested-list'));
    return { lists: lists.length, maxItems: Math.max(0, ...lists.map(l => l.querySelectorAll('.nested-item').length)) };
  `);
  check('预览=3 时每卡嵌套 ≤3', nested3.lists === 2 && nested3.maxItems <= 3, JSON.stringify(nested3));
  // 持久化：reload 后仍是 2 列 / 3 预览
  await send('Page.navigate', { url: POPUP_URL });
  await waitFor(() => evalJs(`return !!document.getElementById('setting-columns') && !!document.querySelector('.bookmark-grid');`), 8000, '持久化重载');
  const persisted = await evalJs(`return { columns: document.getElementById('setting-columns').value, preview: document.getElementById('setting-preview').value, tracks: getComputedStyle(document.querySelector('.bookmark-grid')).gridTemplateColumns.split(' ').filter(Boolean).length };`);
  check('reload 后设置保持（2 列 / 3 预览）', persisted.columns === '2' && persisted.preview === '3' && persisted.tracks === 2, JSON.stringify(persisted));

  console.log('[L] 拖拽移动（HTML5 DnD：拖入文件夹 / 网格内排序 / 面包屑放置）');
  await send('Page.navigate', { url: POPUP_URL });
  await waitFor(() => evalJs(`return document.querySelectorAll('.bookmark-item').length >= 4 && !!document.querySelector('.bookmark-grid');`), 8000, '拖拽分区');
  // 合成 DnD 事件：DragEvent/DataTransfer 可在页面内构造，事件冒泡触发容器上的统一委托
  await evalJs(`
    window.__dnd = {
      fire: (el, type, x, y) => {
        const e = new DragEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, dataTransfer: new DataTransfer() });
        el.dispatchEvent(e);
        return { cls: el.className, dropEffect: e.dataTransfer.dropEffect };
      },
      center: (sel) => {
        const el = document.querySelector(sel);
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }
    };
    return true;
  `);
  const getChildren = (id) => evalJs(`return new Promise(res => chrome.bookmarks.getChildren('${id}', c => res(c.map(n => n.title))));`);
  const itemId = (sel) => evalJs(`return Array.from(document.querySelectorAll('${sel}')).map(li => li.dataset.bookmarkId).join(',');`);

  // L1 只有专用手柄可启动拖拽，链接区域不再隐式成为拖拽源
  const dragAffordance = await evalJs(`
    const card = document.querySelector('.bookmark-item[data-bookmark-id="2"]');
    const handle = card.querySelector('.bookmark-drag-handle');
    const linkEvent = window.__dnd.fire(card.querySelector('.bookmark-link'), 'dragstart', 0, 0);
    const linkBlocked = !card.classList.contains('dnd-dragging') && dndState === null;
    const handleEvent = window.__dnd.fire(handle, 'dragstart', 0, 0);
    return { cardDraggable: card.draggable, handleDraggable: handle.draggable, linkBlocked, dragging: card.classList.contains('dnd-dragging') };
  `);
  check('整张卡片不可拖动、专用手柄可拖动', dragAffordance.cardDraggable === false && dragAffordance.handleDraggable === true, JSON.stringify(dragAffordance));
  check('从书签链接启动拖拽会被阻止', dragAffordance.linkBlocked === true, JSON.stringify(dragAffordance));

  // L2 拖拽源置灰（等 transition: all 0.2s 过渡完再读计算样式）
  const ds = await evalJs(`
    const card = document.querySelector('.bookmark-item[data-bookmark-id="2"]');
    window.__dnd.fire(card.querySelector('.bookmark-drag-handle'), 'dragstart', 0, 0);
    return { dragging: card.classList.contains('dnd-dragging') };
  `);
  check('dragstart 后被拖项标记', ds.dragging === true, JSON.stringify(ds));
  await sleep(350);
  const opacity = await evalJs(`return getComputedStyle(document.querySelector('.dnd-dragging')).opacity;`);
  check('被拖项视觉置灰（opacity < 1）', parseFloat(opacity) < 1, opacity);

  // L3 悬停文件夹卡片 = 拖入高亮
  // 注：合成 DragEvent 下 dataTransfer.dropEffect 赋值不会生效（真实拖拽中正常），
  // 放置反馈以 class 断言为准
  const over = await evalJs(`
    const c = window.__dnd.center('.bookmark-item[data-bookmark-id="6"]');
    const res = window.__dnd.fire(document.querySelector('.bookmark-item[data-bookmark-id="6"]'), 'dragover', c.x, c.y);
    return res;
  `);
  check('悬停文件夹卡片高亮为"拖入"目标', over.cls.includes('dnd-drop-into'), JSON.stringify(over));

  // L4 拖到自己头上：无放置反馈
  const selfOver = await evalJs(`
    const c = window.__dnd.center('.bookmark-item[data-bookmark-id="2"]');
    const res = window.__dnd.fire(document.querySelector('.bookmark-item[data-bookmark-id="2"]'), 'dragover', c.x, c.y);
    return res;
  `);
  check('拖到自己头上无放置反馈', !selfOver.cls.includes('dnd-drop-into') && !selfOver.cls.includes('dnd-drop-invalid'), JSON.stringify(selfOver));

  // L5 松手 → 开发工具 移入 搜索引擎，当前视图刷新
  await evalJs(`
    const c = window.__dnd.center('.bookmark-item[data-bookmark-id="6"]');
    window.__dnd.fire(document.querySelector('.bookmark-item[data-bookmark-id="6"]'), 'drop', c.x, c.y);
    return true;
  `);
  await waitFor(async () => (await getChildren('6')).includes('开发工具'), 5000, '移入搜索引擎');
  check('拖入文件夹：开发工具 移入 搜索引擎', (await getChildren('6')).includes('开发工具'), (await getChildren('6')).join(','));
  const barAfterMove = await itemId('.bookmark-item:not(.dnd-dragging)');
  check('移出后当前视图刷新（剩 3 项）', barAfterMove === '6,9,10', barAfterMove);

  // L6 网格内排序：YouTube(9) 拖到 Wikipedia(10) 右半侧 → 插入其后
  const reorder = await evalJs(`
    window.__dnd.fire(document.querySelector('.bookmark-item[data-bookmark-id="9"] .bookmark-drag-handle'), 'dragstart', 0, 0);
    const wiki = document.querySelector('.bookmark-item[data-bookmark-id="10"]');
    const r = wiki.getBoundingClientRect();
    const res = window.__dnd.fire(wiki, 'dragover', r.right - 5, r.top + r.height / 2);
    return res;
  `);
  check('悬停卡片右半出现"插入其后"指示', reorder.cls.includes('dnd-drop-after'), reorder.cls);
  await evalJs(`
    const wiki = document.querySelector('.bookmark-item[data-bookmark-id="10"]');
    const r = wiki.getBoundingClientRect();
    window.__dnd.fire(wiki, 'drop', r.right - 5, r.top + r.height / 2);
    return true;
  `);
  await waitFor(async () => (await getChildren('1')).join(',') === '搜索引擎,Wikipedia,YouTube', 5000, '排序落定');
  check('同父排序：YouTube 移到 Wikipedia 之后（实证 index 语义）', (await getChildren('1')).join(',') === '搜索引擎,Wikipedia,YouTube', (await getChildren('1')).join(','));

  // L7 面包屑放置：进入 搜索引擎 › 开发工具，拖 GitHub 到面包屑"搜索引擎"项
  await evalJs(`document.querySelector('.bookmark-item[data-bookmark-id="6"] .folder-title').click(); return true;`);
  await waitFor(() => evalJs(`return !!document.querySelector('.bookmark-item[data-bookmark-id="2"]');`), 5000, '进入搜索引擎');
  await evalJs(`document.querySelector('.bookmark-item[data-bookmark-id="2"] .folder-title').click(); return true;`);
  await waitFor(() => evalJs(`return !!document.querySelector('.bookmark-item[data-bookmark-id="3"]');`), 5000, '进入开发工具');
  const crumb = await evalJs(`
    window.__dnd.fire(document.querySelector('.bookmark-item[data-bookmark-id="3"] .bookmark-drag-handle'), 'dragstart', 0, 0);
    const link = document.querySelector('#breadcrumb a[data-folder-id="6"]');
    const r = link.getBoundingClientRect();
    const res = window.__dnd.fire(link, 'dragover', r.left + 5, r.top + r.height / 2);
    return res;
  `);
  check('面包屑目录项可作拖放目标', crumb.cls.includes('dnd-crumb-drop'), JSON.stringify(crumb));
  await evalJs(`
    const link = document.querySelector('#breadcrumb a[data-folder-id="6"]');
    const r = link.getBoundingClientRect();
    window.__dnd.fire(link, 'drop', r.left + 5, r.top + r.height / 2);
    return true;
  `);
  await waitFor(async () => (await getChildren('6')).includes('GitHub'), 5000, 'GitHub 移入搜索引擎');
  check('拖到面包屑：GitHub 移入 搜索引擎', (await getChildren('6')).includes('GitHub'), (await getChildren('6')).join(','));

  // L8 守卫（视图停在"开发工具"内，面包屑为 书签栏 › 搜索引擎 › 开发工具）：
  // ① 拖到当前所在目录=原地放下，无反馈；② 循环校验在页面内真实生效。
  // 注：单层网格 UI 里"文件夹拖入自己后代"的目标永不同屏（卡片只在父级可见、后代
  // 只在其内部可见），UI 层不可达；该路径由 dnd.test.js 单元测试直接覆盖，这里
  // 断言真实挂载的 isSelfOrAncestorOf（此时 搜索引擎 已是 开发工具 的祖先）。
  const guard = await evalJs(`
    window.__dnd.fire(document.querySelector('.bookmark-item[data-bookmark-id="4"] .bookmark-drag-handle'), 'dragstart', 0, 0);
    const link = document.querySelector('#breadcrumb a[data-folder-id="2"]');
    const r = link.getBoundingClientRect();
    const res = window.__dnd.fire(link, 'dragover', r.left + 5, r.top + r.height / 2);
    return { crumb: res.cls, cycle: BMV.bookmarkTree.isSelfOrAncestorOf('6', '2') };
  `);
  check('拖到当前所在目录（原地）无放置反馈', !guard.crumb.includes('dnd-crumb-drop'), JSON.stringify(guard));
  check('循环守卫在页面内生效（搜索引擎 是 开发工具 祖先）', guard.cycle === true, JSON.stringify(guard));

  // L9 dragend 复位 + 搜索结果项不参与拖拽
  const ended = await evalJs(`
    const card = document.querySelector('.bookmark-item[data-bookmark-id="4"]');
    window.__dnd.fire(card, 'dragend', 0, 0);
    return { dragging: card.classList.contains('dnd-dragging') };
  `);
  check('dragend 复位拖拽态', ended.dragging === false, JSON.stringify(ended));
  await evalJs(`
    const box = document.getElementById('search-box');
    box.value = 'git';
    box.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  `);
  await sleep(600);
  const noDrag = await evalJs(`
    const li = document.querySelector('.search-result-item');
    return li ? li.draggable : null;
  `);
  check('搜索结果项不参与拖拽', noDrag === false, String(noDrag));

  console.log('[J] 检查器独立页（checker.html，不再受 popup 生命周期影响）');
  await send('Page.navigate', { url: CHECKER_URL });
  await waitFor(() => evalJs(`return document.querySelectorAll('.checker-table tbody tr').length > 0;`), 20000, '检查器结果');
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
  const checkerInteractions = await evalJs(`
    const dialog = document.getElementById('checker-dialog');
    dialog.querySelector('.checker-overlay').click();
    const remainsAfterOverlay = !!document.getElementById('checker-dialog');
    const link = document.querySelector('.checker-td-url a[href^="http"]');
    let createdWindow = null;
    const originalWindows = chrome.windows;
    chrome.windows = { create: (options, callback) => { createdWindow = options; if (callback) callback(); } };
    if (link) link.click();
    chrome.windows = originalWindows;
    return { remainsAfterOverlay, createdWindow, linkUrl: link && link.getAttribute('href') };
  `);
  check('点击检查结果空白遮罩不关闭对话框', checkerInteractions.remainsAfterOverlay === true, JSON.stringify(checkerInteractions));
  check('点击结果网址通过 windows.create 打开独立窗口', !!checkerInteractions.createdWindow && checkerInteractions.createdWindow.url === checkerInteractions.linkUrl, JSON.stringify(checkerInteractions.createdWindow));

  console.log('[K] 无控制台错误');
  check('加载与交互全程无 JS 错误', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

  ws.close();
  const failed = results.filter(r => !r).length;
  console.log(`\n===== ${results.length - failed}/${results.length} 通过 =====`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('冒烟测试异常:', e); process.exit(1); });
