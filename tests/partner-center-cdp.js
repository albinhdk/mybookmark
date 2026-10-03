// Partner Center 表单自动化：通过 CDP 驱动用户的 Edge（Profile 1，带登录态）。
// 前置：Edge 已用下列命令启动（本脚本只连接，不负责启动浏览器）：
//   msedge --remote-debugging-port=9335 --profile-directory="Profile 1" <url>
//
// 用法：
//   node tests/partner-center-cdp.js state        # 只报告当前页面状态 + 截图
//   node tests/partner-center-cdp.js eval "<js>"  # 在当前页面执行一段 JS 并打印结果
//   node tests/partner-center-cdp.js shot <name>  # 截图到 %TEMP%\pc-shots\<name>.png
//
// 填表流程按 docs/publish/edge-addons-guide.md 分步进行，每步验证后再下一步。
const PORT = 9335;
const SHOT_DIR = process.env.TEMP + '\\pc-shots';
const fs = require('fs');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function findPage() {
  for (let i = 0; i < 40; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const pages = list.filter(t => t.type === 'page');
      if (!pages.length) throw new Error('no page target');
      const pc = pages.find(t => /partner\.microsoft\.com|microsoft\.com\/dashboard/i.test(t.url));
      return pc || pages[pages.length - 1];
    } catch (e) { await sleep(500); }
  }
  throw new Error('无法连接 Edge CDP 端口 9335（Edge 是否已按前置命令启动？）');
}

