/**
 * 代码质量检查工具
 * 提供代码质量分析、最佳实践检查和改进建议
 */

class CodeQualityChecker {
  constructor() {
    this.checks = [];
    this.results = [];
    this.setupChecks();
  }

  /**
   * 设置检查项目
   */
  setupChecks() {
    this.checks = [
      {
        name: 'DOM操作优化',
        check: this.checkDomOperations.bind(this),
        severity: 'warning'
      },
      {
        name: '内存泄漏检查',
        check: this.checkMemoryLeaks.bind(this),
        severity: 'error'
      },
      {
        name: '事件监听器管理',
        check: this.checkEventListeners.bind(this),
        severity: 'warning'
      },
      {
        name: '异步操作处理',
        check: this.checkAsyncOperations.bind(this),
        severity: 'info'
      },
      {
        name: '错误处理完整性',
        check: this.checkErrorHandling.bind(this),
        severity: 'error'
      },
      {
        name: '性能优化建议',
        check: this.checkPerformanceOptimizations.bind(this),
        severity: 'info'
      }
    ];
  }

  /**
   * 运行所有检查
   * @returns {Array} 检查结果
   */
  runAllChecks() {
    this.results = [];
    
    this.checks.forEach(check => {
      try {
        const result = check.check();
        if (result && result.length > 0) {
          this.results.push({
            name: check.name,
            severity: check.severity,
            issues: result
          });
        }
      } catch (error) {
        this.results.push({
          name: check.name,
          severity: 'error',
          issues: [`检查过程中发生错误: ${error.message}`]
        });
      }
    });

    return this.results;
  }

  /**
   * 检查DOM操作优化
   * @returns {Array} 问题列表
   */
  checkDomOperations() {
    const issues = [];
    
    // 检查是否有频繁的DOM查询
    const scripts = document.querySelectorAll('script');
    scripts.forEach(script => {
      if (script.textContent) {
        const domQueries = script.textContent.match(/document\.(getElementById|querySelector|querySelectorAll)/g);
        if (domQueries && domQueries.length > 10) {
          issues.push('检测到频繁的DOM查询，建议缓存DOM元素引用');
        }
      }
    });

    // 检查是否有内联样式
    const elementsWithInlineStyle = document.querySelectorAll('[style]');
    if (elementsWithInlineStyle.length > 5) {
      issues.push(`发现 ${elementsWithInlineStyle.length} 个内联样式元素，建议使用CSS类`);
    }

    return issues;
  }

  /**
   * 检查内存泄漏
   * @returns {Array} 问题列表
   */
  checkMemoryLeaks() {
    const issues = [];
    
    // 检查全局变量
    const globalVars = Object.keys(window).filter(key => 
      !['chrome', 'console', 'document', 'window', 'navigator'].includes(key) &&
      typeof window[key] !== 'function'
    );
    
    if (globalVars.length > 10) {
      issues.push(`检测到 ${globalVars.length} 个全局变量，可能存在内存泄漏风险`);
    }

    // 检查未清理的定时器（这里只是示例，实际需要更复杂的检测）
    if (window.setInterval.toString().includes('[native code]')) {
      issues.push('建议检查是否有未清理的定时器');
    }

    return issues;
  }

  /**
   * 检查事件监听器管理
   * @returns {Array} 问题列表
   */
  checkEventListeners() {
    const issues = [];
    
    // 检查是否有重复的事件监听器
    const elements = document.querySelectorAll('*');
    let totalListeners = 0;
    
    elements.forEach(element => {
      const events = getEventListeners ? getEventListeners(element) : {};
      totalListeners += Object.keys(events).length;
    });

    if (totalListeners > 50) {
      issues.push(`检测到 ${totalListeners} 个事件监听器，建议使用事件委托优化`);
    }

    return issues;
  }

  /**
   * 检查异步操作处理
   * @returns {Array} 问题列表
   */
  checkAsyncOperations() {
    const issues = [];
    
    // 检查是否有未处理的Promise
    let unhandledPromises = 0;
    
    window.addEventListener('unhandledrejection', () => {
      unhandledPromises++;
    });

    if (unhandledPromises > 0) {
      issues.push(`检测到 ${unhandledPromises} 个未处理的Promise拒绝`);
    }

    // 建议使用async/await
    issues.push('建议使用async/await替代Promise链，提高代码可读性');

    return issues;
  }

  /**
   * 检查错误处理完整性
   * @returns {Array} 问题列表
   */
  checkErrorHandling() {
    const issues = [];
    
    // 检查是否有全局错误处理
    if (!window.onerror && !window.addEventListener) {
      issues.push('缺少全局错误处理机制');
    }

    // 检查Chrome API错误处理
    if (typeof chrome !== 'undefined') {
      issues.push('建议在所有Chrome API调用后检查chrome.runtime.lastError');
    }

    return issues;
  }

  /**
   * 检查性能优化建议
   * @returns {Array} 问题列表
   */
  checkPerformanceOptimizations() {
    const issues = [];
    
    // 检查图片优化
    const images = document.querySelectorAll('img');
    images.forEach(img => {
      if (!img.loading) {
        issues.push('建议为图片添加lazy loading属性');
      }
    });

    // 检查CSS优化
    const stylesheets = document.querySelectorAll('link[rel="stylesheet"]');
    if (stylesheets.length > 3) {
      issues.push('建议合并CSS文件以减少HTTP请求');
    }

    // 检查JavaScript优化
    const scripts = document.querySelectorAll('script[src]');
    if (scripts.length > 5) {
      issues.push('建议合并JavaScript文件以减少HTTP请求');
    }

    return issues;
  }

