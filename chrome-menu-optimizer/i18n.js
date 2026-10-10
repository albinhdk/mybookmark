// 国际化运行时：根据浏览器语言自动切换中文/英文界面。
//
// 设计：
// - UI 文案的单一数据源就是本文件的 MESSAGES（zh/en 两张表），t(key) 取当前语言文案；
// - 语言判断：扩展环境用 chrome.i18n.getUILanguage()，file:// 测试环境用 navigator.language；
//   en* → 英文，其余 → 中文；
// - 静态 HTML 用 data-i18n / data-i18n-placeholder / data-i18n-title 标记，加载时统一替换；
//   动态渲染的字符串在 JS 里直接调 BMV.i18n.t()，支持插值：
//     t('key')                                  // 无参
//     t('key', ['a', 'b'])                      // 位置参数 $1 $2
//     t('key', { name: 'x' })                   // 命名参数 {name}
// - _locales/*/messages.json 只负责 manifest 的 name/description（即商店短描述），
//   供 Chrome/Edge 商店识别语言；UI 文案不走 messages.json，避免双份维护。
//
// 加载顺序：必须在 popup.js / bookmark-checker.js 之前加载。
(function () {
  const MESSAGES = {
    zh: {
      // ===== popup 静态 HTML =====
      documentTitle: '书签优化器',
      appTitle: '书签优化器',
      searchPlaceholder: '快速搜索书签...',
      labelPerRow: '每行',
      labelColumns: '列',
      labelPreviewPerCard: '每卡预览',
      labelItems: '项',
      previewOptionNone: '不显示',
      loadingBookmarks: '正在加载书签',
      statsBookmarks: ' 个书签',
      statsFolders: ' 个文件夹',
      appVersion: '版本 $1',
      menuOpenInBackground: '🔗 后台打开',
      menuCopyUrl: '📋 复制链接',
      menuCopyName: '📝 复制名称',
      menuUpdateToCurrentUrl: '🔄 更新为当前地址',
      menuClearUsage: '🔄 清除使用记录',
      menuCheckValidity: '🔍 检查有效性',
      menuEdit: '✏️ 编辑',
      menuDelete: '🗑️ 删除',
      editDialogTitle: '编辑书签',
      editLabelName: '名称',
      editLabelUrl: '网址',
      editPlaceholderName: '请输入书签名称',
      editPlaceholderUrl: '请输入网址',
      btnCancel: '取消',
      btnSave: '保存',
      // ===== popup.js 动态 =====
      chromeApiUnavailable: 'Chrome书签API不可用',
      errorInitFailed: '❌ 初始化失败',
      retryButton: '重试',
      viewSettingsHintWithPreview: '$1 列 · 每卡 $2 项',
      viewSettingsHintNoPreview: '$1 列 · 不显示预览',
      errorOpenFolderFailed: '❌ 无法打开文件夹',
      alertUnsupportedProtocol: '该链接协议不受支持，无法打开',
      dragBookmarkHint: '拖动此处移动书签',
      dragNestedBookmarkHint: '拖动此处调整书签顺序',
      dragFolderHint: '拖动此处移动文件夹',
      alertMoveFolderIntoSelf: '不能将文件夹移动到它自己或它的子文件夹中',
      alertMoveFailed: '移动失败: $1',
      loadingSearchingBookmarks: '正在搜索所有书签...',
      searchNoResultsTitle: '🔍 没有找到匹配的书签',
      searchTipDifferentKeywords: '• 尝试不同的关键词',
      searchTipCheckSpelling: '• 检查拼写',
      searchTipPinyinSupport: '• 搜索支持拼音首字母或全拼',
      breadcrumbSearchResultsLabel: '搜索结果:',
      loadMoreButton: '加载更多（还有 $1 个）...',
      errorSearchFailed: '❌ 搜索时出错',
      tooltipUsageCount: '使用次数: $1',
      loadingBookmarksEllipsis: '正在加载书签...',
      errorBookmarkContainerNotFound: '找不到书签容器元素',
      emptyFolderMessage: '📭 这个文件夹是空的',
      unknownError: '未知错误',
      errorLoadBookmarksFailed: '❌ 加载书签失败',
      breadcrumbSeparator: ' › ',
      tooltipLastUsed: '最后使用: $1',
      folderPreviewMoreItems: '还有 $1 个项目...',
      tooltipViewAllItemsInFolder: '点击查看 $1 文件夹中的所有项目',
      defaultBookmarkBarPath: '书签栏',
      faviconAltText: '书签图标',
      statsSearchResultCount: '搜索结果: $1 项',
      statsBookmarkFolderCount: '<span id="bookmark-count">$1</span> 个书签 | <span id="folder-count">$2</span> 个文件夹',
      searchMatchStatusTooltip: '找到 $1 个匹配项（共 $2 项）',
      contextMenuCheckFolder: '🔍 检查文件夹',
      confirmClearUsage: '确定要清除 "$1" 的使用记录吗？',
      confirmDeleteBookmark: '确定要删除 "$1" 吗？',
      alertCheckerNotLoaded: '书签检查器未加载，请重新加载扩展',
      alertTitleEmpty: '标题不能为空',
      alertUrlEmpty: '书签URL不能为空',
      alertSaveFailed: '保存失败: $1',
      alertEditSimulated: '编辑功能在测试环境中已模拟完成',
      alertGetCurrentTabFailed: '获取当前标签页失败: $1',
      alertNoActiveTab: '未找到当前活动标签页',
      confirmUpdateToCurrentUrl: '确定要将书签 "$1" 的地址更新为当前页面吗？',
      labelCurrentUrl: '当前地址: $1',
      labelNewUrl: '新地址: $1',
      labelNewTitle: '新标题: $1',
      alertBookmarkUpdated: '书签已成功更新为当前页面！\n标题: $1',
      alertUpdateFailed: '更新书签失败: $1',
      mockCurrentPageTitle: '当前页面标题',
      alertBookmarkSimulatedUpdated: '测试环境：书签已模拟更新为当前页面！\n标题: $1',
      // ===== bookmark-checker.js =====
      checkerDocumentTitle: '书签有效性检查器',
      checkBookmarksBtn: '检查书签',
      statusNoResponse: '无响应',
      statusTimeout: '超时',
      statusReachableUnverified: '可达(未验证)',
      noBookmarksToCheck: '没有可检查的书签',
      folderNoBookmarksToCheck: '该文件夹没有可检查的书签',
      noInvalidToRecheck: '没有需要重新检查的书签',
      checkerProgressTitle: '正在检查书签有效性',
      checkerPreparing: '准备中...',
      checkerProgressText: '$1 / $2 ($3%)',
      checkerCurrentItem: '$1 $2',
      checkerStatValid: '✓ $1',
      checkerStatInvalid: '✗ $1',
      checkerStatProblemTotal: '⚠ $1',
      checkerNoResults: '没有检查结果',
      checkerSummaryValid: '✓ 有效: $1',
      checkerSummaryInvalid: '✗ 无效(404/410): $1',
      checkerSummaryBlocked: '🚫 需登录/被拦截: $1',
      checkerSummaryServerError: '🔴 服务器错误: $1',
      checkerSummaryUnreachable: '🌐 无法访问: $1',
      checkerSummaryTimeout: '⏱ 超时: $1',
      checkerSummaryReachable: '❓ 可达未验证: $1',
      checkerSelectAllInvalid: '全选无效项',
      checkerOpenSelectedBtn: '📂 后台打开',
      checkerOpenSelectedTitle: '在后台打开选中项',
      checkerCopySelectedBtn: '📋 复制链接',
      checkerCopySelectedTitle: '复制选中项的URL',
      checkerDeleteSelectedBtn: '🗑️ 删除',
      checkerDeleteSelectedTitle: '删除选中的书签',
      checkerTableHeaderStatus: '状态',
      checkerTableHeaderTitle: '书签名称',
      checkerTableHeaderUrl: '网址',
      checkerTableHeaderCode: '信息',
      checkerResultsTitle: '检查结果 ($1 个书签)',
      checkerRecheckBtn: '重新检查问题项',
      checkerRestoreBtn: '↩️ 恢复备份',
      checkerRestoreBtnTitle: '恢复上次删除前自动备份的书签',
      checkerCloseBtn: '关闭',
      checkerSelectFirstAlert: '请先勾选要操作的书签',
      checkerCopiedBtn: '✅ 已复制',
      checkerDeleteMoreSuffix: '\n……等共 $1 个',
      checkerDeleteConfirm: '确定要删除以下 $1 个书签吗？此操作不可撤销。\n\n$2$3',
      checkerDeleteDoneAlert: '已删除 $1 个书签。删除前已自动备份，可点击"恢复备份"撤销。',
      checkerNoBackupAlert: '没有可恢复的备份',
      checkerRestoreConfirm: '将恢复 $1 备份的 $2 个书签。继续？',
      checkerRestoreDoneAlert: '已恢复 $1 / $2 个书签',
      checkerStartFailAlert: '检查器启动失败: $1',
      // ===== usage-manager.js =====
      usageCountSingular: '1次',
      usageCountFormat: '$1次',
      usageCountKFormat: '$1k次',
      lastUsedJustNow: '刚刚',
      lastUsedMinutesAgo: '$1分钟前',
      lastUsedHoursAgo: '$1小时前',
      lastUsedDaysAgo: '$1天前',
      lastUsedWeeksAgo: '$1周前',
      lastUsedMonthsAgo: '$1个月前',
      lastUsedYearsAgo: '$1年前',
      // ===== bookmark-tree.js =====
      bookmarkBarName: '书签栏',
      unknownLocation: '未知位置',
      errBookmarkBarNotFound: '无法找到书签栏',
      errInvalidFolderId: '文件夹ID无效',
      errGetTreeFailed: '获取书签树失败: $1',
      errGetBookmarksFailed: '获取书签失败: $1',
      // ===== error-handler.js =====
      errorNetworkFailed: '网络请求失败'
    },
    en: {
      // ===== popup static HTML =====
      documentTitle: 'Bookmark Viewer',
      appTitle: 'Bookmark Viewer',
      searchPlaceholder: 'Search bookmarks...',
      labelPerRow: 'Per row',
      labelColumns: 'columns',
      labelPreviewPerCard: 'Preview per card',
      labelItems: 'items',
      previewOptionNone: 'Hide',
      loadingBookmarks: 'Loading bookmarks',
      statsBookmarks: ' bookmarks',
      statsFolders: ' folders',
      appVersion: 'Version $1',
      menuOpenInBackground: '🔗 Open in background',
      menuCopyUrl: '📋 Copy URL',
      menuCopyName: '📋 Copy name',
      menuUpdateToCurrentUrl: '🔄 Update to current URL',
      menuClearUsage: '🔄 Clear usage history',
      menuCheckValidity: '🔍 Check validity',
      menuEdit: '✏️ Edit',
      menuDelete: '🗑️ Delete',
      editDialogTitle: 'Edit bookmark',
      editLabelName: 'Name',
      editLabelUrl: 'URL',
      editPlaceholderName: 'Enter bookmark name',
      editPlaceholderUrl: 'Enter URL',
      btnCancel: 'Cancel',
      btnSave: 'Save',
      // ===== popup.js dynamic =====
      chromeApiUnavailable: 'Chrome bookmarks API unavailable',
      errorInitFailed: '❌ Initialization failed',
      retryButton: 'Retry',
      viewSettingsHintWithPreview: '$1 columns · $2 items per card',
      viewSettingsHintNoPreview: '$1 columns · previews hidden',
      errorOpenFolderFailed: '❌ Failed to open folder',
      alertUnsupportedProtocol: 'This link protocol is not supported',
      dragBookmarkHint: 'Drag here to move this bookmark',
      dragNestedBookmarkHint: 'Drag here to reorder this bookmark',
      dragFolderHint: 'Drag here to move this folder',
      alertMoveFolderIntoSelf: 'A folder cannot be moved into itself or its own subfolder',
      alertMoveFailed: 'Move failed: $1',
      loadingSearchingBookmarks: 'Searching all bookmarks...',
      searchNoResultsTitle: '🔍 No matching bookmarks found',
      searchTipDifferentKeywords: '• Try different keywords',
      searchTipCheckSpelling: '• Check the spelling',
      searchTipPinyinSupport: '• Pinyin initials and full pinyin are supported',
      breadcrumbSearchResultsLabel: 'Search results:',
      loadMoreButton: 'Load more ($1 left)...',
      errorSearchFailed: '❌ Search failed',
      tooltipUsageCount: 'Times used: $1',
      loadingBookmarksEllipsis: 'Loading bookmarks...',
      errorBookmarkContainerNotFound: 'Bookmark container element not found',
      emptyFolderMessage: '📭 This folder is empty',
      unknownError: 'Unknown error',
      errorLoadBookmarksFailed: '❌ Failed to load bookmarks',
      breadcrumbSeparator: ' › ',
      tooltipLastUsed: 'Last used: $1',
      folderPreviewMoreItems: '$1 more items...',
      tooltipViewAllItemsInFolder: 'Click to view all items in folder $1',
      defaultBookmarkBarPath: 'Bookmarks bar',
      faviconAltText: 'Favicon',
      statsSearchResultCount: 'Search results: $1',
      statsBookmarkFolderCount: '<span id="bookmark-count">$1</span> bookmarks | <span id="folder-count">$2</span> folders',
      searchMatchStatusTooltip: 'Found $1 matches (of $2 total)',
      contextMenuCheckFolder: '🔍 Check folder',
      confirmClearUsage: 'Clear usage history of "$1"?',
      confirmDeleteBookmark: 'Delete "$1"?',
      alertCheckerNotLoaded: 'Bookmark checker not loaded. Please reload the extension',
      alertTitleEmpty: 'Title cannot be empty',
      alertUrlEmpty: 'Bookmark URL cannot be empty',
      alertSaveFailed: 'Save failed: $1',
      alertEditSimulated: 'Editing is simulated in the test environment',
      alertGetCurrentTabFailed: 'Failed to get the current tab: $1',
      alertNoActiveTab: 'No active tab found',
      confirmUpdateToCurrentUrl: 'Update the URL of "$1" to the current page?',
      labelCurrentUrl: 'Current URL: $1',
      labelNewUrl: 'New URL: $1',
      labelNewTitle: 'New title: $1',
      alertBookmarkUpdated: 'Bookmark updated to the current page!\nTitle: $1',
      alertUpdateFailed: 'Failed to update bookmark: $1',
      mockCurrentPageTitle: 'Current page title',
      alertBookmarkSimulatedUpdated: 'Test environment: bookmark simulated update!\nTitle: $1',
      // ===== bookmark-checker.js =====
      checkerDocumentTitle: 'Bookmark Validity Checker',
      checkBookmarksBtn: 'Check bookmarks',
      statusNoResponse: 'No response',
      statusTimeout: 'Timeout',
      statusReachableUnverified: 'Reachable (unverified)',
      noBookmarksToCheck: 'No bookmarks to check',
      folderNoBookmarksToCheck: 'No bookmarks to check in this folder',
      noInvalidToRecheck: 'No problem bookmarks to re-check',
      checkerProgressTitle: 'Checking bookmark validity',
      checkerPreparing: 'Preparing...',
      checkerProgressText: '$1 / $2 ($3%)',
      checkerCurrentItem: '$1 $2',
      checkerStatValid: '✓ $1',
      checkerStatInvalid: '✗ $1',
      checkerStatProblemTotal: '⚠ $1',
      checkerNoResults: 'No check results',
      checkerSummaryValid: '✓ Valid: $1',
      checkerSummaryInvalid: '✗ Invalid (404/410): $1',
      checkerSummaryBlocked: '🚫 Blocked or login required: $1',
      checkerSummaryServerError: '🔴 Server error: $1',
      checkerSummaryUnreachable: '🌐 Unreachable: $1',
      checkerSummaryTimeout: '⏱ Timeout: $1',
      checkerSummaryReachable: '❓ Reachable (unverified): $1',
      checkerSelectAllInvalid: 'Select all invalid',
      checkerOpenSelectedBtn: '📂 Open in background',
      checkerOpenSelectedTitle: 'Open selected items in the background',
      checkerCopySelectedBtn: '📋 Copy URL',
      checkerCopySelectedTitle: 'Copy URLs of selected items',
      checkerDeleteSelectedBtn: '🗑️ Delete',
      checkerDeleteSelectedTitle: 'Delete selected bookmarks',
      checkerTableHeaderStatus: 'Status',
      checkerTableHeaderTitle: 'Bookmark name',
      checkerTableHeaderUrl: 'URL',
      checkerTableHeaderCode: 'Info',
      checkerResultsTitle: 'Check results ($1 bookmarks)',
      checkerRecheckBtn: 'Re-check problem items',
      checkerRestoreBtn: '↩️ Restore backup',
      checkerRestoreBtnTitle: 'Restore the automatic backup taken before the last deletion',
      checkerCloseBtn: 'Close',
      checkerSelectFirstAlert: 'Please select the bookmarks to operate on first',
      checkerCopiedBtn: '✅ Copied',
      checkerDeleteMoreSuffix: '\n... and $1 more',
      checkerDeleteConfirm: 'Delete the following $1 bookmarks? This cannot be undone.\n\n$2$3',
      checkerDeleteDoneAlert: 'Deleted $1 bookmarks. An automatic backup was taken before deletion; click "Restore backup" to undo.',
      checkerNoBackupAlert: 'No backup available to restore',
      checkerRestoreConfirm: 'Restore $2 bookmarks backed up at $1. Continue?',
      checkerRestoreDoneAlert: 'Restored $1 of $2 bookmarks',
      checkerStartFailAlert: 'Checker failed to start: $1',
      // ===== usage-manager.js =====
      usageCountSingular: '1 time',
      usageCountFormat: '$1 times',
      usageCountKFormat: '$1k times',
      lastUsedJustNow: 'Just now',
      lastUsedMinutesAgo: '$1 minutes ago',
      lastUsedHoursAgo: '$1 hours ago',
      lastUsedDaysAgo: '$1 days ago',
      lastUsedWeeksAgo: '$1 weeks ago',
      lastUsedMonthsAgo: '$1 months ago',
      lastUsedYearsAgo: '$1 years ago',
      // ===== bookmark-tree.js =====
      bookmarkBarName: 'Bookmarks bar',
      unknownLocation: 'Unknown location',
      errBookmarkBarNotFound: 'Cannot find the bookmarks bar',
      errInvalidFolderId: 'Invalid folder ID',
      errGetTreeFailed: 'Failed to load the bookmark tree: $1',
      errGetBookmarksFailed: 'Failed to load bookmarks: $1',
      // ===== error-handler.js =====
      errorNetworkFailed: 'Network request failed'
    }
  };

  function detectLang() {
    let lang = 'zh';
    try {
      if (typeof chrome !== 'undefined' && chrome.i18n && typeof chrome.i18n.getUILanguage === 'function') {
        lang = chrome.i18n.getUILanguage();
      } else if (typeof navigator !== 'undefined' && navigator.language) {
        lang = navigator.language;
      }
    } catch (e) { /* 保持默认中文 */ }
    return /^en/i.test(lang) ? 'en' : 'zh';
  }

  const lang = detectLang();
  const dict = MESSAGES[lang] || MESSAGES.zh;

  function t(key, substitutions) {
    let s = dict[key];
    if (s === undefined) s = (MESSAGES.zh[key] !== undefined ? MESSAGES.zh[key] : key);
    if (substitutions) {
      if (Array.isArray(substitutions)) {
        substitutions.forEach((v, i) => { s = s.split('$' + (i + 1)).join(v == null ? '' : String(v)); });
      } else if (typeof substitutions === 'object') {
        Object.keys(substitutions).forEach((k) => { s = s.split('{' + k + '}').join(substitutions[k] == null ? '' : String(substitutions[k])); });
      }
    }
    return s;
  }

  function apply(root) {
    const scope = root || document;
    scope.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.getAttribute('data-i18n')); });
    scope.querySelectorAll('[data-i18n-placeholder]').forEach((el) => { el.placeholder = t(el.getAttribute('data-i18n-placeholder')); });
    scope.querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = t(el.getAttribute('data-i18n-title')); });
  }

  window.BMV = window.BMV || {};
  window.BMV.i18n = { lang, t, apply, messages: MESSAGES };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => apply(document));
    } else {
      apply(document);
    }
  }
})();
