// Background service worker
// Handles cross-origin fetch with extension host_permissions

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'fetchUrl') {
    handleFetch(message.url).then(sendResponse);
    return true;
  }
});

async function handleFetch(url) {
  // 仅处理 http/https，其他协议（javascript:/data:/file: 等）直接拒绝
  let parsed;
  try {
    parsed = new URL(url);
  } catch (e) {
    return { ok: false, error: 'invalid url' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, error: 'unsupported protocol' };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Cache-Control': 'no-cache'
      }
    });
    clearTimeout(timeoutId);
    return { ok: true, status: response.status, statusText: response.statusText };
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') return { ok: false, error: 'timeout' };
    // 对于网络错误，尝试用 no-cors 模式再试一次（至少判断是否可达）
    try {
      const fallbackController = new AbortController();
      const fallbackTimeout = setTimeout(() => fallbackController.abort(), 10000);
      await fetch(url, {
        method: 'GET',
        mode: 'no-cors',
        signal: fallbackController.signal
      });
      clearTimeout(fallbackTimeout);
      // no-cors 模式下 opaque response 只能证明服务器可达，无法验证状态码
      return { ok: true, status: 0, statusText: 'reachable (opaque)', opaque: true };
    } catch {
      return { ok: false, error: error.message };
    }
  }
}
