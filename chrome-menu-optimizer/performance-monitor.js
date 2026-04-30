/**
 * 性能监控模块
 * 监控应用性能、内存使用和用户体验指标
 */

class PerformanceMonitor {
  constructor() {
    this.metrics = new Map();
    this.observers = [];
    this.isEnabled = false;
    this.startTime = performance.now();
    
    // 性能阈值配置
    this.thresholds = {
      renderTime: 100, // 渲染时间阈值(ms)
      apiResponseTime: 1000, // API响应时间阈值(ms)
      memoryUsage: 50 * 1024 * 1024, // 内存使用阈值(50MB)
      domNodes: 1000 // DOM节点数量阈值
    };

    this.init();
  }

  /**
   * 初始化性能监控
   */
  init() {
    if (window.configManager?.get('development.enablePerformanceMonitoring')) {
      this.enable();
    }
  }

  /**
   * 启用性能监控
   */
  enable() {
    this.isEnabled = true;
    this.setupObservers();
    this.startMemoryMonitoring();
    console.log('性能监控已启用');
  }

  /**
   * 禁用性能监控
   */
  disable() {
    this.isEnabled = false;
    this.observers.forEach(observer => observer.disconnect());
    this.observers = [];
    console.log('性能监控已禁用');
  }

  /**
   * 设置性能观察器
   */
  setupObservers() {
    // 观察DOM变化
    if ('MutationObserver' in window) {
      const domObserver = new MutationObserver((mutations) => {
        this.trackDomChanges(mutations);
      });
      
      domObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: false
      });
      
