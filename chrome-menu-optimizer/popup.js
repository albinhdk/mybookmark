// 全局变量
let currentFolderId = null; // 初始为null，动态获取
let searchTerm = '';
let currentTargetNodeId = null;

// favicon 加载失败时的占位图（原内联 data URI，提取为常量避免重复）
const FALLBACK_FAVICON = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjE2IiBoZWlnaHQ9IjE2IiByeD0iMiIgZmlsbD0iIzRhOTBlMiIvPgo8dGV4dCB4PSI4IiB5PSIxMSIgZm9udC1mYW1pbHk9InNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iMTAiIGZpbGw9IndoaXRlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj7wn5OQPC90ZXh0Pgo8L3N2Zz4K';

// 分批渲染每批数量与委托数据映射
const RENDER_BATCH = 100;
let currentRenderData = new Map(); // id -> bookmark，供事件委托查找
let pendingLoadMore = null;        // 当前"加载更多"按钮对应的回调

// ===== 内存书签树索引 =====
// 一次 getTree 全量拉取并建索引，面包屑 / 文件夹预览 / 搜索路径全部改为内存查询（零 IPC）；
// 通过 chrome.bookmarks 变更监听 + CRUD 后主动失效保持新鲜（替代原 5 分钟 TTL 缓存）。
let bookmarkTreeIndex = null;   // { nodeById: Map<id, node>, rootId }
let treeListenersRegistered = false;
let treeLoadPromise = null;     // 首次加载并发去重

function buildTreeIndex(bookmarkTree) {
  const nodeById = new Map();
  const root = bookmarkTree && bookmarkTree[0];
  if (!root) return { nodeById, rootId: '0' };
  nodeById.set(root.id, { ...root, parentId: null });
  const walk = (nodes, parentId) => {
    (nodes || []).forEach(node => {
      nodeById.set(node.id, { ...node, parentId });
      if (node.children && node.children.length > 0) walk(node.children, node.id);
    });
  };
  walk(root.children, root.id);
  return { nodeById, rootId: root.id };
}

// 确保树索引可用（并发安全：首次加载共享同一个 Promise）
function ensureBookmarkTree() {
  if (bookmarkTreeIndex) return Promise.resolve(bookmarkTreeIndex);
  if (treeLoadPromise) return treeLoadPromise;
  treeLoadPromise = new Promise((resolve, reject) => {
    chrome.bookmarks.getTree(function(bookmarkTree) {
      if (chrome.runtime.lastError) {
        treeLoadPromise = null;
        reject(new Error(`获取书签树失败: ${chrome.runtime.lastError.message}`));
        return;
      }
      try {
        bookmarkTreeIndex = buildTreeIndex(bookmarkTree);
        resolve(bookmarkTreeIndex);
      } catch (error) {
        treeLoadPromise = null;
        reject(error);
      }
    });
  });
  return treeLoadPromise;
}

// 失效树索引（CRUD 成功后调用，下次 ensure 时自动重建）
function invalidateBookmarkTree() {
  bookmarkTreeIndex = null;
  treeLoadPromise = null;
}

// 注册书签变更监听：外部变更（其他设备同步、书签管理器、导入）同样失效索引
function registerBookmarkTreeListeners() {
  if (treeListenersRegistered) return;
  treeListenersRegistered = true;
  const events = ['onCreated', 'onRemoved', 'onChanged', 'onMoved', 'onChildrenReordered'];
  events.forEach(name => {
    const api = chrome.bookmarks && chrome.bookmarks[name];
    if (api && typeof api.addListener === 'function') {
      api.addListener(() => invalidateBookmarkTree());
    }
  });
  const importEnded = chrome.bookmarks && chrome.bookmarks.onImportEnded;
  if (importEnded && typeof importEnded.addListener === 'function') {
    importEnded.addListener(() => invalidateBookmarkTree());
  }
}

// 从树索引取书签栏根ID（书签栏通常是根节点第一个子节点，标题兜底兼容顺序变化）
function getBookmarkBarRootIdFromTree() {
  const tree = bookmarkTreeIndex;
  const root = tree && tree.nodeById.get(tree.rootId);
  const children = (root && root.children) || [];
  if (children.length > 0) return children[0].id;
  const byTitle = children.find(c => /书签栏|Bookmarks bar/i.test(c.title || ''));
  if (byTitle) return byTitle.id;
  throw new Error('无法找到书签栏');
}

// 检测是否在Chrome扩展环境中
const isExtensionEnvironment = !!(typeof chrome !== 'undefined' && chrome.bookmarks);

