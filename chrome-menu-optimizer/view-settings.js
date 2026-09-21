// 视图设置模块：网格列数与文件夹卡片预览数
// 持久化到 chrome.storage.local（键 bookmark_view_settings），非法值逐项回落默认值。
// 暴露 ready promise：首屏渲染前 await，避免列数/预览数先跳变再纠正。
(function () {
  const STORAGE_KEY = 'bookmark_view_settings';
  const DEFAULTS = { columns: 3, preview: 5 };
  const RANGES = { columns: [2, 5], preview: [0, 10] };

  let settings = { ...DEFAULTS };
  const readyPromise = load();

  // 校验并回落：非整数或越界时用默认值
  function sanitize(value, key) {
    const [min, max] = RANGES[key];
    const n = Number(value);
    if (!Number.isInteger(n) || n < min || n > max) {
      console.warn(`[view-settings] ${key} 取值无效(${value})，回落默认 ${DEFAULTS[key]}`);
      return DEFAULTS[key];
    }
    return n;
  }

  async function load() {
    try {
      if (chrome && chrome.storage && chrome.storage.local) {
        const result = await chrome.storage.local.get([STORAGE_KEY]);
        const stored = result && result[STORAGE_KEY];
        if (stored && typeof stored === 'object') {
          settings = {
            columns: sanitize(stored.columns, 'columns'),
            preview: sanitize(stored.preview, 'preview')
          };
        }
      }
    } catch (error) {
      console.warn('[view-settings] 读取设置失败，使用默认值:', error);
    }
    return settings;
  }

  // 写入设置（仅覆盖传入的键）；返回是否有实际变化
  async function save(next) {
    const merged = {
      columns: sanitize(next && next.columns !== undefined ? next.columns : settings.columns, 'columns'),
      preview: sanitize(next && next.preview !== undefined ? next.preview : settings.preview, 'preview')
    };
    const changed = merged.columns !== settings.columns || merged.preview !== settings.preview;
    settings = merged;
    try {
      if (chrome && chrome.storage && chrome.storage.local) {
        await chrome.storage.local.set({ [STORAGE_KEY]: settings });
      }
    } catch (error) {
      console.warn('[view-settings] 保存设置失败:', error);
    }
    return changed;
  }

  window.bookmarkViewSettings = {
    DEFAULTS: { ...DEFAULTS },
    RANGES,
    get: () => ({ ...settings }),
    ready: () => readyPromise,
    save
  };
})();
