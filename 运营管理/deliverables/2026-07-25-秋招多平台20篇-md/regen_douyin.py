# -*- coding: utf-8 -*-
"""只重生成 09_抖音 20 篇 .md（新轮播格式）"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from topics_data import TOPICS
from gen_md import render_douyin, save_md

BASE_DIR = r"E:\ai项目\考试插件\运营管理\deliverables\2026-07-25-秋招多平台20篇-md"
PLATFORM_DIR = os.path.join(BASE_DIR, "09_抖音")

print("重生成 09_抖音 20 篇（图文轮播格式）...")
for topic in TOPICS:
    content = render_douyin(topic)
    fname = f"{topic['id']:02d}_{topic['topic']}.md"
    save_md(fname, PLATFORM_DIR, content)
    print(f"  ✓ {fname}")

print("\n✓ 全部 20 篇已重生成")