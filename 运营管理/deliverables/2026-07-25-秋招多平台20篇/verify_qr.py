# -*- coding: utf-8 -*-
"""验证小红书/抖音二维码嵌入"""
import os
import zipfile

BASE_DIR = r"E:\ai项目\考试插件\运营管理\deliverables\2026-07-25-秋招多平台20篇"

for platform in ("08_小红书", "09_抖音"):
    pdir = os.path.join(BASE_DIR, platform)
    with_qr = 0
    without_qr = 0
    for fname in sorted(os.listdir(pdir)):
        if not fname.endswith(".docx"):
            continue
        fpath = os.path.join(pdir, fname)
        with zipfile.ZipFile(fpath, 'r') as z:
            media = [n for n in z.namelist() if n.startswith('word/media/')]
            if media:
                with_qr += 1
            else:
                without_qr += 1
                print(f"  ❌ {platform}/{fname} - 无图片")
    print(f"[{platform}] 有二维码：{with_qr} 篇，无二维码：{without_qr} 篇")

# 抽样验证一篇文章的图片是否真是 qrcode_wechat.jpg
sample = os.path.join(BASE_DIR, "08_小红书", "01_2026 秋招开启时间节点.docx")
with zipfile.ZipFile(sample, 'r') as z:
    media = [n for n in z.namelist() if n.startswith('word/media/')]
    for m in media:
        info = z.getinfo(m)
        print(f"  抽样：{sample}")
        print(f"    包含图片：{m}（{info.file_size} bytes）")

print("\n✓ 验证完成")
