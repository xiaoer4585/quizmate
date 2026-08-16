# -*- coding: utf-8 -*-
"""
2026-07-25 秋招多平台 20 篇 · Markdown 版
9 平台 × 20 篇 = 180 篇 .md
小红书 + 抖音：每篇配 1 张 1080×1440 文字排版图（带二维码）
"""
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from topics_data import TOPICS, WEBSITE_URL

# 路径配置
BASE_DIR = r"E:\ai项目\考试插件\运营管理\deliverables\2026-07-25-秋招多平台20篇-md"
QRCODE_PATH = os.path.join(BASE_DIR, "qrcode_wechat.jpg")

PLATFORMS = ["01_知乎", "02_公众号", "03_搜狐号", "04_网易号",
             "05_头条号", "06_企鹅号", "07_百家号", "08_小红书", "09_抖音"]


# ============ 通用工具 ============
def md_section(text, level=2):
    return f"\n{'#'*level} {text}\n\n"

def md_para(text):
    return f"{text}\n\n"

def md_bullet(text):
    return f"- {text}\n"

def md_numbered(idx, text):
    return f"{idx}. {text}\n"

def save_md(filename, dirpath, content):
    full = os.path.join(dirpath, filename)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "w", encoding="utf-8") as f:
        f.write(content)
    return full


def common_cta():
    return f"\n---\n\n📚 想了解秋招全程工具和求职雷达功能，可以看官网：{WEBSITE_URL}\n"


# ============ 平台 Render（输出 .md 字符串） ============

def render_zhihu(topic):
    title = f"【秋招干货】{topic['title_zh']}"
    md = f"# {title}\n\n"
    md += f"> 答主背景：2026 届秋招拿到 5 个 Offer 的过来人 | 阅读约 5 分钟\n\n"
    md += "## 先说结论\n\n"
    md += topic["core"] + "\n\n"
    md += "## 一、为什么这件事重要\n\n"
    md += f"{topic['topic']}是秋招过程中非常关键的环节。我自己在秋招中就因为忽视了这一点，错过了一次重要的机会。后来才意识到：\n\n"
    for f in topic["facts"][:2]:
        md += f"- {f}\n"
    md += "\n## 二、具体怎么做\n\n"
    md += "结合我自己的经验，下面是可执行的步骤：\n\n"
    for f in topic["facts"]:
        md += f"- {f}\n"
    md += "\n## 三、容易踩的坑\n\n"
    md += "根据我帮助同学修改秋招策略的经验，最常见的几个误区：\n\n"
    md += "1. 信息分散导致错过机会\n"
    md += "2. 没有节奏感导致疲于应付\n"
    md += "3. 只投大厂忽略自身匹配\n\n"
    md += f"**实用建议**：{topic['tip']}\n\n"
    md += "## 四、推荐工具\n\n"
    md += "我自己在秋招中用过最有价值的工具：\n\n"
    md += "- **求职雷达**（watch.quizmate.vip）：把分散的招聘信息聚合起来，自动监控企业官网岗位变化\n"
    md += "- **答题悬浮助手**（quizmate.vip）：把笔试刷题、个人知识库、AI 多模型整合起来\n\n"
    md += common_cta()
    return md


