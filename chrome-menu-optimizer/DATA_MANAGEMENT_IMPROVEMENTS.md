# 数据管理优化建议

## 1. 状态管理模式
实现集中式状态管理：

```javascript
class BookmarkState {
  constructor() {
    this.state = {
      currentFolderId: null,
      bookmarks: [],
      searchTerm: '',
      selectedBookmarks: new Set(),
      viewMode: 'list', // 'list' | 'grid' | 'compact'
      sortBy: 'title', // 'title' | 'url' | 'dateAdded'
      sortOrder: 'asc' // 'asc' | 'desc'
    };
    this.listeners = new Map();
  }
  
  subscribe(key, callback) {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    this.listeners.get(key).add(callback);
    
    // 返回取消订阅函数
    return () => {
      const callbacks = this.listeners.get(key);
      if (callbacks) {
        callbacks.delete(callback);
      }
    };
  }
  
  setState(updates) {
    const prevState = { ...this.state };
    this.state = { ...this.state, ...updates };
    
    // 通知订阅者
    Object.keys(updates).forEach(key => {
      const callbacks = this.listeners.get(key);
      if (callbacks) {
        callbacks.forEach(callback => {
          callback(this.state[key], prevState[key]);
        });
      }
    });
  }
  
  getState() {
    return { ...this.state };
  }
}

// 使用示例
const bookmarkState = new BookmarkState();

// 订阅状态变化
const unsubscribe = bookmarkState.subscribe('searchTerm', (newTerm, oldTerm) => {
  console.log(`搜索词从 "${oldTerm}" 变为 "${newTerm}"`);
  applySearchFilter();
});

// 更新状态
bookmarkState.setState({ searchTerm: 'github' });
```

## 2. 缓存机制
实现智能缓存系统：

```javascript
class BookmarkCache {
  constructor(maxSize = 100, ttl = 5 * 60 * 1000) { // 5分钟TTL
    this.cache = new Map();
    this.maxSize = maxSize;
    this.ttl = ttl;
  }
  
  set(key, value) {
    // 如果缓存已满，删除最旧的条目
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    
    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      accessCount: 0
    });
  }
  
  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;
    
    // 检查是否过期
    if (Date.now() - item.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }
    
    // 更新访问计数
    item.accessCount++;
    return item.value;
  }
  
  has(key) {
    return this.get(key) !== null;
  }
  
  clear() {
    this.cache.clear();
  }
  
  // 获取缓存统计信息
  getStats() {
    const items = Array.from(this.cache.values());
    return {
      size: this.cache.size,
      totalAccess: items.reduce((sum, item) => sum + item.accessCount, 0),
      avgAccess: items.length > 0 ? items.reduce((sum, item) => sum + item.accessCount, 0) / items.length : 0
    };
  }
}

// 使用示例
const bookmarkCache = new BookmarkCache();

async function getCachedBookmarks(folderId) {
  const cacheKey = `folder_${folderId}`;
  
  // 尝试从缓存获取
  let bookmarks = bookmarkCache.get(cacheKey);
  if (bookmarks) {
    console.log('从缓存获取书签');
    return bookmarks;
  }
  
  // 缓存未命中，从API获取
  console.log('从API获取书签');
  bookmarks = await getBookmarks(folderId);
  
  // 存入缓存
  bookmarkCache.set(cacheKey, bookmarks);
  return bookmarks;
}
```

## 3. 数据验证和清理
实现数据验证机制：

```javascript
class BookmarkValidator {
  static validateBookmark(bookmark) {
    const errors = [];
    
    if (!bookmark.id) {
      errors.push('书签ID不能为空');
    }
    
    if (!bookmark.title || bookmark.title.trim() === '') {
      errors.push('书签标题不能为空');
    }
    
    if (bookmark.url && !this.isValidUrl(bookmark.url)) {
      errors.push('书签URL格式无效');
    }
    
    if (bookmark.title && bookmark.title.length > 200) {
      errors.push('书签标题过长（最多200字符）');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
  
  static isValidUrl(url) {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }
  
  static sanitizeBookmark(bookmark) {
    return {
      ...bookmark,
      title: this.sanitizeString(bookmark.title),
      url: bookmark.url ? this.sanitizeUrl(bookmark.url) : undefined
    };
  }
  
  static sanitizeString(str) {
    if (!str) return '';
    return str.trim().replace(/[<>]/g, '');
  }
  
  static sanitizeUrl(url) {
    if (!url) return '';
    try {
      const urlObj = new URL(url);
      return urlObj.href;
    } catch {
      return '';
    }
  }
}

// 使用示例
function processBookmark(rawBookmark) {
  const validation = BookmarkValidator.validateBookmark(rawBookmark);
  if (!validation.isValid) {
    console.error('书签验证失败:', validation.errors);
    return null;
  }
  
  return BookmarkValidator.sanitizeBookmark(rawBookmark);
}
```

