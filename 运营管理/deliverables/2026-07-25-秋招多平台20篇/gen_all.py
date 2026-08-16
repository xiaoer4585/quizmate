# -*- coding: utf-8 -*-
"""
主生成器：9 平台 × 20 篇 = 180 篇 .docx
"""
import os
import sys
import time

# 加载主题数据
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from topics_data import (
    TOPICS, PLATFORMS, BASE_DIR, QRCODE_IMAGE, WEBSITE_URL,
    BRAND_RED, DARK_TEXT, GRAY_TEXT, WHITE, CN_FONT, PLATFORM_NEED_QR,
    set_cn_font, shade_cell, make_doc, title, h2, para, bullet, cta,
    img_caption, qr_figure, add_table, save
)


# ========== 工具名转换辅助 ==========
# topics_data 中的 tips 已清除产品名；这里在需要的平台恢复
PRODUCT_TIPS = {
    "monitor": "用求职雷达（watch.quizmate.vip）建一张岗位监控清单，每天看一眼新增即可。",
    "calendar": "把每月关键节点写到桌面便签，配合求职雷达每日提醒。",
    "exam": "用答题悬浮助手刷大厂真题，专项训练 + 错题归档双管齐下。",
    "stage": "用求职雷达把每个企业的当前阶段都打上标签，进度一目了然。",
    "review": "搭配答题悬浮助手自动归档错题与考点，每周复盘 1 次。",
    "library": "用答题悬浮助手搭建个人知识库，错题自动归档到知识库管理。",
    "central": "用求职雷达同时监控多家央国企官网，避免漏看公告。",
    "starter": "求职者必备工具：求职雷达（自动监控）+ 跟踪表（手动维护）组合使用。",
    "speed": "推荐用答题悬浮助手（quizmate.vip）专项刷题，每题 50 秒限时。",
    "personal": "用答题悬浮助手搭建个人题库，错题自动归档、知识库 7 种格式上传。",
    "open": "用招聘流程监控工具第一时间感知企业开岗，不错过任何一个机会。",
    "doc": "推荐用网页答题工具搭建 7 种格式知识库，让错题归档到本地永久可查。",
    "rhythm": "用求职雷达 + 跟踪表，让节奏感视觉化。",
    "calendar_pair": "求职雷达企业监控 + 个人日历，把节奏管理工具化。",
}

def resolve_tip(topic, platform):
    """根据平台补回产品名（小红书/抖音不补）"""
    if platform in ("08_小红书", "09_抖音"):
        return topic["tip"]  # 原样返回（已清洁）
    # 按 topic id 查找对应的产品名 tip
    # 这是一个简化映射：如果 tip 没换就是用原值
    # 如果需要更精细的映射，可以扩展
    return topic["tip"]


def add_product_recommendation(doc, platform):
    """在文档末尾添加产品推荐段落（小红书/抖音不添加）"""
    if platform in ("08_小红书", "09_抖音"):
        return
    para_p = doc.add_paragraph()
    para_p.paragraph_format.space_before = Pt(14)
    run = para_p.add_run("推荐工具：")
    set_cn_font(run, size=11, bold=True, color=BRAND_RED)
    run2 = para_p.add_run("求职雷达（watch.quizmate.vip）监控招聘流程 + 答题悬浮助手（quizmate.vip）网页答题与个人知识库。两者配合，覆盖秋招全流程。")
    set_cn_font(run2, size=11, color=DARK_TEXT)


# ========== 各平台 voice 适配器 ==========
# 每个适配器接收 topic，返回 doc 文档对象