def render_wechat(topic):
    title = topic['title_zh']
    md = f"# {title}\n\n"
    md += f"> 原创 · {topic['category']} · 阅读约 8 分钟\n\n"
    md += "又是一年秋招季，每年到这个时候我都会收到很多同学的私信：\n\n"
    md += f"> 「老师，{topic['topic']}到底该怎么搞？」\n\n"
    md += f"今年系统整理秋招系列文章，今天这篇是关于「{topic['topic']}」的深度拆解。全文约 2500 字，建议先收藏再读。\n\n"
    md += f"## 一、先说背景：{topic['category']} 为什么重要\n\n"
    md += topic["core"] + "\n\n"
    md += "这是整个秋招逻辑的底层。任何想要拿到好 Offer 的同学，都必须把这一步搞清楚。\n\n"
    md += "## 二、五大核心要点\n\n"
    md += "结合我接触过的 100+ 同学的秋招经历，我总结出 5 个核心要点：\n\n"
    for i, f in enumerate(topic["facts"], 1):
        md += f"**要点 {i}**：{f}\n\n"
    md += "## 三、可执行的操作步骤\n\n"
    md += "下面这部分是干货，建议打开手机备忘录边看边记：\n\n"
    md += f"**核心建议**：{topic['tip']}\n\n"
    md += "Step 1：先把自己的求职方向写下来。城市、岗位方向、毕业年份三个维度。\n\n"
    md += "Step 2：拉一份目标企业清单，分核心（必投）/ 重点（争取）/ 备选（练手）三档。\n\n"
    md += "Step 3：把每个企业的官网、招聘公众号、招聘平台账户都加到监控清单。\n\n"
    md += "Step 4：建立跟踪表，每日更新状态（投递/笔试/面试/Offer）。\n\n"
    md += "Step 5：每周日晚上做一次 30 分钟复盘，调整下周节奏。\n\n"
    md += "## 四、过来人踩过的 3 个坑\n\n"
    md += "### 误区 1：海投简历，不看 JD\n\n"
    md += "**后果**：通过率暴跌，HR 容易把你拉黑。\n\n"
    md += "### 误区 2：等到 9 月才开始准备\n\n"
    md += "**后果**：提前批已结束，错过一半机会。\n\n"
    md += "### 误区 3：只刷题不总结\n\n"
    md += "**后果**：题海战术浪费时间，错题反复错。\n\n"
    md += "## 五、我自己在用的工具组合\n\n"
    md += "秋招的过程是「信息收集 + 持续刷题 + 主动跟进」三件事的循环。\n\n"
    md += "**信息收集**：求职雷达（watch.quizmate.vip），聚合 18 个招聘来源，自动发现新增岗位与截止变化，订阅投递进度。\n\n"
    md += "**持续刷题**：答题悬浮助手（quizmate.vip），网页答题插件，不截屏不切屏，6 种 AI 模型可选，还有个人知识库上传自己资料。\n\n"
    md += "这两个工具组合使用，基本覆盖了秋招的全部核心流程。\n\n"
    md += common_cta()
    return md


def render_sohu(topic):
    title = topic['title_other']
    md = f"# {title}\n\n"
    md += f"> 分类：教育 · {topic['category']} · 阅读约 5 分钟\n\n"
    md += "## 导语\n\n"
    md += topic["core"] + "\n\n"
    md += "## 一、核心数据对比\n\n"
    md += "| 维度 | 传统方式 | 工具化方式 |\n"
    md += "|------|---------|-----------|\n"
    md += "| 信息获取 | 5+ 平台手动切换 | 一个入口聚合 |\n"
    md += "| 岗位变化 | 手动对比 | 自动提醒 |\n"
    md += "| 进度追踪 | Excel 手动维护 | 自动归类 |\n"
    md += "| 错题复盘 | 凭记忆 | 自动归档 |\n"
    md += "| 日历管理 | 纸质便签 | 数字日历 + 提醒 |\n\n"
    md += "## 二、五大核心要点\n\n"
    for f in topic["facts"]:
        md += f"- {f}\n"
    md += "\n## 三、详细操作步骤\n\n"
    md += f"**核心建议**：{topic['tip']}\n\n"
    md += "1. **步骤 1**：明确目标。岗位方向 + 城市 + 毕业年份。\n"
    md += "2. **步骤 2**：建立监控清单。聚合所有目标企业的招聘渠道。\n"
    md += "3. **步骤 3**：跟踪投递进度。每周更新一次状态。\n"
    md += "4. **步骤 4**：刷题 + 复盘。每天 1 套，行测五模块轮换。\n"
    md += "5. **步骤 5**：复盘与调整。每周日晚上做整体复盘。\n\n"
    md += "## 四、适用人群\n\n"
    md += "- 大三/研二在校生，准备 2026 届秋招\n"
    md += "- 应届毕业生想冲补录与春招\n"
    md += "- 留学归国时间线不同的同学\n\n"
    md += "## 五、推荐工具\n\n"
    md += "本主题推荐两个工具：**求职雷达**（监控招聘流程）+ **答题悬浮助手**（笔试刷题+知识库）。配合使用可以显著提升秋招效率。\n\n"
    md += common_cta()
    return md


