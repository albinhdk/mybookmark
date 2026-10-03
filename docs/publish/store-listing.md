# Chrome Web Store 上架文案（Bookmark Viewer）

> 配套打包命令见本目录 `README` 或直接见聊天记录。发布前请确认：
> 1. `chrome-menu-optimizer/manifest.json` 的 `version` 与 zip 文件名一致；
> 2. 隐私政策已部署到公网 URL，并填入商店后台「隐私实践」页。

---

## 一、商店列表（开发者后台「商店列表」标签页）

| 字段 | 内容 |
|---|---|
| 扩展名称 | Bookmark Viewer（书签面板） |
| 简短描述（填 manifest description，≤132 字符） | `点击图标即可在一个弹出窗口中查看您的所有书签。` |
| 类别 | 效率工具（Productivity） |
| 语言 | 中文（简体） |
| 图标 | 无需单独上传，使用包内 `icon128.png`（128×128） |
| 截图（≥1 张，建议 1280×800） | ① 书签网格弹窗；② 拼音搜索结果；③ 失效书签检测页（checker 页面全屏截图） |

## 二、详细描述（复制粘贴进「详细描述」）

```
你是否很久没打开过书签栏了？原生书签栏容量小、难查找、难整理。
Bookmark Viewer 把全部书签搬进一个 800px 的网格弹窗，点一下图标就能看、能搜、能整理。

【主要功能】
· 网格总览 —— 点击工具栏图标，所有书签以网格平铺展示，点击直接打开
· 拼音搜索 —— 支持拼音首字母、全拼、多音字（如 "xian/xi'an" 均可搜到），中英文混输也能匹配
· 失效检测 —— 一键检测书签是否还能打开， Chrome 页面/http/https 书签均可测
· 拖拽整理 —— 在弹窗内直接拖动书签移动位置、调整顺序，支持拖入文件夹
· 新建/重命名/删除 —— 右键菜单完成日常整理，操作即时保存到浏览器书签
· 视图设置 —— 网格列数 2–5 列、文件夹预览数量均可调，设置本地保存

【为什么用它】
· 零页面侵入：不注入任何内容脚本，不改网页、不跟踪浏览
· 数据本地：所有书签数据只存在于浏览器内，不经过任何服务器
· 打开即用：无需注册、无需登录、无广告

【适用浏览器】
Chrome 88+ 及基于 Chromium 的浏览器（Edge、Brave 等）。
```

## 三、单一用途说明（Single Purpose，审核必看）

> 在弹出面板中以网格形式展示、搜索和整理浏览器书签，并检测失效书签链接。

## 四、权限用途说明（审核可能被追问，提前备好）

| 权限 | 用途 | 对应代码 |
|---|---|---|
| `bookmarks` | 核心功能：读取书签树、增删改、拖拽移动 | `bookmark-tree.js`、`popup.js` |
| `activeTab` | “更新为当前网址”菜单需要读取当前标签页 URL | `popup.js` updateBookmarkToCurrentUrl |
| `storage` | 保存网格列数、文件夹预览数、使用统计，仅 `chrome.storage.local` | `view-settings.js`、`usage-manager.js` |
| `favicon` | **必须保留**：Chrome 官方 favicon API 的授权方式——通过 `chrome-extension://<id>/_favicon/?pageUrl=...` 端点展示书签网站图标，删除它会导致所有图标 403 回退成通用图标（见 [developer.chrome.com/docs/extensions/how-to/ui/favicons](https://developer.chrome.com/docs/extensions/how-to/ui/favicons)）。该请求由浏览器内部处理，不产生额外外网流量；因本扩展已申请 host_permissions，用户侧不会看到额外权限警告 | `popup.js` getFaviconUrl |
| `host_permissions: http://*/* https://*/*` | **失效书签检测**：用户书签指向互联网上任意站点，无法预先枚举主机，因此需要对任意 URL 发起检测请求；请求由 background service worker 代发，仅访问用户自己的书签 URL | `background.js`（fetchUrl）、`bookmark-checker.js` |

补充口径（如被要求说明为什么不能用 activeTab 替代全网域）：
书签 URL 并非当前标签页，用户点击“检测”时需要由扩展主动访问这些 URL，`activeTab` 只能访问用户当前所在标签页，无法覆盖此场景。

## 五、隐私实践问卷答案（「隐私实践」标签页）

| 问题 | 答案 |
|---|---|
| 你是否收集用户数据？ | 是（仅限用户自己的书签数据，用于展示核心功能） |
| 收集的数据类别 | 个人通信（书签内容）；用户活动（书签使用统计，仅本地） |
| 数据是否离开用户设备？ | 是——仅当用户主动点击「失效检测」时，书签 URL 会被 service worker 请求一次（即访问该书签对应的网站本身） |
| 是否用于核心功能之外？ | 否 |
| 是否出售给第三方？ | 否 |
| 是否用于与核心功能无关的目的（广告、信用等）？ | 否 |
| 隐私政策 URL | `<填入部署后的地址>` |

## 六、分发选项

- 可见范围：公开（Public）或 不公开链接（Unlisted，先给朋友试用）
- 发布区域：全部地区
- 定价：免费

## 七、提交流程 checklist

- [ ] 确认 `version` 已按需递增（本包为 `2.0`，若 2.0 曾发布过则改为 `2.0.1`）
- [ ] zip 根目录为 `manifest.json`（无外层文件夹）
- [ ] zip 内不含调试页（`diagnostic-test.html`、`test-search.html`、`search-debug.html`）
- [ ] 将本扩展的 `checker.html` 效果截 1 张 1280×800 图作为第二张截图
- [ ] 部署隐私政策 → 拿到 URL → 填入隐私实践页
- [ ] 提交审核（时长通常 1 天~数周；广泛主机权限可能触发人工复核，用第四节的口径回复）
