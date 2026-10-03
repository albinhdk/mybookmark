var t = (typeof window !== 'undefined' && window.BMV && window.BMV.i18n) ? window.BMV.i18n.t : function (key) { return key; };

// 共享书签树模块（popup 与检查器页共用）
// 一次 getTree 全量拉取并建 id→node/parentId 索引，面包屑 / 文件夹预览 / 搜索路径
// 全部内存查询（零 IPC）；通过 chrome.bookmarks 变更监听 + CRUD 后主动失效保持新鲜。
// 挂载到 window.BMV.bookmarkTree，供各页面复用。
(function () {
  const BMV = window.BMV = window.BMV || {};

  let treeIndex = null;            // { nodeById: Map<id, node>, rootId }
  let treeLoadPromise = null;      // 首次加载并发去重
  let treeEpoch = 0;               // 代际计数：加载中途失效时，旧加载结果不得写回缓存
  let listenersRegistered = false;

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
    if (treeIndex) return Promise.resolve(treeIndex);
    if (treeLoadPromise) return treeLoadPromise;
    const epoch = treeEpoch;
    treeLoadPromise = new Promise((resolve, reject) => {
      chrome.bookmarks.getTree(function (bookmarkTree) {
        if (chrome.runtime.lastError) {
          if (epoch === treeEpoch) treeLoadPromise = null;
          reject(new Error(t('errGetTreeFailed', [chrome.runtime.lastError.message])));
          return;
        }
        try {
          const index = buildTreeIndex(bookmarkTree);
          // 加载期间发生过失效（代际变化）：结果只给当前调用方，不写回缓存
          if (epoch === treeEpoch) {
            treeIndex = index;
            treeLoadPromise = null;
          }
          resolve(index);
        } catch (error) {
          if (epoch === treeEpoch) treeLoadPromise = null;
          reject(error);
        }
      });
    });
    return treeLoadPromise;
  }

  // 失效树索引（CRUD 成功后调用，下次 ensure 时自动重建）
  function invalidateBookmarkTree() {
    treeEpoch++;
    treeIndex = null;
    treeLoadPromise = null;
  }

  // 注册书签变更监听：外部变更（其他设备同步、书签管理器、导入）同样失效索引
  function registerBookmarkTreeListeners() {
    if (listenersRegistered) return;
    listenersRegistered = true;
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
  function getBookmarkBarRootId() {
    const root = treeIndex && treeIndex.nodeById.get(treeIndex.rootId);
    const children = (root && root.children) || [];
    if (children.length > 0) return children[0].id;
    const byTitle = children.find(c => /书签栏|Bookmarks bar/i.test(c.title || ''));
    if (byTitle) return byTitle.id;
    throw new Error(t('errBookmarkBarNotFound'));
  }

  // 递归获取所有书签（基于内存树索引，零 IPC；排除根节点自身）
  function getAllBookmarks() {
    return ensureBookmarkTree().then(tree => {
      const allBookmarks = [];
      tree.nodeById.forEach((node, id) => {
        if (id === tree.rootId) return;
        allBookmarks.push({ ...node });
      });
      return allBookmarks;
    });
  }

  // 获取特定文件夹的子项（优先读内存树索引，零 IPC；树不可用时回退 API）
  async function getBookmarks(folderId) {
    if (!folderId) throw new Error(t('errInvalidFolderId'));
    if (!chrome || !chrome.bookmarks) throw new Error(t('chromeApiUnavailable'));
    try {
      const tree = await ensureBookmarkTree();
      const node = tree.nodeById.get(folderId);
      if (node) return node.children ? node.children.slice() : [];
    } catch (error) {
      console.warn('内存树获取失败，回退到 API:', error);
    }
    return new Promise((resolve, reject) => {
      chrome.bookmarks.getChildren(folderId, function (bookmarks) {
        if (chrome.runtime.lastError) reject(new Error(t('errGetBookmarksFailed', [chrome.runtime.lastError.message])));
        else resolve(bookmarks || []);
      });
    });
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
        path.unshift({ id: node.id, title: node.title || t('bookmarkBarName') });
        currentId = node.parentId;
      }
    } catch (error) {
      console.error('构建面包屑路径时出错:', error);
    }
    return path;
  }

  // 获取文件夹路径字符串
  async function getFolderPath(parentId) {
    if (!parentId || parentId === '0') return t('bookmarkBarName');
    try {
      const path = await buildBreadcrumbPath(parentId);
      return path.map(item => item.title).join(t('breadcrumbSeparator')) || t('bookmarkBarName');
    } catch (error) {
      console.error('获取文件夹路径失败:', error);
      return t('unknownLocation');
    }
  }

  // 判断 ancestorId 是否为 nodeId 自身或其祖先（拖拽循环校验：
  // 禁止把文件夹移入自己或自己的子树，否则 chrome.bookmarks.move 会报错）。
  // 同步读取内存树索引——popup 渲染前已 ensureBookmarkTree，dragover/drop 高频路径
  // 不能等异步；索引未就绪（理论上不会发生）时返回 false，由 move 失败兜底。
  function isSelfOrAncestorOf(ancestorId, nodeId) {
    if (!ancestorId || !nodeId) return false;
    if (ancestorId === nodeId) return true;
    const index = treeIndex;
    if (!index) return false;
    let current = index.nodeById.get(nodeId);
    while (current && current.parentId != null) {
      if (current.parentId === ancestorId) return true;
      current = index.nodeById.get(current.parentId);
    }
    return false;
  }

  BMV.bookmarkTree = {
    buildTreeIndex,
    ensureBookmarkTree,
    invalidateBookmarkTree,
    registerBookmarkTreeListeners,
    getBookmarkBarRootId,
    getAllBookmarks,
    getBookmarks,
    buildBreadcrumbPath,
    getFolderPath,
    isSelfOrAncestorOf
  };
})();