// 模拟Chrome API（用于测试环境）
if (!isExtensionEnvironment) {
  console.log('检测到非扩展环境，启用模拟Chrome API');
  
  window.chrome = {
    bookmarks: {
      getTree: function(callback) {
        setTimeout(() => {
          callback([
            {
              id: '0',
              title: '',
              children: [
                {
                  id: '1',
                  title: '书签栏',
                  children: [
                    {
                      id: '2',
                      title: '开发工具',
                      children: [
                        { id: '3', title: 'GitHub', url: 'https://github.com' },
                        { id: '4', title: 'Stack Overflow', url: 'https://stackoverflow.com' },
                        { id: '5', title: 'MDN Web Docs', url: 'https://developer.mozilla.org' }
                      ]
                    },
                    {
                      id: '6',
                      title: '搜索引擎',
                      children: [
                        { id: '7', title: 'Google', url: 'https://www.google.com' },
                        { id: '8', title: 'Bing', url: 'https://www.bing.com' }
                      ]
                    },
                    { id: '9', title: 'YouTube', url: 'https://www.youtube.com' },
                    { id: '10', title: 'Wikipedia', url: 'https://www.wikipedia.org' }
                  ]
                }
              ]
            }
          ]);
        }, 100);
      },
      getChildren: function(folderId, callback) {
        const mockData = {
          '1': [
            {
              id: '2',
              title: '开发工具',
              children: [
                { id: '3', title: 'GitHub', url: 'https://github.com' },
                { id: '4', title: 'Stack Overflow', url: 'https://stackoverflow.com' },
                { id: '5', title: 'MDN Web Docs', url: 'https://developer.mozilla.org' }
              ]
            },
            {
              id: '6',
              title: '搜索引擎',
              children: [
                { id: '7', title: 'Google', url: 'https://www.google.com' },
                { id: '8', title: 'Bing', url: 'https://www.bing.com' }
              ]
            },
            { id: '9', title: 'YouTube', url: 'https://www.youtube.com' },
            { id: '10', title: 'Wikipedia', url: 'https://www.wikipedia.org' }
          ],
          '2': [
            { id: '3', title: 'GitHub', url: 'https://github.com' },
            { id: '4', title: 'Stack Overflow', url: 'https://stackoverflow.com' },
            { id: '5', title: 'MDN Web Docs', url: 'https://developer.mozilla.org' }
          ],
          '6': [
            { id: '7', title: 'Google', url: 'https://www.google.com' },
            { id: '8', title: 'Bing', url: 'https://www.bing.com' }
          ]
        };
        
        setTimeout(() => {
          const result = mockData[folderId] || [];
          console.log(`模拟获取文件夹 ${folderId} 的内容:`, result);
          callback(result);
        }, 50);
      },
      get: function(nodeId, callback) {
        const mockNodes = {
          '1': [{ id: '1', title: '书签栏', parentId: '0' }],
          '2': [{ id: '2', title: '开发工具', parentId: '1' }],
          '6': [{ id: '6', title: '搜索引擎', parentId: '1' }]
        };
        
        setTimeout(() => {
          callback(mockNodes[nodeId] || []);
        }, 50);
      }
    },
    runtime: {
      lastError: null
    },
    tabs: {
      create: function(options, callback) {
        console.log('模拟打开标签页:', options.url);
        window.open(options.url, '_blank');
        if (callback) callback({ id: Date.now() });
      }
    }
  };
}

// 初始化
document.addEventListener('DOMContentLoaded', function() {
  console.log('DOM加载完成，开始初始化');
  initializeExtension();
});

// 初始化扩展
async function initializeExtension() {
  try {
    // 检查Chrome API可用性
    if (!chrome || !chrome.bookmarks) {
      throw new Error('Chrome书签API不可用');
    }
    
    // 注册变更监听并全量加载书签树（getTree 成功即代表书签权限可用）
    registerBookmarkTreeListeners();
    await ensureBookmarkTree();
    
    // 获取书签栏根ID
    if (!currentFolderId) {
      currentFolderId = getBookmarkBarRootIdFromTree();
      console.log('设置当前文件夹ID为:', currentFolderId);
    }
    
    console.log('Chrome API检查通过，开始渲染书签');
    await renderBookmarks(currentFolderId);
    setupEventListeners();
    
    // 渲染检查按钮
    if (typeof bookmarkChecker !== 'undefined') {
      bookmarkChecker.renderCheckAllButton();
    }
    
  } catch (error) {
    console.error('初始化失败:', error);
    const bookmarksContainer = document.getElementById('bookmarks');
    if (bookmarksContainer) {
      bookmarksContainer.innerHTML = `
        <div class="error">
          ❌ 初始化失败<br>
          <small>${error.message}</small><br>
          <button class="retry-btn">重试</button>
        </div>
      `;
      const retryBtn = bookmarksContainer.querySelector('button.retry-btn');
      if (retryBtn) {
        retryBtn.addEventListener('click', () => initializeExtension());
      }
    }
  }
}

// 设置事件监听器（幂等：初始化重试不会重复绑定）
let listenersInitialized = false;
function setupEventListeners() {
  if (listenersInitialized) return;
  listenersInitialized = true;
  
  // 搜索功能（200ms 防抖，避免每次按键全量重渲染）
  const searchBox = document.getElementById('search-box');
  let searchDebounceTimer = null;
  searchBox.addEventListener('input', function() {
    searchTerm = this.value.trim();
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(async () => {
      if (searchTerm) {
        await renderSearchResults();
      } else {
        // 重置为当前文件夹视图
        await renderBookmarks(currentFolderId);
      }
    }, 200);
  });

  // 书签容器事件委托（点击/右键/favicon 兜底统一处理，监听器数量 O(1)）
  setupBookmarksDelegation();
  
  // 右键菜单
  setupContextMenu();
  
  // 编辑对话框事件
  setupEditDialog();
}

// 书签容器事件委托
function setupBookmarksDelegation() {
  const container = document.getElementById('bookmarks');
  if (!container || container.dataset.delegationBound) return;
  container.dataset.delegationBound = '1';
  
  const openFolder = async (folderId) => {
    if (!folderId) return;
    currentFolderId = folderId;
    try {
      await renderBookmarks(folderId);
    } catch (error) {
      console.error('打开文件夹时出错:', error);
      container.innerHTML = '<div class="error">❌ 无法打开文件夹</div>';
    }
  };
  
  // 点击：书签链接后台打开；"加载更多"追加渲染；文件夹标题/“还有X个项目”进入文件夹
  container.addEventListener('click', async function(e) {
    const loadMore = e.target.closest('.load-more-item');
    if (loadMore) {
      e.preventDefault();
      if (pendingLoadMore) pendingLoadMore();
      return;
    }
    
    const link = e.target.closest('.bookmark-link');
    if (link) {
      e.preventDefault();
      const holder = link.closest('[data-bookmark-id]');
      const bookmark = holder && currentRenderData.get(holder.dataset.bookmarkId);
      if (!bookmark) return;
      
      // 记录使用统计
      bookmarkUsageManager.recordUsage(bookmark.id, bookmark.url, bookmark.title);
      
      if (isDangerousUrl(bookmark.url)) {
        alert('该链接协议不受支持，无法打开');
        return;
      }
      if (isExtensionEnvironment) {
        // 在扩展环境中，使用Chrome API在后台打开新标签页
        chrome.tabs.create({ url: bookmark.url, active: false });
      } else {
        // 在测试环境中，直接打开链接
        window.open(bookmark.url, '_blank');
      }
      return;
    }
    
    const more = e.target.closest('.more-items-link');
    if (more) {
      e.preventDefault();
      e.stopPropagation();
      await openFolder(more.dataset.folderId);
      return;
    }
    
    const folderTitle = e.target.closest('.folder-title');
    if (folderTitle) {
      e.preventDefault();
      e.stopPropagation();
      await openFolder(folderTitle.dataset.folderId);
    }
  });
  
  // 右键菜单（嵌套项与主项统一处理，closest 保证命中最近的书签元素）
  container.addEventListener('contextmenu', function(e) {
    const holder = e.target.closest('[data-bookmark-id]');
    if (!holder) return;
    e.preventDefault();
    const bookmark = currentRenderData.get(holder.dataset.bookmarkId);
    if (bookmark) showContextMenu(e, bookmark);
  });
  
  // favicon 加载失败兜底（error 事件不冒泡，用捕获阶段委托）
  container.addEventListener('error', function(e) {
    const img = e.target;
    if (img && img.tagName === 'IMG' && img.classList.contains('favicon')) {
      img.src = FALLBACK_FAVICON;
    }
  }, true);
}