      this.observers.push(domObserver);
    }

    // 观察性能条目
    if ('PerformanceObserver' in window) {
      try {
        const perfObserver = new PerformanceObserver((list) => {
          this.trackPerformanceEntries(list.getEntries());
        });
        
        perfObserver.observe({ entryTypes: ['measure', 'navigation', 'resource'] });
        this.observers.push(perfObserver);
      } catch (error) {
        console.warn('PerformanceObserver不支持:', error);
      }
    }
  }

  /**
   * 开始计时
   * @param {string} name - 计时器名称
   */
  startTimer(name) {
    if (!this.isEnabled) return;
    
    this.metrics.set(`${name}_start`, performance.now());
    performance.mark(`${name}_start`);
  }

  /**
   * 结束计时
   * @param {string} name - 计时器名称
   * @returns {number} 耗时(ms)
   */
  endTimer(name) {
    if (!this.isEnabled) return 0;
    
    const endTime = performance.now();
    const startTime = this.metrics.get(`${name}_start`);
    
    if (startTime) {
      const duration = endTime - startTime;
      this.metrics.set(`${name}_duration`, duration);
      
      performance.mark(`${name}_end`);
      performance.measure(name, `${name}_start`, `${name}_end`);
      
      // 检查是否超过阈值
      this.checkThreshold(name, duration);
      
      return duration;
    }
    
    return 0;
  }

  /**
   * 记录自定义指标
   * @param {string} name - 指标名称
   * @param {number} value - 指标值
   * @param {string} unit - 单位
   */
  recordMetric(name, value, unit = 'ms') {
    if (!this.isEnabled) return;
    
    this.metrics.set(name, {
      value,
      unit,
      timestamp: Date.now()
    });
  }

  /**
   * 监控API调用性能
   * @param {string} apiName - API名称
   * @param {Function} apiCall - API调用函数
   * @returns {Promise} API调用结果
   */
  async monitorApiCall(apiName, apiCall) {
    if (!this.isEnabled) {
      return await apiCall();
    }

    this.startTimer(`api_${apiName}`);
    
    try {
      const result = await apiCall();
      const duration = this.endTimer(`api_${apiName}`);
      
      this.recordMetric(`api_${apiName}_success`, duration);
      
      if (duration > this.thresholds.apiResponseTime) {
        console.warn(`API调用 ${apiName} 耗时过长: ${duration}ms`);
      }
      
      return result;
    } catch (error) {
      this.endTimer(`api_${apiName}`);
      this.recordMetric(`api_${apiName}_error`, 1, 'count');
      throw error;
    }
  }

  /**
   * 监控渲染性能
   * @param {string} componentName - 组件名称
   * @param {Function} renderFunction - 渲染函数
   * @returns {any} 渲染结果
   */
  monitorRender(componentName, renderFunction) {
    if (!this.isEnabled) {
      return renderFunction();
    }

    this.startTimer(`render_${componentName}`);
    
    const result = renderFunction();
    
    // 使用 requestAnimationFrame 确保渲染完成后再计时
    requestAnimationFrame(() => {
      const duration = this.endTimer(`render_${componentName}`);
      
      if (duration > this.thresholds.renderTime) {
        console.warn(`组件 ${componentName} 渲染耗时过长: ${duration}ms`);
      }
    });
    
    return result;
  }

  /**
   * 获取内存使用情况
   * @returns {object} 内存使用信息
   */
  getMemoryUsage() {
    if ('memory' in performance) {
      return {
        used: performance.memory.usedJSHeapSize,
        total: performance.memory.totalJSHeapSize,
        limit: performance.memory.jsHeapSizeLimit
      };
    }
    return null;
  }

  /**
   * 开始内存监控
   */
  startMemoryMonitoring() {
    if (!('memory' in performance)) return;

    setInterval(() => {
      const memory = this.getMemoryUsage();
      if (memory) {
        this.recordMetric('memory_used', memory.used, 'bytes');
        
        if (memory.used > this.thresholds.memoryUsage) {
          console.warn(`内存使用过高: ${(memory.used / 1024 / 1024).toFixed(2)}MB`);
        }
      }
    }, 10000); // 每10秒检查一次
  }

  /**
   * 跟踪DOM变化
   * @param {Array} mutations - DOM变化记录
   */
  trackDomChanges(mutations) {
    const nodeCount = document.querySelectorAll('*').length;
    this.recordMetric('dom_nodes', nodeCount, 'count');
    
    if (nodeCount > this.thresholds.domNodes) {
      console.warn(`DOM节点数量过多: ${nodeCount}`);
    }
  }

  /**
   * 跟踪性能条目
   * @param {Array} entries - 性能条目
   */
  trackPerformanceEntries(entries) {
    entries.forEach(entry => {
      if (entry.entryType === 'resource') {
        this.recordMetric(`resource_${entry.name}`, entry.duration);
      } else if (entry.entryType === 'measure') {
        this.recordMetric(`measure_${entry.name}`, entry.duration);
      }
    });
  }

  /**
   * 检查性能阈值
   * @param {string} name - 指标名称
   * @param {number} value - 指标值
   */
  checkThreshold(name, value) {
    const thresholdKey = name.replace(/^(api_|render_)/, '').replace(/_.*$/, '');
    const threshold = this.thresholds[thresholdKey];
    
    if (threshold && value > threshold) {
      console.warn(`性能警告: ${name} 耗时 ${value}ms 超过阈值 ${threshold}ms`);
    }
  }

  /**
   * 获取性能报告
   * @returns {object} 性能报告
   */
  getPerformanceReport() {
    const report = {
      timestamp: new Date().toISOString(),
      uptime: performance.now() - this.startTime,
      metrics: Object.fromEntries(this.metrics),
      memory: this.getMemoryUsage(),
      navigation: this.getNavigationTiming(),
      resources: this.getResourceTiming()
    };

    return report;
  }

  /**
   * 获取导航时间
   * @returns {object} 导航时间信息
   */
  getNavigationTiming() {
    if ('navigation' in performance && performance.navigation) {
      const timing = performance.timing;
      return {
        domContentLoaded: timing.domContentLoadedEventEnd - timing.navigationStart,
        loadComplete: timing.loadEventEnd - timing.navigationStart,
        domReady: timing.domComplete - timing.navigationStart
      };
    }
    return null;
  }

  /**
   * 获取资源加载时间
   * @returns {Array} 资源时间信息
   */
  getResourceTiming() {
    return performance.getEntriesByType('resource').map(entry => ({
      name: entry.name,
      duration: entry.duration,
      size: entry.transferSize || 0,
      type: entry.initiatorType
    }));
  }

  /**
   * 清除性能数据
   */
  clearMetrics() {
    this.metrics.clear();
    performance.clearMarks();
    performance.clearMeasures();
  }

  /**
   * 导出性能数据
   * @returns {string} JSON格式的性能数据
   */
  exportData() {
    return JSON.stringify(this.getPerformanceReport(), null, 2);
  }
}

// 创建全局性能监控器实例
window.performanceMonitor = new PerformanceMonitor();