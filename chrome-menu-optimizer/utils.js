/**
 * 实用工具函数集合
 * 提供常用的工具函数以提升代码质量和可维护性
 */

// ==================== DOM 操作工具 ====================

/**
 * 安全地获取DOM元素
 * @param {string} selector - CSS选择器
 * @param {Element} parent - 父元素，默认为document
 * @returns {Element|null} DOM元素或null
 */
export function safeQuerySelector(selector, parent = document) {
  try {
    return parent.querySelector(selector);
  } catch (error) {
    console.warn(`无效的选择器: ${selector}`, error);
    return null;
  }
}

/**
 * 创建DOM元素的工厂函数
 * @param {string} tag - 标签名
 * @param {Object} attributes - 属性对象
 * @param {string|Element|Array} children - 子元素
 * @returns {Element} 创建的DOM元素
 */
export function createElement(tag, attributes = {}, children = []) {
  const element = document.createElement(tag);
  
  // 设置属性
  Object.entries(attributes).forEach(([key, value]) => {
    if (key === 'className') {
      element.className = value;
    } else if (key === 'dataset') {
      Object.entries(value).forEach(([dataKey, dataValue]) => {
        element.dataset[dataKey] = dataValue;
      });
    } else if (key.startsWith('on') && typeof value === 'function') {
      element.addEventListener(key.slice(2).toLowerCase(), value);
    } else {
      element.setAttribute(key, value);
    }
  });
  
  // 添加子元素
  const childArray = Array.isArray(children) ? children : [children];
  childArray.forEach(child => {
    if (typeof child === 'string') {
      element.appendChild(document.createTextNode(child));
    } else if (child instanceof Element) {
      element.appendChild(child);
    }
  });
  
  return element;
}

// ==================== 防抖和节流 ====================

/**
 * 防抖函数
 * @param {Function} func - 要防抖的函数
 * @param {number} wait - 等待时间（毫秒）
 * @param {boolean} immediate - 是否立即执行
 * @returns {Function} 防抖后的函数
 */
export function debounce(func, wait, immediate = false) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      timeout = null;
      if (!immediate) func.apply(this, args);
    };
    const callNow = immediate && !timeout;
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
    if (callNow) func.apply(this, args);
  };
}

/**
 * 节流函数
 * @param {Function} func - 要节流的函数
 * @param {number} limit - 限制时间（毫秒）
 * @returns {Function} 节流后的函数
 */
