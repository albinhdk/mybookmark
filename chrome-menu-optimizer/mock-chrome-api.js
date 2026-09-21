// 模拟 Chrome API（仅用于 file:// 直接打开 popup.html / checker.html 的测试环境）
// 在真实扩展环境中自动跳过（chrome.bookmarks 已存在），不产生任何副作用。
(function () {
  const isExtensionEnvironment = !!(typeof chrome !== 'undefined' && chrome.bookmarks);
  if (isExtensionEnvironment) return;

  console.log('检测到非扩展环境，启用模拟Chrome API');

  window.chrome = {
    bookmarks: {
      getTree: function (callback) {
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
      getChildren: function (folderId, callback) {
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
      get: function (nodeId, callback) {
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
