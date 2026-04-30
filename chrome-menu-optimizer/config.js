// Chrome Menu Optimizer - 配置管理模块
// 提供集中化的配置管理和常量定义

const CONFIG = {
  // 扩展基本信息
  EXTENSION: {
    NAME: 'ChromeMenuOptimizer',
    VERSION: '2.0.0',
    LOG_PREFIX: '[ChromeMenuOptimizer]'
  },

  // 样式相关配置
  STYLES: {
    STYLE_ID: 'menu-wrap-style',
    FORCE_STYLE_ID: 'chrome-menu-optimizer-force-style',
    CSS_FILE: 'styles.css',
    MAX_HEIGHT: '50px',
    MIN_HEIGHT: '30px',
    ITEM_MAX_WIDTH: '200px',
    DROPDOWN_MAX_HEIGHT: '80px'
  },

  // 性能配置
  PERFORMANCE: {
    DEBOUNCE_DELAY: 300,
    FORCE_APPLY_DELAY: 1000,
    MAX_DETECTION_ATTEMPTS: 3,
    MUTATION_OBSERVER_THROTTLE: 100
  },

  // 检测选择器配置
  SELECTORS: {
    // Chrome 主要选择器
    CHROME_PRIMARY: [
      '.bookmarks-bar',
      '#bookmarks-bar',
      '.bookmark-bar',
      '.bookmark-bar-content',
      '.bookmark-bar-items',
      '[data-test-id="bookmarks-bar"]'
    ],

    // Edge 选择器
    EDGE: [
      '.edge-bookmark-bar',
      '.edge-bookmarks-bar'
    ],

    // 通用选择器
    GENERIC: [
      '[role="toolbar"][aria-label*="书签"]',
      '[role="toolbar"][aria-label*="Bookmark"]',
      '[role="toolbar"][aria-label*="收藏"]'
    ],

    // 模糊匹配选择器
    FUZZY: [
      'div[class*="bookmark"][class*="bar"]',
      'div[id*="bookmark"][id*="bar"]',
      'nav[class*="bookmark"]',
      'section[class*="bookmark"]',
      'div[class*="bookmark"]:not([class*="menu"]):not([class*="dropdown"])'
    ],

    // 下拉菜单选择器
    DROPDOWN: [
      '.bookmark-dropdown',
      '.bookmark-menu',
      '.bookmark-folder-menu',
      '.dropdown-menu',
      '.menu-panel',
      '.chrome-menu',
      '.context-menu',
      '.popup-menu',
      '[role="menu"]',
      '[role="listbox"]'
    ]
  },

  // 检测规则配置
  DETECTION: {
    MIN_LINKS_COUNT: 2,
    MIN_CONTAINER_WIDTH: 200,
    MAX_CONTAINER_HEIGHT: 100,
    MIN_MENU_WIDTH: 50,
    MIN_MENU_HEIGHT: 20,
    HORIZONTAL_RATIO: 2 // width/height ratio for horizontal containers
  },

  // 存储键名
  STORAGE_KEYS: {
    WRAP_ENABLED: 'wrapEnabled',
    USER_PREFERENCES: 'userPreferences',
    DEBUG_MODE: 'debugMode'
  },

  // 调试配置
  DEBUG: {
    ENABLED: false,
    LOG_PERFORMANCE: true,
    LOG_DETECTION: true,
    LOG_STYLE_APPLICATION: true
  }
};

// 配置验证函数
const ConfigValidator = {
  validateSelectors() {
    const allSelectors = [
      ...CONFIG.SELECTORS.CHROME_PRIMARY,
      ...CONFIG.SELECTORS.EDGE,
      ...CONFIG.SELECTORS.GENERIC,
      ...CONFIG.SELECTORS.FUZZY,
      ...CONFIG.SELECTORS.DROPDOWN
    ];
    
    return allSelectors.every(selector => {
      try {
        document.querySelector(selector);
        return true;
      } catch (error) {
        console.warn(`${CONFIG.EXTENSION.LOG_PREFIX} Invalid selector: ${selector}`);
        return false;
      }
    });
  },

  validatePerformanceConfig() {
    const perf = CONFIG.PERFORMANCE;
    return perf.DEBOUNCE_DELAY > 0 && 
           perf.FORCE_APPLY_DELAY > 0 && 
           perf.MAX_DETECTION_ATTEMPTS > 0;
  }
};

// 配置工具函数
const ConfigUtils = {
  getAllBookmarkSelectors() {
    return [
      ...CONFIG.SELECTORS.CHROME_PRIMARY,
      ...CONFIG.SELECTORS.EDGE,
      ...CONFIG.SELECTORS.GENERIC,
      ...CONFIG.SELECTORS.FUZZY
    ];
  },

  getAllDropdownSelectors() {
    return CONFIG.SELECTORS.DROPDOWN;
  },

  getLogPrefix() {
    return CONFIG.EXTENSION.LOG_PREFIX;
  },

  isDebugEnabled() {
    return CONFIG.DEBUG.ENABLED;
  },

  getStyleIds() {
    return {
      main: CONFIG.STYLES.STYLE_ID,
      force: CONFIG.STYLES.FORCE_STYLE_ID
    };
  }
};

// 导出配置（兼容不同模块系统）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CONFIG, ConfigValidator, ConfigUtils };
} else if (typeof window !== 'undefined') {
  window.ChromeMenuOptimizerConfig = { CONFIG, ConfigValidator, ConfigUtils };
}