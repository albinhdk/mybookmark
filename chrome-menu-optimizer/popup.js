// 全局变量
let currentFolderId = null; // 初始为null，动态获取
let searchTerm = '';
let currentTargetNodeId = null;
let searchRequestId = 0;

// 国际化取词（i18n.js 必须先于本文件加载；缺失时退化为直接返回 key）
var t = (typeof window !== 'undefined' && window.BMV && window.BMV.i18n) ? window.BMV.i18n.t : function (key) { return key; };

// favicon 加载失败时的占位图（原内联 data URI，提取为常量避免重复）
const FALLBACK_FAVICON = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjE2IiBoZWlnaHQ9IjE2IiByeD0iMiIgZmlsbD0iIzRhOTBlMiIvPgo8dGV4dCB4PSI4IiB5PSIxMSIgZm9udC1mYW1pbHk9InNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iMTAiIGZpbGw9IndoaXRlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj7wn5OQPC90ZXh0Pgo8L3N2Zz4K';

// 分批渲染每批数量与委托数据映射
const RENDER_BATCH = 100;
const SEARCH_FILTER_BATCH = 500;
let currentRenderData = new Map(); // id -> bookmark，供事件委托查找
let pendingLoadMore = null;        // 当前"加载更多"按钮对应的回调

// favicon 地址：扩展环境走 chrome-extension 的 _favicon 接口（同源、零外网请求、
// 不向站点暴露访问痕迹）；测试环境回退为站点 favicon.ico
function getFaviconUrl(pageUrl) {
  if (isExtensionEnvironment && chrome.runtime && typeof chrome.runtime.getURL === 'function') {
    try {
      return chrome.runtime.getURL('_favicon/?pageUrl=' + encodeURIComponent(pageUrl) + '&size=32');
    } catch (e) { /* 回退到站点 favicon */ }
  }
  try {
    const url = new URL(pageUrl);
    return `${url.protocol}//${url.hostname}/favicon.ico`;
  } catch (e) {
    return FALLBACK_FAVICON;
  }
}

// ===== 书签数据访问 =====
// 内存树索引与数据访问已抽取到共享模块 bookmark-tree.js（window.BMV.bookmarkTree），
// popup 与检查器页（checker.html）共用，保证两处看到同一份新鲜数据。
const BMV = window.BMV;

// 检测是否在Chrome扩展环境中
const isExtensionEnvironment = !!(typeof chrome !== 'undefined' && chrome.bookmarks);
// 注：非扩展环境（file:// 直开）的模拟 Chrome API 已抽取到 mock-chrome-api.js

// 初始化
document.addEventListener('DOMContentLoaded', function() {
  initializeExtension();
});

