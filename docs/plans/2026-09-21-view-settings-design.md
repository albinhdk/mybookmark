# 可配置网格列数与文件夹卡片预览数 — 设计文档

日期：2026-09-21
状态：已评审通过（与用户逐节确认）

## 背景与目标

Bookmark Viewer 的弹窗网格目前有两个硬编码的视觉参数：

1. **每行列数**：`.bookmark-grid` 使用 `repeat(auto-fill, minmax(200px, 1fr))`，在 720px 弹窗下等效 3 列，用户无法调整。
2. **文件夹卡片预览数**：`createBookmarkElement` 中 `slice(0, 5)` 固定展示前 5 个子项，"还有 X 个项目"阈值也硬编码 `> 5`。

目标：把这两个参数做成用户可配置项，即时生效、跨会话保持。

## 需求

| 配置项 | 范围 | 默认 | 语义 |
|---|---|---|---|
| 每行列数 | 2–5 | 3 | 主网格（书签 + 文件夹卡片）的等分列数；3 = 原 auto-fill 的等效值 |
| 每卡预览 | 0–10 | 5 | 文件夹卡片内嵌预览的子项数（按使用频率取前 N）；**0 = 完全不渲染预览**（含"还有 X 个项目"链接） |

约束与边界：

- 设置只作用于**当前视图的网格**；搜索结果页保持纵向列表，不受行列数影响。
- 预览排序沿用现有"按使用频率"逻辑，只是数量可配。
- 弹窗宽度固定 720px（Edge 153 autosize 自锁教训），列数通过内联 `grid-template-columns` 控制，**不重新引入任何 viewport 宽度媒体查询**。

## 设计决策

1. **UI 位置**：面包屑 `#breadcrumb` 与网格 `#bookmarks` 之间插入常驻设置行 `#view-settings`（高约 34px）。理由：高频视觉偏好，常驻比藏起来更顺手；720px 宽度下行高预算充足。
2. **控件**：两个原生 `<select>`（不引入组件库），当前值即选中值；`change` 事件即时写存储并立即重渲当前视图。
3. **搜索时隐藏**：`renderSearchResults` 时设置行 `display:none`，恢复文件夹视图时复原——搜索结果页它无意义，且省 34px。
4. **持久化**：`chrome.storage.local` 键 `bookmark_view_settings`，与使用统计一致（不随账号同步）。读取失败或值非法时逐项回落默认值（columns=3, preview=5），`console.warn` 不阻塞渲染。
5. **模块划分**：新独立小模块 `view-settings.js`（约 60 行，`window.bookmarkViewSettings`，暴露 `ready` promise），与 usage-manager 对等；`initializeExtension` 中与 usage 的 ready 并列 await，保证首屏就是正确列数（避免先 3 列再跳变）。
6. **CSS 策略**：废弃 `.bookmark-grid` / `.folder-view` 中的 `grid-template-columns` 声明，统一由 JS 按 columns 设内联样式——单一数据源，杜绝 auto-fill 与固定列数两套逻辑并存。

## 实现要点

| 文件 | 改动 |
|---|---|
| `chrome-menu-optimizer/view-settings.js` | 新增：load/save/get/onChange，非法值回落，ready promise |
| `chrome-menu-optimizer/popup.html` | 脚本标签（usage-manager 之前）；`#view-settings` 行 HTML + CSS；移除网格 CSS 的 `grid-template-columns` |
| `chrome-menu-optimizer/popup.js` | initializeExtension await ready；renderBookmarks 应用列数；createBookmarkElement 预览 slice 参数化 + preview=0 跳过 + more-link 阈值；设置行 change 处理；搜索显隐 |
| `tests/view-settings.test.js` | 新增：默认值/非法值回落/存储读写/ready 竞态 |
| `tests/popup-smoke.test.js` | 扩充：列数切换、预览切换、搜索隐藏、reload 持久化 |

## 测试计划

- Node 单测：默认值、非法值（0/99/"abc"/null）逐项回落、storage 往返、ready 时序。
- 浏览器冒烟（CDP + 真实 Edge）：默认选中 3/5；选 2 列/5 列后 computed `grid-template-columns` 等分数正确；预览 0 → 嵌套项归零；预览 3 → 每卡嵌套 ≤3；搜索时设置行隐藏、清空恢复；reload 后设置保持。
- 回归：既有 90 个 Node 断言 + 19 项冒烟全绿。

## 明确不做（YAGNI）

- 不做"每个文件夹单独记忆列数/预览数"（全局统一）。
- 不把搜索结果改成网格。
- 不做"恢复默认"按钮（默认值可直接重选）。
