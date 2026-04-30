# Chrome Menu Optimizer - 开发指南

## 🚀 快速开始

### 环境设置
1. **克隆项目**
   ```bash
   git clone <repository-url>
   cd chrome-menu-optimizer
   ```

2. **加载扩展**
   - 打开 Chrome 浏览器
   - 访问 `chrome://extensions/`
   - 开启"开发者模式"
   - 点击"加载已解压的扩展程序"
   - 选择项目文件夹

3. **开发环境验证**
   - 打开 `test-suite.html`
   - 运行所有测试
   - 确保所有测试通过

## 🏗️ 架构概览

### 核心组件
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   popup.js      │    │ content-script  │    │   background    │
│   (用户界面)     │◄──►│   (主要逻辑)    │◄──►│   (消息处理)    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   config.js     │    │   logger.js     │    │ diagnostics.js  │
│   (配置管理)     │    │   (日志系统)    │    │   (诊断系统)    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### 数据流
1. **用户操作** → popup.js → 发送消息
2. **消息接收** → content-script.js → 处理逻辑
3. **DOM操作** → 应用样式 → 记录日志
4. **性能监控** → 收集指标 → 生成报告

## 🔧 开发工作流

### 1. 功能开发
```javascript
// 1. 在 config.js 中添加配置
const NEW_FEATURE_CONFIG = {
    enabled: true,
    selector: '.new-feature',
    options: {}
};

// 2. 在 content-script.js 中实现功能
function implementNewFeature() {
    const logger = new Logger('NewFeature');
    logger.info('Implementing new feature');
    
    // 功能实现
}

// 3. 添加测试用例
describe('New Feature', () => {
    it('should work correctly', () => {
        // 测试代码
    });
});
```

### 2. 调试流程
1. **启用调试模式**
   ```javascript
   // 在 config.js 中设置
   DEBUG: true,
   LOG_LEVEL: 'DEBUG'
   ```

2. **查看日志**
   - 打开开发者工具
   - 查看 Console 标签
   - 过滤 "ChromeMenuOptimizer" 日志

3. **使用诊断工具**
   ```javascript
   // 在控制台中运行
   ChromeMenuOptimizerDiagnostics.generateReport();
   ```

### 3. 测试策略
- **单元测试**: 测试独立功能模块
- **集成测试**: 测试模块间交互
- **性能测试**: 监控性能指标
- **兼容性测试**: 验证浏览器兼容性

## 📝 编码规范

### JavaScript 规范
```javascript
// 1. 使用 const/let，避免 var
const CONFIG = {};
let currentState = null;

// 2. 函数命名使用驼峰命名法
function handleBookmarkDetection() {}

// 3. 类名使用帕斯卡命名法
class BookmarkManager {}

// 4. 常量使用大写下划线
const MAX_RETRY_COUNT = 3;

// 5. 添加 JSDoc 注释
/**
 * 检测书签栏元素
 * @param {string} selector - CSS选择器
 * @returns {Element|null} 找到的元素
 */
function detectBookmarkBar(selector) {}
```

### 错误处理
```javascript
// 1. 使用 try-catch 包装可能出错的代码
try {
    const result = riskyOperation();
    return result;
} catch (error) {
    logger.error('Operation failed', error);
    return null;
}

// 2. 使用工具函数进行错误处理
const safeOperation = withErrorHandling(riskyOperation, 'Operation');

// 3. 验证输入参数
function processData(data) {
    if (!data || typeof data !== 'object') {
        throw new Error('Invalid data parameter');
    }
    // 处理逻辑
}
```

### 性能优化
```javascript
// 1. 使用防抖和节流
const debouncedHandler = debounce(handler, 300);
const throttledHandler = throttle(handler, 100);

// 2. 缓存 DOM 查询结果
const bookmarkBar = document.querySelector('.bookmark-bar');

// 3. 使用性能监控
const operation = withPerformanceMonitoring(expensiveOperation, 'ExpensiveOp');
```

## 🧪 测试指南

### 运行测试
```bash
# 1. 打开测试页面
open test-suite.html

# 2. 运行特定测试
TestFramework.run('Bookmark Detection');

# 3. 查看测试覆盖率
TestFramework.getCoverage();
```

### 编写测试
```javascript
describe('Bookmark Detection', () => {
    beforeEach(() => {
        // 测试前设置
        document.body.innerHTML = '<div class="bookmark-bar"></div>';
    });

    it('should detect bookmark bar by class', () => {
        const element = detectBookmarkBar('.bookmark-bar');
        expect(element).toBeTruthy();
        expect(element.className).toContain('bookmark-bar');
    });

    afterEach(() => {
        // 测试后清理
        document.body.innerHTML = '';
    });
});
```

### 性能测试
```javascript
describe('Performance', () => {
    it('should complete DOM operations within time limit', async () => {
        const startTime = performance.now();
        
        await performDOMOperations();
        
        const duration = performance.now() - startTime;
        expect(duration).toBeLessThan(100); // 100ms 限制
    });
});
```

## 🔍 调试技巧

### 1. 使用浏览器开发工具
- **Elements**: 检查 DOM 结构和样式
- **Console**: 查看日志和错误信息
- **Sources**: 设置断点调试
- **Performance**: 分析性能瓶颈
- **Application**: 检查存储和权限

### 2. 扩展特定调试
```javascript
// 检查扩展状态
chrome.runtime.getManifest();

// 查看存储数据
chrome.storage.local.get(null, console.log);

// 监听消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Message received:', message);
});
```

### 3. 常见问题排查
- **样式不生效**: 检查 CSS 选择器和优先级
- **消息传递失败**: 验证权限和消息格式
- **性能问题**: 使用性能监控工具分析
- **兼容性问题**: 检查浏览器版本和 API 支持

## 📦 发布流程

### 1. 版本准备
```bash
# 1. 更新版本号
# 编辑 manifest.json 中的 version 字段

# 2. 运行完整测试
open test-suite.html

# 3. 生成构建报告
node scripts/build-report.js
```

### 2. 代码检查
- 运行所有测试用例
- 检查代码质量指标
- 验证性能基准
- 确认兼容性支持

### 3. 打包发布
- 创建发布分支
- 生成变更日志
- 打包扩展文件
- 提交到 Chrome Web Store

## 🤝 贡献指南

### 提交代码
1. Fork 项目
2. 创建功能分支
3. 编写代码和测试
4. 运行完整测试套件
5. 提交 Pull Request

### 代码审查
- 功能完整性检查
- 代码质量评估
- 性能影响分析
- 兼容性验证
- 文档更新确认

### 问题报告
- 使用问题模板
- 提供复现步骤
- 包含环境信息
- 附加调试日志
- 建议解决方案

## 📚 参考资源

- [Chrome Extension API](https://developer.chrome.com/docs/extensions/)
- [Web Performance API](https://developer.mozilla.org/en-US/docs/Web/API/Performance)
- [CSS Grid Layout](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Grid_Layout)
- [JavaScript Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)