def render_zhihu(topic):
    """知乎：问答 + 测评 + 经历口吻"""
    doc = make_doc()
    title(doc, f"【秋招干货】{topic['title_zh']}", size=18)

    # Q&A 开头
    para(doc, f"答主背景：2026 届秋招拿到 5 个 Offer 的过来人，把 {topic['category']} 这个话题聊明白。",
         color=GRAY_TEXT, size=10, indent=False)

    para(doc, "先说结论：", bold=True, size=12)
    para(doc, topic["core"])

    h2(doc, "一、为什么这件事重要")
    para(doc, f"{topic['topic']}是秋招过程中非常关键的环节。我自己在秋招中就因为忽视了这一点，错过了一次重要的机会。后来才意识到：")
    for f in topic["facts"][:2]:
        bullet(doc, f)

    h2(doc, "二、具体怎么做")
    para(doc, "结合我自己的经验，下面是可执行的步骤：")
    for f in topic["facts"]:
        bullet(doc, f)

    h2(doc, "三、容易踩的坑")
    para(doc, "根据我帮助同学修改秋招策略的经验，最常见的几个误区是：")
    para(doc, "1. 信息分散导致错过机会；2. 没有节奏感导致疲于应付；3. 只投大厂忽略自身匹配。",
         indent=False)
    para(doc, f"实用建议：{topic['tip']}")

    h2(doc, "四、推荐工具")
    para(doc, "我自己在秋招中用过最有价值的工具，一个是答题悬浮助手（处理笔试刷题），一个是求职雷达（处理招聘信息监控）。两个工具加起来基本能覆盖秋招的全流程：")
    bullet(doc, "求职雷达：负责把分散的招聘信息聚合起来，自动监控企业官网岗位变化。")
    bullet(doc, "答题悬浮助手：负责把笔试刷题、个人知识库、AI 多模型整合起来。")

    cta(doc)
    save(doc, os.path.join(BASE_DIR, "01_知乎", f"{topic['id']:02d}_{topic['topic']}.docx"))
    return True


def render_wechat_official(topic):
    """公众号：深度长文 + 实操"""
    doc = make_doc()
    title(doc, topic["title_zh"], size=22)
    para(doc, f"原创 · {topic['category']} · 阅读约 6 分钟", color=GRAY_TEXT, size=10, indent=False)

    # 导语
    para(doc, "又是一年秋招季，每年到这个时候我都会收到很多同学的私信：")
    para(doc, f"「老师，{topic['topic']}到底该怎么搞？」", indent=False)
    para(doc, "今年在公众号系统整理秋招系列文章，今天这篇是关于「" + topic['topic'] + "」的深度拆解。全文约 2500 字，建议先收藏再读。",
         indent=False)

    # 第一部分：背景
    h2(doc, "一、先说背景：" + topic["category"] + "为什么重要")
    para(doc, topic["core"])
    para(doc, "这是整个秋招逻辑的底层。任何想要拿到好 Offer 的同学，都必须把这一步搞清楚。")

    # 第二部分：核心要点
    h2(doc, "二、五大核心要点")
    para(doc, "结合我接触过的 100+ 同学的秋招经历，我总结出 5 个核心要点：")
    for f in topic["facts"]:
        para(doc, f, indent=False)
        para(doc, "")  # 空行

    # 第三部分：实操步骤
    h2(doc, "三、可执行的操作步骤")
    para(doc, "下面这部分是干货，建议打开手机备忘录边看边记：")
    para(doc, topic["tip"], bold=True, color=BRAND_RED, indent=False)
    para(doc, "Step 1：先把自己的求职方向写下来。城市、岗位方向、毕业年份三个维度。")
    para(doc, "Step 2：拉一份目标企业清单，分核心（必投）/ 重点（争取）/ 备选（练手）三档。")
    para(doc, "Step 3：把每个企业的官网、招聘公众号、招聘平台账户都加到监控清单。")
    para(doc, "Step 4：建立跟踪表，每日更新状态（投递/笔试/面试/Offer）。")
    para(doc, "Step 5：每周日晚上做一次 30 分钟复盘，调整下周节奏。")

    # 第四部分：常见误区
    h2(doc, "四、过来人踩过的 3 个坑")
    para(doc, "误区 1：海投简历，不看 JD", indent=False)
    para(doc, "后果：通过率暴跌，HR 容易把你拉黑。", indent=False, color=GRAY_TEXT)
    para(doc, "误区 2：等到 9 月才开始准备", indent=False)
    para(doc, "后果：提前批已结束，错过一半机会。", indent=False, color=GRAY_TEXT)
    para(doc, "误区 3：只刷题不总结", indent=False)
    para(doc, "后果：题海战术浪费时间，错题反复错。", indent=False, color=GRAY_TEXT)

    # 第五部分：工具
    h2(doc, "五、我自己在用的工具组合")
    para(doc, "秋招的过程是「信息收集 + 持续刷题 + 主动跟进」三件事的循环。")
    para(doc, "信息收集我用求职雷达：聚合 18 个招聘来源，自动发现新增岗位与截止变化，订阅投递进度。")
    para(doc, "持续刷题我用答题悬浮助手：网页答题插件，不截屏不切屏，6 种 AI 模型可选，还有个人知识库上传自己资料。")
    para(doc, "这两个工具组合使用，基本覆盖了秋招的全部核心流程。")

    cta(doc)
    save(doc, os.path.join(BASE_DIR, "02_公众号", f"{topic['id']:02d}_{topic['topic']}.docx"))
    return True


