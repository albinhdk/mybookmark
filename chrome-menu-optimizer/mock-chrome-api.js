// 模拟 Chrome API（仅用于 file:// 直接打开 popup.html / checker.html 的测试环境）
// 在真实扩展环境中自动跳过（chrome.bookmarks 已存在），不产生任何副作用。
// 书签部分为可变内存树：move/create/remove/update 直接修改树，
// getTree/getChildren/get 均从树派生，行为与真实 chrome.bookmarks API 对齐
// （含同父排序时 index 向下自动 -1 的语义，经 tests/dnd-semantics.js 在 Edge 153 实证）。
(function () {
  const isExtensionEnvironment = !!(typeof chrome !== 'undefined' && chrome.bookmarks);
  if (isExtensionEnvironment) return;

  console.log('检测到非扩展环境，启用模拟Chrome API');

  // ===== 可变书签树 =====
  const seedTree = [{
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
  }];

  const nodeById = new Map(); // id -> 节点（文件夹节点含 children 数组）
  const parentOf = new Map(); // id -> 父节点 id（根为 null）
  let idCounter = 0;

  function indexTree(nodes, parentId) {
    (nodes || []).forEach(node => {
      nodeById.set(node.id, node);
      parentOf.set(node.id, parentId);
      if (node.children) indexTree(node.children, node.id);
    });
  }
  indexTree(seedTree[0].children, seedTree[0].id);

  function nextId() {
    idCounter += 1;
    return 'mock-' + idCounter;
  }

  // 深拷贝导出（调用方不得拿到内部引用）
  function cloneNode(node) {
    const copy = { id: node.id, title: node.title || '' };
    if (node.url !== undefined && node.url !== null) copy.url = node.url;
    if (node.children) copy.children = node.children.map(cloneNode);
    return copy;
  }

  // 书签变更事件（真实 API 的在 CRUD 后触发，popup 靠它失效内存树索引）
  const bookmarkEvents = ['onCreated', 'onRemoved', 'onChanged', 'onMoved', 'onChildrenReordered', 'onImportEnded'];
  const listeners = {};
  bookmarkEvents.forEach(name => { listeners[name] = []; });
  function fireEvent(name, ...args) {
    listeners[name].forEach(fn => {
      try { fn(...args); } catch (e) { console.error('模拟事件监听器出错:', e); }
    });
  }

  const bookmarks = {
    getTree: function (callback) {
      setTimeout(() => callback(seedTree.map(cloneNode)), 100);
    },

    getChildren: function (folderId, callback) {
      setTimeout(() => {
        const folder = nodeById.get(folderId);
        const result = folder && folder.children ? folder.children.map(cloneNode) : [];
        console.log(`模拟获取文件夹 ${folderId} 的内容:`, result);
        callback(result);
      }, 50);
    },

    get: function (nodeId, callback) {
      setTimeout(() => {
        const node = nodeById.get(nodeId);
        callback(node ? [cloneNode(node)] : []);
      }, 50);
    },

    create: function (bookmark, callback) {
      setTimeout(() => {
        const parent = nodeById.get(bookmark.parentId || '1');
        if (!parent) { callback(null); return; }
        const node = {
          id: nextId(),
          title: bookmark.title || '',
          ...(bookmark.url ? { url: bookmark.url } : {})
        };
        if (!node.url) node.children = [];
        nodeById.set(node.id, node);
        parentOf.set(node.id, parent.id);
        const siblings = parent.children || (parent.children = []);
        const at = Number.isInteger(bookmark.index) ? Math.min(Math.max(bookmark.index, 0), siblings.length) : siblings.length;
        siblings.splice(at, 0, node);
        fireEvent('onCreated', node.id, cloneNode(node));
        fireEvent('onChildrenReordered', parent.id);
        callback(cloneNode(node));
      }, 50);
    },

    move: function (id, destination, callback) {
      setTimeout(() => {
        const node = nodeById.get(id);
        if (!node) { callback(null); return; }
        const oldParentId = parentOf.get(id);
        const oldParent = nodeById.get(oldParentId);
        const destParentId = destination.parentId != null ? destination.parentId : oldParentId;
        const destParent = nodeById.get(destParentId);
        if (!destParent) { callback(null); return; }

        const oldIndex = oldParent.children.indexOf(node);
        const originalLength = oldParent.children.length; // 移除前长度：index 缺省=原父末尾（追加）
        oldParent.children.splice(oldIndex, 1);

        let index = destination.index;
        if (index == null) {
          index = destParentId === oldParentId ? originalLength : (destParent.children || (destParent.children = [])).length;
        }
        // 同父排序：Chromium 将 index 解释为移除前坐标，向下移动自动 -1（dnd-semantics.js 实证）
        if (destParentId === oldParentId && index > oldIndex) index -= 1;
        index = Math.min(Math.max(index, 0), destParent.children.length);
        destParent.children.splice(index, 0, node);
        parentOf.set(id, destParentId);

        fireEvent('onMoved', id, {
          parentId: destParentId,
          index,
          oldParentId,
          oldIndex
        });
        fireEvent('onChildrenReordered', destParentId);
        if (destParentId !== oldParentId) fireEvent('onChildrenReordered', oldParentId);
        callback(cloneNode(node));
      }, 50);
    },

    update: function (id, changes, callback) {
      setTimeout(() => {
        const node = nodeById.get(id);
        if (node) {
          if (changes.title !== undefined) node.title = changes.title;
          if (changes.url !== undefined) node.url = changes.url;
          fireEvent('onChanged', id, { title: node.title, url: node.url });
        }
        callback(node ? cloneNode(node) : null);
      }, 50);
    },

    remove: function (id, callback) {
      setTimeout(() => {
        const node = nodeById.get(id);
        if (!node) { callback(); return; }
        removeSubtree(node, id);
        callback();
      }, 50);
    },

    removeTree: function (id, callback) {
      setTimeout(() => {
        const node = nodeById.get(id);
        if (node) removeSubtree(node, id);
        callback();
      }, 50);
    }
  };

  function removeSubtree(node, id) {
    const parent = nodeById.get(parentOf.get(id));
    if (parent && parent.children) {
      const at = parent.children.indexOf(node);
      if (at !== -1) parent.children.splice(at, 1);
      fireEvent('onChildrenReordered', parent.id);
    }
    const toRemove = [id];
    while (toRemove.length) {
      const cur = toRemove.pop();
      const curNode = nodeById.get(cur);
      if (curNode && curNode.children) toRemove.push(...curNode.children.map(c => c.id));
      nodeById.delete(cur);
      parentOf.delete(cur);
    }
    fireEvent('onRemoved', id, { parentId: parent && parent.id, index: 0 });
  }

  bookmarkEvents.forEach(name => {
    bookmarks[name] = {
      _listeners: listeners[name],
      addListener: function (fn) { listeners[name].push(fn); },
      removeListener: function (fn) {
        const at = listeners[name].indexOf(fn);
        if (at !== -1) listeners[name].splice(at, 1);
      },
      hasListener: function (fn) { return listeners[name].includes(fn); }
    };
  });

  window.chrome = {
    bookmarks: bookmarks,
    runtime: {
      lastError: null
    },
    tabs: {
      create: function (options, callback) {
        console.log('模拟打开标签页:', options.url);
        window.open(options.url, '_blank');
        if (callback) callback({ id: Date.now() });
      }
    },
    storage: {
      local: {
        // 用 localStorage 做持久化后备，行为与真实 chrome.storage.local 一致
        get: function (keys) {
          return new Promise((resolve) => {
            const result = {};
            const keyList = Array.isArray(keys) ? keys : (keys ? [keys] : Object.keys(localStorage));
            keyList.forEach(k => {
              const raw = localStorage.getItem(k);
              if (raw !== null) {
                try { result[k] = JSON.parse(raw); } catch (e) { result[k] = raw; }
              }
            });
            resolve(result);
          });
        },
        set: function (items) {
          return new Promise((resolve) => {
            Object.keys(items).forEach(k => localStorage.setItem(k, JSON.stringify(items[k])));
            resolve();
          });
        },
        remove: function (keys) {
          return new Promise((resolve) => {
            (Array.isArray(keys) ? keys : [keys]).forEach(k => localStorage.removeItem(k));
            resolve();
          });
        }
      }
    }
  };
})();