// 渲染搜索结果（竞态防护 + 分批渲染）
let searchRequestId = 0;
async function renderSearchResults() {
  const requestId = ++searchRequestId;
  console.log('=== 渲染搜索结果 ===');
  console.log('搜索词:', searchTerm);
  const bookmarksContainer = document.getElementById('bookmarks');
  
  // 显示加载状态
  bookmarksContainer.innerHTML = '<div class="loading">正在搜索所有书签...</div>';
  
  try {
    // 获取所有书签
    const allBookmarks = await getAllBookmarks();
    // 竞态防护：加载期间又有新搜索或切回文件夹视图时，丢弃本次过期响应
    if (requestId !== searchRequestId) return;
    
    // 过滤书签（仅包含有URL的书签，排除文件夹）
    const filteredBookmarks = allBookmarks.filter(bookmark => 
        bookmark.url && (isSearchMatch(bookmark.title, searchTerm) || isSearchMatch(bookmark.url, searchTerm))
      );
    
    console.log('搜索结果:', filteredBookmarks.length);
    
    if (filteredBookmarks.length === 0) {
      bookmarksContainer.innerHTML = `
        <div class="empty-state">
          🔍 没有找到匹配的书签
          <div class="search-tips">
            <div>• 尝试不同的关键词</div>
            <div>• 检查拼写</div>
            <div>• 搜索支持拼音首字母或全拼</div>
          </div>
        </div>
      `;
      return;
    }
    
    // 按标题排序
    filteredBookmarks.sort((a, b) => a.title.localeCompare(b.title));
    
    // 更新面包屑为搜索状态
    const breadcrumbContainer = document.getElementById('breadcrumb');
    breadcrumbContainer.innerHTML = `
      <span>搜索结果:</span> 
      <span class="search-term-highlight">${escapeHtml(searchTerm)}</span>
    `;
    breadcrumbContainer.style.display = 'flex';
    
    // 更新统计信息
    const statsElement = document.getElementById('stats');
    statsElement.innerHTML = `<span style="color: #4a90e2;">${filteredBookmarks.length} 个匹配书签</span>`;
    
    // 显示结果（分批渲染 + 委托数据映射）
    const resultsContainer = document.createElement('ul');
    resultsContainer.className = 'search-results-list';
    bookmarksContainer.innerHTML = '';
    bookmarksContainer.appendChild(resultsContainer);
    currentRenderData = new Map();
    pendingLoadMore = null;
    
    let rendered = 0;
    const renderBatch = async () => {
      const slice = filteredBookmarks.slice(rendered, rendered + RENDER_BATCH);
      for (const bookmark of slice) {
        if (requestId !== searchRequestId) return; // 批次已过期，停止追加
        const resultItem = await createSearchResultItem(bookmark);
        resultsContainer.appendChild(resultItem);
      }
      rendered += slice.length;
      
      const existingMore = resultsContainer.querySelector('.load-more-item');
      if (existingMore) existingMore.remove();
      pendingLoadMore = null;
      if (rendered < filteredBookmarks.length) {
        const moreItem = document.createElement('li');
        moreItem.className = 'more-items-link load-more-item';
        moreItem.innerHTML = `<span>加载更多（还有 ${filteredBookmarks.length - rendered} 个）...</span>`;
        pendingLoadMore = renderBatch;
        resultsContainer.appendChild(moreItem);
      }
    };
    await renderBatch();
    
  } catch (error) {
    console.error('搜索失败:', error);
    bookmarksContainer.innerHTML = `
      <div class="error">
        ❌ 搜索时出错
        <small>${error.message}</small>
      </div>
    `;
  }
}

// 创建搜索结果项（事件由 #bookmarks 容器委托处理，此处只挂数据）
async function createSearchResultItem(bookmark) {
  const listItem = document.createElement('li');
  listItem.className = 'search-result-item';
  listItem.dataset.bookmarkId = bookmark.id;
  currentRenderData.set(bookmark.id, bookmark);
  
  // 获取文件夹路径
  const folderPath = await getFolderPath(bookmark.parentId);
  
  // 获取使用统计
  const usageCount = bookmarkUsageManager.getUsageCount(bookmark.id);
  const usageText = bookmarkUsageManager.formatUsageCount(usageCount);
  
  // 获取favicon
  let faviconUrl;
  try {
    const url = new URL(bookmark.url);
    faviconUrl = `${url.protocol}//${url.hostname}/favicon.ico`;
  } catch (e) {
    faviconUrl = FALLBACK_FAVICON;
  }
  
  // 构建工具提示信息
  let tooltipText = bookmark.title;
  tooltipText += `
${bookmark.url}`;
  if (usageCount > 0) {
    tooltipText += `
使用次数: ${usageText}`;
  }
  
  listItem.innerHTML = `
    <a href="${isDangerousUrl(bookmark.url) ? '#' : escapeHtml(bookmark.url)}" class="bookmark-link" title="${escapeHtml(tooltipText)}">
      <img src="${faviconUrl}" class="favicon" alt="">
      <span class="bookmark-title">${escapeHtml(bookmark.title)}</span>
      ${usageCount > 0 ? `<span class="usage-count">${usageText}</span>` : ''}
    </a>
    <div class="folder-path">${escapeHtml(folderPath)}</div>
  `;
  
  return listItem;
}

