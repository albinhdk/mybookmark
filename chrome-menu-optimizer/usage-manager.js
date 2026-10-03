var t = (typeof window !== 'undefined' && window.BMV && window.BMV.i18n) ? window.BMV.i18n.t : function (key) { return key; };

// 书签使用统计管理器
class BookmarkUsageManager {
  constructor() {
    this.storageKey = 'bookmark_usage_stats';
    this.usageStats = {};
    this.maxEntries = 5000;   // 条目上限，超出按最后使用时间淘汰
    this.saveTimer = null;
    this.ready = this.loadUsageStats(); // 首屏渲染前 await 它，避免统计先显示 0
  }

  // 从本地存储加载使用统计
  async loadUsageStats() {
    try {
      if (chrome && chrome.storage && chrome.storage.local) {
        const result = await chrome.storage.local.get([this.storageKey]);
        this.usageStats = result[this.storageKey] || {};
      } else {
        // 测试环境使用localStorage
        const stored = localStorage.getItem(this.storageKey);
        this.usageStats = stored ? JSON.parse(stored) : {};
      }
    } catch (error) {
      console.error('加载使用统计失败:', error);
      this.usageStats = {};
    }
  }

  // 保存使用统计到本地存储（500ms 防抖合并写，避免每次点击都全量写盘）
  saveUsageStats() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => { this.saveTimer = null; this._writeNow(); }, 500);
  }

  // 立即写入（明确操作/页面关闭前使用）
  async _writeNow() {
    clearTimeout(this.saveTimer);
    this.saveTimer = null;
    try {
      if (chrome && chrome.storage && chrome.storage.local) {
        await chrome.storage.local.set({ [this.storageKey]: this.usageStats });
      } else {
        // 测试环境使用localStorage
        localStorage.setItem(this.storageKey, JSON.stringify(this.usageStats));
      }
    } catch (error) {
      console.error('保存使用统计失败:', error);
    }
  }

  // 记录书签使用
  async recordUsage(bookmarkId, bookmarkUrl, bookmarkTitle) {
    if (!bookmarkId) return;

    const now = Date.now();
    if (!this.usageStats[bookmarkId]) {
      this.usageStats[bookmarkId] = {
        id: bookmarkId,
        url: bookmarkUrl,
        title: bookmarkTitle,
        count: 0,
        lastUsed: now,
        firstUsed: now
      };
    }

    this.usageStats[bookmarkId].count++;
    this.usageStats[bookmarkId].lastUsed = now;
    this.usageStats[bookmarkId].title = bookmarkTitle; // 更新标题以防变化
    this.usageStats[bookmarkId].url = bookmarkUrl; // 更新URL以防变化

    this.saveUsageStats(); // 防抖合并写
  }

  // 清理已删除书签的孤儿统计条目，并按上限淘汰最久未使用的条目
  pruneUsageStats(validIds) {
    let changed = false;
    Object.keys(this.usageStats).forEach(id => {
      if (!validIds.has(id)) {
        delete this.usageStats[id];
        changed = true;
      }
    });
    const entries = Object.entries(this.usageStats);
    if (entries.length > this.maxEntries) {
      entries.sort((a, b) => (b[1].lastUsed || 0) - (a[1].lastUsed || 0));
      this.usageStats = Object.fromEntries(entries.slice(0, this.maxEntries));
      changed = true;
    }
    if (changed) this.saveUsageStats();
    return changed;
  }

  // 获取书签使用次数
  getUsageCount(bookmarkId) {
    return this.usageStats[bookmarkId]?.count || 0;
  }

  // 获取书签最后使用时间
  getLastUsed(bookmarkId) {
    return this.usageStats[bookmarkId]?.lastUsed || 0;
  }

  // 清除特定书签的使用记录
  async clearUsage(bookmarkId) {
    if (this.usageStats[bookmarkId]) {
      delete this.usageStats[bookmarkId];
      await this._writeNow(); // 明确操作，立即落盘
      return true;
    }
    return false;
  }

  // 清除所有使用记录
  async clearAllUsage() {
    this.usageStats = {};
    await this._writeNow();
  }

  // 根据使用频率排序书签
  sortBookmarksByUsage(bookmarks) {
    return bookmarks.sort((a, b) => {
      const aUsage = this.getUsageCount(a.id);
      const bUsage = this.getUsageCount(b.id);
      
      // 首先按使用次数排序（降序）
      if (aUsage !== bUsage) {
        return bUsage - aUsage;
      }
      
      // 如果使用次数相同，按最后使用时间排序（降序）
      const aLastUsed = this.getLastUsed(a.id);
      const bLastUsed = this.getLastUsed(b.id);
      if (aLastUsed !== bLastUsed) {
        return bLastUsed - aLastUsed;
      }
      
      // 如果都没有使用记录，按标题排序
      return a.title.localeCompare(b.title);
    });
  }

  // 获取使用统计摘要
  getUsageSummary() {
    const stats = Object.values(this.usageStats);
    const totalUsage = stats.reduce((sum, stat) => sum + stat.count, 0);
    const mostUsed = stats.sort((a, b) => b.count - a.count).slice(0, 10);
    
    return {
      totalBookmarks: stats.length,
      totalUsage: totalUsage,
      averageUsage: stats.length > 0 ? (totalUsage / stats.length).toFixed(1) : 0,
      mostUsed: mostUsed
    };
  }

  // 格式化使用次数显示
  formatUsageCount(count) {
    if (count === 0) return '';
    if (count === 1) return t('usageCountSingular');
    if (count < 100) return t('usageCountFormat', [count]);
    if (count < 1000) return t('usageCountFormat', [count]);
    return t('usageCountKFormat', [(count / 1000).toFixed(1)]);
  }

  // 格式化最后使用时间
  formatLastUsed(timestamp) {
    if (!timestamp) return '';
    
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (minutes < 1) return t('lastUsedJustNow');
    if (minutes < 60) return t('lastUsedMinutesAgo', [minutes]);
    if (hours < 24) return t('lastUsedHoursAgo', [hours]);
    if (days < 7) return t('lastUsedDaysAgo', [days]);
    if (days < 30) return t('lastUsedWeeksAgo', [Math.floor(days / 7)]);
    if (days < 365) return t('lastUsedMonthsAgo', [Math.floor(days / 30)]);
    return t('lastUsedYearsAgo', [Math.floor(days / 365)]);
  }
}

// 创建全局使用统计管理器实例
// 同时挂到 window，统一访问方式（与 window.BMV / window.bookmarkChecker 一致）
const bookmarkUsageManager = new BookmarkUsageManager();
if (typeof window !== 'undefined') {
  window.bookmarkUsageManager = bookmarkUsageManager;
}