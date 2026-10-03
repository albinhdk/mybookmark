// 书签有效性检查模块
// 通过 background service worker 发起请求，利用 host_permissions 绕过 CORS，获取真实 HTTP 状态码

// 国际化取词（i18n.js 必须先于本文件加载；缺失时退化为直接返回 key）
var t = (typeof window !== 'undefined' && window.BMV && window.BMV.i18n) ? window.BMV.i18n.t : function (key) { return key; };

const BookmarkChecker = {
  results: new Map(),
  isRunning: false,
  abortController: null,
  concurrency: 5,
  _runToken: 0,
  _lastProgressAt: 0,

  async checkSingle(bookmark) {
    if (!bookmark.url) return null;
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        const result = await new Promise((resolve) => {
          const timeout = setTimeout(() => resolve({ ok: false, error: 'timeout' }), 15000);
          chrome.runtime.sendMessage({ action: 'fetchUrl', url: bookmark.url }, (response) => {
            clearTimeout(timeout);
            if (chrome.runtime.lastError) {
              resolve({ ok: false, error: chrome.runtime.lastError.message });
            } else {
              resolve(response || { ok: false, error: t('statusNoResponse') });
            }
          });
        });
        return this._classifyResult(result);
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      try {
        await fetch(bookmark.url, { method: 'GET', mode: 'no-cors', signal: controller.signal, redirect: 'follow' });
        clearTimeout(timeoutId);
        return this._classifyResult({ ok: true, status: 0, opaque: true });
      } catch (fetchError) {
        clearTimeout(timeoutId);
        if (fetchError.name === 'AbortError') return { status: 'timeout', code: t('statusTimeout') };
        return { status: 'unreachable', code: fetchError.message };
      }
    } catch (error) {
      return { status: 'unreachable', code: error.message };
    }
  },

  _classifyResult(result) {
    if (result.ok) {
      const code = result.status;
      // no-cors 兜底的 opaque 响应（status 0）只能证明服务器可达，不能证明页面有效
      if (result.opaque || code === 0) return { status: 'reachable', code: t('statusReachableUnverified') };
      if (code >= 200 && code < 400) return { status: 'valid', code };
      if (code === 404 || code === 410) return { status: 'invalid', code };
      // 403/401 等需登录或被反爬，不等于死链，单独分类避免误删
      if (code >= 400 && code < 500) return { status: 'blocked', code };
      if (code >= 500) return { status: 'server_error', code };
      return { status: 'valid', code };
    } else {
      if (result.error === 'timeout') return { status: 'timeout', code: t('statusTimeout') };
      return { status: 'unreachable', code: result.error };
    }
  },

  async checkBatch(bookmarks, onProgress) {
    const queue = bookmarks.filter(b => b.url && !this.results.has(b.id));
    if (queue.length === 0) return { cancelled: false, checked: 0 };
    // 使用本批次局部 controller：取消后旧 worker 立即停止，不会读到新批次的 controller
    const controller = new AbortController();
    this.abortController = controller;
    let completed = 0;
    const total = queue.length;
    const workers = [];

    for (let i = 0; i < Math.min(this.concurrency, queue.length); i++) {
      workers.push((async () => {
        while (queue.length > 0 && !controller.signal.aborted) {
          const bookmark = queue.shift();
          const result = await this.checkSingle(bookmark);
          // 取消后丢弃在途结果，避免旧批次写入新批次的结果与进度
          if (controller.signal.aborted) return;
          if (result) {
            this.results.set(bookmark.id, { ...result, title: bookmark.title, url: bookmark.url, parentId: bookmark.parentId });
          }
          completed++;
          if (onProgress) onProgress(completed, total, bookmark, result);
        }
      })());
    }
    await Promise.all(workers);
    return { cancelled: controller.signal.aborted, checked: completed };
  },

  cancel() {
    if (this.abortController) this.abortController.abort();
    this.isRunning = false;
  },

  getStats() {
    let valid = 0, invalid = 0, blocked = 0, server_error = 0, unreachable = 0, timeout = 0, reachable = 0;
    this.results.forEach(r => {
      if (r.status === 'valid') valid++;
      else if (r.status === 'invalid') invalid++;
      else if (r.status === 'blocked') blocked++;
      else if (r.status === 'server_error') server_error++;
      else if (r.status === 'unreachable') unreachable++;
      else if (r.status === 'timeout') timeout++;
      else if (r.status === 'reachable') reachable++;
    });
    return { valid, invalid, blocked, server_error, unreachable, timeout, reachable, total: this.results.size };
  },

  clearResults() {
    this.results.clear();
  },

  // 在 popup 头部渲染"检查书签"按钮（点击后打开独立的检查器页，长任务不受 popup 生命周期影响）
  renderCheckAllButton() {
    const header = document.querySelector('.header h1');
    if (!header || document.getElementById('btn-check-all')) return;
    const btn = document.createElement('button');
    btn.id = 'btn-check-all';
    btn.className = 'check-all-btn';
    btn.textContent = t('checkBookmarksBtn');
    btn.addEventListener('click', () => this.openCheckerPage());
    header.appendChild(btn);
  },

  // 打开检查器独立页（支持 ?bookmark=ID 单个检查 / ?folder=ID 文件夹检查 / 默认全量）
  openCheckerPage(params) {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    const url = chrome.runtime.getURL('checker.html') + query;
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
      chrome.tabs.create({ url });
    } else {
      window.open(url, '_blank');
    }
  },

  async _runCheck(bookmarks, emptyMessage) {
    if (this.isRunning) return;
    this.isRunning = true;
    // 批次令牌：取消后立即重开时，旧批次的 finally 不会复位新批次的状态
    const token = ++this._runToken;
    try {
      if (!bookmarks || bookmarks.length === 0) { alert(emptyMessage || t('noBookmarksToCheck')); return; }
      this.clearResults();
      this.showProgressDialog(bookmarks.length);
      const outcome = await this.checkBatch(bookmarks, (completed, total, bookmark, result) => {
        this.updateProgress(completed, total, bookmark, result);
      });
      // 用户取消后不再弹出结果对话框
      if (!outcome.cancelled) this.showResultsDialog();
    } finally {
      if (this._runToken === token) this.isRunning = false;
    }
  },

  async checkAllBookmarks() {
    const allBookmarks = await BMV.bookmarkTree.getAllBookmarks();
    await this._runCheck(allBookmarks.filter(b => b.url), t('noBookmarksToCheck'));
  },

  async checkFolderBookmarks(folderId, folderName) {
    const children = await this.getFolderBookmarksRecursive(folderId);
    await this._runCheck(children, t('folderNoBookmarksToCheck'));
  },

  async getFolderBookmarksRecursive(folderId) {
    const results = [];
    const traverse = (bookmarks) => {
      bookmarks.forEach(b => {
        if (b.url) results.push(b);
        if (b.children) traverse(b.children);
      });
    };
    return new Promise((resolve) => {
      chrome.bookmarks.getChildren(folderId, (children) => {
        if (children) traverse(children);
        resolve(results);
      });
    });
  },

  showProgressDialog(total) {
    const existing = document.getElementById('checker-dialog');
    if (existing) existing.remove();
    const dialog = document.createElement('div');
    dialog.id = 'checker-dialog';
    dialog.className = 'checker-dialog';
    dialog.innerHTML = `<div class="checker-overlay"></div>
      <div class="checker-content">
        <div class="checker-header">
          <h3>${t('checkerProgressTitle')}</h3>
          <button class="checker-close" id="checker-cancel-btn">${t('btnCancel')}</button>
        </div>
        <div class="checker-body">
          <div class="checker-progress">
            <div class="checker-progress-bar" id="checker-progress-bar" style="width: 0%"></div>
          </div>
          <div class="checker-progress-text" id="checker-progress-text">${t('checkerPreparing')}</div>
          <div class="checker-current" id="checker-current"></div>
          <div class="checker-stats-mini" id="checker-stats-mini"></div>
        </div>
      </div>`;
    document.body.appendChild(dialog);
    dialog.querySelector('.checker-overlay').addEventListener('click', () => this.cancelCheck());
    document.getElementById('checker-cancel-btn').addEventListener('click', () => this.cancelCheck());
  },

  cancelCheck() {
    this.cancel();
    const dialog = document.getElementById('checker-dialog');
    if (dialog) dialog.remove();
  },

  updateProgress(completed, total, bookmark, result) {
    // 节流：高频完成时最多每 100ms 刷新一次，避免 O(n²) 的全量统计与 DOM 重写
    const now = Date.now();
    if (completed < total && now - (this._lastProgressAt || 0) < 100) return;
    this._lastProgressAt = now;
    const pct = Math.round((completed / total) * 100);
    const bar = document.getElementById('checker-progress-bar');
    const text = document.getElementById('checker-progress-text');
    const current = document.getElementById('checker-current');
    const mini = document.getElementById('checker-stats-mini');
    if (bar) bar.style.width = pct + '%';
    if (text) text.textContent = t('checkerProgressText', [completed, total, pct]);
    if (current) {
      const icon = result ? this.getStatusIcon(result.status) : '';
      current.innerHTML = t('checkerCurrentItem', [icon, this.escapeHtml(bookmark.title)]);
    }
    if (mini) {
      const s = this.getStats();
      mini.innerHTML = `<span class="stat-valid">${t('checkerStatValid', [s.valid])}</span>
        <span class="stat-invalid">${t('checkerStatInvalid', [s.invalid])}</span>
        <span class="stat-error">${t('checkerStatProblemTotal', [s.blocked + s.server_error + s.unreachable + s.timeout + s.reachable])}</span>`;
    }
  },

  showResultsDialog() {
    const dialog = document.getElementById('checker-dialog');
    if (dialog) dialog.remove();
    const stats = this.getStats();
    const newDialog = document.createElement('div');
    newDialog.id = 'checker-dialog';
    newDialog.className = 'checker-dialog';

    let bodyHTML;
    if (stats.total === 0) {
      bodyHTML = '<div class="checker-empty">' + t('checkerNoResults') + '</div>';
    } else {
      const sorted = Array.from(this.results.entries()).sort((a, b) => {
        const order = { invalid: 0, blocked: 1, server_error: 2, unreachable: 3, timeout: 4, reachable: 5, valid: 6 };
        return (order[a[1].status] ?? 5) - (order[b[1].status] ?? 5);
      });
      const problemCount = stats.total - stats.valid;
      bodyHTML = `<div class="checker-summary">
        <span class="stat-valid">${t('checkerSummaryValid', [stats.valid])}</span>
        <span class="stat-invalid">${t('checkerSummaryInvalid', [stats.invalid])}</span>
        ${stats.blocked > 0 ? `<span class="stat-error">${t('checkerSummaryBlocked', [stats.blocked])}</span>` : ''}
        ${stats.server_error > 0 ? `<span class="stat-error">${t('checkerSummaryServerError', [stats.server_error])}</span>` : ''}
        ${stats.unreachable > 0 ? `<span class="stat-error">${t('checkerSummaryUnreachable', [stats.unreachable])}</span>` : ''}
        ${stats.timeout > 0 ? `<span class="stat-error">${t('checkerSummaryTimeout', [stats.timeout])}</span>` : ''}
        ${stats.reachable > 0 ? `<span class="stat-error">${t('checkerSummaryReachable', [stats.reachable])}</span>` : ''}
      </div>
      ${problemCount > 0 ? `<div class="checker-actions">
        <label class="checker-select-all"><input type="checkbox" id="checker-select-all"> ${t('checkerSelectAllInvalid')}</label>
        <button class="checker-action-btn" id="checker-open-selected" title="${t('checkerOpenSelectedTitle')}">${t('checkerOpenSelectedBtn')}</button>
        <button class="checker-action-btn" id="checker-copy-selected" title="${t('checkerCopySelectedTitle')}">${t('checkerCopySelectedBtn')}</button>
        <button class="checker-action-btn checker-action-danger" id="checker-delete-selected" title="${t('checkerDeleteSelectedTitle')}">${t('checkerDeleteSelectedBtn')}</button>
      </div>` : ''}
      <div class="checker-table-wrap"><table class="checker-table">
        <thead><tr>
          ${problemCount > 0 ? '<th style="width:30px"></th>' : ''}
          <th>${t('checkerTableHeaderStatus')}</th><th>${t('checkerTableHeaderTitle')}</th><th>${t('checkerTableHeaderUrl')}</th><th>${t('checkerTableHeaderCode')}</th>
        </tr></thead>
        <tbody>${sorted.map(([id, r]) => {
          const isProblem = r.status !== 'valid';
          return `<tr class="checker-row-${r.status}" data-bookmark-id="${id}" data-url="${this.escapeHtml(r.url)}" data-status="${r.status}">
            ${problemCount > 0 ? `<td>${isProblem ? `<input type="checkbox" class="checker-row-cb" data-bookmark-id="${id}">` : ''}</td>` : ''}
            <td>${this.getStatusIcon(r.status)}</td>
            <td class="checker-td-title">${this.escapeHtml(r.title)}</td>
            <td class="checker-td-url"><a href="${(typeof isDangerousUrl === 'function' && isDangerousUrl(r.url)) ? '#' : this.escapeHtml(r.url)}" title="${this.escapeHtml(r.url)}">${this.escapeHtml(this.truncateUrl(r.url))}</a></td>
            <td>${this.escapeHtml(String(r.code))}</td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>`;
    }

    newDialog.innerHTML = `<div class="checker-overlay"></div>
      <div class="checker-content checker-results">
        <div class="checker-header">
          <h3>${t('checkerResultsTitle', [stats.total])}</h3>
          <div>
            <button class="checker-action-btn" id="checker-recheck-btn">${t('checkerRecheckBtn')}</button>
            <button class="checker-action-btn" id="checker-restore-btn" title="${t('checkerRestoreBtnTitle')}">${t('checkerRestoreBtn')}</button>
            <button class="checker-close" id="checker-close-btn">${t('checkerCloseBtn')}</button>
          </div>
        </div>
        <div class="checker-body">${bodyHTML}</div>
      </div>`;

    document.body.appendChild(newDialog);

    // 事件绑定
    newDialog.querySelector('.checker-overlay').addEventListener('click', () => this.closeDialog());
    document.getElementById('checker-close-btn').addEventListener('click', () => this.closeDialog());
    document.getElementById('checker-recheck-btn').addEventListener('click', () => this.recheckInvalid());
    document.getElementById('checker-restore-btn').addEventListener('click', () => this.restoreBackup());

    // 批量操作事件
    this._bindBulkActions();
  },

  _bindBulkActions() {
    const selectAllCb = document.getElementById('checker-select-all');
    const openBtn = document.getElementById('checker-open-selected');
    const copyBtn = document.getElementById('checker-copy-selected');
    const deleteBtn = document.getElementById('checker-delete-selected');

    if (selectAllCb) {
      selectAllCb.addEventListener('change', (e) => {
        // 全选只选中确认无效(404/410)的书签，避免把需登录/超时/网络抖动项一键纳入删除
        document.querySelectorAll('.checker-row-cb').forEach(cb => {
          const row = cb.closest('tr');
          cb.checked = e.target.checked && !!row && row.dataset.status === 'invalid';
        });
      });
    }

    if (openBtn) {
      openBtn.addEventListener('click', () => {
        const selected = this._getSelectedIds();
        if (selected.length === 0) { alert(t('checkerSelectFirstAlert')); return; }
        selected.forEach(id => {
          const r = this.results.get(id);
          if (r && r.url) {
            if (typeof isDangerousUrl === 'function' && isDangerousUrl(r.url)) return;
            chrome.tabs.create({ url: r.url, active: false });
          }
        });
      });
    }

    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        const selected = this._getSelectedIds();
        if (selected.length === 0) { alert(t('checkerSelectFirstAlert')); return; }
        const urls = selected.map(id => this.results.get(id)?.url).filter(Boolean).join('\n');
        navigator.clipboard.writeText(urls).then(() => {
          copyBtn.textContent = t('checkerCopiedBtn');
          setTimeout(() => { copyBtn.textContent = t('checkerCopySelectedBtn'); }, 1500);
        });
      });
    }

    if (deleteBtn) {
      deleteBtn.addEventListener('click', async () => {
        const selected = this._getSelectedIds();
        if (selected.length === 0) { alert(t('checkerSelectFirstAlert')); return; }
        const items = selected.map(id => this.results.get(id)).filter(Boolean);
        // confirm 列出前若干个书名，避免"只看数量"的误删
        const names = items.slice(0, 10).map(r => `· ${r.title || r.url}`).join('\n');
        const more = items.length > 10 ? t('checkerDeleteMoreSuffix', [items.length]) : '';
        if (!confirm(t('checkerDeleteConfirm', [items.length, names, more]))) return;
        // 删除前自动备份，误删后可通过"恢复备份"找回
        await this._backupForDelete(items);
        let deleted = 0;
        for (const id of selected) {
          try {
            await new Promise((resolve, reject) => {
              chrome.bookmarks.remove(id, () => {
                if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
                else resolve();
              });
            });
            this.results.delete(id);
            deleted++;
          } catch (e) {
            console.error('删除书签失败:', id, e);
          }
        }
        alert(t('checkerDeleteDoneAlert', [deleted]));
        this.showResultsDialog();
      });
    }
  },

  // 删除前把书签快照写入 chrome.storage.local，供误删恢复
  async _backupForDelete(items) {
    const backup = {
      time: Date.now(),
      items: items.map(r => ({ title: r.title, url: r.url, parentId: r.parentId || null }))
    };
    try {
      await chrome.storage.local.set({ 'bookmarkChecker.lastDeleteBackup': backup });
    } catch (e) {
      console.error('写入删除备份失败:', e);
    }
  },

  async _getBookmarkBarId() {
    return new Promise((resolve) => {
      try {
        chrome.bookmarks.getTree((tree) => {
          const root = tree && tree[0];
          const bar = root && root.children && root.children[0];
          resolve(bar ? bar.id : '1');
        });
      } catch (e) {
        resolve('1');
      }
    });
  },

  // 恢复上次删除前备份的书签（原文件夹不存在时放到书签栏）
  async restoreBackup() {
    let backup = null;
    try {
      const data = await chrome.storage.local.get('bookmarkChecker.lastDeleteBackup');
      backup = data && data['bookmarkChecker.lastDeleteBackup'];
    } catch (e) {
      console.error('读取删除备份失败:', e);
    }
    if (!backup || !backup.items || backup.items.length === 0) { alert(t('checkerNoBackupAlert')); return; }
    const timeStr = new Date(backup.time).toLocaleString();
    if (!confirm(t('checkerRestoreConfirm', [timeStr, backup.items.length]))) return;
    let restored = 0;
    for (const item of backup.items) {
      try {
        let parentId = item.parentId;
        if (parentId) {
          const exists = await new Promise((resolve) => {
            chrome.bookmarks.get(parentId, (nodes) => {
              resolve(!chrome.runtime.lastError && nodes && nodes.length > 0);
            });
          });
          if (!exists) parentId = null;
        }
        if (!parentId) parentId = await this._getBookmarkBarId();
        await new Promise((resolve, reject) => {
          chrome.bookmarks.create({ parentId, title: item.title, url: item.url }, () => {
            if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
            else resolve();
          });
        });
        restored++;
      } catch (e) {
        console.error('恢复书签失败:', item, e);
      }
    }
    alert(t('checkerRestoreDoneAlert', [restored, backup.items.length]));
    this.showResultsDialog();
  },

  _getSelectedIds() {
    const ids = [];
    document.querySelectorAll('.checker-row-cb:checked').forEach(cb => {
      ids.push(cb.getAttribute('data-bookmark-id'));
    });
    return ids;
  },

  async recheckInvalid() {
    if (this.isRunning) return;
    const invalidBookmarks = [];
    this.results.forEach((r, id) => {
      if (r.status !== 'valid') {
        invalidBookmarks.push({ id, url: r.url, title: r.title, parentId: r.parentId });
        this.results.delete(id);
      }
    });
    await this._runCheck(invalidBookmarks, t('noInvalidToRecheck'));
  },

  closeDialog() {
    const dialog = document.getElementById('checker-dialog');
    if (dialog) dialog.remove();
  },

  getStatusIcon(status) {
    const icons = { valid: '✅', invalid: '❌', blocked: '🚫', server_error: '🔴', unreachable: '🌐', timeout: '⏱️', reachable: '❓' };
    return icons[status] || '❓';
  },

  truncateUrl(url) {
    if (!url) return '';
    try {
      const u = new URL(url);
      const display = u.hostname + u.pathname;
      return display.length > 50 ? display.substring(0, 47) + '...' : display;
    } catch { return url.length > 50 ? url.substring(0, 47) + '...' : url; }
  },

  escapeHtml(text) {
    if (text === null || text === undefined) return '';
    return String(text).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[c]));
  }
};

if (typeof window !== 'undefined') {
  window.bookmarkChecker = BookmarkChecker;
}

// ===== 独立检查器页（checker.html）引导 =====
// 根据 URL 参数决定检查范围：?bookmark=ID 单个 / ?folder=ID 文件夹 / 默认全量。
// 独立页运行使长任务不再受 popup 关闭影响。
(function initCheckerPage() {
  if (typeof document === 'undefined' || !document.body) return;
  if (!/checker\.html/.test(location.pathname)) return;

  const params = new URLSearchParams(location.search);
  const bookmarkId = params.get('bookmark');
  const folderId = params.get('folder');

  async function start() {
    try {
      if (bookmarkId) {
        const bookmark = await new Promise((resolve) => {
          chrome.bookmarks.get(bookmarkId, (nodes) => resolve(nodes && nodes[0]));
        });
        if (bookmark) {
          const result = await BookmarkChecker.checkSingle(bookmark);
          BookmarkChecker.results.set(bookmark.id, { ...result, title: bookmark.title, url: bookmark.url, parentId: bookmark.parentId });
          BookmarkChecker.showResultsDialog();
          return;
        }
      }
      if (folderId) {
        await BookmarkChecker.checkFolderBookmarks(folderId, '');
        return;
      }
      await BookmarkChecker.checkAllBookmarks();
    } catch (error) {
      console.error('检查器启动失败:', error);
      alert(t('checkerStartFailAlert', [error.message]));
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