// 渲染书签
async function renderBookmarks(folderId) {
  console.log('开始渲染书签，文件夹ID:', folderId);
  const bookmarksContainer = document.getElementById('bookmarks');
  
  // 显示加载状态
  bookmarksContainer.innerHTML = '<div class="loading">正在加载书签...</div>';
  
  try {
    // 验证容器元素
    if (!bookmarksContainer) {
      throw new Error('找不到书签容器元素');
    }
    
    const bookmarks = await getBookmarks(folderId);
    await updateBreadcrumb(folderId);
    
    if (!bookmarks || bookmarks.length === 0) {
      bookmarksContainer.innerHTML = '<div class="empty-state">📭 这个文件夹是空的</div>';
      updateStats(0, 0);
      return;
    }

    // 创建网格容器
    const gridContainer = document.createElement('ul');
    gridContainer.className = 'bookmark-grid';
    
    // 判断是否为文件夹视图
    const isFolder = bookmarks.some(bookmark => bookmark.children);
    if (isFolder) {
      gridContainer.classList.add('folder-view');
    }

    // 统计全量计算（与分批渲染解耦，保证数字始终准确）
    const bookmarkCount = bookmarks.filter(b => b.url).length;
    const folderCount = bookmarks.length - bookmarkCount;
    
    // 重建事件委托用的数据映射
    currentRenderData = new Map();
    
    bookmarksContainer.innerHTML = '';
    bookmarksContainer.appendChild(gridContainer);
    
    // 分批渲染：首批 RENDER_BATCH 项，其余通过"加载更多"按需追加
    let rendered = 0;
    const renderBatch = () => {
      const slice = bookmarks.slice(rendered, rendered + RENDER_BATCH);
      slice.forEach(bookmark => {
        try {
          const listItem = createBookmarkElement(bookmark);
          gridContainer.appendChild(listItem);
        } catch (error) {
          console.error('创建书签元素时出错:', error, bookmark);
        }
      });
      rendered += slice.length;
      
      const existingMore = gridContainer.querySelector('.load-more-item');
      if (existingMore) existingMore.remove();
      pendingLoadMore = null;
      if (rendered < bookmarks.length) {
        const moreItem = document.createElement('li');
        moreItem.className = 'more-items-link load-more-item';
        moreItem.innerHTML = `<span>加载更多（还有 ${bookmarks.length - rendered} 个）...</span>`;
        pendingLoadMore = renderBatch;
        gridContainer.appendChild(moreItem);
      }
    };
    renderBatch();
    
    // 更新统计信息
    updateStats(bookmarkCount, folderCount);
    
    // 重新应用搜索过滤
    applySearchFilter();
    
    console.log('书签渲染完成，书签数:', bookmarkCount, '文件夹数:', folderCount);
    
  } catch (error) {
    console.error('渲染书签时出错:', error);
    const errorMessage = error.message || '未知错误';
    bookmarksContainer.innerHTML = `
      <div class="error">
        ❌ 加载书签失败<br>
        <small>${errorMessage}</small><br>
        <button class="retry-btn">重试</button>
      </div>
    `;
    const retryBtn = bookmarksContainer.querySelector('button.retry-btn');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => renderBookmarks(folderId));
    }
  }
}

// 更新面包屑导航
async function updateBreadcrumb(folderId) {
  const breadcrumbContainer = document.getElementById('breadcrumb');
  
  try {
    const path = await buildBreadcrumbPath(folderId);
    
    if (path.length === 0) {
      breadcrumbContainer.style.display = 'none';
      return;
    }
    
    breadcrumbContainer.style.display = 'flex';
    breadcrumbContainer.innerHTML = '';
    
    path.forEach((item, index) => {
      if (index > 0) {
        const separator = document.createElement('span');
        separator.textContent = ' › ';
        breadcrumbContainer.appendChild(separator);
      }
      
      const link = document.createElement('a');
      link.href = '#';
      link.textContent = item.title;
      link.addEventListener('click', async function(e) {
        e.preventDefault();
        try {
          currentFolderId = item.id;
          await renderBookmarks(item.id);
        } catch (error) {
          console.error('面包屑导航点击错误:', error);
        }
      });
      
      breadcrumbContainer.appendChild(link);
    });
    
  } catch (error) {
    console.error('更新面包屑时出错:', error);
    breadcrumbContainer.style.display = 'none';
  }
}

// 构建面包屑路径（基于内存树索引的父链遍历，零 IPC）
async function buildBreadcrumbPath(folderId) {
  const path = [];
  try {
    const tree = await ensureBookmarkTree();
    let currentId = folderId;
    while (currentId && currentId !== tree.rootId) {
      const node = tree.nodeById.get(currentId);
      if (!node) break;
      path.unshift({
        id: node.id,
        title: node.title || '书签栏'
      });
      currentId = node.parentId;
    }
  } catch (error) {
    console.error('构建面包屑路径时出错:', error);
  }
  return path;
}

// 获取文件夹路径
async function getFolderPath(parentId) {
  if (!parentId || parentId === '0') {
    return '书签栏';
  }
  
  try {
    const path = await buildBreadcrumbPath(parentId);
    return path.map(item => item.title).join(' › ') || '书签栏';
  } catch (error) {
    console.error('获取文件夹路径失败:', error);
    return '未知位置';
  }
}

