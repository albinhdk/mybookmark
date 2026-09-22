// 实证 chrome.bookmarks.move 在同级排序时的 index 语义（移除前 vs 移除后）
const PORT = 9333;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  // MV3 扩展为 service_worker 目标；Edge 内置组件扩展是 background_page 或 background.rollup.js，
  // 用 "URL 以 /background.js 结尾" 定位我们自己的扩展
  const bg = list.find(t => (t.type === 'service_worker' || t.type === 'background_page') && /\/background\.js$/.test(t.url));
  if (!bg) { console.log('NO_EXT_BG_TARGET'); console.log(list.map(t => t.type + ' ' + t.url).join('\n')); process.exit(1); }
  const extId = bg.url.match(/chrome-extension:\/\/([a-z]+)\//)[1];
  console.log('extId =', extId);

  const page = list.find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r));
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  });
  const send = (method, params) => new Promise((resolve) => {
    const i = ++id;
    pending.set(i, resolve);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: `(async () => { ${expr} })()`, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) return { __error: r.result.exceptionDetails.text + ' | ' + (r.result.exceptionDetails.exception?.description || '').split('\n')[0] };
    return r.result?.result?.value;
  };

  await send('Page.enable');
  await send('Page.navigate', { url: `chrome-extension://${extId}/checker.html` });
  await sleep(2500);

  const out = await ev(`
    const folder = await new Promise(res => chrome.bookmarks.create({ title: 'DnDTest' }, res));
    const mk = (t) => new Promise(res => chrome.bookmarks.create({ parentId: folder.id, title: t }, res));
    const A = await mk('A'), B = await mk('B'), C = await mk('C'), D = await mk('D');
    const titles = async () => (await new Promise(res => chrome.bookmarks.getChildren(folder.id, res))).map(n => n.title).join('');
    const before = await titles();
    // 关键用例：把 A（原 index 0）移动到 index 2
    await new Promise((res, rej) => chrome.bookmarks.move(A.id, { index: 2 }, () => chrome.runtime.lastError ? rej(chrome.runtime.lastError) : res()));
    const after = await titles();
    // 清理
    await new Promise(res => chrome.bookmarks.removeTree(folder.id, res));
    return { before, after, verdict: after === 'BCAD' ? 'POST-REMOVAL(不调整)' : (after === 'BACD' ? 'ADJUSTED(index--)' : 'other') };
  `);
  console.log('move(A, index=2) 于 [A,B,C,D]:', JSON.stringify(out));
  ws.close();
  process.exit(0);
})().catch(e => { console.error('EXC', e); process.exit(1); });
