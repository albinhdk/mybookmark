# MyBookmark

这个代码仓库包含了 Chrome 书签菜单优化器扩展程序（`chrome-menu-optimizer`）。

## 🌟 项目简介

MyBookmark 是一个旨在改善 Chrome 浏览器原生书签栏使用体验的扩展程序项目。它将传统的单行书签布局升级为多行网格布局，充分利用屏幕空间，从而大大提升书签的查找和使用效率。

📦 **已上架 Microsoft Edge 加载项商店**：[Bookmark Viewer](https://microsoftedge.microsoft.com/addons/detail/bookmark-viewer/npddjihfkljcegccbchiioiiljbeclhc)

### ✨ 核心功能

- **多行网格排版**：将书签栏从单行改为智能网格排列，自动适应屏幕尺寸。
- **拼音快速搜索**：支持通过拼音首字母快速检索和定位书签。
- **智能排版系统**：自动计算和调整书签项的最小宽度与间距，确保视觉一致性。
- **实时监控与诊断**：内置轻量级的性能监控、错误捕获与测试框架，保证扩展的稳定运行。

## 📁 目录结构

- [`chrome-menu-optimizer/`](./chrome-menu-optimizer/) —— 扩展程序核心代码
  - 包含了 Popup UI、核心内容注入脚本（Content Script）、全局配置、样式以及完整的测试套件。

## 🚀 快速上手

### 安装指南

1. 下载或克隆本项目到本地机器。
2. 打开 Chrome 浏览器，在地址栏输入并访问 `chrome://extensions/`。
3. 开启页面右上角的 **“开发者模式”**。
4. 点击左上角的 **“加载已解压的扩展程序”**。
5. 选择本项目中的 `chrome-menu-optimizer` 文件夹。
6. 确保扩展已启用，并在浏览器工具栏点击插件图标进行相应配置。

> 更多详细的开发指南、架构说明和 API 文档，请参阅扩展目录内的 [详细 README](./chrome-menu-optimizer/README.md) 以及相关架构说明文档。
