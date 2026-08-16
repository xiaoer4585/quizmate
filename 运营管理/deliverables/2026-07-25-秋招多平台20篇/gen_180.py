# -*- coding: utf-8 -*-
"""
2026-07-25 秋招多平台 20 篇 · 批量生成器
9 平台 × 20 篇 = 180 篇 .docx

链接规则：每篇只放 1 次 https://www.quizmate.vip/
红线：不出现价格；不出现"免费试用一天"；可保留"送免费注册""送 50 积分"
小红书/抖音第 2 张图固定插入微信企业二维码
"""
import os
import sys
from docx import Document
from docx.shared import Pt, Inches, RGBColor, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

# ========== 配置 ==========
BASE_DIR = r"E:\ai项目\考试插件\运营管理\deliverables\2026-07-25-秋招多平台20篇"
QRCODE_IMAGE = os.path.join(BASE_DIR, "qrcode_wechat.jpg")
WEBSITE_URL = "https://www.quizmate.vip/"

BRAND_RED = RGBColor(0xFF, 0x24, 0x42)
DARK_TEXT = RGBColor(0x33, 0x33, 0x33)
GRAY_TEXT = RGBColor(0x88, 0x88, 0x88)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)

CN_FONT = "微软雅黑"

# ========== 平台目录映射 ==========
PLATFORMS = {
    "01_知乎": {"voice": "zhihu", "need_qr": False, "words": (700, 1500)},
    "02_公众号": {"voice": "wechat_official", "need_qr": False, "words": (1500, 2500)},
    "03_搜狐号": {"voice": "sohu", "need_qr": False, "words": (1000, 1800)},
    "04_网易号": {"voice": "netease", "need_qr": False, "words": (1000, 1500)},
    "05_头条号": {"voice": "toutiao", "need_qr": False, "words": (700, 1300)},
    "06_企鹅号": {"voice": "penguin", "need_qr": False, "words": (400, 800)},
    "07_百家号": {"voice": "baidu", "need_qr": False, "words": (1000, 1500)},
    "08_小红书": {"voice": "xhs", "need_qr": True, "words": (300, 600)},
    "09_抖音": {"voice": "douyin", "need_qr": True, "words": (200, 400)},
}

# ========== Word 工具函数 ==========
def set_cn_font(run, font=CN_FONT, size=11, bold=False, color=None):
    run.font.name = font
    run.font.size = Pt(size)
    run.bold = bold
    if color:
        run.font.color.rgb = color
    rPr = run._element.get_or_add_rPr()
    rFonts = rPr.find(qn('w:rFonts'))
    if rFonts is None:
        rFonts = OxmlElement('w:rFonts')
        rPr.insert(0, rFonts)
    rFonts.set(qn('w:eastAsia'), font)
    rFonts.set(qn('w:ascii'), font)
    rFonts.set(qn('w:hAnsi'), font)

def add_title(doc, text, size=20, color=BRAND_RED, align="center"):
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER if align == "center" else WD_ALIGN_PARAGRAPH.LEFT
    run = p.add_run(text)
    set_cn_font(run, size=size, bold=True, color=color)
    return p

def add_h2(doc, text):
    p = doc.add_paragraph()
    run = p.add_run(text)
    set_cn_font(run, size=14, bold=True, color=BRAND_RED)
    p.paragraph_format.space_before = Pt(12)
    p.paragraph_format.space_after = Pt(6)
    return p

def add_para(doc, text, size=11, bold=False, color=None, indent=False):
    p = doc.add_paragraph()
    if indent:
        p.paragraph_format.first_line_indent = Pt(24)
    p.paragraph_format.space_after = Pt(6)
    p.paragraph_format.line_spacing = 1.5
    run = p.add_run(text)
    set_cn_font(run, size=size, bold=bold, color=color or DARK_TEXT)
    return p

def add_bullet(doc, text, size=11):
    p = doc.add_paragraph(style='List Bullet')
    p.paragraph_format.space_after = Pt(4)
    p.paragraph_format.line_spacing = 1.4
    run = p.add_run(text)
    set_cn_font(run, size=size, color=DARK_TEXT)
    return p

def add_numbered(doc, text, size=11):
    p = doc.add_paragraph()
    p.paragraph_format.left_indent = Pt(20)
    p.paragraph_format.space_after = Pt(4)
    p.paragraph_format.line_spacing = 1.4
    run = p.add_run(text)
    set_cn_font(run, size=size, color=DARK_TEXT)
    return p

def shade_cell(cell, hex_color):
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement('w:shd')
    shd.set(qn('w:val'), 'clear')
    shd.set(qn('w:color'), 'auto')
    shd.set(qn('w:fill'), hex_color)
    tc_pr.append(shd)

