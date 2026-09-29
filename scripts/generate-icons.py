#!/usr/bin/env python3
"""生成 Prompt-Box 扩展图标。

纯标准库实现（zlib + struct），不依赖 Pillow。
以 4 倍超采样渲染后降采样，得到平滑边缘。

用法：python3 scripts/generate-icons.py
输出：public/icon/{16,32,48,96,128}.png
"""

import os
import struct
import zlib

BG = (0x37, 0x8A, 0xDD)
FG = (0xFF, 0xFF, 0xFF)
SIZES = (16, 32, 48, 96, 128)
SS = 4

OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "public", "icon")


def in_rounded_rect(x, y, size, radius):
    if x < 0 or y < 0 or x >= size or y >= size:
        return False
    cx = radius if x < radius else (size - radius if x > size - radius else x)
    cy = radius if y < radius else (size - radius if y > size - radius else y)
    if cx == x and cy == y:
        return True
    return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2


def in_bar(x, y, size, index):
    bar_h = size * 0.075
    gap = size * 0.155
    first_center = size * 0.345
    cy = first_center + index * gap
    x0 = size * 0.285
    x1 = size * 0.715
    return x0 <= x <= x1 and abs(y - cy) <= bar_h / 2


def render(size):
    big = size * SS
    radius = big * 0.23
    acc = [[[0, 0, 0, 0] for _ in range(size)] for _ in range(size)]

    for by in range(big):
        for bx in range(big):
            if not in_rounded_rect(bx + 0.5, by + 0.5, big, radius):
                continue
            color = FG if any(in_bar(bx + 0.5, by + 0.5, big, i) for i in range(3)) else BG
            px = acc[by // SS][bx // SS]
            px[0] += color[0]
            px[1] += color[1]
            px[2] += color[2]
            px[3] += 255

    rows = []
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            r, g, b, a = acc[y][x]
            n = SS * SS
            if a == 0:
                row += bytes((0, 0, 0, 0))
                continue
            opaque = a / 255.0
            row += bytes((
                min(255, round(r / opaque)),
                min(255, round(g / opaque)),
                min(255, round(b / opaque)),
                a // n,
            ))
        rows.append(bytes(row))
    return b"".join(rows)


def chunk(tag, data):
    return (
        struct.pack(">I", len(data))
        + tag
        + data
        + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    )


def write_png(path, size):
    raw = render(size)
    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")
    with open(path, "wb") as fh:
        fh.write(png)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for size in SIZES:
        path = os.path.join(OUT_DIR, f"{size}.png")
        write_png(path, size)
        print(f"wrote {path} ({os.path.getsize(path)} bytes)")


if __name__ == "__main__":
    main()