  /**
   * 生成质量报告
   * @returns {object} 质量报告
   */
  generateReport() {
    const results = this.runAllChecks();
    
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        totalChecks: this.checks.length,
        totalIssues: results.reduce((sum, result) => sum + result.issues.length, 0),
        errorCount: results.filter(r => r.severity === 'error').length,
        warningCount: results.filter(r => r.severity === 'warning').length,
        infoCount: results.filter(r => r.severity === 'info').length
      },
      details: results,
      recommendations: this.generateRecommendations(results)
    };

    return report;
  }

  /**
   * 生成改进建议
   * @param {Array} results - 检查结果
   * @returns {Array} 建议列表
   */
  generateRecommendations(results) {
    const recommendations = [];
    
    // 基于检查结果生成建议
    if (results.some(r => r.name === 'DOM操作优化' && r.issues.length > 0)) {
      recommendations.push({
        priority: 'high',
        category: '性能优化',
        suggestion: '实现DOM元素缓存机制，减少重复查询',
        implementation: '创建一个DOM缓存对象，在初始化时缓存常用元素'
      });
    }

    if (results.some(r => r.name === '内存泄漏检查' && r.issues.length > 0)) {
      recommendations.push({
        priority: 'high',
        category: '内存管理',
        suggestion: '实现资源清理机制，避免内存泄漏',
        implementation: '在组件销毁时清理事件监听器、定时器和全局引用'
      });
    }

    if (results.some(r => r.name === '事件监听器管理' && r.issues.length > 0)) {
      recommendations.push({
        priority: 'medium',
        category: '事件管理',
        suggestion: '使用事件委托减少事件监听器数量',
        implementation: '在父容器上监听事件，通过event.target判断实际触发元素'
      });
    }

    // 通用建议
    recommendations.push({
      priority: 'medium',
      category: '代码组织',
      suggestion: '采用模块化架构，提高代码可维护性',
      implementation: '将功能拆分为独立模块，使用ES6模块或命名空间'
    });

    recommendations.push({
      priority: 'low',
      category: '文档完善',
      suggestion: '添加JSDoc注释，提高代码可读性',
      implementation: '为所有函数和类添加详细的JSDoc注释'
    });

    return recommendations;
  }

  /**
   * 输出报告到控制台
   */
  printReport() {
    const report = this.generateReport();
    
    console.group('📊 代码质量检查报告');
    console.log('🕒 检查时间:', report.timestamp);
    console.log('📈 总体概况:', report.summary);
    
    if (report.details.length > 0) {
      console.group('🔍 详细问题');
      report.details.forEach(detail => {
        const icon = detail.severity === 'error' ? '❌' : 
                    detail.severity === 'warning' ? '⚠️' : 'ℹ️';
        console.group(`${icon} ${detail.name}`);
        detail.issues.forEach(issue => console.log(`• ${issue}`));
        console.groupEnd();
      });
      console.groupEnd();
    }

    if (report.recommendations.length > 0) {
      console.group('💡 改进建议');
      report.recommendations.forEach(rec => {
        const priorityIcon = rec.priority === 'high' ? '🔴' : 
                           rec.priority === 'medium' ? '🟡' : '🟢';
        console.group(`${priorityIcon} ${rec.category}: ${rec.suggestion}`);
        console.log('实施方案:', rec.implementation);
        console.groupEnd();
      });
      console.groupEnd();
    }

    console.groupEnd();
    
    return report;
  }

  /**
   * 导出报告
   * @param {string} format - 导出格式 ('json' | 'html')
   * @returns {string} 报告内容
   */
  exportReport(format = 'json') {
    const report = this.generateReport();
    
    if (format === 'html') {
      return this.generateHtmlReport(report);
    }
    
    return JSON.stringify(report, null, 2);
  }

  /**
   * 生成HTML格式报告
   * @param {object} report - 报告对象
   * @returns {string} HTML内容
   */
  generateHtmlReport(report) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>代码质量检查报告</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          .summary { background: #f5f5f5; padding: 15px; border-radius: 5px; }
          .issue { margin: 10px 0; padding: 10px; border-left: 4px solid #ccc; }
          .error { border-color: #e74c3c; }
          .warning { border-color: #f39c12; }
          .info { border-color: #3498db; }
          .recommendation { background: #e8f5e8; padding: 10px; margin: 10px 0; border-radius: 5px; }
        </style>
      </head>
      <body>
        <h1>📊 代码质量检查报告</h1>
        <div class="summary">
          <h2>总体概况</h2>
          <p>检查时间: ${report.timestamp}</p>
          <p>总检查项: ${report.summary.totalChecks}</p>
          <p>发现问题: ${report.summary.totalIssues}</p>
          <p>错误: ${report.summary.errorCount} | 警告: ${report.summary.warningCount} | 信息: ${report.summary.infoCount}</p>
        </div>
        
        <h2>详细问题</h2>
        ${report.details.map(detail => `
          <div class="issue ${detail.severity}">
            <h3>${detail.name}</h3>
            <ul>
              ${detail.issues.map(issue => `<li>${issue}</li>`).join('')}
            </ul>
          </div>
        `).join('')}
        
        <h2>改进建议</h2>
        ${report.recommendations.map(rec => `
          <div class="recommendation">
            <h3>${rec.category}: ${rec.suggestion}</h3>
            <p><strong>优先级:</strong> ${rec.priority}</p>
            <p><strong>实施方案:</strong> ${rec.implementation}</p>
          </div>
        `).join('')}
      </body>
      </html>
    `;
  }
}

// 创建全局代码质量检查器实例
window.codeQualityChecker = new CodeQualityChecker();

// 在开发模式下自动运行检查
if (window.configManager?.isDebugMode()) {
  setTimeout(() => {
    window.codeQualityChecker.printReport();
  }, 2000);
}