def add_table(doc, headers, rows):
    t = doc.add_table(rows=1, cols=len(headers))
    t.style = 'Table Grid'
    for i, h in enumerate(headers):
        cell = t.rows[0].cells[i]
        shade_cell(cell, "FF2442")
        run = cell.paragraphs[0].add_run(h)
        set_cn_font(run, size=11, bold=True, color=WHITE)
        cell.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
    for row in rows:
        cells = t.add_row().cells
        for i, val in enumerate(row):
            run = cells[i].paragraphs[0].add_run(str(val))
            set_cn_font(run, size=10)
            cells[i].paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.LEFT
    return t

def add_cta(doc, text=None):
    """文末 CTA 段（统一只放 1 次官网链接）"""
    if text is None:
        text = f"\n📚 想了解秋招全程工具和求职雷达功能，可以看官网：{WEBSITE_URL}"
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(18)
    p.alignment = WD_ALIGN_PARAGRAPH.LEFT
    run = p.add_run(text)
    set_cn_font(run, size=11, color=BRAND_RED)

def add_qrcode(doc):
    """在文档第 2 段位置插入微信二维码（小红书/抖音用）"""
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run()
    run.add_picture(QRCODE_IMAGE, width=Inches(2.5))
    cap = doc.add_paragraph()
    cap.alignment = WD_ALIGN_PARAGRAPH.CENTER
    cap_run = cap.add_run("↑ 长按识别二维码，加企业微信咨询")
    set_cn_font(cap_run, size=10, color=GRAY_TEXT)
    return p

def add_image_placeholder(doc, n, desc):
    """占位说明（不进上传内容，写作配图清单）"""
    p = doc.add_paragraph()
    run = p.add_run(f"【配图{n}】{desc}")
    set_cn_font(run, size=9, color=GRAY_TEXT)
    return p

