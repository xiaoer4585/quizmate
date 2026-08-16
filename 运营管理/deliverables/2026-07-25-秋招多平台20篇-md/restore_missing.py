# -*- coding: utf-8 -*-
"""重建 01_知乎 缺失的 5 篇 + 08_小红书 全部 20 篇"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from topics_data import TOPICS
from gen_md import render_zhihu, render_xhs, save_md

BASE_DIR = r"E:\ai项目\考试插件\运营管理\deliverables\2026-07-25-秋招多平台20篇-md"

# 1. 重建 01_知乎 缺失的 5 篇
print("[01_知乎] 重建缺失的 5 篇...")
zhihu_dir = os.path.join(BASE_DIR, "01_知乎")
for topic in TOPICS[:5]:  # 01-05
    content = render_zhihu(topic)
    fname = f"{topic['id']:02d}_{topic['topic']}.md"
    save_md(fname, zhihu_dir, content)
    print(f"  ✓ {fname}")

# 2. 重建 08_小红书 全部 20 篇
print("\n[08_小红书] 重建全部 20 篇...")
xhs_dir = os.path.join(BASE_DIR, "08_小红书")
os.makedirs(xhs_dir, exist_ok=True)
for topic in TOPICS:
    content = render_xhs(topic)
    fname = f"{topic['id']:02d}_{topic['topic']}.md"
    save_md(fname, xhs_dir, content)
    print(f"  ✓ {fname}")

# 3. 重建 08_小红书 通用 cover 图（指向第 1 张）
import shutil
src = os.path.join(xhs_dir, "xhs_cover_01.jpg")
dst = os.path.join(xhs_dir, "xhs_cover.jpg")
if os.path.exists(src):
    shutil.copy(src, dst)
    print(f"\n  复制 {src} -> {dst}")
else:
    print(f"\n  ⚠️ 警告：{src} 不存在，需要先运行 gen_images.py 重新生成图片")

print("\n✓ 重建完成")