// 创建书签元素（事件统一由 #bookmarks 容器委托处理，此处只挂数据）
function createBookmarkElement(bookmark) {
  const listItem = document.createElement('li');
  listItem.dataset.bookmarkId = bookmark.id;
  currentRenderData.set(bookmark.id, bookmark);
  
  if (!bookmark.url) { // 文件夹没有URL属性
    // 文件夹
    listItem.className = 'bookmark-item folder-item';
    listItem.innerHTML = `
      <div class="folder-title" data-folder-id="${bookmark.id}">
        ${escapeHtml(bookmark.title)}
      </div>
    `;
    
    // 异步加载并显示文件夹预览
    (async () => {
      try {
        const children = await getBookmarks(bookmark.id);
        if (children.length > 0) {
      const nestedList = document.createElement('ul');
      nestedList.className = 'nested-list';
      
      // 过滤出书签（不包括文件夹）
      const bookmarkChildren = children.filter(child => !child.children);
      
      // 按使用频率排序
      const sortedBookmarks = bookmarkUsageManager.sortBookmarksByUsage(bookmarkChildren);
      
      // 显示前5个子项作为预览
      const previewItems = sortedBookmarks.slice(0, 5);
      previewItems.forEach(child => {
        const nestedItem = document.createElement('li');
        nestedItem.className = 'nested-item';
        
        // 获取使用统计
        const usageCount = bookmarkUsageManager.getUsageCount(child.id);
        const usageText = bookmarkUsageManager.formatUsageCount(usageCount);
        const lastUsed = bookmarkUsageManager.formatLastUsed(bookmarkUsageManager.getLastUsed(child.id));
        
        // 从URL中提取域名，直接获取网站的favicon
        let nestedFaviconUrl;
        try {
          const url = new URL(child.url);
          nestedFaviconUrl = `${url.protocol}//${url.hostname}/favicon.ico`;
        } catch (e) {
          nestedFaviconUrl = FALLBACK_FAVICON;
        }
        
        // 构建工具提示信息
        let tooltipText = child.title;
        if (usageCount > 0) {
          tooltipText += `\n使用次数: ${usageText}`;
          if (lastUsed) {
            tooltipText += `\n最后使用: ${lastUsed}`;
          }
        }
        
        nestedItem.innerHTML = `
          <a href="${isDangerousUrl(child.url) ? '#' : escapeHtml(child.url)}" class="bookmark-link" title="${escapeHtml(tooltipText)}">
            <img src="${nestedFaviconUrl}" class="favicon" alt="">
            <span class="bookmark-title">${escapeHtml(child.title)}</span>
            ${usageCount > 0 ? `<span class="usage-count">${usageText}</span>` : ''}
          </a>
        `;
        
        // 登记到委托数据映射（点击/右键/favicon 兜底由容器统一委托处理）
        nestedItem.dataset.bookmarkId = child.id;
        currentRenderData.set(child.id, child);
        
        nestedList.appendChild(nestedItem);
      });
      
      if (bookmarkChildren.length > 5) {
        const moreItem = document.createElement('li');
        moreItem.className = 'nested-item more-items-link';
        moreItem.dataset.folderId = bookmark.id;
        moreItem.innerHTML = `<span>还有 ${bookmarkChildren.length - 5} 个项目...</span>`;
        moreItem.title = `点击查看 ${bookmark.title} 文件夹中的所有项目`;
        nestedList.appendChild(moreItem);
      }
      
      listItem.appendChild(nestedList);
        }
      } catch (error) {
        console.error('加载文件夹预览失败:', error);
      }
    })();
    
  } else {
    // 书签
    listItem.className = 'bookmark-item';
    
    // 获取使用统计
    const usageCount = bookmarkUsageManager.getUsageCount(bookmark.id);
    const usageText = bookmarkUsageManager.formatUsageCount(usageCount);
    const lastUsed = bookmarkUsageManager.formatLastUsed(bookmarkUsageManager.getLastUsed(bookmark.id));
    
    // 从URL中提取域名，直接获取网站的favicon
    let faviconUrl;
    try {
      const url = new URL(bookmark.url);
      faviconUrl = `${url.protocol}//${url.hostname}/favicon.ico`;
    } catch (e) {
      faviconUrl = FALLBACK_FAVICON;
    }
    
    // 获取文件夹路径（仅在搜索模式下显示）
    let folderPathText = '';
    let shouldShowPath = searchTerm && searchTerm.trim() !== '';
    
    if (shouldShowPath) {
      folderPathText = '书签栏';
      // 立即调用异步函数
      (async () => {
        try {
          folderPathText = await getFolderPath(bookmark.parentId);
          // 更新路径显示
          const pathElement = listItem.querySelector('.bookmark-path');
          if (pathElement) {
            pathElement.textContent = folderPathText;
          }
        } catch (error) {
          console.error('获取文件夹路径失败:', error);
        }
      })();
    }
    
    // 构建工具提示信息
    let tooltipText = bookmark.title;
    if (usageCount > 0) {
      tooltipText += `\n使用次数: ${usageText}`;
      if (lastUsed) {
        tooltipText += `\n最后使用: ${lastUsed}`;
      }
    }
    
    listItem.innerHTML = `
      <a href="${isDangerousUrl(bookmark.url) ? '#' : escapeHtml(bookmark.url)}" class="bookmark-link" title="${escapeHtml(tooltipText)}">
        <img src="${faviconUrl}" alt="Favicon" class="favicon">
        <div class="bookmark-info">
          <div class="bookmark-title">${escapeHtml(bookmark.title)}</div>
          ${shouldShowPath ? `<div class="bookmark-path">${escapeHtml(folderPathText)}</div>` : ''}
        </div>
        ${usageCount > 0 ? `<span class="usage-count">${usageText}</span>` : ''}
      </a>`
    ;
  }
  
  return listItem;
}

// 递归获取所有书签（基于内存树索引，零 IPC）
function getAllBookmarks() {
  return ensureBookmarkTree().then(tree => {
    const allBookmarks = [];
    tree.nodeById.forEach((node, id) => {
      if (id === tree.rootId) return; // 排除根节点自身
      allBookmarks.push({ ...node });
    });
    return allBookmarks;
  });
}

