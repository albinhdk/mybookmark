// Chrome Menu Optimizer - 日志管理模块
// 提供统一的日志记录和调试功能

class Logger {
  constructor(config = {}) {
    this.prefix = config.prefix || '[ChromeMenuOptimizer]';
    this.debugEnabled = config.debugEnabled || false;
    this.performanceEnabled = config.performanceEnabled || true;
    this.logLevels = {
      ERROR: 0,
      WARN: 1,
      INFO: 2,
      DEBUG: 3,
      TRACE: 4
    };
    this.currentLevel = config.logLevel || this.logLevels.INFO;
    this.performanceMarks = new Map();
  }

  // 设置日志级别
  setLogLevel(level) {
    if (typeof level === 'string') {
      this.currentLevel = this.logLevels[level.toUpperCase()] || this.logLevels.INFO;
    } else {
      this.currentLevel = level;
    }
  }

  // 启用/禁用调试模式
  setDebugMode(enabled) {
    this.debugEnabled = enabled;
    this.currentLevel = enabled ? this.logLevels.DEBUG : this.logLevels.INFO;
  }

  // 格式化消息
  formatMessage(level, message, data = null) {
    const timestamp = new Date().toISOString().substr(11, 12);
    const levelStr = Object.keys(this.logLevels).find(key => this.logLevels[key] === level);
    let formattedMessage = `${this.prefix} [${timestamp}] [${levelStr}] ${message}`;
    
    if (data !== null) {
      formattedMessage += ` | Data: ${JSON.stringify(data)}`;
    }
    
    return formattedMessage;
  }

  // 基础日志方法
  log(level, message, data = null) {
    if (level <= this.currentLevel) {
      const formattedMessage = this.formatMessage(level, message, data);
      
      switch (level) {
        case this.logLevels.ERROR:
          console.error(formattedMessage);
          break;
        case this.logLevels.WARN:
          console.warn(formattedMessage);
          break;
        case this.logLevels.DEBUG:
        case this.logLevels.TRACE:
          if (this.debugEnabled) {
            console.debug(formattedMessage);
          }
          break;
        default:
          console.log(formattedMessage);
      }
    }
  }

  // 便捷方法
  error(message, data = null) {
    this.log(this.logLevels.ERROR, message, data);
  }

  warn(message, data = null) {
    this.log(this.logLevels.WARN, message, data);
  }

  info(message, data = null) {
    this.log(this.logLevels.INFO, message, data);
  }

  debug(message, data = null) {
    this.log(this.logLevels.DEBUG, message, data);
  }

  trace(message, data = null) {
    this.log(this.logLevels.TRACE, message, data);
  }

  // 性能监控方法
  startPerformance(markName) {
    if (this.performanceEnabled) {
      const startTime = performance.now();
      this.performanceMarks.set(markName, startTime);
      this.debug(`Performance mark started: ${markName}`);
    }
  }

  endPerformance(markName, logMessage = null) {
    if (this.performanceEnabled && this.performanceMarks.has(markName)) {
      const startTime = this.performanceMarks.get(markName);
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      this.performanceMarks.delete(markName);
      
      const message = logMessage || `Performance mark completed: ${markName}`;
      this.info(`${message} | Duration: ${duration.toFixed(2)}ms`);
      
      return duration;
    }
    return null;
  }

  // 检测结果日志
  logDetectionResult(type, selectors, foundElements) {
    const message = `Detection completed for ${type}`;
    const data = {
      selectorsCount: selectors.length,
      foundElementsCount: foundElements.length,
      selectors: this.debugEnabled ? selectors : selectors.length,
      elements: this.debugEnabled ? foundElements.map(el => el.tagName + (el.className ? '.' + el.className : '')) : foundElements.length
    };
    this.info(message, data);
  }

  // 样式应用日志
  logStyleApplication(styleType, success, details = {}) {
    const message = `Style application ${success ? 'succeeded' : 'failed'}: ${styleType}`;
    this.info(message, details);
  }

  // DOM变化日志
  logDOMChange(changeType, details = {}) {
    this.debug(`DOM change detected: ${changeType}`, details);
  }

  // 错误处理日志
  logError(operation, error, context = {}) {
    const message = `Error in ${operation}`;
    const errorData = {
      error: error.message,
      stack: this.debugEnabled ? error.stack : undefined,
      context
    };
    this.error(message, errorData);
  }

  // 扩展状态日志
  logExtensionState(state, details = {}) {
    this.info(`Extension state: ${state}`, details);
  }

  // 批量日志（用于减少控制台输出）
  batchLog(logs, flushInterval = 1000) {
    if (!this.batchBuffer) {
      this.batchBuffer = [];
      this.batchTimer = null;
    }

    this.batchBuffer.push(...logs);

    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
    }

    this.batchTimer = setTimeout(() => {
      if (this.batchBuffer.length > 0) {
        console.group(`${this.prefix} Batch Logs (${this.batchBuffer.length} entries)`);
        this.batchBuffer.forEach(log => {
          this.log(log.level, log.message, log.data);
        });
        console.groupEnd();
        this.batchBuffer = [];
      }
    }, flushInterval);
  }

  // 获取性能统计
  getPerformanceStats() {
    return {
      activeMarks: Array.from(this.performanceMarks.keys()),
      marksCount: this.performanceMarks.size
    };
  }

  // 清理资源
  cleanup() {
    this.performanceMarks.clear();
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
    if (this.batchBuffer) {
      this.batchBuffer = [];
    }
  }
}

// 创建默认日志实例
const createLogger = (config = {}) => {
  return new Logger(config);
};

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Logger, createLogger };
} else if (typeof window !== 'undefined') {
  window.ChromeMenuOptimizerLogger = { Logger, createLogger };
}