# -*- coding: utf-8 -*-
"""
搜狐号合规检查器（基于官方规范）

搜狐号核心规范：
1. 违规推广营销：
   - 内容包含二维码推广、电话号码、外链推广（站外链接）
   - 文章含有营销购买信息，且对象为单一某产品或品牌的硬广
   - 诱导话术："私我购买""转发可领"等
   - 推广与自身账号属性无关的产品或品牌
2. 违规标题党：耸人听闻、数字夸大、虚假夸大、无中生有、低俗色情
3. 内容低质：机器写作痕迹、排版混乱、段落缺失
4. 推广伪装成攻略/测评/科普等中立形式的隐性推广
"""
import os
import re

BASE_DIR = r"E:\ai项目\考试插件\运营管理\deliverables\2026-07-25-秋招多平台20篇-md\03_搜狐号"

# 搜狐号违规检测规则
SOHU_RULES = {
    "外链推广": re.compile(r"https?://(?!mp\.sohu\.com)", re.I),
    "二维码": re.compile(r"二维码|qrcode|qr", re.I),
    "微信/QQ引流": re.compile(r"微信(\s*号)?[:：]?\s*[a-zA-Z0-9_]+|加我[微信vV]|薇信|微[信a-zA-Z]|qq[:：]?\s*\d+", re.I),
    "诱导话术": re.compile(r"私我|私聊|私信|转发可领|扫码领取|扫码咨询|扫码进群|评论区扣\d|评论领取|免费领取|限时领取|扫码下载|扫我|领红包", re.I),
    "诱导下载": re.compile(r"立即下载|点击下载|戳我下载|点这里下载|扫码下载", re.I),
    "产品品牌推广": re.compile(r"求职雷达|答题悬浮助手|quizmate|watch\.quizmate"),
    "推荐工具硬广": re.compile(r"推荐.*工具|推荐.*网站|推荐.*APP|推荐.*应用", re.I),
    "数字夸大": re.compile(r"震惊\d|刷爆|暴涨\d+%|必看|不看亏了", re.I),
    "耸人听闻": re.compile(r"再不.*就|再不.*会|一定.*要|错过.*等|一定.*后悔|终于.*了", re.I),
    "账号属性不符": re.compile(r"求职|找工作|招聘|应聘|秋招|offer"),  # 搜狐号如果是教育号没事；如果不是就有问题
}


def check_file(filepath):
    issues = []
    with open(filepath, "r", encoding="utf-8") as f:
        text = f.read()
    lines = text.split('\n')
    for rule_name, pat in SOHU_RULES.items():
        for m in pat.finditer(text):
            # 找到行号
            start = m.start()
            line_no = text[:start].count('\n') + 1
            line_content = lines[line_no - 1].strip()[:80]
            issues.append((rule_name, line_no, line_content))
    return issues


def main():
    print("="*70)
    print("搜狐号合规检查（基于官方《文章发布规范》）")
    print("="*70)

    all_issues = {}
    files = sorted(os.listdir(BASE_DIR))
    for fname in files:
        if not fname.endswith(".md"):
            continue
        fpath = os.path.join(BASE_DIR, fname)
        issues = check_file(fpath)
        if issues:
            all_issues[fname] = issues

    # 统计每个规则的总命中数
    rule_totals = {}
    for fname, issues in all_issues.items():
        for rule_name, line_no, line_content in issues:
            rule_totals[rule_name] = rule_totals.get(rule_name, 0) + 1

    print(f"\n扫描 {len(files)} 篇 .md 文件")
    print(f"命中问题的文件数：{len(all_issues)}")
    print(f"规则命中统计：")
    for rule, count in sorted(rule_totals.items(), key=lambda x: -x[1]):
        print(f"  · {rule}: {count} 处")

    # 详细列出
    print("\n" + "="*70)
    print("详细命中清单（按文件）")
    print("="*70)
    for fname, issues in all_issues.items():
        print(f"\n📄 {fname}（{len(issues)} 处问题）")
        # 去重规则
        seen_rules = set()
        for rule_name, line_no, line_content in issues:
            if rule_name not in seen_rules:
                seen_rules.add(rule_name)
                print(f"  Line {line_no:3d} [{rule_name}]: {line_content}")

    return rule_totals


if __name__ == "__main__":
    rule_totals = main()