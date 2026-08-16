# -*- coding: utf-8 -*-
"""头条号 + 百家号 .docx 专项合规扫描"""
import os
import re
import zipfile

BASE_DIR = r"E:\ai项目\考试插件\运营管理\deliverables\2026-07-25-秋招多平台20篇-md"

RED_PRICE = re.compile(r"(19\.8|29\.8|69\.8|\d+元|￥|价格)")
RED_TRIAL = re.compile(r"(免费试用[一1]天|试用1天|试用一天)")
RED_LINK = re.compile(r"https?://")
RED_SUB_URL = re.compile(r"quizmate\.vip/[a-zA-Z]+")

# 头条号严规则
TOUTIAO_RULES = {
    "外链推广": RED_LINK,
    "二维码": re.compile(r"二维码|qrcode|qr", re.I),
    "微信引流": re.compile(r"微信(\s*号)?[:：]?\s*[a-zA-Z0-9_]+|加我[微信vV]|薇信|微[信a-zA-Z]|qq[:：]?\s*\d+", re.I),
    "诱导话术": re.compile(r"私我|私聊|私信|转发可领|扫码领取|扫码咨询|评论区扣\d|免费领取|限时领取|扫码下载|领红包", re.I),
    "诱导下载": re.compile(r"立即下载|点击下载|戳我下载|扫码下载", re.I),
    "品牌硬广": re.compile(r"求职雷达|答题悬浮助手|quizmate|watch\.quizmate"),
    "推荐工具硬广": re.compile(r"推荐.*工具|推荐.*网站|推荐.*APP", re.I),
    "耸人听闻": re.compile(r"再不.*就|再不.*会|震惊\d|必看|不看亏了|错过.*等一年|错过.*一辈子|错过.*后悔", re.I),
}

# 百家号宽松规则（可保留品牌名）
BAIDU_RULES = {
    "价格红线": RED_PRICE,
    "试用时长": RED_TRIAL,
    "子链接": RED_SUB_URL,
    "二维码": re.compile(r"二维码|qrcode|qr", re.I),
    "微信引流": re.compile(r"微信(\s*号)?[:：]?\s*[a-zA-Z0-9_]+|加我[微信vV]|薇信|微[信a-zA-Z]|qq[:：]?\s*\d+", re.I),
    "诱导话术": re.compile(r"私我|私聊|私信|转发可领|扫码领取|扫码咨询|评论区扣\d|免费领取|限时领取|扫码下载|领红包", re.I),
}


def extract_docx_text(path):
    try:
        with zipfile.ZipFile(path, 'r') as z:
            xml = z.read('word/document.xml').decode('utf-8')
        text = re.sub(r'<[^>]+>', '', xml)
        return text
    except Exception as e:
        return ""


def main():
    for platform, rules in [("05_头条号", TOUTIAO_RULES), ("07_百家号", BAIDU_RULES)]:
        pdir = os.path.join(BASE_DIR, platform)
        print("="*70)
        print(f"{platform} 合规扫描（{sum(1 for _ in os.listdir(pdir) if _.endswith('.docx'))} 篇 .docx）")
        print("="*70)

        rule_totals = {}
        all_issues = {}

        for fname in sorted(os.listdir(pdir)):
            if not fname.endswith(".docx"):
                continue
            fpath = os.path.join(pdir, fname)
            text = extract_docx_text(fpath)
            file_issues = []
            for rule_name, pat in rules.items():
                m = pat.search(text)
                if m:
                    rule_totals[rule_name] = rule_totals.get(rule_name, 0) + 1
                    file_issues.append((rule_name, m.group()))

            # 链接数
            n_links = len(RED_LINK.findall(text))
            if n_links > 1:
                rule_totals["链接次数异常"] = rule_totals.get("链接次数异常", 0) + 1
                file_issues.append(("链接次数异常", f"{n_links}次"))

            if file_issues:
                all_issues[fname] = file_issues

        print(f"扫描 {sum(1 for _ in os.listdir(pdir) if _.endswith('.docx'))} 篇")
        if rule_totals:
            print("命中统计：")
            for k, v in sorted(rule_totals.items(), key=lambda x: -x[1]):
                print(f"  · {k}: {v} 处")
        else:
            print("  ✅ 全部合规！")

        # 详细
        if all_issues:
            print("\n详细命中：")
            for fname, issues in list(all_issues.items())[:5]:
                print(f"  📄 {fname}")
                for rule, hit in issues:
                    print(f"    - {rule}: 「{hit[:50]}」")


if __name__ == "__main__":
    main()