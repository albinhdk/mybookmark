/**
 * 配置管理模块
 * 统一管理应用配置、常量和设置
 */

class ConfigManager {
  constructor() {
    this.config = {
      // 应用基础配置
      app: {
        name: 'Bookmark Viewer',
        version: '2.0',
        defaultFolderId: '1',
        maxSearchResults: 100,
        debounceDelay: 300
      },

      // UI配置
      ui: {
        maxPreviewItems: 5,
        animationDuration: 200,
        tooltipDelay: 500,
        contextMenuWidth: 150
      },

      // 性能配置
      performance: {
        maxHistorySize: 50,
        cacheTimeout: 300000, // 5分钟
        batchSize: 20,
        lazyLoadThreshold: 100
      },

      // 安全配置
      security: {
        allowedProtocols: ['http:', 'https:', 'ftp:', 'file:'],
        maxUrlLength: 2048,
        sanitizeHtml: true
      },

      // 图标配置
      icons: {
        defaultFavicon: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjE2IiBoZWlnaHQ9IjE2IiByeD0iMiIgZmlsbD0iIzRhOTBlMiIvPgo8dGV4dCB4PSI4IiB5PSIxMSIgZm9udC1mYW1pbHk9InNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iMTAiIGZpbGw9IndoaXRlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj7wn5OQPC90ZXh0Pgo8L3N2Zz4K',
        folderIcon: '📁',
        bookmarkIcon: '🔖',
        loadingIcon: '⏳'
      },

      // 消息配置
      messages: {
        loading: '正在加载书签...',
        noBookmarks: '暂无书签',
        searchNoResults: '未找到匹配的书签',
        error: '发生错误，请重试',
        permissionDenied: '缺少书签访问权限',
        networkError: '网络连接失败'
      },

      // 开发配置
      development: {
        enableDebugMode: false,
        enablePerformanceMonitoring: false,
        enableErrorReporting: true,
        mockApiDelay: 100
      }
    };

    // 加载用户自定义配置
    this.loadUserConfig();
  }

  /**
   * 获取配置值
   * @param {string} path - 配置路径，如 'app.name' 或 'ui.maxPreviewItems'
   * @param {any} defaultValue - 默认值
   * @returns {any} 配置值
   */
  get(path, defaultValue = null) {
    const keys = path.split('.');
    let value = this.config;

    for (const key of keys) {
      if (value && typeof value === 'object' && key in value) {
        value = value[key];
      } else {
        return defaultValue;
      }
    }

    return value;
  }

  /**
   * 设置配置值
   * @param {string} path - 配置路径
   * @param {any} value - 配置值
   */
  set(path, value) {
    const keys = path.split('.');
    const lastKey = keys.pop();
    let target = this.config;

    for (const key of keys) {
      if (!(key in target) || typeof target[key] !== 'object') {
        target[key] = {};
      }
      target = target[key];
    }

    target[lastKey] = value;
    this.saveUserConfig();
  }

  /**
   * 获取所有配置
   * @returns {object} 完整配置对象
   */
  getAll() {
    return { ...this.config };
  }

  /**
   * 重置配置到默认值
   * @param {string} section - 要重置的配置段，不传则重置全部
   */
  reset(section = null) {
    if (section) {
      // 重置特定段落的逻辑需要根据实际需求实现
      console.warn(`重置配置段落: ${section}`);
    } else {
      // 重置全部配置
      localStorage.removeItem('bookmarkViewer_userConfig');
      location.reload();
    }
  }

  /**
   * 加载用户自定义配置
   */
  loadUserConfig() {
    try {
      const userConfig = localStorage.getItem('bookmarkViewer_userConfig');
      if (userConfig) {
        const parsed = JSON.parse(userConfig);
        this.mergeConfig(this.config, parsed);
      }
    } catch (error) {
      console.warn('加载用户配置失败:', error);
    }
  }

  /**
   * 保存用户配置
   */
  saveUserConfig() {
    try {
      // 只保存用户修改过的配置
      const userConfig = this.getUserModifiedConfig();
      localStorage.setItem('bookmarkViewer_userConfig', JSON.stringify(userConfig));
    } catch (error) {
      console.warn('保存用户配置失败:', error);
    }
  }

  /**
   * 深度合并配置对象
   * @param {object} target - 目标对象
   * @param {object} source - 源对象
   */
  mergeConfig(target, source) {
    for (const key in source) {
      if (source.hasOwnProperty(key)) {
        if (typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])) {
          if (!target[key] || typeof target[key] !== 'object') {
            target[key] = {};
          }
          this.mergeConfig(target[key], source[key]);
        } else {
          target[key] = source[key];
        }
      }
    }
  }

  /**
   * 获取用户修改过的配置
   * @returns {object} 用户配置对象
   */
  getUserModifiedConfig() {
    // 这里应该实现逻辑来跟踪哪些配置被用户修改过
    // 为简化，暂时返回空对象
    return {};
  }

  /**
   * 验证URL是否安全
   * @param {string} url - 要验证的URL
   * @returns {boolean} 是否安全
   */
  isUrlSafe(url) {
    try {
      const urlObj = new URL(url);
      const allowedProtocols = this.get('security.allowedProtocols', []);
      const maxLength = this.get('security.maxUrlLength', 2048);
      
      return allowedProtocols.includes(urlObj.protocol) && url.length <= maxLength;
    } catch {
      return false;
    }
  }

  /**
   * 获取默认favicon
   * @returns {string} 默认favicon的base64编码
   */
  getDefaultFavicon() {
    return this.get('icons.defaultFavicon');
  }

  /**
   * 获取消息文本
   * @param {string} key - 消息键
   * @param {string} defaultText - 默认文本
   * @returns {string} 消息文本
   */
  getMessage(key, defaultText = '') {
    return this.get(`messages.${key}`, defaultText);
  }

  /**
   * 是否启用调试模式
   * @returns {boolean} 是否启用
   */
  isDebugMode() {
    return this.get('development.enableDebugMode', false);
  }

  /**
   * 导出配置
   * @returns {string} JSON格式的配置
   */
  exportConfig() {
    return JSON.stringify(this.config, null, 2);
  }
}

// 创建全局配置管理器实例
window.configManager = new ConfigManager();