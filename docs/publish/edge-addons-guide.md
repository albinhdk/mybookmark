# Microsoft Edge Add-ons 上架指南（Bookmark Viewer）

## 版本状态

| 版本 | 内容 | 商店状态 |
|---|---|---|
| 2.0 | 首个提交（favicon 修复后打包） | ✅ 已上架（In the Store，2026-10-01） |
| 2.1 | 国际化（zh/en 自动切换）+ manifest description 本地化 | ✅ 已提交，审核中（In review，2026-10-03；双 listing zh-CN + en-US 已填妥） |

> 2.1 提交流程：等 2.0 审核通过并上架后，在 Partner Center 上传 2.1 包提交更新；
> 或取消 2.0  submission 直接用 2.1 重新提交（已安装用户不受影响）。
> 2.1 的商店描述（含"界面语言自动切换"说明）见 `docs/publish/screenshots/store-description.txt`，
> 需粘贴到 Store listings → Details 的 Description 字段（manifest description 仍受 132 字符限制，保持短描述）。
> 上传 2.1 包后，商店会依据 `_locales/` 自动生成 zh-CN + en-US 双 listing：
> - zh-CN listing：长描述用 `store-description.txt`，截图用 `popup-grid.png` / `popup-pinyin-search.png` / `checker.png`（中文界面）
> - en-US listing：长描述用 `store-description-en.txt`，截图用 `popup-grid-en-US.png` / `popup-pinyin-search-en-US.png` / `checker-en-US.png`（英文界面）
> 官方流程原文：[Publish a Microsoft Edge extension (Microsoft Learn)](https://learn.microsoft.com/en-us/microsoft-edge/extensions-chromium/publish/publish-extension)
> 开发者后台：https://partner.microsoft.com/dashboard/microsoftedge/public/login
>
> **材料清单（全部已备好）**：
> - 包：`dist/bookmark-viewer-2.0-edge.zip`（manifest description 保持短描述——Edge 包校验 schema 限制 ≤132 字符，实测 467 字符会被拒）
> - Logo：`docs/publish/screenshots/logo-300.png`（300×300，1:1）
> - 截图（均为精确 1280×800）：`popup-grid.png`、`popup-pinyin-search.png`、`checker.png`
> - 隐私政策文案：`docs/publish/privacy-policy.md`（需先部署到公网 URL）
> - 商店长描述：`docs/publish/store-listing.md`（≥250 字符，填 Partner Center 的 Details → Description 字段）
> - 网站/支持：https://github.com/albinhdk/mybookmark （仓库地址）

**为什么必须由你本人完成最后一步**：Partner Center 注册和提交需要用你的 Microsoft 账号登录并接受《开发者协议》，这一步只能你本人操作。下面每一步该点什么、填什么都已写好；如果你愿意，可以在你登录后让我用浏览器自动化帮你逐栏填写。

---

## 第 0 步：部署隐私政策（5 分钟，先做）

Edge 商店要求：扩展访问了隐私数据（书签）就必须提供隐私政策 URL。

最简单方式——用已有 GitHub 仓库开 Pages：

1. 把 `docs/publish/privacy-policy.md` 内容部署为该仓库的一个页面（如 `docs/privacy-policy.md`，
   Settings → Pages → Source 选 `main` 分支 `/docs` 目录），得到
   `https://albinhdk.github.io/mybookmark/privacy-policy`（Pages 会把 md 渲染成网页）。
   也可以更简单地：在仓库根目录放一份同内容 HTML/MD，用 raw 链接。
2. 确认浏览器能打开该 URL，且 `<邮箱>`、`<日期>` 已替换。

## 第 1 步：注册开发者账号（免费）

1. 打开 https://partner.microsoft.com/dashboard/microsoftedge/public/login
2. 用你的 Microsoft 账号登录（没有就先注册一个 Outlook/Hotmail 账号）。
3. 首次进入需完成 Partner Center 注册：填写**发布者名称**（会显示在商店页面上，建议用
   `albinhdk` 或你喜欢的名字）、国家/地区、联系邮箱。
4. 在 **账户设置 → 开发者设置** 中确认 Edge 扩展发布资格已启用（免费，通常即时生效）。

> 微软注册流程可能要求验证邮箱；Edge 扩展发布本身**不收费**（不像 Chrome 收 $5）。

## 第 2 步：创建扩展并上传包

1. 进入 Edge 工作区，点 **Create new extension**（+ 号）。
2. 把 `dist/bookmark-viewer-2.0-edge.zip` 拖到上传区，等校验通过。
3. 依次点左侧 **Extension overview** → **Packages** → **Continue**。

## 第 3 步：Availability（可见性/市场）

| 字段 | 填法 |
|---|---|
| Visibility | **Public**（先给朋友试用可改 Hidden，之后可随时改回 Public） |
| Markets | 默认"全部市场"即可，点 **Save & Continue** |

## 第 4 步：Properties（属性）

| 字段 | 填法 |
|---|---|
| Category | **Productivity / 效率** |
| Website | https://github.com/albinhdk/mybookmark |
| Support contact detail | 你的邮箱（或仓库 Issues 地址） |
| Mature content | 不勾选 |

## 第 5 步：Privacy（隐私页，审核重点）

**① Single Purpose（单一用途）**——复制粘贴：

> 在弹出面板中以网格形式展示、搜索和整理浏览器书签，并检测失效书签链接。

**② Permission justification（逐条权限说明）**——复制粘贴：

| 权限 | 说明文字（英文，审核员看） |
|---|---|
| bookmarks | Core functionality: reads the bookmark tree and performs add/edit/delete/move operations requested by the user. |
| activeTab | Used when the user picks "update bookmark to current URL": we need the URL of the active tab at that moment. |
| storage | Saves view settings (grid columns, folder preview count) and local usage statistics in chrome.storage.local only. |
| favicon | Required by Chrome's documented favicon API: bookmarked sites' icons are served through the browser's built-in chrome-extension://<id>/_favicon/ endpoint (developer.chrome.com/docs/extensions/how-to/ui/favicons). These requests are handled internally by the browser; the extension makes no additional external requests. |
| host_permissions http/https | The dead-link checker must send one request to each user-selected bookmarked URL to test reachability; bookmarks can point to any site on the internet, so hosts cannot be enumerated in advance. All requests go directly to the user's own bookmarked sites; no other site is contacted. |

**③ Are you using remote code?**：选 **No, I am not using remote code**（MV3 + CSP `script-src 'self'`，全本地代码）。

**④ Data usage（数据使用）**：

- What user data do you plan to collect? 勾选：
  - **Personal communications**（书签内容属于个人通信数据，仅用于展示功能）
  - **User activity**（书签使用统计，仅存本地）
- 是否传出设备：**是**——仅当用户主动点击"失效检测"时，书签 URL 由 service worker 请求一次（访问的就是该书签对应的网站），结果不持久化上传。
- 三条 certification 复选框按实情勾选（不卖数据、不用于功能外目的）。

**⑤ Privacy Policy URL**：填入第 0 步部署好的 URL。

## 第 6 步：Store Listings → Details for 中文（中国）

> ⚠️ 实测结论（2026-10 提交时验证）：manifest 的 description 有 ≤132 字符的硬限制（超长包校验直接报
> "JSON does not match all schemas"）。所以 Details 页的 **Description 是可编辑的长描述字段（250–10000 字符）**，
> 需要把短描述扩展成完整描述粘贴进去（manifest description 只作为 Short description）。

| 字段 | 填法 |
|---|---|
| Extension name | Bookmark Viewer（只读，来自 manifest） |
| Description（长描述，250–10000 字符） | 粘贴 `docs/publish/store-listing.md` 的「详细描述」去掉 markdown 符号后的版本（已删好存在截图同目录 `store-description.txt` 的文本） |
| Extension logo | 上传 `logo-300.png`（300×300） |
| Screenshots | 依次上传 `popup-grid.png`、`popup-pinyin-search.png`、`checker.png`（最多 6 张，均为 1280×800；顺序即展示顺序，建议按此顺序） |
| Search terms | `书签, 书签管理, 书签搜索, 拼音搜索, pinyin, bookmark, 失效检测`（7 个词，未超 21 词上限） |
| Short description | 只读，来自 manifest description |
| YouTube video | 留空（可选） |

点 **Save draft**，确认 Status 显示 Complete。

## 第 7 步：Notes for certification → Publish

在 **Notes for certification** 粘贴：

```
Tested on Microsoft Edge 153 (Windows 11).
How to test: click the extension icon in the toolbar to open the bookmark grid popup.
Type in the search box to filter (supports Chinese pinyin initials/full pinyin and
plain English). "检查书签" in the popup header opens checker.html, which validates
every bookmark in the background page context (allowed to finish after the popup closes).
Remote network checks are issued by the extension service worker (fetchUrl message)
because of page CORS restrictions. No remote code is loaded.
```

然后点 **Publish**。审核**最长 7 个工作日**，通常 1-3 天。通过后商店状态变为 **In the Store**。

## 常见卡点

| 现象 | 处理 |
|---|---|
| Description 提示不足 250 字符 | 本 Edge 包 manifest description 已 467 字符，重新上传该 zip 即可 |
| 权限被要求补充说明 | 用第 5 步 ② 的英文说明逐条回复 |
| 商店只识别出一种语言 | manifest 硬编码中文 → 只显示 zh-CN 列表，属正常 |
| 审核超 7 个工作日未过 | 到 Partner Center 提交工单（Extensions New Support Request） |

## 后续更新

manifest `version` 递增 → `python tests/package.py [version]` 重打 dist/ 下两个 zip（manifest
description 走 `__MSG_extensionDescription__` 短描述 + `_locales/` 双语，Edge 包校验限制 ≤132 字符）
→ Partner Center 上传新包 → 提交。已安装用户自动收到更新。