// 获取特定文件夹的书签（优先读内存树索引，零 IPC；树不可用时回退 API）
async function getBookmarks(folderId) {
  if (!folderId) {
    throw new Error('文件夹ID无效');
  }
  if (!chrome || !chrome.bookmarks) {
    throw new Error('Chrome书签API不可用');
  }
  
  try {
    const tree = await ensureBookmarkTree();
    const node = tree.nodeById.get(folderId);
    if (node) {
      return node.children ? node.children.slice() : [];
    }
  } catch (error) {
    console.warn('内存树获取失败，回退到 API:', error);
  }
  
  return new Promise((resolve, reject) => {
    chrome.bookmarks.getChildren(folderId, function(bookmarks) {
      if (chrome.runtime.lastError) {
        reject(new Error(`获取书签失败: ${chrome.runtime.lastError.message}`));
      } else {
        resolve(bookmarks || []);
      }
    });
  });
}

// 搜索过滤功能
function applySearchFilter() {
  console.log('=== 搜索过滤调试信息 ===');
  console.log('搜索词:', searchTerm);
  console.log('当前文件夹ID:', currentFolderId);
  
  // 包含所有类型的项目：主书签、文件夹、嵌套书签
  const allItems = document.querySelectorAll('.bookmark-item, .folder-item, .nested-item');
  console.log('找到项目数量:', allItems.length);
  console.log('项目类型分布:', {
    bookmarkItems: document.querySelectorAll('.bookmark-item').length,
    folderItems: document.querySelectorAll('.folder-item').length,
    nestedItems: document.querySelectorAll('.nested-item').length
  });
  
  if (!searchTerm) {
    // console.log('清除搜索，显示所有项目');
    // 清除搜索时显示所有项目
    allItems.forEach(item => {
      item.classList.remove('hidden-by-search');
      // 同时显示所有父级元素
      let parent = item.parentElement;
      while (parent && parent.classList) {
        parent.classList.remove('hidden-by-search');
        parent = parent.parentElement;
      }
    });
    
    // 更新搜索状态显示
    updateSearchStatus(allItems.length, allItems.length);
    return;
  }
  
  const searchLower = searchTerm.toLowerCase();
  let matchCount = 0;
  let totalCount = 0;
  
  allItems.forEach((item, index) => {
    totalCount++;
    // 只匹配自身的标题：书签取 .bookmark-title，文件夹取 .folder-title
    //（不能用 item.textContent，否则文件夹会把嵌套子项的标题也算进匹配）
    const titleElement = item.querySelector('.bookmark-title') || item.querySelector('.folder-title');
    const text = titleElement ? titleElement.textContent : item.textContent;
    
    // 使用增强的搜索匹配函数
    const isMatch = typeof isSearchMatch === 'function' 
      ? isSearchMatch(text, searchLower)
      : text.toLowerCase().includes(searchLower);
      
    if (isMatch) {
      matchCount++;
      item.classList.remove('hidden-by-search');
      
      // 显示匹配项的所有祖先元素
      let parent = item.parentElement;
      while (parent && parent.classList) {
        parent.classList.remove('hidden-by-search');
        parent = parent.parentElement;
      }
      
      // 特殊处理：如果匹配的是嵌套项目，确保其父文件夹也显示
      if (item.classList.contains('nested-item')) {
        const parentFolder = item.closest('.folder-item');
        if (parentFolder) {
          parentFolder.classList.remove('hidden-by-search');
          console.log('显示嵌套项目的父文件夹');
        }
      }
    } else {
      item.classList.add('hidden-by-search');
    }
  });
  
  // 搜索结果统计已通过UI展示，移除控制台日志
    /* console.log('搜索结果:', {
      matchCount: matchCount,
      totalCount: totalCount,
      searchTerm: searchTerm
    }); */
  
  // 更新搜索状态显示
  updateSearchStatus(matchCount, totalCount);
}

// 更新搜索状态显示
function updateSearchStatus(matchCount, totalCount) {
  const searchBox = document.getElementById('search-box');
  const statsElement = document.getElementById('stats');
  
  if (searchTerm && searchBox) {
    // 显示搜索结果状态
    searchBox.classList.add('search-active');
    if (matchCount === 0) {
      searchBox.classList.add('search-no-results');
    } else {
      searchBox.classList.remove('search-no-results');
    }
    searchBox.title = `找到 ${matchCount} 个匹配项（共 ${totalCount} 项）`;
  } else if (searchBox) {
    // 清除搜索状态
    searchBox.classList.remove('search-active', 'search-no-results');
    searchBox.title = '';
  }
  
  // 在统计信息中显示搜索结果
  if (statsElement) {
    if (searchTerm) {
      // 显示搜索结果
      const bookmarkCountEl = document.getElementById('bookmark-count');
      const folderCountEl = document.getElementById('folder-count');
      const bookmarkCount = bookmarkCountEl ? bookmarkCountEl.textContent : '0';
      const folderCount = folderCountEl ? folderCountEl.textContent : '0';
      
      const resultColor = matchCount > 0 ? '#4a90e2' : '#ff6b6b';
      const resultIcon = matchCount > 0 ? '🔍' : '❌';
      statsElement.innerHTML = `${bookmarkCount} 个书签 | ${folderCount} 个文件夹 | <span style="color: ${resultColor};">${resultIcon} 搜索结果: ${matchCount} 项</span>`;
    } else {
      // 清除搜索结果显示，恢复原始统计
      const bookmarkCountEl = document.getElementById('bookmark-count');
      const folderCountEl = document.getElementById('folder-count');
      const bookmarkCount = bookmarkCountEl ? bookmarkCountEl.textContent : '0';
      const folderCount = folderCountEl ? folderCountEl.textContent : '0';
      
      statsElement.innerHTML = `<span id="bookmark-count">${bookmarkCount}</span> 个书签 | <span id="folder-count">${folderCount}</span> 个文件夹`;
    }
  }
}