def render_netease(topic):
    title = topic['title_other']
    md = f"# {title}\n\n"
    md += "> 科技/工具评测 · 全文约 1500 字\n\n"
    md += "## 导语\n\n"
    md += topic["core"] + "\n\n"
    md += "## 1. 问题分析\n\n"
    md += f"在「{topic['category']}」这件事上，传统做法有三个明显短板：信息分散、效率低下、节奏失控。本文将逐一拆解。\n\n"
    md += "## 2. 工具化解决思路\n\n"
    md += "把分散的流程集中到一个工具入口，让数据自动流转。以秋招为例：\n\n"
    md += "**求职雷达**（watch.quizmate.vip）可以聚合 18 个招聘来源，自动发现新增岗位、跟踪投递进度、监控网页变化。\n\n"
    md += "**答题悬浮助手**（quizmate.vip）是网页答题插件，可直接读取页面结构、不截屏不切屏，配套个人知识库与 6 种 AI 模型。\n\n"
    md += "## 3. 关键技术点\n\n"
    md += "- **网页正文解析**：在不截屏的情况下识别页面题目与选项\n"
    md += "- **多源聚合**：把分散的招聘网站整合成一张清单\n"
    md += "- **自动变化监控**：定时抓取目标页面，对比历史版本，发现变化即推送\n"
    md += "- **个人知识库**：支持 7 种格式资料上传，构建专属训练语料\n\n"
    md += "## 4. 实操建议\n\n"
    for f in topic["facts"]:
        md += f"- {f}\n"
    md += f"\n**{topic['tip']}**\n\n"
    md += "## 5. 总结\n\n"
    md += "工具化的本质是把重复劳动交给程序，把判断与决策留给人。秋招如此，工作以后的项目管理亦如此。\n\n"
    md += common_cta()
    return md


def render_toutiao(topic):
    title = topic['title_other']
    md = f"# {title}\n\n"
    md += f"> {topic['category']} · 阅读约 4 分钟\n\n"
    md += "## 开篇点题\n\n"
    md += topic["core"] + "\n\n"
    md += "## 快速清单\n\n"
    for f in topic["facts"]:
        md += f"- ✅ {f}\n"
    md += "\n## 核心方法\n\n"
    md += f"**{topic['tip']}**\n\n"
    md += "把这三件事做扎实：明确目标 → 建立监控 → 持续跟进。\n\n"
    md += "## 为什么这件事秋招时一定要做\n\n"
    md += "1. 把握时间窗口：秋招只有 2 个月主战场。\n"
    md += "2. 避免漏掉机会：分散招聘渠道容易错过公告。\n"
    md += "3. 提升通过率：节奏感比刷题量更关键。\n\n"
    md += "## 工具建议\n\n"
    md += "本主题相关：**求职雷达**（招聘流程监控）+ **答题悬浮助手**（网页答题 + 个人知识库）。\n\n"
    md += common_cta()
    return md


def render_penguin(topic):
    title = topic['title_other']
    md = f"# {title}\n\n"
    md += f"> {topic['category']} · 约 800 字\n\n"
    md += topic["core"] + "\n\n"
    md += "## 5 个要点\n\n"
    for f in topic["facts"]:
        md += f"- {f}\n"
    md += "\n## 一句话建议\n\n"
    md += f"**{topic['tip']}**\n\n"
    md += "## 工具推荐\n\n"
    md += "求职雷达（watch.quizmate.vip）+ 答题悬浮助手（quizmate.vip），覆盖秋招全流程。\n\n"
    md += common_cta()
    return md