export function throttle(func, limit) {
  let inThrottle;
  return function(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

// ==================== 数据验证 ====================

/**
 * 验证书签对象
 * @param {Object} bookmark - 书签对象
 * @returns {boolean} 是否有效
 */
export function isValidBookmark(bookmark) {
  if (!bookmark || typeof bookmark !== 'object') return false;
  
  // 必须有id和title
  if (!bookmark.id || !bookmark.title) return false;
  
  // 如果是书签，必须有URL
  if (!bookmark.children && !bookmark.url) return false;
  
  // 如果是文件夹，children应该是数组
  if (bookmark.children && !Array.isArray(bookmark.children)) return false;
  
  return true;
}

/**
 * 清理和验证搜索词
 * @param {string} searchTerm - 搜索词
 * @returns {string} 清理后的搜索词
 */
export function sanitizeSearchTerm(searchTerm) {
  if (typeof searchTerm !== 'string') return '';
  
  return searchTerm
    .trim()
    .replace(/[<>\"'&]/g, '') // 移除潜在的XSS字符
    .substring(0, 100); // 限制长度
}

// ==================== HTML转义 ====================

/**
 * HTML转义函数
 * @param {string} text - 要转义的文本
 * @returns {string} 转义后的文本
 */
export function escapeHtml(text) {
  if (typeof text !== 'string') return '';
  
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * 反转义HTML
 * @param {string} html - 要反转义的HTML
 * @returns {string} 反转义后的文本
 */
export function unescapeHtml(html) {
  if (typeof html !== 'string') return '';
  
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || div.innerText || '';
}

// ==================== 错误处理 ====================

/**
 * 安全执行异步函数
 * @param {Function} asyncFn - 异步函数
 * @param {*} fallback - 失败时的回退值
 * @returns {Promise} 执行结果
 */
export async function safeAsync(asyncFn, fallback = null) {
  try {
    return await asyncFn();
  } catch (error) {
    console.error('异步操作失败:', error);
    return fallback;
  }
}

/**
 * 重试机制
 * @param {Function} fn - 要重试的函数
 * @param {number} maxRetries - 最大重试次数
 * @param {number} delay - 重试延迟（毫秒）
 * @returns {Promise} 执行结果
 */
export async function retry(fn, maxRetries = 3, delay = 1000) {
  let lastError;
  
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError;
}

// ==================== 性能监控 ====================

/**
 * 性能计时器
 */
export class PerformanceTimer {
  constructor(name) {
    this.name = name;
    this.startTime = null;
    this.endTime = null;
  }
  
  start() {
    this.startTime = performance.now();
    return this;
  }
  
  end() {
    this.endTime = performance.now();
    const duration = this.endTime - this.startTime;
    console.log(`⏱️ ${this.name}: ${duration.toFixed(2)}ms`);
    return duration;
  }
  
  static measure(name, fn) {
    const timer = new PerformanceTimer(name);
    timer.start();
    const result = fn();
    timer.end();
    return result;
  }
  
  static async measureAsync(name, asyncFn) {
    const timer = new PerformanceTimer(name);
    timer.start();
    const result = await asyncFn();
    timer.end();
    return result;
  }
}

// ==================== 本地存储工具 ====================

/**
 * 本地存储管理器
 */
export class StorageManager {
  static setItem(key, value, expiry = null) {
    try {
      const item = {
        value,
        timestamp: Date.now(),
        expiry
      };
      localStorage.setItem(key, JSON.stringify(item));
      return true;
    } catch (error) {
      console.error('存储失败:', error);
      return false;
    }
  }
  
  static getItem(key) {
    try {
      const itemStr = localStorage.getItem(key);
      if (!itemStr) return null;
      
      const item = JSON.parse(itemStr);
      
      // 检查是否过期
      if (item.expiry && Date.now() > item.timestamp + item.expiry) {
        localStorage.removeItem(key);
        return null;
      }
      
      return item.value;
    } catch (error) {
      console.error('读取存储失败:', error);
      return null;
    }
  }
  
  static removeItem(key) {
    try {
      localStorage.removeItem(key);
      return true;
    } catch (error) {
      console.error('删除存储失败:', error);
      return false;
    }
  }
  
  static clear() {
    try {
      localStorage.clear();
      return true;
    } catch (error) {
      console.error('清空存储失败:', error);
      return false;
    }
  }
}

// ==================== 事件管理 ====================

/**
 * 事件发射器
 */
export class EventEmitter {
  constructor() {
    this.events = {};
  }
  
  on(event, listener) {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    this.events[event].push(listener);
    
    // 返回取消订阅函数
    return () => this.off(event, listener);
  }
  
  off(event, listener) {
    if (!this.events[event]) return;
    
    this.events[event] = this.events[event].filter(l => l !== listener);
  }
  
  emit(event, ...args) {
    if (!this.events[event]) return;
    
    this.events[event].forEach(listener => {
      try {
        listener(...args);
      } catch (error) {
        console.error(`事件监听器错误 (${event}):`, error);
      }
    });
  }
  
  once(event, listener) {
    const onceListener = (...args) => {
      listener(...args);
      this.off(event, onceListener);
    };
    this.on(event, onceListener);
  }
}

// ==================== URL工具 ====================

/**
 * 验证URL是否有效
 * @param {string} url - 要验证的URL
 * @returns {boolean} 是否有效
 */
export function isValidUrl(url) {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * 获取域名
 * @param {string} url - URL字符串
 * @returns {string} 域名
 */
export function getDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

/**
 * 获取网站图标URL
 * @param {string} url - 网站URL
 * @returns {string} 图标URL
 */
export function getFaviconUrl(url) {
  try {
    const urlObj = new URL(url);
    return `${urlObj.protocol}//${urlObj.hostname}/favicon.ico`;
  } catch {
    // 返回默认的SVG图标
    return 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjE2IiBoZWlnaHQ9IjE2IiByeD0iMiIgZmlsbD0iIzRhOTBlMiIvPgo8dGV4dCB4PSI4IiB5PSIxMSIgZm9udC1mYW1pbHk9InNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iMTAiIGZpbGw9IndoaXRlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj7wn5OQPC90ZXh0Pgo8L3N2Zz4K';
  }
}

// ==================== 数组工具 ====================

/**
 * 数组分块
 * @param {Array} array - 要分块的数组
 * @param {number} size - 块大小
 * @returns {Array} 分块后的数组
 */
export function chunk(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * 数组去重
 * @param {Array} array - 要去重的数组
 * @param {Function} keyFn - 获取唯一键的函数
 * @returns {Array} 去重后的数组
 */
export function uniqueBy(array, keyFn) {
  const seen = new Set();
  return array.filter(item => {
    const key = keyFn(item);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

// ==================== 导出默认配置 ====================

export const DEFAULT_CONFIG = {
  SEARCH_DEBOUNCE_DELAY: 300,
  MAX_PREVIEW_ITEMS: 3,
  CACHE_EXPIRY: 5 * 60 * 1000, // 5分钟
  MAX_SEARCH_LENGTH: 100,
  PERFORMANCE_LOGGING: true
};

// ==================== 调试工具 ====================

/**
 * 开发环境调试助手
 */
export const debugUtils = {
  log: (...args) => {
    if (process.env.NODE_ENV === 'development') {
      console.log('🐛 [DEBUG]', ...args);
    }
  },
  
  warn: (...args) => {
    if (process.env.NODE_ENV === 'development') {
      console.warn('⚠️ [WARN]', ...args);
    }
  },
  
  error: (...args) => {
    console.error('❌ [ERROR]', ...args);
  },
  
  time: (label) => {
    if (process.env.NODE_ENV === 'development') {
      console.time(`⏱️ ${label}`);
    }
  },
  
  timeEnd: (label) => {
    if (process.env.NODE_ENV === 'development') {
      console.timeEnd(`⏱️ ${label}`);
    }
  }
};