// 更新统计信息
function updateStats(bookmarkCount, folderCount) {
  const bookmarkCountEl = document.getElementById('bookmark-count');
  const folderCountEl = document.getElementById('folder-count');
  const statsElement = document.getElementById('stats');
  
  if (bookmarkCountEl) bookmarkCountEl.textContent = bookmarkCount;
  if (folderCountEl) folderCountEl.textContent = folderCount;
  
  // 如果有搜索词，重新应用搜索状态显示
  if (searchTerm && statsElement) {
    // 延迟执行，确保DOM已更新
    setTimeout(() => {
      // 包含所有类型的项目：主书签、文件夹、嵌套书签
      const allItems = document.querySelectorAll('.bookmark-item, .folder-item, .nested-item');
      const visibleItems = Array.from(allItems).filter(item => !item.classList.contains('hidden-by-search'));
      const matchCount = visibleItems.length;
      const totalCount = allItems.length;
      
      // 更新搜索状态显示
      updateSearchStatus(matchCount, totalCount);
    }, 0);
  }
}

// 右键菜单功能
function setupContextMenu() {
  const contextMenu = document.getElementById('context-menu');
  
  // 点击其他地方隐藏菜单
  document.addEventListener('click', function() {
    contextMenu.style.display = 'none';
  });
  
  // 菜单项点击事件
  contextMenu.addEventListener('click', function(e) {
    const action = e.target.getAttribute('data-action');
    if (action && window.currentContextBookmark) {
      handleContextMenuAction(action, window.currentContextBookmark);
    }
    contextMenu.style.display = 'none';
  });
}

// 设置编辑对话框事件监听器
function setupEditDialog() {
  const dialog = document.getElementById('edit-dialog');
  const overlay = dialog.querySelector('.edit-dialog-overlay');
  const closeBtn = document.getElementById('edit-dialog-close');
  const cancelBtn = document.getElementById('edit-cancel');
  const saveBtn = document.getElementById('edit-save');
  const titleInput = document.getElementById('edit-title');
  const urlInput = document.getElementById('edit-url');
  
  // 点击遮罩层关闭对话框
  overlay.addEventListener('click', hideEditDialog);
  
  // 点击关闭按钮
  closeBtn.addEventListener('click', hideEditDialog);
  
  // 点击取消按钮
  cancelBtn.addEventListener('click', hideEditDialog);
  
  // 点击保存按钮
  saveBtn.addEventListener('click', saveEdit);
  
  // 键盘事件
  dialog.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      hideEditDialog();
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      saveEdit();
    }
  });
  
  // 输入框回车事件
  titleInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (urlInput.style.display !== 'none') {
        urlInput.focus();
      } else {
        saveEdit();
      }
    }
  });
  
  urlInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveEdit();
    }
  });
}

// 显示右键菜单
function showContextMenu(event, bookmark) {
  const contextMenu = document.getElementById('context-menu');
  window.currentContextBookmark = bookmark;
  
  // 根据书签类型显示/隐藏相应的菜单项
  const openInBackgroundItem = contextMenu.querySelector('[data-action="open-in-background"]');
  const copyUrlItem = contextMenu.querySelector('[data-action="copy-url"]');
  const copyNameItem = contextMenu.querySelector('[data-action="copy-name"]');
  const updateToCurrentUrlItem = contextMenu.querySelector('[data-action="update-to-current-url"]');
  const clearUsageItem = contextMenu.querySelector('[data-action="clear-usage"]');
  const checkValidityItem = contextMenu.querySelector('[data-action="check-validity"]');
  const editItem = contextMenu.querySelector('[data-action="edit"]');
  const deleteItem = contextMenu.querySelector('[data-action="delete"]');
  
  if (bookmark.url) {
    // 书签 - 显示所有菜单项
    openInBackgroundItem.style.display = 'block';
    copyUrlItem.style.display = 'block';
    copyNameItem.style.display = 'block';
    updateToCurrentUrlItem.style.display = 'block';
    clearUsageItem.style.display = 'block';
    checkValidityItem.style.display = 'block';
    checkValidityItem.textContent = '🔍 检查有效性';
    editItem.style.display = 'block';
    deleteItem.style.display = 'block';
  } else {
    // 文件夹 - 隐藏不适用的菜单项
    openInBackgroundItem.style.display = 'none';
    copyUrlItem.style.display = 'none';
    copyNameItem.style.display = 'block';
    updateToCurrentUrlItem.style.display = 'none';
    clearUsageItem.style.display = 'none';
    checkValidityItem.style.display = 'block';
    checkValidityItem.textContent = '🔍 检查文件夹';
    editItem.style.display = 'block';
    deleteItem.style.display = 'block';
  }
  
  contextMenu.style.display = 'block';
  contextMenu.style.left = event.pageX + 'px';
  contextMenu.style.top = event.pageY + 'px';
  
  // 确保菜单不会超出视窗
  const rect = contextMenu.getBoundingClientRect();
  if (rect.right > window.innerWidth) {
    contextMenu.style.left = (event.pageX - rect.width) + 'px';
  }
  if (rect.bottom > window.innerHeight) {
    contextMenu.style.top = (event.pageY - rect.height) + 'px';
  }
}

// 处理右键菜单操作
function handleContextMenuAction(action, bookmark) {
  switch (action) {
    case 'open-in-background':
      if (bookmark.url) {
        if (isDangerousUrl(bookmark.url)) { alert('该链接协议不受支持，无法打开'); break; }
        chrome.tabs.create({ url: bookmark.url, active: false });
      }
      break;
    case 'copy-url':
      if (bookmark.url) {
        navigator.clipboard.writeText(bookmark.url);
      }
      break;
    case 'copy-name':
      navigator.clipboard.writeText(bookmark.title);
      break;
    case 'update-to-current-url':
      if (bookmark.url) {
        updateBookmarkToCurrentUrl(bookmark);
      }
      break;
    case 'clear-usage':
      if (bookmark.url && confirm(`确定要清除 "${bookmark.title}" 的使用记录吗？`)) {
        bookmarkUsageManager.clearUsage(bookmark.id);
        // 重新渲染当前文件夹以更新显示
        renderBookmarks(currentFolderId);
      }
      break;
    case 'edit':
      showEditDialog(bookmark);
      break;
    case 'delete':
      if (confirm(`确定要删除 "${bookmark.title}" 吗？`)) {
        chrome.bookmarks.remove(bookmark.id, function() {
          if (chrome.runtime.lastError) {
            console.error('删除书签失败:', chrome.runtime.lastError);
          } else {
            invalidateBookmarkTree(); // 内存树失效，下次读取自动重建
            // 重新渲染当前文件夹
            renderBookmarks(currentFolderId);
          }
        });
      }
      break;
    case 'check-validity':
      if (bookmark.url) {
        bookmarkChecker.checkSingle(bookmark).then(result => {
          bookmarkChecker.results.set(bookmark.id, { ...result, title: bookmark.title, url: bookmark.url });
          bookmarkChecker.showResultsDialog();
        });
      } else {
        bookmarkChecker.checkFolderBookmarks(bookmark.id, bookmark.title);
      }
      break;
  }
}

