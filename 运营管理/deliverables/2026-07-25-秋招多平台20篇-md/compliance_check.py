# -*- coding: utf-8 -*-
"""合规扫描（Markdown 版）"""
import os
import re

BASE_DIR = r"E:\ai项目\考试插件\运营管理\deliverables\2026-07-25-秋招多平台20篇-md"

RED_PRICE = re.compile(r"(19\.8|29\.8|69\.8|\d+元|￥|价格)")
RED_TRIAL = re.compile(r"(免费试用[一1]天|试用1天|试用一天)")
RED_XHS_WORDS = re.compile(r"(考试插件|答题悬浮助手|答题助手|作弊|作弊器|秒答)")
RED_SUB_URL = re.compile(r"quizmate\.vip/[a-zA-Z]+")
RED_LINK = re.compile(r"https?://")

PLATFORMS_XHS = {"08_小红书", "09_抖音"}
NEED_IMG = {"08_小红书", "09_抖音"}


def main():
    stats = {"total": 0, "price_hits": [], "trial_hits": [], "xhs_hits": [],
             "link_errors": [], "sub_url_hits": [], "img_missing": []}

    for platform in sorted(os.listdir(BASE_DIR)):
        pdir = os.path.join(BASE_DIR, platform)
        if not os.path.isdir(pdir):
            continue
        for fname in sorted(os.listdir(pdir)):
            if not fname.endswith(".md"):
                continue
            fpath = os.path.join(pdir, fname)
            with open(fpath, "r", encoding="utf-8") as f:
                text = f.read()
            stats["total"] += 1

            for label, pat in (("price", RED_PRICE), ("trial", RED_TRIAL)):
                m = pat.search(text)
                if m:
                    stats[f"{label}_hits"].append((platform, fname, m.group()))

            m = RED_SUB_URL.search(text)
            if m:
                stats["sub_url_hits"].append((platform, fname, m.group()))

            # 链接数
            n = len(RED_LINK.findall(text))
            if platform in PLATFORMS_XHS:
                if n > 2:
                    stats["link_errors"].append((platform, fname, f"{n}次"))
            else:
                if n > 1:
                    stats["link_errors"].append((platform, fname, f"{n}次"))

            # 小红书安全词
            if platform == "08_小红书":
                m = RED_XHS_WORDS.search(text)
                if m:
                    stats["xhs_hits"].append((platform, fname, m.group()))

            # 配图检查
            if platform in NEED_IMG:
                # 配图都放在另一张共用的 xhs_cover.jpg / dy_cover.jpg，每篇引用同一张
                img_name = "xhs_cover.jpg" if platform == "08_小红书" else "dy_cover.jpg"
                img_path = os.path.join(pdir, img_name)
                if not os.path.exists(img_path):
                    stats["img_missing"].append((platform, fname))

    print("="*60)
    print("合规扫描报告（Markdown 版）")
    print("="*60)
    print(f"扫描总数：{stats['total']} 篇 .md")

    for k in ["price_hits", "trial_hits", "sub_url_hits", "link_errors", "xhs_hits", "img_missing"]:
        label = {
            "price_hits": "价格红线",
            "trial_hits": "试用时长红线",
            "sub_url_hits": "子链接",
            "link_errors": "链接次数异常",
            "xhs_hits": "小红书安全词",
            "img_missing": "小红书/抖音配图缺失",
        }[k]
        print(f"\n【{label}】：{len(stats[k])} 处")
        for p, f, *info in stats[k][:5]:
            extra = info[0] if info else ""
            print(f"    {p}/{f} {extra}")

    total_issues = sum(len(v) for k, v in stats.items()
                       if k != "total" and isinstance(v, list))
    print(f"\n{'='*60}")
    if total_issues == 0:
        print("✅ 全部合规，可发布！")
    else:
        print(f"⚠️ 共 {total_issues} 个合规问题需要修复")


if __name__ == "__main__":
    main()
