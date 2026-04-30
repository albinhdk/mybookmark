# 事件处理优化建议

## 1. 事件委托模式
当前每个书签项都单独绑定事件监听器，可以考虑使用事件委托来提高性能：

```javascript
// 当前方式（为每个项目绑定事件）
listItem.addEventListener('contextmenu', function(e) {
  e.preventDefault();
  showContextMenu(e, bookmark);
});

// 建议方式（事件委托）
document.getElementById('bookmarks').addEventListener('contextmenu', function(e) {
  const bookmarkItem = e.target.closest('.bookmark-item, .folder-item');
  if (bookmarkItem) {
    e.preventDefault();
    const bookmarkData = JSON.parse(bookmarkItem.dataset.bookmark);
    showContextMenu(e, bookmarkData);
  }
});
```

## 2. 内存泄漏防护
添加事件监听器清理机制：

```javascript
class BookmarkEventManager {
  constructor() {
    this.eventListeners = new Map();
  }
  
  addListener(element, event, handler) {
    const key = `${element.id || element.className}-${event}`;
    if (this.eventListeners.has(key)) {
      this.removeListener(element, event);
    }
    element.addEventListener(event, handler);
    this.eventListeners.set(key, { element, event, handler });
  }
  
  removeListener(element, event) {
    const key = `${element.id || element.className}-${event}`;
    const listener = this.eventListeners.get(key);
    if (listener) {
      listener.element.removeEventListener(listener.event, listener.handler);
      this.eventListeners.delete(key);
    }
  }
  
  cleanup() {
    this.eventListeners.forEach(({ element, event, handler }) => {
      element.removeEventListener(event, handler);
    });
    this.eventListeners.clear();
  }
}
```

## 3. 事件处理器统一管理
创建统一的事件处理器类：

```javascript
class ContextMenuHandler {
  constructor() {
    this.currentBookmark = null;
  }
  
  show(event, bookmark) {
    this.currentBookmark = bookmark;
    this.updateMenuItems(bookmark);
    this.positionMenu(event);
  }
  
  updateMenuItems(bookmark) {
    const menu = document.getElementById('context-menu');
    const items = {
      openInBackground: menu.querySelector('[data-action="open-in-background"]'),
      copyUrl: menu.querySelector('[data-action="copy-url"]'),
      copyName: menu.querySelector('[data-action="copy-name"]'),
      edit: menu.querySelector('[data-action="edit"]'),
      delete: menu.querySelector('[data-action="delete"]')
    };
    
    const isFolder = !bookmark.url;
    items.openInBackground.style.display = isFolder ? 'none' : 'block';
    items.copyUrl.style.display = isFolder ? 'none' : 'block';
  }
  
  positionMenu(event) {
    const menu = document.getElementById('context-menu');
    menu.style.display = 'block';
    menu.style.left = event.pageX + 'px';
    menu.style.top = event.pageY + 'px';
    
    // 防止菜单超出视窗
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      menu.style.left = (event.pageX - rect.width) + 'px';
    }
    if (rect.bottom > window.innerHeight) {
      menu.style.top = (event.pageY - rect.height) + 'px';
    }
  }
}
```

## 4. 键盘导航支持
为右键菜单添加键盘导航：

```javascript
class KeyboardNavigationHandler {
  constructor(menuElement) {
    this.menu = menuElement;
    this.currentIndex = 0;
    this.items = [];
  }
  
  enable() {
    this.items = Array.from(this.menu.querySelectorAll('li:not(.separator)'));
    this.menu.addEventListener('keydown', this.handleKeydown.bind(this));
    this.highlightItem(0);
  }
  
  handleKeydown(e) {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        this.moveDown();
        break;
      case 'ArrowUp':
        e.preventDefault();
        this.moveUp();
        break;
      case 'Enter':
        e.preventDefault();
        this.selectItem();
        break;
      case 'Escape':
        e.preventDefault();
        this.close();
        break;
    }
  }
  
  moveDown() {
    this.currentIndex = (this.currentIndex + 1) % this.items.length;
    this.highlightItem(this.currentIndex);
  }
  
  moveUp() {
    this.currentIndex = (this.currentIndex - 1 + this.items.length) % this.items.length;
    this.highlightItem(this.currentIndex);
  }
  
  highlightItem(index) {
    this.items.forEach((item, i) => {
      item.classList.toggle('highlighted', i === index);
    });
  }
  
  selectItem() {
    const action = this.items[this.currentIndex].dataset.action;
    if (action && window.currentContextBookmark) {
      handleContextMenuAction(action, window.currentContextBookmark);
    }
    this.close();
  }
  
  close() {
    this.menu.style.display = 'none';
  }
}
```

## 5. 触摸设备支持
为移动设备添加长按支持：

```javascript
class TouchHandler {
  constructor() {
    this.touchTimer = null;
    this.touchStartPos = null;
  }
  
  addTouchSupport(element, bookmark) {
    element.addEventListener('touchstart', (e) => {
      this.touchStartPos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      this.touchTimer = setTimeout(() => {
        // 模拟右键菜单
        const contextEvent = new MouseEvent('contextmenu', {
          clientX: this.touchStartPos.x,
          clientY: this.touchStartPos.y,
          bubbles: true
        });
        showContextMenu(contextEvent, bookmark);
      }, 500); // 500ms 长按
    });
    
    element.addEventListener('touchend', () => {
      if (this.touchTimer) {
        clearTimeout(this.touchTimer);
        this.touchTimer = null;
      }
    });
    
    element.addEventListener('touchmove', (e) => {
      if (this.touchStartPos) {
        const currentPos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        const distance = Math.sqrt(
          Math.pow(currentPos.x - this.touchStartPos.x, 2) +
          Math.pow(currentPos.y - this.touchStartPos.y, 2)
        );
        
        // 如果移动距离超过10px，取消长按
        if (distance > 10 && this.touchTimer) {
          clearTimeout(this.touchTimer);
          this.touchTimer = null;
        }
      }
    });
  }
}
```

## 6. 性能优化建议
- 使用 `requestAnimationFrame` 优化DOM操作
- 实现虚拟滚动处理大量书签
- 添加防抖处理搜索功能
- 使用 Web Workers 处理大量数据操作