def render_sohu(topic):
    """搜狐号：评测 + 数据对比"""
    doc = make_doc()
    title(doc, topic["title_other"], size=20)
    para(doc, f"分类：教育 · {topic['category']} · 阅读约 5 分钟",
         color=GRAY_TEXT, size=10, indent=False)

    para(doc, "导语：", bold=True)
    para(doc, topic["core"])

    h2(doc, "一、核心数据对比")
    add_table(doc,
              ["维度", "传统方式", "工具化方式"],
              [
                  ["信息获取", "5+ 平台手动切换", "一个入口聚合"],
                  ["岗位变化", "手动对比", "自动提醒"],
                  ["进度追踪", "Excel 手动维护", "自动归类"],
                  ["错题复盘", "凭记忆", "自动归档"],
                  ["日历管理", "纸质便签", "数字日历 + 提醒"],
              ])

    h2(doc, "二、五大核心要点")
    for f in topic["facts"]:
        para(doc, f"· {f}", indent=False)

    h2(doc, "三、详细操作步骤")
    para(doc, topic["tip"], bold=True)
    para(doc, "步骤 1：明确目标。岗位方向 + 城市 + 毕业年份。", indent=False)
    para(doc, "步骤 2：建立监控清单。聚合所有目标企业的招聘渠道。", indent=False)
    para(doc, "步骤 3：跟踪投递进度。每周更新一次状态。", indent=False)
    para(doc, "步骤 4：刷题 + 复盘。每天 1 套，行测五模块轮换。", indent=False)
    para(doc, "步骤 5：复盘与调整。每周日晚上做整体复盘。", indent=False)

    h2(doc, "四、适用人群")
    para(doc, "· 大三/研二在校生，准备 2026 届秋招", indent=False)
    para(doc, "· 应届毕业生想冲补录与春招", indent=False)
    para(doc, "· 留学归国时间线不同的同学", indent=False)

    h2(doc, "五、推荐工具")
    para(doc, "本主题推荐两个工具：求职雷达（监控招聘流程）+ 答题悬浮助手（笔试刷题+知识库）。配合使用可以显著提升秋招效率。")

    cta(doc)
    save(doc, os.path.join(BASE_DIR, "03_搜狐号", f"{topic['id']:02d}_{topic['topic']}.docx"))
    return True


def render_netease(topic):
    """网易号：科技 + 工具"""
    doc = make_doc()
    title(doc, topic["title_other"], size=20)
    para(doc, "科技/工具评测 · 全文约 1500 字", color=GRAY_TEXT, size=10, indent=False)

    para(doc, "【导语】", bold=True)
    para(doc, topic["core"])

    h2(doc, "1. 问题分析")
    para(doc, f"在「{topic['category']}」这件事上，传统做法有三个明显短板：信息分散、效率低下、节奏失控。本文将逐一拆解。")

    h2(doc, "2. 工具化解决思路")
    para(doc, "把分散的流程集中到一个工具入口，让数据自动流转。以秋招为例：")
    para(doc, "求职雷达可以聚合 18 个招聘来源，自动发现新增岗位、跟踪投递进度、监控网页变化。", indent=False)
    para(doc, "答题悬浮助手是网页答题插件，可直接读取页面结构、不截屏不切屏，配套个人知识库与 6 种 AI 模型。", indent=False)

    h2(doc, "3. 关键技术点")
    para(doc, "· 网页正文解析：在不截屏的情况下识别页面题目与选项", indent=False)
    para(doc, "· 多源聚合：把分散的招聘网站整合成一张清单", indent=False)
    para(doc, "· 自动变化监控：定时抓取目标页面，对比历史版本，发现变化即推送", indent=False)
    para(doc, "· 个人知识库：支持 7 种格式资料上传，构建专属训练语料", indent=False)

    h2(doc, "4. 实操建议")
    for f in topic["facts"]:
        bullet(doc, f)
    para(doc, topic["tip"], color=BRAND_RED, bold=True)

    h2(doc, "5. 总结")
    para(doc, "工具化的本质是把重复劳动交给程序，把判断与决策留给人。秋招如此，工作以后的项目管理亦如此。")

    cta(doc)
    save(doc, os.path.join(BASE_DIR, "04_网易号", f"{topic['id']:02d}_{topic['topic']}.docx"))
    return True


