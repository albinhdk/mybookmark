/**
 * Chrome 书签优化器 - 性能监控和优化模块
 * 提供性能监控、内存管理和优化建议
 */

class PerformanceMonitor {
  constructor() {
    this.metrics = {
      domOperations: [],
      styleApplications: [],
      memoryUsage: [],
      renderTimes: [],
      mutationEvents: []
    };
    
    this.thresholds = {
      slowDomOperation: 50, // ms
      slowStyleApplication: 100, // ms
      highMemoryUsage: 50 * 1024 * 1024, // 50MB
      slowRender: 16.67, // 60fps threshold
      excessiveMutations: 100 // per second
    };
    
    this.observers = new Map();
    this.isMonitoring = false;
    this.maxMetricsHistory = 1000;
    
    this.initializeMonitoring();
  }

  /**
   * 初始化性能监控
   */
  initializeMonitoring() {
    if (typeof window !== 'undefined' && window.performance) {
      this.setupPerformanceObserver();
      this.setupMemoryMonitoring();
      this.setupMutationMonitoring();
    }
  }

  /**
   * 设置性能观察器
   */
  setupPerformanceObserver() {
    if ('PerformanceObserver' in window) {
      try {
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            this.processPerformanceEntry(entry);
          }
        });
        
        observer.observe({ entryTypes: ['measure', 'navigation', 'paint'] });
        this.observers.set('performance', observer);
      } catch (error) {
        console.warn('[PerformanceMonitor] Failed to setup PerformanceObserver:', error);
      }
    }
  }

  /**
   * 设置内存监控
   */
  setupMemoryMonitoring() {
    if (window.performance && window.performance.memory) {
      setInterval(() => {
        this.recordMemoryUsage();
      }, 30000); // 每30秒记录一次内存使用
    }
  }

  /**
   * 设置DOM变化监控
   */
  setupMutationMonitoring() {
    const mutationObserver = new MutationObserver((mutations) => {
      this.recordMutationEvents(mutations);
    });
    
    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'id']
    });
    
    this.observers.set('mutation', mutationObserver);
  }

  /**
   * 处理性能条目
   */
  processPerformanceEntry(entry) {
    switch (entry.entryType) {
      case 'measure':
        this.recordCustomMeasure(entry);
        break;
      case 'navigation':
        this.recordNavigationTiming(entry);
        break;
      case 'paint':
        this.recordPaintTiming(entry);
        break;
    }
  }

  /**
   * 记录自定义测量
   */
  recordCustomMeasure(entry) {
    const metric = {
      timestamp: Date.now(),
      name: entry.name,
      duration: entry.duration,
      startTime: entry.startTime
    };
    
    if (entry.name.includes('dom')) {
      this.addMetric('domOperations', metric);
    } else if (entry.name.includes('style')) {
      this.addMetric('styleApplications', metric);
    }
    
    // 检查是否超过阈值
    this.checkThresholds(entry);
  }

  /**
   * 记录导航时间
   */
  recordNavigationTiming(entry) {
    const renderTime = entry.loadEventEnd - entry.navigationStart;
    this.addMetric('renderTimes', {
      timestamp: Date.now(),
      renderTime: renderTime,
      domContentLoaded: entry.domContentLoadedEventEnd - entry.navigationStart,
      loadComplete: entry.loadEventEnd - entry.navigationStart
    });
  }

  /**
   * 记录绘制时间
   */
  recordPaintTiming(entry) {
    this.addMetric('renderTimes', {
      timestamp: Date.now(),
      type: entry.name,
      startTime: entry.startTime
    });
  }

  /**
   * 记录内存使用
   */
  recordMemoryUsage() {
    if (window.performance && window.performance.memory) {
      const memory = window.performance.memory;
      const usage = {
        timestamp: Date.now(),
        used: memory.usedJSHeapSize,
        total: memory.totalJSHeapSize,
        limit: memory.jsHeapSizeLimit
      };
      
      this.addMetric('memoryUsage', usage);
      
      // 检查内存使用是否过高
      if (usage.used > this.thresholds.highMemoryUsage) {
        this.reportHighMemoryUsage(usage);
      }
    }
  }

  /**
   * 记录DOM变化事件
   */
  recordMutationEvents(mutations) {
    const now = Date.now();
    const mutationCount = mutations.length;
    
    this.addMetric('mutationEvents', {
      timestamp: now,
      count: mutationCount,
      types: mutations.map(m => m.type)
    });
    
    // 检查是否有过多的DOM变化
    this.checkMutationFrequency();
  }

  /**
   * 添加指标到历史记录
   */
  addMetric(type, metric) {
    if (!this.metrics[type]) {
      this.metrics[type] = [];
    }
    
    this.metrics[type].unshift(metric);
    
    // 限制历史记录长度
    if (this.metrics[type].length > this.maxMetricsHistory) {
      this.metrics[type] = this.metrics[type].slice(0, this.maxMetricsHistory);
    }
  }

  /**
   * 检查性能阈值
   */
  checkThresholds(entry) {
    if (entry.name.includes('dom') && entry.duration > this.thresholds.slowDomOperation) {
      this.reportSlowOperation('DOM', entry);
    } else if (entry.name.includes('style') && entry.duration > this.thresholds.slowStyleApplication) {
      this.reportSlowOperation('Style', entry);
    }
  }

  /**
   * 检查DOM变化频率
   */
  checkMutationFrequency() {
    const now = Date.now();
    const recentMutations = this.metrics.mutationEvents.filter(
      m => now - m.timestamp < 1000
    );
    
    const totalMutations = recentMutations.reduce((sum, m) => sum + m.count, 0);
    
    if (totalMutations > this.thresholds.excessiveMutations) {
      this.reportExcessiveMutations(totalMutations);
    }
  }

  /**
   * 开始性能测量
   */
  startMeasure(name) {
    if (window.performance && window.performance.mark) {
      const markName = `${name}-start`;
      window.performance.mark(markName);
      return markName;
    }
    return null;
  }

  /**
   * 结束性能测量
   */
  endMeasure(name, startMark = null) {
    if (window.performance && window.performance.mark && window.performance.measure) {
      const endMarkName = `${name}-end`;
      const measureName = `${name}-measure`;
      const startMarkName = startMark || `${name}-start`;
      
      try {
        window.performance.mark(endMarkName);
        window.performance.measure(measureName, startMarkName, endMarkName);
        
        const measure = window.performance.getEntriesByName(measureName)[0];
        return measure ? measure.duration : null;
      } catch (error) {
        console.warn('[PerformanceMonitor] Failed to measure:', error);
        return null;
      }
    }
    return null;
  }

  /**
   * 获取性能统计
   */
  getPerformanceStats() {
    const stats = {};
    
    for (const [type, metrics] of Object.entries(this.metrics)) {
      if (metrics.length > 0) {
        stats[type] = this.calculateStats(metrics);
      }
    }
    
    return stats;
  }

  /**
   * 计算统计数据
   */
  calculateStats(metrics) {
    if (metrics.length === 0) return null;
    
    const durations = metrics
      .map(m => m.duration || m.renderTime || m.used || m.count)
      .filter(d => typeof d === 'number');
    
    if (durations.length === 0) return { count: metrics.length };
    
    const sorted = durations.sort((a, b) => a - b);
    const sum = durations.reduce((a, b) => a + b, 0);
    
    return {
      count: metrics.length,
      average: sum / durations.length,
      median: sorted[Math.floor(sorted.length / 2)],
      min: Math.min(...durations),
      max: Math.max(...durations),
      p95: sorted[Math.floor(sorted.length * 0.95)],
      recent: metrics.slice(0, 5)
    };
  }

  /**
   * 获取性能建议
   */
  getPerformanceRecommendations() {
    const recommendations = [];
    const stats = this.getPerformanceStats();
    
    // DOM操作建议
    if (stats.domOperations && stats.domOperations.average > this.thresholds.slowDomOperation) {
      recommendations.push({
        type: 'dom',
        severity: 'warning',
        message: 'DOM操作较慢，建议使用批量操作和DocumentFragment',
        details: `平均耗时: ${stats.domOperations.average.toFixed(2)}ms`
      });
    }
    
    // 样式应用建议
    if (stats.styleApplications && stats.styleApplications.average > this.thresholds.slowStyleApplication) {
      recommendations.push({
        type: 'style',
        severity: 'warning',
        message: '样式应用较慢，建议减少重排和重绘',
        details: `平均耗时: ${stats.styleApplications.average.toFixed(2)}ms`
      });
    }
    
    // 内存使用建议
    if (stats.memoryUsage && stats.memoryUsage.max > this.thresholds.highMemoryUsage) {
      recommendations.push({
        type: 'memory',
        severity: 'error',
        message: '内存使用过高，建议清理未使用的对象和事件监听器',
        details: `最大使用: ${(stats.memoryUsage.max / 1024 / 1024).toFixed(2)}MB`
      });
    }
    
    // DOM变化建议
    if (stats.mutationEvents && stats.mutationEvents.average > this.thresholds.excessiveMutations / 10) {
      recommendations.push({
        type: 'mutations',
        severity: 'info',
        message: 'DOM变化频繁，建议使用防抖或节流优化',
        details: `平均变化: ${stats.mutationEvents.average.toFixed(0)}次/秒`
      });
    }
    
    return recommendations;
  }

  /**
   * 报告慢操作
   */
  reportSlowOperation(type, entry) {
    console.warn(`[PerformanceMonitor] Slow ${type} operation detected:`, {
      name: entry.name,
      duration: entry.duration,
      threshold: type === 'DOM' ? this.thresholds.slowDomOperation : this.thresholds.slowStyleApplication
    });
  }

  /**
   * 报告高内存使用
   */
  reportHighMemoryUsage(usage) {
    console.warn('[PerformanceMonitor] High memory usage detected:', {
      used: `${(usage.used / 1024 / 1024).toFixed(2)}MB`,
      total: `${(usage.total / 1024 / 1024).toFixed(2)}MB`,
      threshold: `${(this.thresholds.highMemoryUsage / 1024 / 1024).toFixed(2)}MB`
    });
  }

  /**
   * 报告过多DOM变化
   */
  reportExcessiveMutations(count) {
    console.warn('[PerformanceMonitor] Excessive DOM mutations detected:', {
      count: count,
      threshold: this.thresholds.excessiveMutations,
      timeWindow: '1 second'
    });
  }

  /**
   * 清理资源
   */
  cleanup() {
    // 断开所有观察器
    for (const [name, observer] of this.observers) {
      try {
        observer.disconnect();
      } catch (error) {
        console.warn(`[PerformanceMonitor] Failed to disconnect ${name} observer:`, error);
      }
    }
    
    this.observers.clear();
    
    // 清理性能标记
    if (window.performance && window.performance.clearMarks) {
      window.performance.clearMarks();
    }
    
    // 清理指标历史
    for (const type of Object.keys(this.metrics)) {
      this.metrics[type] = [];
    }
  }

  /**
   * 生成性能报告
   */
  generateReport() {
    return {
      timestamp: Date.now(),
      stats: this.getPerformanceStats(),
      recommendations: this.getPerformanceRecommendations(),
      thresholds: this.thresholds,
      isMonitoring: this.isMonitoring
    };
  }
}

// 导出性能监控器
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PerformanceMonitor;
} else if (typeof window !== 'undefined') {
  window.PerformanceMonitor = PerformanceMonitor;
}