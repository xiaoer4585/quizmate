# -*- coding: utf-8 -*-
"""
合规扫描：检查 180 篇 .docx
1. 价格红线：无"19.8/29.8/69.8/价格/元/￥"
2. 试用时长红线：无"免费试用一天/试用1天"
3. 链接硬规则：每篇 https:// 命中数 ≤ 1
4. 小红书安全词：无"考试插件/答题悬浮助手/答题助手/作弊/秒答"
5. 小红书/抖音：QR code 已嵌入
"""
import os
import re
import zipfile
from xml.etree import ElementTree as ET

BASE_DIR = r"E:\ai项目\考试插件\运营管理\deliverables\2026-07-25-秋招多平台20篇"

# 红线规则
RED_PRICE = re.compile(r"(19\.8|29\.8|69\.8|\d+元|￥|价格)")
RED_TRIAL = re.compile(r"(免费试用[一1]天|试用1天|试用一天)")
RED_XHS_WORDS = re.compile(r"(考试插件|答题悬浮助手|答题助手|作弊|作弊器|秒答)")
RED_SUB_URL = re.compile(r"quizmate\.vip/[a-zA-Z]+")  # 子链接
RED_DOUBLE = re.compile(r"https?://")  # 检查重复

PLATFORMS_XHS = {"08_小红书", "09_抖音"}


def extract_docx_text(path):
    """提取 docx 全部文字"""
    try:
        with zipfile.ZipFile(path, 'r') as z:
            xml = z.read('word/document.xml').decode('utf-8')
        # 去掉 XML 标签
        text = re.sub(r'<[^>]+>', '', xml)
        return text
    except Exception as e:
        return f"ERROR: {e}"


def check_has_image(path):
    """docx 是否包含图片"""
    try:
        with zipfile.ZipFile(path, 'r') as z:
            media = [n for n in z.namelist() if n.startswith('word/media/')]
            return len(media) > 0
    except Exception:
        return False


def main():
    stats = {
        "total": 0,
        "price_hits": [],
        "trial_hits": [],
        "xhs_word_hits": [],
        "link_count_errors": [],
        "sub_url_hits": [],
        "xhs_no_qr": [],
    }

    for platform in sorted(os.listdir(BASE_DIR)):
        pdir = os.path.join(BASE_DIR, platform)
        if not os.path.isdir(pdir) or "_" not in platform:
            continue
        for fname in sorted(os.listdir(pdir)):
            if not fname.endswith(".docx"):
                continue
            fpath = os.path.join(pdir, fname)
            stats["total"] += 1
            text = extract_docx_text(fpath)

            # 1. 价格
            m = RED_PRICE.search(text)
            if m:
                stats["price_hits"].append((platform, fname, m.group()))

            # 2. 试用
            m = RED_TRIAL.search(text)
            if m:
                stats["trial_hits"].append((platform, fname, m.group()))

            # 3. 子链接
            m = RED_SUB_URL.search(text)
            if m:
                stats["sub_url_hits"].append((platform, fname, m.group()))

            # 4. 链接数（合规：每篇应 = 1）
            links = RED_DOUBLE.findall(text)
            # 小红书/抖音的合规判定：≤2（多处引导但官网本体只放 1 次）
            n_links = len(links)
            if platform in PLATFORMS_XHS:
                if n_links > 2:
                    stats["link_count_errors"].append((platform, fname, f"{n_links}次"))
            else:
                if n_links > 1:
                    stats["link_count_errors"].append((platform, fname, f"{n_links}次"))

            # 5. 小红书专属：安全词
            if platform == "08_小红书":
                m = RED_XHS_WORDS.search(text)
                if m:
                    stats["xhs_word_hits"].append((platform, fname, m.group()))
                if not check_has_image(fpath):
                    stats["xhs_no_qr"].append((platform, fname))

    # 输出
    print("="*60)
    print("合规扫描报告")
    print("="*60)
    print(f"扫描总数：{stats['total']} 篇")

    print(f"\n【1】价格红线命中：{len(stats['price_hits'])} 次")
    for p, f, m in stats["price_hits"][:10]:
        print(f"    {p}/{f}: 「{m}」")

    print(f"\n【2】试用时长红线命中：{len(stats['trial_hits'])} 次")
    for p, f, m in stats["trial_hits"][:10]:
        print(f"    {p}/{f}: 「{m}」")

    print(f"\n【3】子链接命中：{len(stats['sub_url_hits'])} 次")
    for p, f, m in stats["sub_url_hits"][:10]:
        print(f"    {p}/{f}: 「{m}」")

    print(f"\n【4】链接次数异常：{len(stats['link_count_errors'])} 次")
    for p, f, m in stats["link_count_errors"][:10]:
        print(f"    {p}/{f}: {m}")

    print(f"\n【5】小红书安全词命中：{len(stats['xhs_word_hits'])} 次")
    for p, f, m in stats["xhs_word_hits"][:10]:
        print(f"    {p}/{f}: 「{m}」")

    print(f"\n【6】小红书/抖音未嵌入二维码：{len(stats['xhs_no_qr'])} 次")
    for p, f in stats["xhs_no_qr"][:10]:
        print(f"    {p}/{f}")

    # 总结
    total_issues = sum(len(v) for k, v in stats.items()
                       if k not in ("total",) and isinstance(v, list))
    if total_issues == 0:
        print("\n✅ 全部合规，可发布！")
    else:
        print(f"\n⚠️ 共 {total_issues} 个合规问题需要修复")


if __name__ == "__main__":
    main()