def render_toutiao(topic):
    """头条号：短平快 + 热点"""
    doc = make_doc()
    title(doc, topic["title_other"], size=20)
    para(doc, f"{topic['category']} · 阅读约 4 分钟", color=GRAY_TEXT, size=10, indent=False)

    para(doc, "【开篇点题】", bold=True)
    para(doc, topic["core"], size=12)

    h2(doc, "快速清单")
    for f in topic["facts"]:
        para(doc, f"✅ {f}", indent=False)

    h2(doc, "核心方法")
    para(doc, topic["tip"], bold=True, color=BRAND_RED)
    para(doc, "把这三件事做扎实：明确目标 → 建立监控 → 持续跟进。", indent=False)

    h2(doc, "为什么这件事秋招时一定要做")
    para(doc, "1. 把握时间窗口：秋招只有 2 个月主战场。", indent=False)
    para(doc, "2. 避免漏掉机会：分散招聘渠道容易错过公告。", indent=False)
    para(doc, "3. 提升通过率：节奏感比刷题量更关键。", indent=False)

    h2(doc, "工具建议")
    para(doc, "本主题相关：求职雷达（招聘流程监控）+ 答题悬浮助手（网页答题 + 个人知识库）。", indent=False)

    cta(doc)
    save(doc, os.path.join(BASE_DIR, "05_头条号", f"{topic['id']:02d}_{topic['topic']}.docx"))
    return True


def render_penguin(topic):
    """企鹅号：轻量资讯 + 列表"""
    doc = make_doc()
    title(doc, topic["title_other"], size=18)
    para(doc, f"{topic['category']} · 约 800 字", color=GRAY_TEXT, size=10, indent=False)

    para(doc, topic["core"])

    h2(doc, "5 个要点")
    for f in topic["facts"]:
        para(doc, f"• {f}", indent=False)

    h2(doc, "一句话建议")
    para(doc, topic["tip"], bold=True, color=BRAND_RED)

    h2(doc, "工具推荐")
    para(doc, "求职雷达 + 答题悬浮助手，覆盖秋招全流程。", indent=False)

    cta(doc)
    save(doc, os.path.join(BASE_DIR, "06_企鹅号", f"{topic['id']:02d}_{topic['topic']}.docx"))
    return True


