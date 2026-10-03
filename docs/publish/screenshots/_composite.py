# -*- coding: utf-8 -*-
"""把 take-screenshots.js 产出的原始截图为标准商店素材：
- popup 原始图（800px 宽）裁剪掉底部空白后，居中贴到 1280x800 画布（Edge Add-ons 要求精确尺寸）
- checker 原生 1280x800 直接采用
- logo 300x300 直接采用
用法：python _composite.py   （在本目录执行）
"""
import os
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
CANVAS = (1280, 800)
BG = (238, 241, 246)          # 画布底色（浅灰蓝）
BORDER = (208, 216, 228)      # 截图画框
TOL = 12                      # 判定“空白行”的容差


def crop_blank_bottom(img, tol=TOL):
    """从底部向上裁掉与页面背景色一致的行。"""
    px = img.convert("RGB")
    w, h = px.size
    bg = px.getpixel((w - 2, h - 2))           # 取样右下角作为背景色
    last = h - 1
    for y in range(h - 1, -1, -1):
        row_diff = 0
        for x in range(0, w, 16):               # 抽样加速
            p = px.getpixel((x, y))
            row_diff = max(row_diff, abs(p[0] - bg[0]) + abs(p[1] - bg[1]) + abs(p[2] - bg[2]))
            if row_diff > tol:
                break
        if row_diff > tol:
            last = y
            break
    bottom = min(h, last + 24)                  # 保留 24px 呼吸
    return px.crop((0, 0, w, bottom))


def compose_to_canvas(content, border=True):
    canvas = Image.new("RGB", CANVAS, BG)
    cw, ch = content.size
    if ch > CANVAS[1] - 40:                     # 超高则等比缩小
        ratio = (CANVAS[1] - 40) / ch
        content = content.resize((max(1, int(cw * ratio)), CANVAS[1] - 40), Image.LANCZOS)
        cw, ch = content.size
    x = (CANVAS[0] - cw) // 2
    y = (CANVAS[1] - ch) // 2
    canvas.paste(content, (x, y))
    if border:
        draw = canvas.load()                 # 在已贴好内容的画布上画边框
        for bx in range(x - 1, x + cw + 1):
            for by in (y - 1, y + ch):
                if 0 <= bx < CANVAS[0] and 0 <= by < CANVAS[1]:
                    draw[bx, by] = BORDER
        for by in range(y - 1, y + ch + 1):
            for bx in (x - 1, x + cw):
                if 0 <= bx < CANVAS[0] and 0 <= by < CANVAS[1]:
                    draw[bx, by] = BORDER
    return canvas


def main():
    outputs = []

    for raw, final in (("_raw-popup.png", "popup-grid.png"),
                       ("_raw-popup-search.png", "popup-pinyin-search.png")):
        img = Image.open(os.path.join(HERE, raw))
        cropped = crop_blank_bottom(img)
        compose_to_canvas(cropped).save(os.path.join(HERE, final))
        outputs.append(f"{final}  (1280x800, 内容 {cropped.size[0]}x{cropped.size[1]})")

    # checker：原生就是 1280x800
    checker = Image.open(os.path.join(HERE, "_raw-checker.png")).convert("RGB")
    assert checker.size == CANVAS, f"checker 尺寸异常: {checker.size}"
    checker.save(os.path.join(HERE, "checker.png"))
    outputs.append("checker.png  (1280x800 原生)")

    # logo：原生 300x300
    logo = Image.open(os.path.join(HERE, "_raw-logo-300.png")).convert("RGB")
    assert logo.size == (300, 300), f"logo 尺寸异常: {logo.size}"
    logo.save(os.path.join(HERE, "logo-300.png"))
    outputs.append("logo-300.png  (300x300)")

    print("\n".join(outputs))
    # 清理中间产物（可由 node tests/take-screenshots.js 重新生成）
    for raw in ("_raw-popup.png", "_raw-popup-search.png", "_raw-checker.png", "_raw-logo-300.png"):
        os.remove(os.path.join(HERE, raw))
    print("已清理 _raw-* 中间文件")


if __name__ == "__main__":
    main()