def render_baidu(topic):
    title = topic['title_other']
    md = f"# {title}\n\n"
    md += f"> 主题：{topic['topic']} · 分类：{topic['category']}\n\n"
    md += "## 导语\n\n"
    md += topic["core"] + "\n\n"
    md += "## 一、本文要点\n\n"
    for f in topic["facts"]:
        md += f"- {f}\n"
    md += "\n## 二、详细对比表\n\n"
    # 不同分类用不同的表格
    if topic["category"] == "时间点":
        md += "| 批次 | 时间窗口 | 适用对象 | 建议动作 |\n"
        md += "|------|----------|----------|----------|\n"
        md += "| 提前批 | 5-8 月 | 顶尖学生/技术岗 | 大胆投递练手 |\n"
        md += "| 正式批 | 8-10 月 | 应届生主力 | 集中精力主攻 |\n"
        md += "| 补录批 | 11-12 月 | 未招满岗位 | 跟进进度 + 补投 |\n"
        md += "| 春招 | 次年 3-5 月 | 秋招失利者 | 复盘后二次尝试 |\n\n"
    elif topic["category"] == "流程监控":
        md += "| 阶段 | 动作 | 频率 | 推荐工具 |\n"
        md += "|------|------|------|----------|\n"
        md += "| 信息获取 | 浏览新岗位 | 每日 | 求职雷达 |\n"
        md += "| 简历投递 | 定制化投递 | 每周 5-10 个 | 求职雷达 + 表格 |\n"
        md += "| 笔试准备 | 刷题训练 | 每天 1 套 | 答题悬浮助手 |\n"
        md += "| 面试准备 | 项目复盘 | 面试前 3 天 | 个人知识库 |\n\n"
    elif topic["category"] == "行测题":
        md += "| 模块 | 题量占比 | 难度 | 训练建议 |\n"
        md += "|------|----------|------|----------|\n"
        md += "| 言语理解 | 约 25% | 中等 | 每天 30 题 |\n"
        md += "| 数量关系 | 约 20% | 较难 | 按题型集中刷 |\n"
        md += "| 判断推理 | 约 25% | 中等 | 分题型速解 |\n"
        md += "| 资料分析 | 约 20% | 易提分 | 每天 5 篇 |\n"
        md += "| 常识判断 | 约 10% | 积累型 | 碎片时间记忆 |\n\n"
    elif topic["category"] == "题库":
        md += "| 模块 | 题量建议 | 训练周期 | 检验标准 |\n"
        md += "|------|----------|----------|----------|\n"
        md += "| 基础题型 | 200 题 | 1 周 | 正确率 80% |\n"
        md += "| 进阶题型 | 100 题 | 1 周 | 正确率 70% |\n"
        md += "| 综合训练 | 50 套卷 | 2 周 | 平均 60 分 |\n"
        md += "| 错题归档 | 全部错题 | 持续 | 复盘周期 7 天 |\n\n"
    else:
        md += "| 环节 | 占总成绩 | 应对策略 |\n"
        md += "|------|----------|----------|\n"
        md += "| 通用行测 | 30% | 刷题 + 限速 |\n"
        md += "| 专业题 | 50% | 按岗位准备 |\n"
        md += "| 综合开放题 | 20% | 结构化答题 |\n\n"
    md += "## 三、实操步骤\n\n"
    md += f"**核心建议**：{topic['tip']}\n\n"
    md += "1. **Step 1**：明确目标与方向。\n"
    md += "2. **Step 2**：建立监控清单与跟踪表。\n"
    md += "3. **Step 3**：模块化刷题与定期复盘。\n"
    md += "4. **Step 4**：持续跟进投递进度。\n"
    md += "5. **Step 5**：每周日做整体复盘。\n\n"
    md += "## 四、推荐工具\n\n"
    md += "求职雷达（watch.quizmate.vip）+ 答题悬浮助手（quizmate.vip）。\n\n"
    md += common_cta()
    return md


def render_xhs(topic):
    """小红书：反问安全话术 + 二维码引导 + 配图说明"""
    safe_title = topic['title_zh'].replace("答题悬浮助手", "").replace("求职雷达", "")
    img_path = "xhs_cover.jpg"  # 引用同目录下的图片
    md = f"# {safe_title}\n\n"
    md += f"![{safe_title}]({img_path})\n\n"
    md += "📌 **30 秒看懂这篇**：\n\n"

    # 反问开头（按 category）
    if topic["category"] == "时间点":
        md += f"{topic['topic']}还不知道？\n\n"
        md += "×，不行，错过就只能等明年——秋招的窗口期只有 2 个月，错过没补。\n\n"
        md += "×，不行，光记笔记不够——记到脑子里 ≠ 能落地执行。\n\n"
    elif topic["category"] == "流程监控":
        md += "秋招信息分散在 5-6 个平台，每天切换到眼花？\n\n"
        md += "×，不行，全靠人工盯——错过公告是常态。\n\n"
        md += "×，不行，Excel 表格——只适合小批量，分散信息管不过来。\n\n"
    elif topic["category"] == "行测题":
        md += "行测题刷了一堆，分数还是提不上去？\n\n"
        md += "×，不行，题海战术——没归类等于白刷。\n\n"
        md += "×，不行，只刷不归档——错题反复错。\n\n"
    elif topic["category"] == "题库":
        md += "题库越攒越多，但正确率没提高？\n\n"
        md += "×，不行，堆积题——只增不整理等于没刷。\n\n"
        md += "×，不行，光刷不复盘——知识点漏洞越攒越大。\n\n"
    else:
        md += f"{topic['topic']}还在焦虑怎么应对？\n\n"
        md += "×，不行，光刷题没用——方法不对，事倍功半。\n\n"
        md += "×，不行，光等机会——主动管理才有 Offer。\n\n"

    md += "那到底怎么办？🤔\n\n"
    md += "**这里有解决方案**——而且不止一种。\n\n"
    md += "📋 **核心要点速记**：\n\n"
    for i, f in enumerate(topic["facts"][:4], 1):
        md += f"{i}. {f}\n"
    md += "\n"
    md += f"💡 **一个关键思路**：{topic['tip']}\n\n"
    md += "👆 想更系统的解法？\n\n"
    md += "这里有解决方案，而且不止一种。\n\n"
    md += "想看具体怎么操作，看我主页简介有官网链接。\n\n"
    md += "---\n\n"
    md += "📱 长按上方图片识别二维码，加企业微信咨询\n\n"
    md += f"---\n\n> 完整内容：{WEBSITE_URL}\n"
    return md