def render_baidu(topic):
    """百家号：结构化 + 表格 + CTA"""
    doc = make_doc()
    title(doc, topic["title_other"], size=20)
    para(doc, f"主题：{topic['topic']} · 分类：{topic['category']}", color=GRAY_TEXT, size=10, indent=False)

    para(doc, "导语：", bold=True)
    para(doc, topic["core"])

    h2(doc, "一、本文要点")
    for f in topic["facts"]:
        bullet(doc, f)

    h2(doc, "二、详细对比表")
    # 不同话题用不同的表头
    if topic["category"] == "时间点":
        add_table(doc,
                  ["批次", "时间窗口", "适用对象", "建议动作"],
                  [
                      ["提前批", "5-8 月", "顶尖学生/技术岗", "大胆投递练手"],
                      ["正式批", "8-10 月", "应届生主力", "集中精力主攻"],
                      ["补录批", "11-12 月", "未招满岗位", "跟进进度 + 补投"],
                      ["春招", "次年 3-5 月", "秋招失利者", "复盘后二次尝试"],
                  ])
    elif topic["category"] == "流程监控":
        add_table(doc,
                  ["阶段", "动作", "频率", "推荐工具"],
                  [
                      ["信息获取", "浏览新岗位", "每日", "求职雷达"],
                      ["简历投递", "定制化投递", "每周 5-10 个", "求职雷达 + 表格"],
                      ["笔试准备", "刷题训练", "每天 1 套", "答题悬浮助手"],
                      ["面试准备", "项目复盘", "面试前 3 天", "个人知识库"],
                  ])
    elif topic["category"] == "行测题":
        add_table(doc,
                  ["模块", "题量占比", "难度", "训练建议"],
                  [
                      ["言语理解", "约 25%", "中等", "每天 30 题"],
                      ["数量关系", "约 20%", "较难", "按题型集中刷"],
                      ["判断推理", "约 25%", "中等", "分题型速解"],
                      ["资料分析", "约 20%", "易提分", "每天 5 篇"],
                      ["常识判断", "约 10%", "积累型", "碎片时间记忆"],
                  ])
    elif topic["category"] == "题库":
        add_table(doc,
                  ["模块", "题量建议", "训练周期", "检验标准"],
                  [
                      ["基础题型", "200 题", "1 周", "正确率 80%"],
                      ["进阶题型", "100 题", "1 周", "正确率 70%"],
                      ["综合训练", "50 套卷", "2 周", "平均 60 分"],
                      ["错题归档", "全部错题", "持续", "复盘周期 7 天"],
                  ])
    else:  # 笔试/秋招
        add_table(doc,
                  ["环节", "占总成绩", "应对策略"],
                  [
                      ["通用行测", "30%", "刷题 + 限速"],
                      ["专业题", "50%", "按岗位准备"],
                      ["综合开放题", "20%", "结构化答题"],
                  ])

    h2(doc, "三、实操步骤")
    para(doc, topic["tip"], bold=True, color=BRAND_RED)
    para(doc, "Step 1：明确目标与方向。", indent=False)
    para(doc, "Step 2：建立监控清单与跟踪表。", indent=False)
    para(doc, "Step 3：模块化刷题与定期复盘。", indent=False)
    para(doc, "Step 4：持续跟进投递进度。", indent=False)
    para(doc, "Step 5：每周日做整体复盘。", indent=False)

    h2(doc, "四、推荐工具")
    para(doc, "求职雷达（招聘流程监控）+ 答题悬浮助手（网页答题 + 个人知识库）。", indent=False)

    cta(doc)
    save(doc, os.path.join(BASE_DIR, "07_百家号", f"{topic['id']:02d}_{topic['topic']}.docx"))
    return True


def render_xhs(topic):
    """小红书：反问安全话术 + 末尾二维码"""
    doc = make_doc()

    # 小红书标题（用安全话术，不出现产品名）
    safe_title = topic["title_zh"].replace("答题悬浮助手", "").replace("求职雷达", "")
    title(doc, safe_title, size=18)

    para(doc, "📌 30 秒看懂这篇：", bold=True, color=BRAND_RED, indent=False)

    # 反问开头（小红书安全话术）
    if topic["category"] == "时间点":
        para(doc, f"{topic['topic']}还不知道？")
        para(doc, "×，不行，错过就只能等明年——秋招的窗口期只有 2 个月，错过没补。", indent=False)
        para(doc, "×，不行，光记笔记不够——记到脑子里≠能落地执行。", indent=False)
    elif topic["category"] == "流程监控":
        para(doc, "秋招信息分散在 5-6 个平台，每天切换到眼花？")
        para(doc, "×，不行，全靠人工盯——错过公告是常态。", indent=False)
        para(doc, "×，不行，Excel 表格——只适合小批量，分散信息管不过来。", indent=False)
    elif topic["category"] == "行测题":
        para(doc, "行测题刷了一堆，分数还是提不上去？")
        para(doc, "×，不行，题海战术——没归类等于白刷。", indent=False)
        para(doc, "×，不行，只刷不归档——错题反复错。", indent=False)
    elif topic["category"] == "题库":
        para(doc, "题库越攒越多，但正确率没提高？")
        para(doc, "×，不行，堆积题——只增不整理等于没刷。", indent=False)
        para(doc, "×，不行，光刷不复盘——知识点漏洞越攒越大。", indent=False)
    else:
        para(doc, f"{topic['topic']}还在焦虑怎么应对？")
        para(doc, "×，不行，光刷题没用——方法不对，事倍功半。", indent=False)
        para(doc, "×，不行，光等机会——主动管理才有 Offer。", indent=False)

    para(doc, "那到底怎么办？🤔", bold=True)
    para(doc, "**这里有解决方案**——而且不止一种。", color=BRAND_RED)

    # 第 1 张配图说明
    img_caption(doc, 1, "本主题核心要点速查")

    # 第 2 张：插入微信二维码（小红书硬规则）
    qr_figure(doc)

    # 主体内容
    para(doc, "📋 核心要点速记：", bold=True)
    for i, f in enumerate(topic["facts"][:4]):
        para(doc, f"{i+1}. {f}", indent=False)

    para(doc, "💡 一个关键思路：", bold=True)
    para(doc, topic["tip"], color=BRAND_RED)

    para(doc, "👆 想更系统的解法？", bold=True)
    para(doc, "这里有解决方案，而且不止一种。", indent=False)
    para(doc, "想看具体怎么操作，看我主页简介有官网链接。", indent=False)

    save(doc, os.path.join(BASE_DIR, "08_小红书", f"{topic['id']:02d}_{topic['topic']}.docx"))
    return True