(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const mode = process.argv[2] || 'state';
  const page = await findPage();
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  const pending = new Map();
  let msgId = 0;
  ws.addEventListener('message', (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  });
  const send = (method, params) => new Promise((resolve) => {
    const id = ++msgId;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
  await new Promise((r) => { ws.addEventListener('open', r); setTimeout(r, 5000); });
  await send('Runtime.enable');
  await send('Page.enable');
  await send('DOM.enable');

  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: `(async () => { ${expr} })()`, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) return { __error: r.result.exceptionDetails.text + ' ' + (r.result.exceptionDetails.exception?.description || '') };
    return r.result?.result?.value;
  };

  if (mode === 'nav') {
    await send('Page.navigate', { url: process.argv[3] || 'https://partner.microsoft.com/dashboard/microsoftedge/overview' });
    await sleep(5000);
    console.log('navigated: ' + process.argv[3]);
  } else if (mode === 'upload') {
    // upload [index] <file...>：按索引定位 input[type=file] 并写入文件
    let idx = 0;
    let fileArgs = process.argv.slice(3);
    if (/^\d+$/.test(fileArgs[0])) { idx = parseInt(fileArgs[0], 10); fileArgs = fileArgs.slice(1); }
    const doc = await send('DOM.getDocument', { depth: -1 });
    const q = await send('DOM.querySelectorAll', { nodeId: doc.result.root.nodeId, selector: 'input[type=file]' });
    const ids = q.result.nodeIds || [];
    if (!ids.length) throw new Error('找不到文件输入框');
    if (idx >= ids.length) throw new Error('索引超范围: ' + ids.length);
    await send('DOM.setFileInputFiles', { files: fileArgs, nodeId: ids[idx] });
    console.log('file set on input[' + idx + ']: ' + fileArgs.join(', '));
  } else if (mode === 'listing') {
    // Store listings → Details for <language> 页面：描述 + 搜索词（logo/截图用 upload 模式）
    const fsx = require('fs');
    const pathx = require('path');
    const SHOTS = pathx.join(__dirname, '..', 'docs', 'publish', 'screenshots');
    const descJson = JSON.stringify(fsx.readFileSync(pathx.join(SHOTS, 'store-description.txt'), 'utf8').trim()); const descText = '';
    const out = await evalJs(`
      const res = {};
      function deep(root, arr, tag) { const els = root.querySelectorAll('*'); for (const el of els) { if (!tag || el.tagName === tag) arr.push(el); if (el.shadowRoot) deep(el.shadowRoot, arr, tag); } }
      const tas = []; deep(document, tas, 'TEXTAREA');
      const descTa = tas.find(t => (t.id || '').indexOf('description') >= 0);
      if (!descTa) { res.desc = 'NOT_FOUND'; }
      else {
        const tset = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
        tset.call(descTa, ${descJson});
        descTa.dispatchEvent(new Event('input', { bubbles: true }));
        descTa.dispatchEvent(new Event('change', { bubbles: true }));
        res.desc = 'filled ' + descTa.value.length + ' chars';
      }
      const termInput = document.getElementById('last-search-item');
      const terms = ['书签', '书签管理', '书签搜索', '拼音搜索', 'pinyin', 'bookmark', '失效检测'];
      if (termInput) {
        const iset = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        let added = 0;
        for (const term of terms) {
          iset.call(termInput, term);
          termInput.dispatchEvent(new Event('input', { bubbles: true }));
          const addBtn = Array.from(document.querySelectorAll('button')).find(b => (b.innerText || '').trim() === 'Add Term');
          if (addBtn) { addBtn.click(); added++; await new Promise(r => setTimeout(r, 500)); }
        }
        res.terms = added + '/' + terms.length;
      } else res.terms = 'input-not-found';
      return res;
    `);
    console.log(JSON.stringify(out, null, 1));
  } else if (mode === 'eval') {
    const out = await evalJs(process.argv[3] || 'return 1');
    console.log(typeof out === 'string' ? out : JSON.stringify(out, null, 1));
  } else if (mode === 'insert') {
    // insert <selector> <text>：聚焦元素后用 Input.insertText 模拟真实输入（绕过 Angular 控件拦截）
    await evalJs(`document.querySelector(${JSON.stringify(process.argv[3])}).focus(); return document.activeElement.tagName;`);
    const chunk = process.argv.slice(4).join(' ');
    for (let i = 0; i < chunk.length; i += 200) {
      await send('Input.insertText', { text: chunk.slice(i, i + 200) });
      await sleep(150);
    }
    const val = await evalJs(`return document.querySelector(${JSON.stringify(process.argv[3])}).value.length;`);
    console.log('inserted, length now: ' + val);
  } else if (mode === 'click') {
    // click <x> <y>：真实鼠标点击坐标
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: parseFloat(process.argv[3]), y: parseFloat(process.argv[4]), button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: parseFloat(process.argv[3]), y: parseFloat(process.argv[4]), button: 'left', clickCount: 1 });
    console.log('clicked ' + process.argv[3] + ',' + process.argv[4]);
  } else if (mode === 'shot') {
    await send('Page.bringToFront');
    await sleep(500);
    const r = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`${SHOT_DIR}\\${process.argv[3] || 'shot'}.png`, Buffer.from(r.result.data, 'base64'));
    console.log(`${SHOT_DIR}\\${process.argv[3] || 'shot'}.png`);
  } else {
    // state：报告当前页面
    const rep = await evalJs(`
      const bt = [];
      document.querySelectorAll('button, a[role=button], input[type=submit]').forEach(b => {
        const t = (b.innerText || b.value || b.getAttribute('aria-label') || '').trim().replace(/\\s+/g, ' ');
        if (t && bt.length < 40) bt.push(t.slice(0, 60));
      });
      const inputs = [];
      document.querySelectorAll('input, textarea, select').forEach(i => {
        inputs.push({ type: i.type, id: i.id, name: i.name, ph: i.placeholder || '', val: (i.value || '').slice(0, 40) });
      });
      return {
        url: location.href,
        title: document.title,
        heading: (document.querySelector('h1,h2') || {}).innerText || '',
        buttons: bt.slice(0, 25),
        inputs: inputs.slice(0, 20),
        text: (document.body.innerText || '').replace(/\\n{2,}/g, '\\n').slice(0, 1200)
      };
    `);
    console.log(JSON.stringify(rep, null, 1));
    const r = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`${SHOT_DIR}\\state.png`, Buffer.from(r.result.data, 'base64'));
    console.log(`screenshot: ${SHOT_DIR}\\state.png`);
  }
  ws.close();
})().catch((e) => { console.error('失败:', e.message); process.exit(1); });