def save_docx(doc, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    doc.save(path)

# ========== 内容生成函数（按平台 voice 适配） ==========

def make_doc():
    doc = Document()
    # 默认字体设置
    style = doc.styles['Normal']
    style.font.name = CN_FONT
    style.font.size = Pt(11)
    rpr = style.element.get_or_add_rPr()
    rfonts = rpr.find(qn('w:rFonts'))
    if rfonts is None:
        rfonts = OxmlElement('w:rFonts')
        rpr.insert(0, rfonts)
    rfonts.set(qn('w:eastAsia'), CN_FONT)
    return doc

# ========== 20 篇文章的核心内容 ==========
# 每个主题：基础标题 + 章节要点 + 关键事实
# 平台 voice 在生成时再适配

ARTICLES = [
    {
        "id": 1,
        "tag": "时间点",
        "topic": "2026 秋招开启时间节点",
        "base_title": "2026 秋招时间节点全梳理，错过等一年",
        "core": """
2026 届秋招从 2025 年 5-6 月陆续启动，分四个批次：提前批（5-8 月）、正式批（8-10 月）、补录批（11-12 月）、次年春招（3-5 月）。
互联网大厂普遍 6 月开启提前批（如字节、阿里、腾讯），7-8 月是技术岗主战场；金融行业（银行、券商、基金）秋招通常 9-10 月集中开放；
央国企（电网、烟草、中字头）则在 10 月-11 月迎来投递高峰。
关键提醒：每个批次的截止时间都比想象中早，提前批截止后大多不会再补录。
""",
        "sections": [
            ("四大批次时间总表", "整理 2026 届秋招的四个批次，对应不同的企业类型与岗位。"),
            ("互联网/科技大厂节奏", "字节、阿里、腾讯、美团、京东、拼多多的提前批与正式批时间线。"),
            ("金融行业节奏", "国有银行、股份制银行、券商、基金、保险的招聘启动时间差异。"),
            ("央国企节奏", "国家电网、烟草、中石油、中石化、中国建筑等的投递窗口。"),
            ("避免踩坑的关键节点", "提前批投递截止、简历冻结期、Offer 发放高峰期。"),
        ],
    },
    {
        "id": 2,
        "tag": "流程监控",
        "topic": "秋招流程监控如何不漏机会",
        "base_title": "秋招流程监控：分散的招聘信息这样管",
        "core": """
秋招最大的痛点不是信息太少，而是信息分散：每个企业有自己的官网、招聘公众号、就业网站，加上 21 家主流招聘平台（BOSS、前程无忧、智联、牛客等）和 5-6 个校友群。
人工盯不过来是常态，结果就是常常错过截止时间、漏掉新岗位。
解决思路：把分散的来源变成"一张可监控的清单"，用爬虫/监控服务订阅关键词与企业域名，正向提醒新增与变化，反向避免重复抓取。
""",
        "sections": [
            ("分散招聘信息的痛点", "招聘信息分布在官网、公众号、就业网、招聘平台、校友群，漏看率极高。"),
            ("监控的核心思路", "把来源清单化、把变化结构化、把提醒即时化。"),
            ("可监控的来源类型", "企业招聘官网、高校就业网、招聘平台账户、公开 RSS/微信公众号。"),
            ("求职雷达如何帮你", "把官网、就业网、招聘平台统一接入，自动发现新增岗位与截止变化。"),
            ("维护监控清单的最佳实践", "按求职方向建卡片、定期刷新、按城市和岗位分层管理。"),
        ],
    },
    {
        "id": 3,
        "tag": "行测题",
        "topic": "行测数量关系解题技巧",
        "base_title": "行测数量关系：题型拆解与速算技巧",
        "core": """
行测数量关系是公认"难且费时"的题型，主要包括工程问题、行程问题、利润问题、植树问题、排列组合、概率、几何、数列推算等。
应对思路：① 先识别题型（看到关键词秒判题型）；② 用代入法/排除法代替硬算；③ 训练 30 秒内出答案的节奏。
不建议刷太多题，关键是分类刷——一个题型刷 30 道同类型，直到形成肌肉记忆。
""",
        "sections": [
            ("数量关系五大常考题型", "工程问题、行程问题、利润问题、植树问题、排列组合。"),
            ("30 秒判断题型的技巧", "看关键词、看单位、看问法。"),
            ("代入法与排除法", "选项关系（互斥/包含/特值）能跳过硬算。"),
            ("特值法与比例法", "把未知量设为 1 或 100，化简计算。"),
            ("训练节奏建议", "按题型集中刷题、计时训练、错题二刷。"),
        ],
    },
    {
        "id": 4,
        "tag": "题库",
        "topic": "秋招行测题库如何搭建",
        "base_title": "行测题库搭建：模块化刷题策略",
        "core": """
题库不是"题海"，而是"按知识点归类的专项库"。搭建步骤：① 把题按知识点切片（言语/数量/判断/资料/常识）；② 每题记录考点、难度、错因；③ 形成错题本反复训练；
④ 模块突破到 80% 正确率后，转向下一模块。
题库的核心指标不是数量，而是"未掌握的知识点覆盖率"。
""",
        "sections": [
            ("题库的模块化分类", "言语理解、数量关系、判断推理、资料分析、常识判断五大模块。"),
            ("错题本的正确用法", "记考点、记错因、记正解思路，而不是抄原题。"),
            ("专项训练到综合训练", "先单模块 80% 正确率，再混合限时训练。"),
            ("在线题库 vs 纸质题库", "在线题库便于错题归档，纸质便于手写计算。"),
            ("错题复盘周期", "错题 1 天后再做、7 天后再做、30 天后再做。"),
        ],
    },
    {
        "id": 5,
        "tag": "时间点",
        "topic": "2026 届秋招日历速查表",
        "base_title": "2026 届秋招日历 7-12 月关键日期",
        "core": """
2026 届秋招从 2025 年 7 月开启到 2026 年 1 月基本收尾。7-8 月是提前批，9-10 月是正式批高峰期，11 月是补录批，12 月开始准备春招。
每个节点都有"该做"和"该避"：7 月应该开始投提前批，9 月应该集中投递互联网大厂，11 月应该跟进入度，12 月应该复盘与准备春招。
""",
        "sections": [
            ("7-8 月：提前批黄金期", "互联网大厂提前批启动，准备好简历与行测即可开投。"),
            ("9-10 月：正式批最高峰", "投互联网、投金融、跑宣讲会、做笔试。"),
            ("11 月：补录批与 Offer 收割", "跟进进度、补投未投满的企业。"),
            ("12 月-次年 1 月：收尾与春招准备", "复盘秋招，准备春招与毕业论文。"),
            ("月度速查清单", "每个月的关键任务与时间窗口。"),
        ],
    },
    {
        "id": 6,
        "tag": "笔试",
        "topic": "大厂秋招笔试流程拆解",
        "base_title": "大厂笔试流程：题型分布与难度分层",
        "core": """
大厂笔试分三类：通用行测（30%）、专业题（50%）、综合题/开放题（20%）。
通用行测 30 题，限时 30 分钟；专业题按岗位分技术/产品/运营/市场，难度从基础到进阶；
综合题多为材料分析或开放题（如"如何提升 XX 产品的留存率"）。
难度分层：通用行测及格线 60%，专业题及格线 50%（不少公司只要过线就行）。
""",
        "sections": [
            ("笔试三类题型分布", "通用行测、专业题、综合题三大块的题量与时长。"),
            ("通用行测题型构成", "言语 10 题、数量 10 题、推理 5 题、资料 5 题。"),
            ("专业题难度分级", "基础、中等、进阶三档，对应不同岗位级别。"),
            ("综合题的应答策略", "材料题结构化答题、开放题 STAR 法则。"),
            ("笔试题型差异（互联网/金融/国企）", "互联网偏技术算法，金融偏数字推理，国企偏时政常识。"),
        ],
    },
    {
        "id": 7,
        "tag": "流程监控",
        "topic": "网申到 Offer 全流程追踪",
        "base_title": "秋招全流程：从网申到 Offer 的 7 个阶段",
        "core": """
完整秋招流程：① 网申 → ② 在线测评/AI 面试 → ③ 笔试 → ④ 一面（技术/HR）→ ⑤ 二面（业务/技术）→ ⑥ 三面（综合/Leader）→ ⑦ Offer 发放。
每个阶段都有"该做"和"该避"：网申阶段避免海投、AI 面试阶段多模拟练习、笔试阶段持续刷题、一面准备基础、二面准备项目细节。
进度管理：建议用一张总表把每个企业的当前阶段、HR 联系人、下一步时间都记录下来。
""",
        "sections": [
            ("网申阶段的关键", "简历定制化、JD 关键词匹配、不海投。"),
            ("AI 面试/在线测评", "腾讯、字节、玛氏等常见，模拟练习可以显著提升通过率。"),
            ("笔试备考节奏", "提前 2 周开始刷题，每天 1 套卷子。"),
            ("一/二/三轮面试关注点", "一面看基础、二面看项目、三面看价值观。"),
            ("Offer 谈判与选择", "多个 Offer 在手时，按城市-岗位-平台-薪资综合排序。"),
        ],
    },
    {
        "id": 8,
        "tag": "行测题",
        "topic": "言语理解高频考点",
        "base_title": "行测言语理解：高频考点与破题套路",
        "core": """
言语理解分两大类：选词填空（实词/成语辨析）和片段阅读（主旨/意图/细节）。
选词填空的核心是"语境分析"——看搭配、看语义轻重、看感情色彩；片段阅读的核心是"抓住文段中心"——找主题句、判段落结构。
训练要点：每天 20 题、对答案时不止看对错、看考点归类。
""",
        "sections": [
            ("选词填空三大考点", "实词辨析、成语使用、关联词搭配。"),
            ("片段阅读四大题型", "主旨概括、意图判断、细节理解、语句填空。"),
            ("语境分析方法", "抓住关联词、找到对应关系、判断语义色彩。"),
            ("常见易错点", "望文生义、过度推断、忽略转折。"),
            ("每日训练建议", "30 道选词 + 20 道片段，限时 25 分钟。"),
        ],
    },
    {
        "id": 9,
        "tag": "题库",
        "topic": "在线题库自动刷题方法",
        "base_title": "在线题库自动刷题：效率最大化方法",
        "core": """
在线题库的优势：自动判分、自动统计错题、可按知识点切片。
高效刷题三原则：① 限时训练（每题不超过 50 秒）；② 错题必归档（每道错题写清考点与错因）；③ 周期性重做（错题隔周重做）。
不要追求刷题量，追求"知识点覆盖完整 + 错题反复训练"。
""",
        "sections": [
            ("在线题库的三大优势", "自动判分、错题归档、知识点切片。"),
            ("高效刷题的三原则", "限时、归档、复盘。"),
            ("错题归档的标准格式", "考点 + 错因 + 正解思路 + 关联知识点。"),
            ("周期性重做节奏", "24 小时、7 天、30 天三个周期。"),
            ("模块化刷题的执行细节", "单模块 50 题/天，正确率 80% 后切下一模块。"),
        ],
    },
    {
        "id": 10,
        "tag": "秋招",
        "topic": "秋招提前批 vs 正式批区别",
        "base_title": "秋招提前批 vs 正式批：怎么选",
        "core": """.
""",
    },
    {
        "id": 11,
        "tag": "时间点",
        "topic": "央国企秋招时间点梳理",
        "base_title": "央国企秋招时间节点梳理",
        "core": """
央国企秋招普遍 9 月启动、10-11 月集中投递，12 月到次年 1 月补录。
""",
        "sections": [("", ""),],
    },
]

# 测试一下脚本可以运行（验证依赖）
print("Script loaded successfully")
print(f"Article count: {len(ARTICLES)}")