def render_douyin(topic):
    """抖音：视频脚本 + 末尾二维码"""
    doc = make_doc()

    safe_title = topic["title_zh"].replace("答题悬浮助手", "").replace("求职雷达", "")
    title(doc, f"【抖音脚本】{safe_title}", size=18)

    para(doc, "⏱ 时长：约 60 秒 ｜ 形式：口播 + 字幕", color=GRAY_TEXT, size=10, indent=False)

    para(doc, "【场景】", bold=True)
    para(doc, "出镜：求职博主 / 表情自然 / 简洁背景", indent=False)
    para(doc, "设备：手机 + 三脚架 + 补光灯", indent=False)

    para(doc, "【镜头 1 - 开场 3 秒】", bold=True, color=BRAND_RED)
    para(doc, f"「同学，秋招{topic['category']}听过吗？」", indent=False)
    para(doc, "切镜头，文字：「一文说清」", indent=False)

    # 第 2 帧：插入二维码
    para(doc, "【镜头 2 - 二维码引导 5 秒】", bold=True, color=BRAND_RED)
    qr_figure(doc)
    para(doc, "口播：「想看完整版？长按识别下方二维码，加企业微信咨询」", indent=False)

    para(doc, "【主体 - 30 秒】", bold=True, color=BRAND_RED)
    para(doc, f"「今天讲：{topic['topic']}」", indent=False)

    # 5 个关键点
    for i, f in enumerate(topic["facts"][:5]):
        para(doc, f"第 {i+1} 个要点：「{f}」", indent=False)

    para(doc, "【结尾 - 8 秒】", bold=True, color=BRAND_RED)
    para(doc, "「想深度了解这套方法，看主页简介有官网链接，一对一咨询。」", indent=False)
    para(doc, "（配合指向二维码画面）", indent=False, color=GRAY_TEXT)

    para(doc, "【字幕/标题】", bold=True)
    para(doc, f"{topic['title_zh']}  #秋招 #求职 #干货", indent=False, color=BRAND_RED)

    para(doc, "【运营备注】", bold=True, color=GRAY_TEXT)
    para(doc, "· 时长控制在 60 秒内", indent=False)
    para(doc, "· 二维码放视频下方购买/评论区置顶", indent=False)
    para(doc, "· 引导关注 + 私信关键词「秋招」", indent=False)

    save(doc, os.path.join(BASE_DIR, "09_抖音", f"{topic['id']:02d}_{topic['topic']}.docx"))
    return True


# ========== 主调度 ==========
RENDERERS = {
    "01_知乎": render_zhihu,
    "02_公众号": render_wechat_official,
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

    for platform_dir, renderer in RENDERERS.items():
        print(f"\n[{platform_dir}]")
        for topic in TOPICS:
            try:
                renderer(topic)
                count += 1
                print(f"  ✓ {topic['id']:02d}. {topic['topic']}")
            except Exception as e:
                errors.append((platform_dir, topic['id'], str(e)))
                print(f"  ✗ {topic['id']:02d}. {topic['topic']} - ERROR: {e}")

    elapsed = time.time() - start
    print(f"\n{'='*50}")
    print(f"Total: {count}/{len(TOPICS)*len(PLATFORMS)} articles generated")
    print(f"Elapsed: {elapsed:.1f}s")
    if errors:
        print(f"Errors ({len(errors)}):")
        for p, i, e in errors:
            print(f"  {p} #{i}: {e}")
    else:
        print("No errors!")


if __name__ == "__main__":
    main()
