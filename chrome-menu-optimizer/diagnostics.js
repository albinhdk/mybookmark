// Chrome Menu Optimizer - 诊断和监控系统
class DiagnosticsManager {
  constructor() {
    this.errors = [];
    this.performance = [];
    this.connectionStatus = 'unknown';
    this.lastCheck = null;
    this.maxErrors = 50;
    this.maxPerformance = 100;
  }

  // 记录错误
  logError(error, context = '', severity = 'error') {
    const errorEntry = {
      timestamp: Date.now(),
      message: error.message || error,
      stack: error.stack || '',
      context: context,
      severity: severity,
      url: window.location.href,
      userAgent: navigator.userAgent
    };

    this.errors.unshift(errorEntry);
    if (this.errors.length > this.maxErrors) {
      this.errors = this.errors.slice(0, this.maxErrors);
    }

    console.error(`[Diagnostics] ${severity.toUpperCase()}: ${context}`, error);
    
    // 发送到后台脚本（如果需要）
    this.sendToBackground('error', errorEntry);
  }

  // 记录性能数据
  logPerformance(operation, duration, details = {}) {
    const perfEntry = {
      timestamp: Date.now(),
      operation: operation,
      duration: duration,
      details: details,
      url: window.location.href
    };

    this.performance.unshift(perfEntry);
    if (this.performance.length > this.maxPerformance) {
      this.performance = this.performance.slice(0, this.maxPerformance);
    }

    console.log(`[Diagnostics] Performance: ${operation} took ${duration}ms`, details);
  }

  // 测试连接状态
  async testConnection() {
    const startTime = performance.now();
    
    try {
      // 测试与popup的连接
      const response = await this.sendMessage({ action: 'ping' });
      const duration = performance.now() - startTime;
      
      this.connectionStatus = 'connected';
      this.lastCheck = Date.now();
      this.logPerformance('connection_test', duration, { status: 'success' });
      
      return { success: true, duration: duration };
    } catch (error) {
      const duration = performance.now() - startTime;
      
      this.connectionStatus = 'disconnected';
      this.lastCheck = Date.now();
      this.logError(error, 'connection_test', 'warning');
      this.logPerformance('connection_test', duration, { status: 'failed' });
      
      return { success: false, error: error.message, duration: duration };
    }
  }

  // 发送消息的包装器
  sendMessage(message, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Message timeout'));
      }, timeout);

      chrome.runtime.sendMessage(message, (response) => {
        clearTimeout(timeoutId);
        
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  }

  // 发送数据到后台脚本
  sendToBackground(type, data) {
    try {
      chrome.runtime.sendMessage({
        action: 'diagnostics',
        type: type,
        data: data
      }).catch(() => {
        // 忽略发送失败，避免循环错误
      });
    } catch (error) {
      // 忽略发送失败
    }
  }

  // 系统健康检查
  async healthCheck() {
    const health = {
      timestamp: Date.now(),
      connection: await this.testConnection(),
      dom: this.checkDOMHealth(),
      styles: this.checkStylesHealth(),
      performance: this.getPerformanceStats(),
      errors: this.getErrorStats()
    };

    console.log('[Diagnostics] Health Check:', health);
    return health;
  }

  // 检查DOM健康状态
  checkDOMHealth() {
    const selectors = [
      '#bookmarks-bar-content',
      '.bookmarks-bar-content',
      '[id*="bookmark"][id*="bar"]',
      '.bookmark-bar',
      '#bookmark-bar'
    ];

    const found = [];
    const missing = [];

    selectors.forEach(selector => {
      try {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          found.push({ selector, count: elements.length });
        } else {
          missing.push(selector);
        }
      } catch (error) {
        missing.push(selector);
        this.logError(error, `DOM check for ${selector}`, 'warning');
      }
    });

    return {
      found: found,
      missing: missing,
      totalElements: found.reduce((sum, item) => sum + item.count, 0)
    };
  }

  // 检查样式健康状态
  checkStylesHealth() {
    const styleIds = [
      'chrome-menu-optimizer-super-force',
      'chrome-menu-optimizer-styles'
    ];

    const applied = [];
    const missing = [];

    styleIds.forEach(id => {
      const element = document.getElementById(id);
      if (element) {
        applied.push({
          id: id,
          length: element.textContent.length,
          disabled: element.disabled
        });
      } else {
        missing.push(id);
      }
    });

    return {
      applied: applied,
      missing: missing
    };
  }

  // 获取性能统计
  getPerformanceStats() {
    if (this.performance.length === 0) {
      return { count: 0 };
    }

    const durations = this.performance.map(p => p.duration);
    const avg = durations.reduce((sum, d) => sum + d, 0) / durations.length;
    const max = Math.max(...durations);
    const min = Math.min(...durations);

    return {
      count: this.performance.length,
      average: Math.round(avg * 100) / 100,
      max: max,
      min: min,
      recent: this.performance.slice(0, 5)
    };
  }

  // 获取错误统计
  getErrorStats() {
    if (this.errors.length === 0) {
      return { count: 0 };
    }

    const severityCounts = this.errors.reduce((counts, error) => {
      counts[error.severity] = (counts[error.severity] || 0) + 1;
      return counts;
    }, {});

    return {
      count: this.errors.length,
      severityCounts: severityCounts,
      recent: this.errors.slice(0, 5).map(e => ({
        timestamp: e.timestamp,
        message: e.message,
        context: e.context,
        severity: e.severity
      }))
    };
  }

  // 生成诊断报告
  generateReport() {
    return {
      timestamp: Date.now(),
      version: '1.0.0',
      url: window.location.href,
      userAgent: navigator.userAgent,
      connectionStatus: this.connectionStatus,
      lastCheck: this.lastCheck,
      errors: this.getErrorStats(),
      performance: this.getPerformanceStats(),
      dom: this.checkDOMHealth(),
      styles: this.checkStylesHealth()
    };
  }

  // 清除历史数据
  clear() {
    this.errors = [];
    this.performance = [];
    this.connectionStatus = 'unknown';
    this.lastCheck = null;
    console.log('[Diagnostics] History cleared');
  }
}

// 创建全局诊断实例
window.ChromeMenuOptimizerDiagnostics = new DiagnosticsManager();

// 自动错误捕获
window.addEventListener('error', (event) => {
  window.ChromeMenuOptimizerDiagnostics.logError(
    event.error || new Error(event.message),
    'global_error_handler',
    'error'
  );
});

window.addEventListener('unhandledrejection', (event) => {
  window.ChromeMenuOptimizerDiagnostics.logError(
    event.reason,
    'unhandled_promise_rejection',
    'error'
  );
});

console.log('[Diagnostics] Diagnostics system initialized');