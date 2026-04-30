/**
 * 错误处理和日志记录模块
 * 提供统一的错误处理、日志记录和用户反馈机制
 */

class ErrorHandler {
  constructor() {
    this.logLevel = 'info'; // debug, info, warn, error
    this.errorHistory = [];
    this.maxHistorySize = 50;
  }

  /**
   * 设置日志级别
   * @param {string} level - debug, info, warn, error
   */
  setLogLevel(level) {
    this.logLevel = level;
  }

  /**
   * 记录日志
   * @param {string} level - 日志级别
   * @param {string} message - 日志消息
   * @param {any} data - 附加数据
   */
  log(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      data
    };

    // 添加到历史记录
    this.errorHistory.push(logEntry);
    if (this.errorHistory.length > this.maxHistorySize) {
      this.errorHistory.shift();
    }

    // 控制台输出
    const logMethod = console[level] || console.log;
    logMethod(`[${timestamp}] [${level.toUpperCase()}] ${message}`, data || '');
  }

  /**
   * 处理Chrome API错误
   * @param {string} operation - 操作名称
   * @param {Error} error - 错误对象
   */
  handleChromeApiError(operation, error) {
    const errorMessage = chrome.runtime.lastError?.message || error?.message || '未知错误';
    this.log('error', `Chrome API错误 - ${operation}`, {
      error: errorMessage,
      operation,
      stack: error?.stack
    });
    
    return {
      success: false,
      error: errorMessage,
      operation
    };
  }

  /**
   * 处理网络错误
   * @param {string} url - 请求URL
   * @param {Error} error - 错误对象
   */
  handleNetworkError(url, error) {
    this.log('error', `网络请求失败`, {
      url,
      error: error.message,
      stack: error.stack
    });
    
    return {
      success: false,
      error: '网络请求失败',
      url
    };
  }

  /**
   * 显示用户友好的错误消息
   * @param {string} message - 错误消息
   * @param {string} containerId - 容器ID
   * @param {boolean} showRetry - 是否显示重试按钮
   */
  showUserError(message, containerId = 'bookmarks', showRetry = true) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const retryButton = showRetry ? 
      `<button onclick="location.reload()" class="retry-btn">重试</button>` : '';

    container.innerHTML = `
      <div class="error-message">
        <div class="error-icon">⚠️</div>
        <div class="error-text">${message}</div>
        ${retryButton}
      </div>
    `;
  }

  /**
   * 获取错误历史记录
   * @param {string} level - 过滤级别
   * @returns {Array} 错误记录数组
   */
  getErrorHistory(level = null) {
    if (level) {
      return this.errorHistory.filter(entry => entry.level === level);
    }
    return [...this.errorHistory];
  }

  /**
   * 清除错误历史记录
   */
  clearHistory() {
    this.errorHistory = [];
  }

  /**
   * 导出错误报告
   * @returns {string} JSON格式的错误报告
   */
  exportErrorReport() {
    const report = {
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href,
      errors: this.getErrorHistory('error'),
      warnings: this.getErrorHistory('warn')
    };
    
    return JSON.stringify(report, null, 2);
  }
}

// 创建全局错误处理器实例
window.errorHandler = new ErrorHandler();

// 全局错误捕获
window.addEventListener('error', (event) => {
  window.errorHandler.log('error', '全局JavaScript错误', {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
    stack: event.error?.stack
  });
});

// Promise错误捕获
window.addEventListener('unhandledrejection', (event) => {
  window.errorHandler.log('error', '未处理的Promise拒绝', {
    reason: event.reason,
    stack: event.reason?.stack
  });
});