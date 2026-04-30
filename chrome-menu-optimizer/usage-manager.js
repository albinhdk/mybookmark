// 书签使用统计管理器
class BookmarkUsageManager {
  constructor() {
    this.storageKey = 'bookmark_usage_stats';
    this.usageStats = {};
    this.loadUsageStats();
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
      console.log('加载使用统计:', this.usageStats);
    } catch (error) {
      console.error('加载使用统计失败:', error);
      this.usageStats = {};
    }
  }

  // 保存使用统计到本地存储
  async saveUsageStats() {
    try {
      if (chrome && chrome.storage && chrome.storage.local) {
        await chrome.storage.local.set({ [this.storageKey]: this.usageStats });
      } else {
        // 测试环境使用localStorage
        localStorage.setItem(this.storageKey, JSON.stringify(this.usageStats));
      }
      console.log('保存使用统计:', this.usageStats);
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

    await this.saveUsageStats();
    console.log(`记录书签使用: ${bookmarkTitle} (${this.usageStats[bookmarkId].count}次)`);
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
      await this.saveUsageStats();
      console.log(`清除书签使用记录: ${bookmarkId}`);
      return true;
    }
    return false;
  }

  // 清除所有使用记录
  async clearAllUsage() {
    this.usageStats = {};
    await this.saveUsageStats();
    console.log('清除所有使用记录');
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
    if (count === 1) return '1次';
    if (count < 100) return `${count}次`;
    if (count < 1000) return `${count}次`;
    return `${(count / 1000).toFixed(1)}k次`;
  }

  // 格式化最后使用时间
  formatLastUsed(timestamp) {
    if (!timestamp) return '';
    
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes}分钟前`;
    if (hours < 24) return `${hours}小时前`;
    if (days < 7) return `${days}天前`;
    if (days < 30) return `${Math.floor(days / 7)}周前`;
    if (days < 365) return `${Math.floor(days / 30)}个月前`;
    return `${Math.floor(days / 365)}年前`;
  }
}

// 创建全局使用统计管理器实例
const bookmarkUsageManager = new BookmarkUsageManager();