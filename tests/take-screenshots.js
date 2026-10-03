// 商店截图工具：驱动 Edge headless 以 file:// 模式打开 popup.html / checker.html
// （mock-chrome-api.js 提供模拟书签数据），产出 Microsoft Edge Add-ons / Chrome
// Web Store 上架用的原始截图素材 + 300x300 logo。
//
// 运行：node tests/take-screenshots.js
// 输出：docs/publish/screenshots/_raw-*.png（随后由 Pillow 合成为标准尺寸，
//       见 docs/publish/edge-addons-guide.md 的上架材料清单）
//
// 说明：
// - popup 自然宽度 800px（浏览器弹窗硬上限），1280x800 画布需后期合成；
// - checker 页面在 file:// 下不会真正联网（未挂 background.js），拍初始状态即可；
// - 本脚本自行启动 Edge，用户无需提前打开任何调试端口。
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9334;
const OUT_DIR = path.join(__dirname, '..', 'docs', 'publish', 'screenshots');
const POPUP_URL = 'file:///D:/workspace/mybookmark/chrome-menu-optimizer/popup.html';
const CHECKER_URL = 'file:///D:/workspace/mybookmark/chrome-menu-optimizer/checker.html';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function launchEdge() {
  const profile = path.join(os.tmpdir(), 'dsh-shots-' + process.pid);
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { /* 目录可能被占用 */ }
  // SHOT_LANG=en-US 时以英文界面启动（--lang 影响 navigator.language，用于验证 i18n 切换）
  const langArgs = process.env.SHOT_LANG ? [`--lang=${process.env.SHOT_LANG}`] : [];
  const child = spawn(EDGE, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    ...langArgs,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    'about:blank'
  ], { stdio: 'ignore' });
  const cleanup = () => { try { child.kill(); } catch (e) { /* 已退出 */ } };
  process.on('exit', cleanup);
  process.on('SIGINT', () => { cleanup(); process.exit(130); });
  return child;
}

async function connectCdp() {
  let list = null;
  for (let i = 0; i < 30; i++) {
    try {
      list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find(t => t.type === 'page');
      if (page) return page;
    } catch (e) { /* 端口未起 */ }
    await sleep(500);
  }
  throw new Error('无法连接 Edge CDP 端口');
}

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const SFX = process.env.SHOT_LANG ? '-' + process.env.SHOT_LANG : '';
  const browser = launchEdge();
  const page = await connectCdp();
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
  await new Promise((r) => { ws.addEventListener('open', r); setTimeout(() => r(), 5000); });
  await send('Runtime.enable');
  await send('Page.enable');

  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: `(async () => { ${expr} })()`, returnByValue: true, awaitPromise: true });
    return r.result?.result?.value;
  };
  const waitFor = async (condFn, timeoutMs, label) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      let ok = false;
      try { ok = await condFn(); } catch (e) { ok = false; }
      if (ok) return true;
      await sleep(250);
    }
    console.log(`  [waitFor 超时] ${label}`);
    return false;
  };
  const setViewport = (w, h) => send('Emulation.setDeviceMetricsOverride', {
    width: w, height: h, deviceScaleFactor: 1, mobile: false
  });
  const shoot = async (file) => {
    const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    if (!r.result || !r.result.data) throw new Error('截图失败: ' + JSON.stringify(r).slice(0, 200));
    fs.writeFileSync(path.join(OUT_DIR, file), Buffer.from(r.result.data, 'base64'));
    console.log(`  已保存 ${file}`);
  };
  const openClean = async (url, needle, label) => {
    await send('Page.navigate', { url });
    await evalJs('localStorage.clear()'); // 保证默认视图设置（3 列 / 预览 5 个）
    await send('Page.navigate', { url });
    await waitFor(() => evalJs(needle), 15000, label);
  };

  // ===== 截图 1：popup 默认网格 =====
  console.log('[1/4] popup 默认网格');
  await openClean(POPUP_URL, `return document.querySelectorAll('.bookmark-item').length >= 4;`, 'popup 渲染');
  await sleep(600); // 等图标/favicon 加载与布局稳定
  await setViewport(800, 1000);
  await shoot('_raw-popup' + SFX + '.png');

  // ===== 截图 2：popup 搜索（输入 "so" 命中 Stack Overflow，演示搜索态）=====
  console.log('[2/4] popup 搜索态');
  await evalJs(`
    const el = document.getElementById('search-box');
    el.value = 'so';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return document.getElementById('search-box').value;
  `);
  await waitFor(() => evalJs(`return document.querySelectorAll('.search-results-list .search-result-item').length >= 1 || document.querySelectorAll('.hidden-by-search').length >= 1;`), 8000, '搜索结果');
  await sleep(500);
  await shoot('_raw-popup-search' + SFX + '.png');

  // file:// 直开时 background.js 不参与，检测必然失败；为截图注入一个
  // 直接返回 200 的 sendMessage mock（在页面脚本之前执行，DOMContentLoaded 时打补丁），
  // 让 checker 截图展示“全部有效”的真实界面而非全部失败。
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    (function () {
      function patch() {
        if (window.chrome && chrome.runtime && !chrome.runtime.__shotPatched) {
          chrome.runtime.__shotPatched = true;
          chrome.runtime.sendMessage = function (msg, cb) {
            if (msg && msg.action === 'fetchUrl') {
              setTimeout(function () { cb && cb({ ok: true, status: 200, statusText: 'OK' }); }, 150);
            }
            return true;
          };
        }
      }
      var t = setInterval(patch, 20);
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', patch); else patch();
    })();
  ` });

  // ===== 截图 3：checker 检测完成（1280x800 原生；已注入 200 mock）=====
  console.log('[3/4] checker 页面');
  await send('Page.navigate', { url: CHECKER_URL });
  await waitFor(() => evalJs(`return document.body && document.body.innerText.indexOf('检查结果') >= 0;`), 20000, 'checker 结果框');
  await setViewport(1280, 800);
  await sleep(600);
  await shoot('_raw-checker' + SFX + '.png');

  // ===== 截图 4：300x300 logo（从 icon128.svg 渲染，边缘清晰）=====
  console.log('[4/4] 300x300 logo');
  const wrapper = path.join(os.tmpdir(), 'bmv-logo.html');
  fs.writeFileSync(wrapper, `<html><body style="margin:0"><img src="file:///D:/workspace/mybookmark/chrome-menu-optimizer/icons/icon128.svg" width="300" height="300"></body></html>`);
  await send('Page.navigate', { url: 'file:///' + wrapper.replace(/\\/g, '/') });
  await waitFor(() => evalJs(`return document.readyState === 'complete';`), 8000, 'logo 加载');
  await setViewport(300, 300);
  await sleep(400);
  await shoot('_raw-logo-300' + SFX + '.png');
  fs.rmSync(wrapper, { force: true });

  ws.close();
  browser.kill();
  console.log('完成：原始素材已写入 docs/publish/screenshots/_raw-*.png');
})().catch((e) => { console.error('截图失败:', e.message); process.exit(1); });