## 4. 批量操作优化
实现批量操作功能：

```javascript
class BookmarkBatchOperations {
  constructor() {
    this.operationQueue = [];
    this.isProcessing = false;
  }
  
  async batchUpdate(bookmarks, updates) {
    const operations = bookmarks.map(bookmark => ({
      type: 'update',
      id: bookmark.id,
      data: { ...bookmark, ...updates }
    }));
    
    return this.executeOperations(operations);
  }
  
  async batchDelete(bookmarkIds) {
    const operations = bookmarkIds.map(id => ({
      type: 'delete',
      id
    }));
    
    return this.executeOperations(operations);
  }
  
  async batchMove(bookmarkIds, targetFolderId) {
    const operations = bookmarkIds.map(id => ({
      type: 'move',
      id,
      data: { parentId: targetFolderId }
    }));
    
    return this.executeOperations(operations);
  }
  
  async executeOperations(operations) {
    if (this.isProcessing) {
      throw new Error('批量操作正在进行中');
    }
    
    this.isProcessing = true;
    const results = [];
    const errors = [];
    
    try {
      for (const operation of operations) {
        try {
          const result = await this.executeOperation(operation);
          results.push({ success: true, operation, result });
        } catch (error) {
          errors.push({ success: false, operation, error: error.message });
        }
      }
      
      return {
        success: errors.length === 0,
        results,
        errors,
        total: operations.length,
        successful: results.length,
        failed: errors.length
      };
    } finally {
      this.isProcessing = false;
    }
  }
  
  async executeOperation(operation) {
    switch (operation.type) {
      case 'update':
        return new Promise((resolve, reject) => {
          chrome.bookmarks.update(operation.id, operation.data, (result) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(result);
            }
          });
        });
        
      case 'delete':
        return new Promise((resolve, reject) => {
          chrome.bookmarks.remove(operation.id, () => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve({ id: operation.id });
            }
          });
        });
        
      case 'move':
        return new Promise((resolve, reject) => {
          chrome.bookmarks.move(operation.id, operation.data, (result) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(result);
            }
          });
        });
        
      default:
        throw new Error(`未知操作类型: ${operation.type}`);
    }
  }
}

// 使用示例
const batchOps = new BookmarkBatchOperations();

// 批量删除选中的书签
async function deleteSelectedBookmarks() {
  const selectedIds = Array.from(bookmarkState.getState().selectedBookmarks);
  if (selectedIds.length === 0) return;
  
  if (!confirm(`确定要删除 ${selectedIds.length} 个书签吗？`)) return;
  
  try {
    const result = await batchOps.batchDelete(selectedIds);
    console.log(`批量删除完成: ${result.successful}/${result.total} 成功`);
    
    if (result.errors.length > 0) {
      console.error('删除失败的项目:', result.errors);
    }
    
    // 刷新界面
    renderBookmarks(currentFolderId);
  } catch (error) {
    console.error('批量删除失败:', error);
  }
}
```

## 5. 数据同步机制
实现数据同步功能：

```javascript
class BookmarkSync {
  constructor() {
    this.syncInProgress = false;
    this.lastSyncTime = null;
    this.conflictResolver = new ConflictResolver();
  }
  
  async syncWithCloud(cloudData) {
    if (this.syncInProgress) {
      throw new Error('同步正在进行中');
    }
    
    this.syncInProgress = true;
    
    try {
      const localData = await this.getLocalBookmarks();
      const conflicts = this.detectConflicts(localData, cloudData);
      
      if (conflicts.length > 0) {
        const resolutions = await this.conflictResolver.resolve(conflicts);
        await this.applyResolutions(resolutions);
      }
      
      await this.mergeData(localData, cloudData);
      this.lastSyncTime = Date.now();
      
      return {
        success: true,
        conflicts: conflicts.length,
        syncTime: this.lastSyncTime
      };
    } finally {
      this.syncInProgress = false;
    }
  }
  
  detectConflicts(localData, cloudData) {
    const conflicts = [];
    
    cloudData.forEach(cloudItem => {
      const localItem = localData.find(item => item.id === cloudItem.id);
      if (localItem && localItem.dateModified !== cloudItem.dateModified) {
        conflicts.push({
          id: cloudItem.id,
          local: localItem,
          cloud: cloudItem,
          type: 'modified'
        });
      }
    });
    
    return conflicts;
  }
  
  async getLocalBookmarks() {
    return new Promise((resolve, reject) => {
      chrome.bookmarks.getTree((tree) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(this.flattenBookmarkTree(tree));
        }
      });
    });
  }
  
  flattenBookmarkTree(tree) {
    const result = [];
    
    function traverse(nodes) {
      nodes.forEach(node => {
        result.push(node);
        if (node.children) {
          traverse(node.children);
        }
      });
    }
    
    traverse(tree);
    return result;
  }
}
```