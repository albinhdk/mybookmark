# Bookmark Viewer 隐私政策（发布用草稿）

> 使用方法：将本文部署到一个公网 URL（最简单的方式：推到 GitHub 仓库后开 GitHub Pages，
> 或用 GitHub Gist + raw 链接），把链接填进 Chrome Web Store 后台「隐私实践」页的
> Privacy policy URL。正文里的 `<邮箱>` 和 `<日期>` 替换成你自己的信息。

---

## 中文版（正文）

**最后更新日期：2026-10-01**

Bookmark Viewer（以下简称“本扩展”）是一款 Chrome 书签管理工具。我们非常重视你的隐私，本政策旨在说明本扩展如何处理数据。

### 一、本扩展不收集、不上传你的书签

本扩展的全部核心功能（书签网格展示、拼音搜索、拖拽整理）都在你的浏览器本地完成。你的书签内容、文件夹结构、搜索关键词**不会**发送到任何服务器，我们也无法访问。

### 二、你会主动触发的唯一网络请求

当你点击「失效检测」功能时，本扩展的后台 Service Worker 会对你选中的书签 URL 逐一发起一次 HTTP 请求，以判断该书签是否仍然有效。这些请求直接访问的是**你自己的书签所对应的网站**，不经过任何第三方服务器。检测结果（HTTP 状态码）仅保存在你的浏览器内存中，用于在本页展示，不会持久化上传。

### 三、本地存储

本扩展使用 `chrome.storage.local`（仅存于本机）保存以下设置，不会同步到云端：

- 网格列数、文件夹预览数量等视图设置；
- 书签使用次数统计（用于本地排序，不离开本设备）。

### 四、权限说明

- `bookmarks`：读取和管理你的书签；
- `activeTab`：在你使用「更新为当前网址」功能时读取当前标签页地址；
- `storage`：保存上述本地设置；
- `favicon`：授权浏览器内置的 `chrome-extension://_favicon/` 图标端点，用于显示书签网站图标；
- `host_permissions`（http/https）：仅供失效检测时访问你自己的书签 URL，不对其他站点发起任何请求。

### 五、图标

书签图标通过浏览器内置的 `chrome-extension://_favicon/` 接口获取，不向任何外部服务发送请求。

### 六、我们不做的事

不植入统计 /  analytics，不投放广告，不要求注册登录，不出售或共享任何数据，不加载任何远程代码。

### 七、联系方式

如对本政策有疑问，请联系：albinbing@hotmail.com。

---

## English Version

**Last updated: `<date>`**

Bookmark Viewer ("the extension") is a Chrome bookmark management tool. This policy explains how it handles data.

**No collection of bookmarks.** All core features (grid view, pinyin search, drag-to-organize) run entirely in your browser. Your bookmarks, folder structure, and search terms are never sent to any server, and we cannot access them.

**The only network requests are the ones you trigger.** When you use the "dead link check" feature, the extension's service worker sends one HTTP request to each bookmarked URL you selected in order to test whether it is still reachable. These requests go directly to the websites your own bookmarks point to; they do not pass through any third-party server. Results are kept in memory for display only.

**Local storage.** The extension uses `chrome.storage.local` to save view settings (grid columns, folder preview counts) and local usage statistics on your device only.

**Permissions.** `bookmarks` (read/manage your bookmarks), `activeTab` (read the current tab's URL when you use "update to current URL"), `storage` (save local settings), and `host_permissions` (http/https) used solely for dead-link checks against your own bookmarked URLs.

**Favicons** are fetched through the browser's built-in `chrome-extension://_favicon/` endpoint; no external requests are made.

**What we do not do:** no analytics, no ads, no account required, no sale or sharing of data, no remote code loading.

**Contact:** albinbing@hotmail.com