// 初始化扩展
async function initializeExtension() {
  try {
    // 检查Chrome API可用性
    if (!chrome || !chrome.bookmarks) {
      throw new Error(t('chromeApiUnavailable'));
    }
    
    // 注册变更监听并全量加载书签树（getTree 成功即代表书签权限可用）
    BMV.bookmarkTree.registerBookmarkTreeListeners();
    const tree = await BMV.bookmarkTree.ensureBookmarkTree();
    
    // 等待使用统计加载完成再首渲染，避免使用次数先显示 0；
    // 同时清理已删除书签的孤儿统计条目
    if (bookmarkUsageManager && bookmarkUsageManager.ready) {
      await bookmarkUsageManager.ready;
      bookmarkUsageManager.pruneUsageStats(new Set(tree.nodeById.keys()));
    }
    // popup 关闭前把防抖待写入的统计落盘
    window.addEventListener('pagehide', () => {
      if (bookmarkUsageManager && bookmarkUsageManager._writeNow) {
        bookmarkUsageManager._writeNow();
      }
    });
    
    // 等待视图设置（列数/预览数）加载完成再首渲染，避免先跳变再纠正
    if (typeof bookmarkViewSettings !== 'undefined' && bookmarkViewSettings.ready) {
      await bookmarkViewSettings.ready();
    }
    
    // 获取书签栏根ID
    if (!currentFolderId) {
      currentFolderId = BMV.bookmarkTree.getBookmarkBarRootId();
    }
    
    await renderBookmarks(currentFolderId);
    setupViewSettings();
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
          ${t('errorInitFailed')}<br>
          <small>${error.message}</small><br>
          <button class="retry-btn">${t('retryButton')}</button>
        </div>
      `;
      const retryBtn = bookmarksContainer.querySelector('button.retry-btn');
      if (retryBtn) {
        retryBtn.addEventListener('click', () => initializeExtension());
      }
    }
  }
}

// 视图设置（每行列数 / 每卡预览数）：初始化选中值、change 即时保存并重渲
// popup 整体宽度固定为浏览器上限 800px，卡片宽度由列数经网格 1fr 轨道动态均分。
function setupViewSettings() {
  const columnsSel = document.getElementById('setting-columns');
  const previewSel = document.getElementById('setting-preview');
  const hint = document.getElementById('view-settings-hint');
  if (!columnsSel || !previewSel) return;

  const apply = () => {
    const s = bookmarkViewSettings.get();
    columnsSel.value = String(s.columns);
    previewSel.value = String(s.preview);
    if (hint) {
      hint.textContent = s.preview > 0 ? t('viewSettingsHintWithPreview', [s.columns, s.preview]) : t('viewSettingsHintNoPreview', [s.columns]);
    }
  };
  apply();

  const onChange = async () => {
    await bookmarkViewSettings.save({
      columns: Number(columnsSel.value),
      preview: Number(previewSel.value)
    });
    apply();
    await renderBookmarks(currentFolderId); // 即时重渲当前视图
  };
  columnsSel.addEventListener('change', onChange);
  previewSel.addEventListener('change', onChange);
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
    searchRequestId++; // 输入变化时立即取消正在扫描或渲染的旧搜索
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

  // 键盘支持：Esc 清空搜索；↑/↓ 在可见书签项间移动焦点（Enter 打开）
  let kbIndex = -1;
  const getVisibleLinks = () => Array.from(
    document.querySelectorAll('#bookmarks .bookmark-link')
  ).filter(link => {
    let el = link.closest('li');
    while (el) {
      if (el.classList && el.classList.contains('hidden-by-search')) return false;
      el = el.parentElement;
    }
    return true;
  });
  document.addEventListener('keydown', function(e) {
    const inSearch = e.target === searchBox;
    const inLink = e.target.classList && e.target.classList.contains('bookmark-link');
    if (!inSearch && !inLink) return;
    
    if (e.key === 'Escape' && inSearch) {
      if (searchBox.value) {
        searchBox.value = '';
        searchTerm = '';
        searchRequestId++;
        clearTimeout(searchDebounceTimer);
        renderBookmarks(currentFolderId);
      }
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    
    const links = getVisibleLinks();
    if (links.length === 0) return;
    e.preventDefault();
    document.querySelectorAll('.keyboard-focus').forEach(el => el.classList.remove('keyboard-focus'));
    kbIndex = e.key === 'ArrowDown'
      ? (kbIndex + 1) % links.length
      : (kbIndex <= 0 ? links.length - 1 : kbIndex - 1);
    const target = links[kbIndex];
    target.classList.add('keyboard-focus');
    target.focus();
  });

  // 书签容器事件委托（点击/右键/favicon 兜底统一处理，监听器数量 O(1)）
  setupBookmarksDelegation();
  
  // 拖拽移动（委托在 #bookmarks 容器 + 面包屑）
  setupDragAndDrop();
  
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
      container.innerHTML = '<div class="error">' + t('errorOpenFolderFailed') + '</div>';
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
        alert(t('alertUnsupportedProtocol'));
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

// ===== 拖拽移动（HTML5 Drag & Drop）=====
// 交互：书签/文件夹卡片均可拖动 —— 拖到文件夹卡片上=移入该文件夹；
// 在当前网格内拖动=排序；面包屑目录项也是放置目标（拖到哪层就移到哪层）。
// 事件全部冒泡，统一委托在 #bookmarks 容器上，监听器 O(1)。
// 卡片仅允许专用 .bookmark-drag-handle 启动拖拽；链接仍由容器单独处理点击。
let dndState = null; // { id, isFolder, fromFolderId, fromIndex, insertTarget?, folderDropId?, crumbDropId? }

// 同父排序的 index 归一化。chrome.bookmarks.move 的 index 以"移除前"数组为基准，
// 向下移动时 Chromium 自动 -1（tests/dnd-semantics.js 于 Edge 153 实证：move(A,2)
// 于 [A,B,C,D] 得 BACD），故视觉落点（移除后坐标）向下时需 +1 回补；
// 向上移动与跨父移动直接传落点即可。
function normalizeMoveIndex(fromIndex, dropIndex, sameParent) {
  if (sameParent && dropIndex > fromIndex) return dropIndex + 1;
  return dropIndex;
}

// 视觉插入位置 → 移除后坐标系的落点：悬停卡在原列表中的 cardIndex，
// 其被拖项移除后的位置为 cardIndex - (fromIndex < cardIndex ? 1 : 0)。
// position 为 'before'/'after'（after 场景由调用方以"最后一张卡之后"传入）。
function computeDropIndex(fromIndex, cardIndex, position) {
  const cardPos = cardIndex - (fromIndex < cardIndex ? 1 : 0);
  return position === 'after' ? cardPos + 1 : cardPos;
}

// 网格直接子卡片（不含末尾的"加载更多"假项；顺序即当前文件夹子项顺序，
// load-more 挂起时列表不完整，此时禁用排序——见 setupDragAndDrop 的 pendingLoadMore 门控）
function getGridCards(grid) {
  return Array.from(grid.children).filter(li =>
    li.classList.contains('bookmark-item') && !li.classList.contains('load-more-item')
  );
}

// 指针所在网格内的插入位置：取最近的可放置卡片（跳过被拖项），
// 以卡片水平中线判定落在其前还是后（多列网格的列间空隙由最近卡片兜底）
function resolveGridInsertTarget(grid, clientX, clientY, excludeCard) {
  const cards = getGridCards(grid).filter(card => card !== excludeCard);
  if (cards.length === 0) return null;
  let best = null, bestDist = Infinity;
  for (const card of cards) {
    const r = card.getBoundingClientRect();
    const dx = clientX < r.left ? r.left - clientX : (clientX > r.right ? clientX - r.right : 0);
    const dy = clientY < r.top ? r.top - clientY : (clientY > r.bottom ? clientY - r.bottom : 0);
    if (dx === 0 && dy === 0) { best = card; break; } // 指针就在卡内
    const dist = dx * dx + dy * dy;
    if (dist < bestDist) { bestDist = dist; best = card; }
  }
  const r = best.getBoundingClientRect();
  return { card: best, position: clientX > r.left + r.width / 2 ? 'after' : 'before' };
}

function setupDragAndDrop() {
  const container = document.getElementById('bookmarks');
  const breadcrumb = document.getElementById('breadcrumb');
  if (!container || container.dataset.dndBound) return;
  container.dataset.dndBound = '1';

  // 只清除放置反馈高亮；拖拽源的 .dnd-dragging 置灰保留到 dragend/drop
  const clearDropVisuals = () => {
    container.querySelectorAll('.dnd-drop-into, .dnd-drop-before, .dnd-drop-after, .dnd-drop-invalid')
      .forEach(el => el.classList.remove('dnd-drop-into', 'dnd-drop-before', 'dnd-drop-after', 'dnd-drop-invalid'));
    if (breadcrumb) {
      breadcrumb.querySelectorAll('.dnd-crumb-drop').forEach(el => el.classList.remove('dnd-crumb-drop'));
    }
  };

  const resetDnD = () => {
    clearDropVisuals();
    container.querySelectorAll('.dnd-dragging').forEach(el => el.classList.remove('dnd-dragging'));
    dndState = null;
  };

  // dragstart：记录被拖项与其原始位置（先算 fromIndex 再置灰，
  // 避免 dragging 卡片被过滤导致索引坐标系不一致）
  container.addEventListener('dragstart', function(e) {
    const card = e.target.closest('.bookmark-item');
    const handle = e.target.closest('.bookmark-drag-handle');
    if (!card || !handle || !card.contains(handle)) {
      e.preventDefault();
      return;
    }
    const bookmark = currentRenderData.get(card.dataset.bookmarkId);
    if (!bookmark) return;
    const grid = card.closest('.bookmark-grid');
    dndState = {
      id: bookmark.id,
      isFolder: !bookmark.url,
      fromFolderId: currentFolderId,
      fromIndex: grid ? getGridCards(grid).indexOf(card) : -1
    };
    e.dataTransfer.setData('text/plain', bookmark.title || '');
    e.dataTransfer.effectAllowed = 'move';
    card.classList.add('dnd-dragging');
  });

  // dragover：文件夹卡片=移入高亮（校验自身/子树）；其他位置=排序插入指示
  container.addEventListener('dragover', function(e) {
    if (!dndState) return;
    e.preventDefault(); // 不阻止默认则 drop 不触发
    clearDropVisuals();

    const folderCard = e.target.closest('.folder-item');
    if (folderCard) {
      const targetId = folderCard.dataset.bookmarkId;
      if (targetId !== dndState.id) {
        const invalid = dndState.isFolder && BMV.bookmarkTree.isSelfOrAncestorOf(dndState.id, targetId);
        folderCard.classList.add(invalid ? 'dnd-drop-invalid' : 'dnd-drop-into');
        e.dataTransfer.dropEffect = invalid ? 'none' : 'move';
      } else {
        e.dataTransfer.dropEffect = 'none'; // 拖到自己头上：无放置反馈
      }
      return;
    }

    // 排序：pendingLoadMore 挂起时只渲染了部分子项，index 会错位，禁用
    const grid = container.querySelector('.bookmark-grid');
    if (grid && !pendingLoadMore) {
      const target = resolveGridInsertTarget(grid, e.clientX, e.clientY, container.querySelector('.dnd-dragging'));
      if (target) {
        target.card.classList.add(target.position === 'after' ? 'dnd-drop-after' : 'dnd-drop-before');
        dndState.insertTarget = { bookmarkId: target.card.dataset.bookmarkId, position: target.position };
        e.dataTransfer.dropEffect = 'move';
        return;
      }
    }
    e.dataTransfer.dropEffect = 'none';
  });

  container.addEventListener('drop', function(e) {
    if (!dndState) return;
    e.preventDefault();
    const state = dndState;
    const folderCard = e.target.closest('.folder-item');
    const folderTargetId = folderCard && folderCard.dataset.bookmarkId;

    // 1) 拖入文件夹（同一张卡上 dragover 已高亮，这里按同一规则复核）
    if (folderTargetId && folderTargetId !== state.id) {
      const invalid = state.isFolder && BMV.bookmarkTree.isSelfOrAncestorOf(state.id, folderTargetId);
      resetDnD();
      if (invalid) {
        alert(t('alertMoveFolderIntoSelf'));
        return;
      }
      moveBookmarkTo(state.id, { parentId: folderTargetId });
      return;
    }

    // 2) 网格内排序（fromIndex/插入目标都在"移除前"坐标系，与 drop 时 DOM 一致）
    const insert = state.insertTarget;
    const grid = container.querySelector('.bookmark-grid');
    if (insert && grid && !pendingLoadMore && state.fromIndex >= 0) {
      const cardIndex = getGridCards(grid).findIndex(li => li.dataset.bookmarkId === insert.bookmarkId);
      if (cardIndex !== -1) {
        const dropIndex = computeDropIndex(state.fromIndex, cardIndex, insert.position);
        resetDnD();
        if (dropIndex !== state.fromIndex) {
          moveBookmarkTo(state.id, { index: normalizeMoveIndex(state.fromIndex, dropIndex, true) });
        }
        return;
      }
    }
    resetDnD();
  });

  // 无论放置是否有效、按 Esc 取消还是拖出窗口，dragend 都会触发，统一收尾
  container.addEventListener('dragend', resetDnD);

  // 面包屑放置目标：拖到哪层目录项就移到哪层
  if (breadcrumb) {
    breadcrumb.addEventListener('dragover', function(e) {
      if (!dndState) return;
      e.preventDefault();
      clearDropVisuals();
      const link = e.target.closest('a[data-folder-id]');
      if (!link) { e.dataTransfer.dropEffect = 'none'; return; }
      const targetId = link.dataset.folderId;
      // 自身/子树、原地放下都视为无效
      const invalid = targetId === dndState.id
        || (dndState.isFolder && BMV.bookmarkTree.isSelfOrAncestorOf(dndState.id, targetId))
        || targetId === dndState.fromFolderId;
      if (invalid) { e.dataTransfer.dropEffect = 'none'; return; }
      link.classList.add('dnd-crumb-drop');
      e.dataTransfer.dropEffect = 'move';
    });

    breadcrumb.addEventListener('drop', function(e) {
      if (!dndState) return;
      e.preventDefault();
      const state = dndState;
      const link = e.target.closest('a[data-folder-id]');
      const targetId = link && link.dataset.folderId;
      resetDnD();
      if (!targetId || targetId === state.fromFolderId || targetId === state.id) return;
      if (state.isFolder && BMV.bookmarkTree.isSelfOrAncestorOf(state.id, targetId)) {
        alert(t('alertMoveFolderIntoSelf'));
        return;
      }
      moveBookmarkTo(state.id, { parentId: targetId });
    });

    // 指针离开面包屑时清掉残留高亮（relatedTarget 为空表示拖出了窗口）
    breadcrumb.addEventListener('dragleave', function(e) {
      if (!dndState) return;
      if (!breadcrumb.contains(e.relatedTarget)) {
        breadcrumb.querySelectorAll('.dnd-crumb-drop').forEach(el => el.classList.remove('dnd-crumb-drop'));
      }
    });
  }
}

// 移动书签/文件夹：chrome.bookmarks.move → 失效内存树 → 重渲当前视图
async function moveBookmarkTo(id, destination) {
  try {
    await new Promise((resolve, reject) => {
      chrome.bookmarks.move(id, destination, function() {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    });
    BMV.bookmarkTree.invalidateBookmarkTree(); // 内存树失效，下次读取自动重建
    await renderBookmarks(currentFolderId);
  } catch (error) {
    console.error('移动书签失败:', error);
    alert(t('alertMoveFailed', [error.message]));
  }
}

// 渲染搜索结果（竞态防护 + 分批渲染）
async function renderSearchResults() {
  const requestId = ++searchRequestId;
  const query = searchTerm;
  const bookmarksContainer = document.getElementById('bookmarks');
  
  // 搜索结果页隐藏视图设置行（设置只作用于网格视图）
  const settingsRow = document.getElementById('view-settings');
  if (settingsRow) settingsRow.style.display = 'none';
  
  // 显示加载状态
  bookmarksContainer.innerHTML = '<div class="loading">' + t('loadingSearchingBookmarks') + '</div>';
  
  try {
    // 获取所有书签
    const allBookmarks = await BMV.bookmarkTree.getAllBookmarks();
    // 竞态防护：加载期间又有新搜索或切回文件夹视图时，丢弃本次过期响应
    if (requestId !== searchRequestId) return;
    
    // 分段过滤并让出主线程，避免大型书签库阻塞弹窗交互。
    const filteredBookmarks = [];
    for (let start = 0; start < allBookmarks.length; start += SEARCH_FILTER_BATCH) {
      if (requestId !== searchRequestId) return;
      const end = Math.min(start + SEARCH_FILTER_BATCH, allBookmarks.length);
      for (let index = start; index < end; index++) {
        const bookmark = allBookmarks[index];
        if (bookmark.url && (isSearchMatch(bookmark.title, query) || isSearchMatch(bookmark.url, query))) {
          filteredBookmarks.push(bookmark);
        }
      }
      if (end < allBookmarks.length) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
    if (requestId !== searchRequestId) return;
    
    if (filteredBookmarks.length === 0) {
      bookmarksContainer.innerHTML = `
        <div class="empty-state">
          ${t('searchNoResultsTitle')}
          <div class="search-tips">
            <div>${t('searchTipDifferentKeywords')}</div>
            <div>${t('searchTipCheckSpelling')}</div>
            <div>${t('searchTipPinyinSupport')}</div>
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
      <span>${t('breadcrumbSearchResultsLabel')}</span> 
      <span class="search-term-highlight">${escapeHtml(query)}</span>
    `;
    breadcrumbContainer.style.display = 'flex';
    
    // 更新统计信息
    viewState.matchCount = filteredBookmarks.length;
    renderStats();
    
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
      if (requestId !== searchRequestId) return; // 批次已过期，停止追加

      // 同批书签常来自相同文件夹：每个父文件夹只计算一次路径，并发准备结果项。
      const parentIds = [...new Set(slice.map(bookmark => bookmark.parentId))];
      const folderPaths = new Map(await Promise.all(parentIds.map(async parentId => [
        parentId,
        await BMV.bookmarkTree.getFolderPath(parentId)
      ])));
      const resultItems = await Promise.all(slice.map(bookmark =>
        createSearchResultItem(bookmark, folderPaths.get(bookmark.parentId))
      ));

      // 异步准备期间可能开始了新搜索；过期批次不能污染当前映射或页面。
      if (requestId !== searchRequestId) return;
      const fragment = document.createDocumentFragment();
      slice.forEach((bookmark, index) => {
        currentRenderData.set(bookmark.id, bookmark);
        fragment.appendChild(resultItems[index]);
      });
      resultsContainer.appendChild(fragment);
      rendered += slice.length;
      
      const existingMore = resultsContainer.querySelector('.load-more-item');
      if (existingMore) existingMore.remove();
      pendingLoadMore = null;
      if (rendered < filteredBookmarks.length) {
        const moreItem = document.createElement('li');
        moreItem.className = 'more-items-link load-more-item';
        moreItem.innerHTML = `<span>${t('loadMoreButton', [filteredBookmarks.length - rendered])}...</span>`;
        pendingLoadMore = renderBatch;
        resultsContainer.appendChild(moreItem);
      }
    };
    await renderBatch();
    
  } catch (error) {
    console.error('搜索失败:', error);
    bookmarksContainer.innerHTML = `
      <div class="error">
        ${t('errorSearchFailed')}
        <small>${error.message}</small>
      </div>
    `;
  }
}

// 创建搜索结果项（事件由 #bookmarks 容器委托处理，此处只挂数据）
function createSearchResultItem(bookmark, folderPath) {
  const listItem = document.createElement('li');
  listItem.className = 'search-result-item';
  listItem.dataset.bookmarkId = bookmark.id;
  
  // 获取使用统计
  const usageCount = bookmarkUsageManager.getUsageCount(bookmark.id);
  const usageText = bookmarkUsageManager.formatUsageCount(usageCount);
  
  // 获取favicon
  const faviconUrl = getFaviconUrl(bookmark.url);
  
  // 构建工具提示信息
  let tooltipText = bookmark.title;
  tooltipText += `
${bookmark.url}`;
  if (usageCount > 0) {
    tooltipText += `
${t('tooltipUsageCount', [usageText])}`;
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
  searchRequestId++; // 切回文件夹视图时取消尚未完成的搜索
  const bookmarksContainer = document.getElementById('bookmarks');
  
  // 恢复视图设置行（搜索页会隐藏它）
  const settingsRow = document.getElementById('view-settings');
  if (settingsRow) settingsRow.style.display = '';
  
  // 显示加载状态
  bookmarksContainer.innerHTML = '<div class="loading">' + t('loadingBookmarksEllipsis') + '</div>';
  
  try {
    // 验证容器元素
    if (!bookmarksContainer) {
      throw new Error(t('errorBookmarkContainerNotFound'));
    }
    
    const bookmarks = await BMV.bookmarkTree.getBookmarks(folderId);
    await updateBreadcrumb(folderId);
    
    if (!bookmarks || bookmarks.length === 0) {
      bookmarksContainer.innerHTML = '<div class="empty-state">' + t('emptyFolderMessage') + '</div>';
      updateStats(0, 0);
      return;
    }

    // 创建网格容器（popup 固定最大宽度，卡片由列数经 1fr 轨道动态均分）
    const gridContainer = document.createElement('ul');
    gridContainer.className = 'bookmark-grid';
    const viewSettings = (typeof bookmarkViewSettings !== 'undefined') ? bookmarkViewSettings.get() : null;
    const columns = (viewSettings && viewSettings.columns) || 3;
    gridContainer.style.gridTemplateColumns = `repeat(${columns}, minmax(0, 1fr))`;
    
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
        moreItem.innerHTML = `<span>${t('loadMoreButton', [bookmarks.length - rendered])}...</span>`;
        pendingLoadMore = renderBatch;
        gridContainer.appendChild(moreItem);
      }
    };
    renderBatch();
    
    // 更新统计信息
    updateStats(bookmarkCount, folderCount);
    
    // 重新应用搜索过滤
    applySearchFilter();
  } catch (error) {
    console.error('渲染书签时出错:', error);
    const errorMessage = error.message || t('unknownError');
    bookmarksContainer.innerHTML = `
      <div class="error">
        ${t('errorLoadBookmarksFailed')}<br>
        <small>${errorMessage}</small><br>
        <button class="retry-btn">${t('retryButton')}</button>
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
    const path = await BMV.bookmarkTree.buildBreadcrumbPath(folderId);
    
    if (path.length === 0) {
      breadcrumbContainer.style.display = 'none';
      return;
    }
    
    breadcrumbContainer.style.display = 'flex';
    breadcrumbContainer.innerHTML = '';
    
    path.forEach((item, index) => {
      if (index > 0) {
        const separator = document.createElement('span');
        separator.textContent = t('breadcrumbSeparator');
        breadcrumbContainer.appendChild(separator);
      }
      
      const link = document.createElement('a');
      link.href = '#';
      link.textContent = item.title;
      link.dataset.folderId = item.id; // 拖拽放置目标（见 setupDragAndDrop）
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

// 创建书签元素（事件统一由 #bookmarks 容器委托处理，此处只挂数据）
function createBookmarkElement(bookmark) {
  const listItem = document.createElement('li');
  listItem.dataset.bookmarkId = bookmark.id;
  currentRenderData.set(bookmark.id, bookmark);

  const dragHandle = `<button class="bookmark-drag-handle" type="button" draggable="true" title="${escapeHtml(t('dragBookmarkHint'))}" aria-label="${escapeHtml(t('dragBookmarkHint'))}"><span aria-hidden="true">⠿</span></button>`;
  
  if (!bookmark.url) { // 文件夹没有URL属性
    // 文件夹
    listItem.className = 'bookmark-item folder-item';
    listItem.innerHTML = `
      <div class="folder-title" data-folder-id="${bookmark.id}">
        ${escapeHtml(bookmark.title)}
      </div>
      ${dragHandle}
    `;
    
    // 异步加载并显示文件夹预览（预览数由视图设置控制，0 表示不渲染）
    (async () => {
      const previewCount = (typeof bookmarkViewSettings !== 'undefined') ? bookmarkViewSettings.get().preview : 5;
      if (previewCount <= 0) return;
      try {
        const children = await BMV.bookmarkTree.getBookmarks(bookmark.id);
        if (children.length > 0) {
      const nestedList = document.createElement('ul');
      nestedList.className = 'nested-list';
      
      // 过滤出书签（不包括文件夹）
      const bookmarkChildren = children.filter(child => !child.children);
      
      // 仅选出预览所需的高频书签，避免对大型文件夹全量排序。
      const previewItems = bookmarkUsageManager.sortBookmarksByUsage(bookmarkChildren, previewCount);
      previewItems.forEach(child => {
        const nestedItem = document.createElement('li');
        nestedItem.className = 'nested-item';
        
        // 获取使用统计
        const usageCount = bookmarkUsageManager.getUsageCount(child.id);
        const usageText = bookmarkUsageManager.formatUsageCount(usageCount);
        const lastUsed = bookmarkUsageManager.formatLastUsed(bookmarkUsageManager.getLastUsed(child.id));
        
        // 获取favicon
        const nestedFaviconUrl = getFaviconUrl(child.url);
        
        // 构建工具提示信息
        let tooltipText = child.title;
        if (usageCount > 0) {
          tooltipText += `\n${t('tooltipUsageCount', [usageText])}`;
          if (lastUsed) {
            tooltipText += `\n${t('tooltipLastUsed', [lastUsed])}`;
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
      
      if (bookmarkChildren.length > previewCount) {
        const moreItem = document.createElement('li');
        moreItem.className = 'nested-item more-items-link';
        moreItem.dataset.folderId = bookmark.id;
        moreItem.innerHTML = `<span>${t('folderPreviewMoreItems', [bookmarkChildren.length - previewCount])}</span>`;
        moreItem.title = t('tooltipViewAllItemsInFolder', [bookmark.title]);
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
    
    // 获取favicon
    const faviconUrl = getFaviconUrl(bookmark.url);
    
    // 获取文件夹路径（仅在搜索模式下显示）
    let folderPathText = '';
    let shouldShowPath = searchTerm && searchTerm.trim() !== '';
    
    if (shouldShowPath) {
      folderPathText = t('defaultBookmarkBarPath');
      // 立即调用异步函数
      (async () => {
        try {
          folderPathText = await BMV.bookmarkTree.getFolderPath(bookmark.parentId);
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
      tooltipText += `\n${t('tooltipUsageCount', [usageText])}`;
      if (lastUsed) {
        tooltipText += `\n${t('tooltipLastUsed', [lastUsed])}`;
      }
    }
    
    listItem.innerHTML = `
      <a href="${isDangerousUrl(bookmark.url) ? '#' : escapeHtml(bookmark.url)}" class="bookmark-link" title="${escapeHtml(tooltipText)}">
        <img src="${faviconUrl}" alt="${t('faviconAltText')}" class="favicon">
        <div class="bookmark-info">
          <div class="bookmark-title">${escapeHtml(bookmark.title)}</div>
          ${shouldShowPath ? `<div class="bookmark-path">${escapeHtml(folderPathText)}</div>` : ''}
        </div>
        ${usageCount > 0 ? `<span class="usage-count">${usageText}</span>` : ''}
      </a>
      ${dragHandle}`
    ;
  }
  
  return listItem;
}

// 搜索过滤功能
function applySearchFilter() {
  // 包含所有类型的项目：主书签、文件夹、嵌套书签
  const allItems = document.querySelectorAll('.bookmark-item, .folder-item, .nested-item');
  
  if (!searchTerm) {
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
  
  let matchCount = 0;
  let totalCount = 0;
  
  allItems.forEach((item, index) => {
    totalCount++;
    // 只匹配自身的标题：书签取 .bookmark-title，文件夹取 .folder-title
    //（不能用 item.textContent，否则文件夹会把嵌套子项的标题也算进匹配）
    const titleElement = item.querySelector('.bookmark-title') || item.querySelector('.folder-title');
    const text = titleElement ? titleElement.textContent : item.textContent;
    
    // 使用增强的搜索匹配函数（与全局搜索保持一致：传原始 searchTerm，
    // isSearchMatch 内部自行处理大小写）
    const isMatch = typeof isSearchMatch === 'function' 
      ? isSearchMatch(text, searchTerm)
      : text.toLowerCase().includes(searchTerm.toLowerCase());
      
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
        }
      }
    } else {
      item.classList.add('hidden-by-search');
    }
  });
  
  // 更新搜索状态显示
  updateSearchStatus(matchCount, totalCount);
}

// 视图状态：统计信息的唯一数据源（避免从 DOM textContent 回读导致错乱）
const viewState = {
  bookmarkCount: 0,
  folderCount: 0,
  matchCount: 0
};

// 渲染统计栏（唯一出口）
function renderStats() {
  const statsElement = document.getElementById('stats');
  if (!statsElement) return;
  if (searchTerm) {
    const color = viewState.matchCount > 0 ? '#4a90e2' : '#ff6b6b';
    const icon = viewState.matchCount > 0 ? '🔍' : '❌';
    statsElement.innerHTML = `<span style="color: ${color};">${icon} ${t('statsSearchResultCount', [viewState.matchCount])}</span>`;
  } else {
    statsElement.innerHTML = t('statsBookmarkFolderCount', [viewState.bookmarkCount, viewState.folderCount]);
  }
}

// 更新搜索状态显示
function updateSearchStatus(matchCount, totalCount) {
  const searchBox = document.getElementById('search-box');
  viewState.matchCount = searchTerm ? matchCount : 0;
  
  if (searchBox) {
    if (searchTerm) {
      // 显示搜索结果状态
      searchBox.classList.add('search-active');
      if (matchCount === 0) {
        searchBox.classList.add('search-no-results');
      } else {
        searchBox.classList.remove('search-no-results');
      }
      searchBox.title = t('searchMatchStatusTooltip', [matchCount, totalCount]);
    } else {
      // 清除搜索状态
      searchBox.classList.remove('search-active', 'search-no-results');
      searchBox.title = '';
    }
  }
  
  renderStats();
}

// 更新统计信息
function updateStats(bookmarkCount, folderCount) {
  viewState.bookmarkCount = bookmarkCount;
  viewState.folderCount = folderCount;
  renderStats();
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
    checkValidityItem.textContent = t('menuCheckValidity');
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
    checkValidityItem.textContent = t('contextMenuCheckFolder');
    editItem.style.display = 'block';
    deleteItem.style.display = 'block';
  }
  
  contextMenu.style.display = 'block';
  // 使用视口坐标 + fixed 定位（原 pageX/pageY + absolute 在页面滚动后会错位）
  contextMenu.style.left = event.clientX + 'px';
  contextMenu.style.top = event.clientY + 'px';
  
  // 确保菜单不会超出视窗
  const rect = contextMenu.getBoundingClientRect();
  if (rect.right > window.innerWidth) {
    contextMenu.style.left = Math.max(0, window.innerWidth - rect.width) + 'px';
  }
  if (rect.bottom > window.innerHeight) {
    contextMenu.style.top = Math.max(0, window.innerHeight - rect.height) + 'px';
  }
}

// 处理右键菜单操作
function handleContextMenuAction(action, bookmark) {
  switch (action) {
    case 'open-in-background':
      if (bookmark.url) {
        if (isDangerousUrl(bookmark.url)) { alert(t('alertUnsupportedProtocol')); break; }
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
      if (bookmark.url && confirm(t('confirmClearUsage', [bookmark.title]))) {
        bookmarkUsageManager.clearUsage(bookmark.id);
        // 重新渲染当前文件夹以更新显示
        renderBookmarks(currentFolderId);
      }
      break;
    case 'edit':
      showEditDialog(bookmark);
      break;
    case 'delete':
      if (confirm(t('confirmDeleteBookmark', [bookmark.title]))) {
        chrome.bookmarks.remove(bookmark.id, function() {
          if (chrome.runtime.lastError) {
            console.error('删除书签失败:', chrome.runtime.lastError);
          } else {
            BMV.bookmarkTree.invalidateBookmarkTree(); // 内存树失效，下次读取自动重建
            // 重新渲染当前文件夹
            renderBookmarks(currentFolderId);
          }
        });
      }
      break;
    case 'check-validity':
      if (typeof bookmarkChecker === 'undefined') {
        alert(t('alertCheckerNotLoaded'));
        break;
      }
      // 打开独立检查器页（书签单个 / 文件夹整检），长任务不受 popup 关闭影响
      if (bookmark.url) {
        bookmarkChecker.openCheckerPage({ bookmark: bookmark.id });
      } else {
        bookmarkChecker.openCheckerPage({ folder: bookmark.id });
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
    alert(t('alertTitleEmpty'));
    titleInput.focus();
    return;
  }
  
  // 如果是书签且URL为空，提示错误
  if (urlGroup.style.display !== 'none' && !newUrl) {
    alert(t('alertUrlEmpty'));
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
        alert(t('alertSaveFailed', [chrome.runtime.lastError.message]));
      } else {
        hideEditDialog();
        BMV.bookmarkTree.invalidateBookmarkTree(); // 内存树失效，下次读取自动重建
        // 重新渲染当前文件夹
        renderBookmarks(currentFolderId);
      }
    });
  } else {
    // 测试环境模拟
    console.log('模拟更新书签:', updateData);
    hideEditDialog();
    alert(t('alertEditSimulated'));
  }
}

// 更新书签为当前地址栏地址
function updateBookmarkToCurrentUrl(bookmark) {
  if (isExtensionEnvironment) {
    // 获取当前活动标签页
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      if (chrome.runtime.lastError) {
        console.error('获取当前标签页失败:', chrome.runtime.lastError);
        alert(t('alertGetCurrentTabFailed', [chrome.runtime.lastError.message]));
        return;
      }
      
      if (tabs.length === 0) {
        alert(t('alertNoActiveTab'));
        return;
      }
      
      const currentTab = tabs[0];
      const currentUrl = currentTab.url;
      const currentTitle = currentTab.title;
      
      // 确认是否要更新
      const confirmMessage = `${t('confirmUpdateToCurrentUrl', [bookmark.title])}\n\n` +
                           `${t('labelCurrentUrl', [bookmark.url])}\n` +
                           `${t('labelNewUrl', [currentUrl])}\n` +
                           `${t('labelNewTitle', [currentTitle])}`;
      
      if (confirm(confirmMessage)) {
        // 更新书签
        const updateData = {
          title: currentTitle,
          url: currentUrl
        };
        
        chrome.bookmarks.update(bookmark.id, updateData, function(result) {
          if (chrome.runtime.lastError) {
            console.error('更新书签失败:', chrome.runtime.lastError);
            alert(t('alertUpdateFailed', [chrome.runtime.lastError.message]));
          } else {
            alert(t('alertBookmarkUpdated', [currentTitle]));
            BMV.bookmarkTree.invalidateBookmarkTree(); // 内存树失效，下次读取自动重建
            // 重新渲染当前文件夹
            renderBookmarks(currentFolderId);
          }
        });
      }
    });
  } else {
    // 测试环境模拟
    const mockCurrentUrl = 'https://example.com/current-page';
    const mockCurrentTitle = t('mockCurrentPageTitle');
    
    const confirmMessage = `${t('confirmUpdateToCurrentUrl', [bookmark.title])}\n\n` +
                         `${t('labelCurrentUrl', [bookmark.url])}\n` +
                         `${t('labelNewUrl', [mockCurrentUrl])}\n` +
                         `${t('labelNewTitle', [mockCurrentTitle])}`;
    
    if (confirm(confirmMessage)) {
      console.log('模拟更新书签:', {
        id: bookmark.id,
        oldUrl: bookmark.url,
        newUrl: mockCurrentUrl,
        newTitle: mockCurrentTitle
      });
      alert(t('alertBookmarkSimulatedUpdated', [mockCurrentTitle]));
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
