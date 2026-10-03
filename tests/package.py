#!/usr/bin/env python3
"""打包扩展到 dist/：bookmark-viewer-<version>.zip 与 bookmark-viewer-<version>-edge.zip。

用法：python tests/package.py [version]
version 缺省取 chrome-menu-optimizer/manifest.json 的 version 字段。

包内容 = 运行时文件清单（manifest 在 zip 根目录，无外层文件夹），
不含设计文档（*.md）、调试页（diagnostic-test.html / test-search.html / search-debug.html）
和 svg 图标源文件。manifest description 走 __MSG_extensionDescription__（≤132 字符，
Edge 包校验限制），商店长描述在 Partner Center 的 Details → Description 填写。
"""
import json
import os
import sys
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'chrome-menu-optimizer')
DIST = os.path.join(ROOT, 'dist')

INCLUDE = [
    '_locales/en/messages.json',
    '_locales/zh_CN/messages.json',
    'background.js',
    'bookmark-checker.js',
    'bookmark-tree.js',
    'checker.html',
    'error-handler.js',
    'i18n.js',
    'icons/icon16.png',
    'icons/icon32.png',
    'icons/icon48.png',
    'icons/icon128.png',
    'manifest.json',
    'mock-chrome-api.js',
    'pinyin-search.js',
    'popup.html',
    'popup.js',
    'usage-manager.js',
    'view-settings.js',
]


def build(version):
    missing = [f for f in INCLUDE if not os.path.isfile(os.path.join(SRC, f))]
    if missing:
        raise SystemExit('缺少文件：' + ', '.join(missing))
    os.makedirs(DIST, exist_ok=True)
    for suffix in ('', '-edge'):
        out = os.path.join(DIST, 'bookmark-viewer-%s%s.zip' % (version, suffix))
        with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
            for f in INCLUDE:
                z.write(os.path.join(SRC, f), f)
        print('已生成 %s' % out)


if __name__ == '__main__':
    with open(os.path.join(SRC, 'manifest.json'), encoding='utf-8') as fp:
        manifest = json.load(fp)
    build(sys.argv[1] if len(sys.argv) > 1 else manifest['version'])