def render_douyin(topic):
    """抖音：视频脚本 + 配图"""
    safe_title = topic['title_zh'].replace("答题悬浮助手", "").replace("求职雷达", "")
    img_path = "dy_cover.jpg"  # 引用同目录下的图片
    md = f"# 【抖音脚本】{safe_title}\n\n"
    md += f"![{safe_title}]({img_path})\n\n"
    md += "> ⏱ 时长：约 60 秒 ｜ 形式：口播 + 字幕\n\n"
    md += f"> 📱 长按上方图片识别二维码，加企业微信咨询\n\n"
    md += "## 【场景】\n\n"
    md += "- 出镜：求职博主 / 表情自然 / 简洁背景\n"
    md += "- 设备：手机 + 三脚架 + 补光灯\n\n"
    md += "## 【镜头 1 - 开场 3 秒】\n\n"
    md += f"口播：「同学，秋招{topic['category']}听过吗？」\n\n"
    md += "切镜头，文字：「一文说清」\n\n"
    md += "## 【镜头 2 - 二维码引导 5 秒】\n\n"
    md += "口播：「想看完整版？长按识别下方二维码，加企业微信咨询」\n\n"
    md += "## 【主体 - 30 秒】\n\n"
    md += f"口播：「今天讲：{topic['topic']}」\n\n"
    for i, f in enumerate(topic["facts"][:5], 1):
        md += f"**第 {i} 个要点**：{f}\n\n"
    md += "## 【结尾 - 8 秒】\n\n"
    md += "「想深度了解这套方法，看主页简介有官网链接，一对一咨询。」\n\n"
    md += "（配合指向二维码画面）\n\n"
    md += "## 【字幕/标题】\n\n"
    md += f"**{topic['title_zh']}**  #秋招 #求职 #干货\n\n"
    md += "## 【运营备注】\n\n"
    md += "- 时长控制在 60 秒内\n"
    md += "- 二维码放视频下方购买/评论区置顶\n"
    md += "- 引导关注 + 私信关键词「秋招」\n\n"
    md += f"---\n\n> 完整内容：{WEBSITE_URL}\n"
    return md


RENDERERS = {
    "01_知乎": render_zhihu,
    "02_公众号": render_wechat,
    "03_搜狐号": render_sohu,
    "04_网易号": render_netease,
    "05_头条号": render_toutiao,
    "06_企鹅号": render_penguin,
    "07_百家号": render_baidu,
    "08_小红书": render_xhs,
    "09_抖音": render_douyin,
}


def main():
    start = time.time()
    count = 0
    errors = []

    for platform in PLATFORMS:
        renderer = RENDERERS[platform]
        pdir = os.path.join(BASE_DIR, platform)
        print(f"\n[{platform}]")
        for topic in TOPICS:
            try:
                content = renderer(topic)
                fname = f"{topic['id']:02d}_{topic['topic']}.md"
                save_md(fname, pdir, content)
                count += 1
                print(f"  ✓ {fname}")
            except Exception as e:
                errors.append((platform, topic['id'], str(e)))
                print(f"  ✗ {topic['id']:02d}. {topic['topic']} - ERROR: {e}")

    elapsed = time.time() - start
    print(f"\n{'='*50}")
    print(f"Total: {count}/{len(TOPICS) * len(PLATFORMS)} .md files generated")
    print(f"Elapsed: {elapsed:.1f}s")
    if errors:
        print(f"Errors: {len(errors)}")
        for p, i, e in errors:
            print(f"  {p} #{i}: {e}")
    else:
        print("No errors!")


if __name__ == "__main__":
    main()