// 显示编辑对话框
function showEditDialog(bookmark) {
  const dialog = document.getElementById('edit-dialog');
  const titleInput = document.getElementById('edit-title');
  const urlInput = document.getElementById('edit-url');
  const urlGroup = document.getElementById('edit-url-group');
  
  // 设置当前编辑的书签ID
  dialog.setAttribute('data-bookmark-id', bookmark.id);
  
  // 填充当前值
  titleInput.value = bookmark.title || '';
  
  if (bookmark.url) {
    // 书签
    urlInput.value = bookmark.url;
    urlGroup.style.display = 'block';
  } else {
    // 文件夹
    urlGroup.style.display = 'none';
  }
  
  // 显示对话框
  dialog.style.display = 'block';
  titleInput.focus();
  titleInput.select();
}

// 隐藏编辑对话框
function hideEditDialog() {
  const dialog = document.getElementById('edit-dialog');
  dialog.style.display = 'none';
}

// 保存编辑
function saveEdit() {
  const dialog = document.getElementById('edit-dialog');
  const bookmarkId = dialog.getAttribute('data-bookmark-id');
  const titleInput = document.getElementById('edit-title');
  const urlInput = document.getElementById('edit-url');
  const urlGroup = document.getElementById('edit-url-group');
  
  const newTitle = titleInput.value.trim();
  const newUrl = urlInput.value.trim();
  
  if (!newTitle) {
    alert('标题不能为空');
    titleInput.focus();
    return;
  }
  
  // 如果是书签且URL为空，提示错误
  if (urlGroup.style.display !== 'none' && !newUrl) {
    alert('书签URL不能为空');
    urlInput.focus();
    return;
  }
  
  // 准备更新数据
  const updateData = { title: newTitle };
  if (newUrl) {
    updateData.url = newUrl;
  }
  
  // 更新书签
  if (isExtensionEnvironment) {
    chrome.bookmarks.update(bookmarkId, updateData, function(result) {
      if (chrome.runtime.lastError) {
        console.error('更新书签失败:', chrome.runtime.lastError);
        alert('保存失败: ' + chrome.runtime.lastError.message);
      } else {
        console.log('书签更新成功:', result);
        hideEditDialog();
        invalidateBookmarkTree(); // 内存树失效，下次读取自动重建
        // 重新渲染当前文件夹
        renderBookmarks(currentFolderId);
      }
    });
  } else {
    // 测试环境模拟
    console.log('模拟更新书签:', updateData);
    hideEditDialog();
    alert('编辑功能在测试环境中已模拟完成');
  }
}

// 更新书签为当前地址栏地址
function updateBookmarkToCurrentUrl(bookmark) {
  if (isExtensionEnvironment) {
    // 获取当前活动标签页
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      if (chrome.runtime.lastError) {
        console.error('获取当前标签页失败:', chrome.runtime.lastError);
        alert('获取当前标签页失败: ' + chrome.runtime.lastError.message);
        return;
      }
      
      if (tabs.length === 0) {
        alert('未找到当前活动标签页');
        return;
      }
      
      const currentTab = tabs[0];
      const currentUrl = currentTab.url;
      const currentTitle = currentTab.title;
      
      // 确认是否要更新
      const confirmMessage = `确定要将书签 "${bookmark.title}" 的地址更新为当前页面吗？\n\n` +
                           `当前地址: ${bookmark.url}\n` +
                           `新地址: ${currentUrl}\n` +
                           `新标题: ${currentTitle}`;
      
      if (confirm(confirmMessage)) {
        // 更新书签
        const updateData = {
          title: currentTitle,
          url: currentUrl
        };
        
        chrome.bookmarks.update(bookmark.id, updateData, function(result) {
          if (chrome.runtime.lastError) {
            console.error('更新书签失败:', chrome.runtime.lastError);
            alert('更新书签失败: ' + chrome.runtime.lastError.message);
          } else {
            console.log('书签更新成功:', result);
            alert(`书签已成功更新为当前页面！\n标题: ${currentTitle}`);
            invalidateBookmarkTree(); // 内存树失效，下次读取自动重建
            // 重新渲染当前文件夹
            renderBookmarks(currentFolderId);
          }
        });
      }
    });
  } else {
    // 测试环境模拟
    const mockCurrentUrl = 'https://example.com/current-page';
    const mockCurrentTitle = '当前页面标题';
    
    const confirmMessage = `确定要将书签 "${bookmark.title}" 的地址更新为当前页面吗？\n\n` +
                         `当前地址: ${bookmark.url}\n` +
                         `新地址: ${mockCurrentUrl}\n` +
                         `新标题: ${mockCurrentTitle}`;
    
    if (confirm(confirmMessage)) {
      console.log('模拟更新书签:', {
        id: bookmark.id,
        oldUrl: bookmark.url,
        newUrl: mockCurrentUrl,
        newTitle: mockCurrentTitle
      });
      alert(`测试环境：书签已模拟更新为当前页面！\n标题: ${mockCurrentTitle}`);
    }
  }
}

// HTML转义函数（同时适用于文本与属性上下文，含引号转义）
function escapeHtml(text) {
  if (text === null || text === undefined) return '';
  return String(text).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}

// 判断是否为可执行脚本的危险协议（javascript:/data:/vbscript:）
function isDangerousUrl(url) {
  try {
    const protocol = new URL(url).protocol;
    return protocol === 'javascript:' || protocol === 'data:' || protocol === 'vbscript:';
  } catch (e) {
    return false;
  }
}