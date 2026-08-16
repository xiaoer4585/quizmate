# -*- coding: utf-8 -*-
"""
2026-07-25 秋招多平台 20 篇 · 批量生成器
9 平台 × 20 篇 = 180 篇 .docx（每篇仅含上传内容本身，不混入标签/评论/元信息）

链接规则：每篇只放 1 次 https://www.quizmate.vip/
红线：不出现价格；不出现"免费试用一天"；可保留"送免费注册""送 50 积分"
小红书/抖音第 2 段固定插入微信企业二维码图片
"""
import os
import sys
from docx import Document
from docx.shared import Pt, Inches, RGBColor
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

PLATFORMS = ["01_知乎", "02_公众号", "03_搜狐号", "04_网易号",
             "05_头条号", "06_企鹅号", "07_百家号", "08_小红书", "09_抖音"]

PLATFORM_NEED_QR = {"08_小红书", "09_抖音"}

# ========== Word 工具 ==========
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

def shade_cell(cell, hex_color):
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement('w:shd')
    shd.set(qn('w:val'), 'clear')
    shd.set(qn('w:color'), 'auto')
    shd.set(qn('w:fill'), hex_color)
    tc_pr.append(shd)

def make_doc():
    doc = Document()
    style = doc.styles['Normal']
    style.font.name = CN_FONT
    style.font.size = Pt(11)
    rpr = style.element.get_or_add_rPr()
    rfonts = rpr.find(qn('w:rFonts'))
    if rfonts is None:
        rfonts = OxmlElement('w:rFonts')
        rpr.insert(0, rfonts)
    rfonts.set(qn('w:eastAsia'), CN_FONT)
    rfonts.set(qn('w:ascii'), CN_FONT)
    rfonts.set(qn('w:hAnsi'), CN_FONT)
    return doc

def title(doc, text, size=20, color=BRAND_RED, center=True):
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER if center else WD_ALIGN_PARAGRAPH.LEFT
    run = p.add_run(text)
    set_cn_font(run, size=size, bold=True, color=color)
    p.paragraph_format.space_after = Pt(12)
    return p

def h2(doc, text):
    p = doc.add_paragraph()
    run = p.add_run("▎" + text)
    set_cn_font(run, size=14, bold=True, color=BRAND_RED)
    p.paragraph_format.space_before = Pt(14)
    p.paragraph_format.space_after = Pt(6)
    return p

def para(doc, text, size=11, bold=False, color=None, indent=True):
    p = doc.add_paragraph()
    if indent:
        p.paragraph_format.first_line_indent = Pt(24)
    p.paragraph_format.space_after = Pt(6)
    p.paragraph_format.line_spacing = 1.6
    run = p.add_run(text)
    set_cn_font(run, size=size, bold=bold, color=color or DARK_TEXT)
    return p

def bullet(doc, text, size=11):
    p = doc.add_paragraph(style='List Bullet')
    p.paragraph_format.space_after = Pt(4)
    p.paragraph_format.line_spacing = 1.4
    run = p.add_run(text)
    set_cn_font(run, size=size, color=DARK_TEXT)
    return p

def cta(doc, text=None):
    if text is None:
        text = f"📚 完整功能与下载：{WEBSITE_URL}"
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(18)
    run = p.add_run(text)
    set_cn_font(run, size=11, color=BRAND_RED, bold=True)
    return p

def img_caption(doc, n, desc):
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run(f"【配图 {n}】{desc}")
    set_cn_font(run, size=9, color=GRAY_TEXT)
    return p

def qr_figure(doc):
    """插入二维码图片（小红书/抖音专用，第 2 段位置）"""
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run()
    run.add_picture(QRCODE_IMAGE, width=Inches(2.5))
    cap = doc.add_paragraph()
    cap.alignment = WD_ALIGN_PARAGRAPH.CENTER
    cap_run = cap.add_run("↑ 长按识别二维码 · 加企业微信咨询")
    set_cn_font(cap_run, size=10, color=GRAY_TEXT)
    return p

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

def save(doc, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    doc.save(path)


# ========== 20 个主题的核心内容 ==========
# 每篇包含：核心事实 + 章节大纲（适配器按平台重组这些数据）

TOPICS = [
    {
        "id": 1,
        "category": "时间点",
        "topic": "2026 秋招开启时间节点",
        "title_zh": "2026 秋招时间节点全梳理：错过等一年",
        "title_other": "2026 秋招开启时间节点总览",
        "core": "2026 届秋招分四个批次：提前批（5-8 月）、正式批（8-10 月）、补录批（11-12 月）、春招（次年 3-5 月）。互联网大厂 6 月开启提前批，8-10 月是技术岗主战场；金融行业 9-10 月集中开放；央国企 10-11 月迎来投递高峰。每个批次截止时间都比想象中早，提前批截止后大多不会再补录。",
        "facts": [
            "提前批（5-8 月）：字节/阿里/腾讯等大厂启动早，6 月集中开岗。",
            "正式批（8-10 月）：互联网全线、金融启动、央国企启动。",
            "补录批（11-12 月）：未招满岗位补招，竞争与秋招主战场相当。",
            "Offer 发放高峰（10-12 月）：集中在这一时段发放意向。",
            "次年春招（3-5 月）：秋招失利者的二次机会，但岗位少。",
        ],
        "tip": "建议 7 月前完成简历，7 月开投提前批，9 月集中投正式批。"
    },
    {
        "id": 2,
        "category": "流程监控",
        "topic": "秋招流程监控如何不漏机会",
        "title_zh": "秋招流程监控：分散招聘信息这样管",
        "title_other": "秋招流程监控如何不漏掉机会",
        "core": "秋招最大的痛点不是信息太少，而是信息分散：企业招聘官网、招聘公众号、就业网站，加上 5-6 个招聘平台和校友群，人工盯不过来。解决思路：把分散来源变成一张可监控清单，用工具持续跟踪企业岗位变化，按关键词与域名订阅，一旦有新岗位或截止变化立即提醒。",
        "facts": [
            "招聘信息分散在：企业官网、招聘公众号、就业网站、BOSS 等平台。",
            "人工监控的痛点：错过截止日、漏掉新岗位、重复看同一岗位。",
            "监控的关键能力：来源汇总、关键词匹配、新增提醒、截止预警。",
            "招聘流程监控工具的解决路径：把多来源接入，自动发现新增与截止变化。",
            "维护节奏：每周刷新一次监控清单，每月清理已投递岗位。",
        ],
        "tip": "用招聘流程监控工具建一张岗位监控清单，每天看一眼新增即可。"
    },
    {
        "id": 3,
        "category": "行测题",
        "topic": "行测数量关系解题技巧",
        "title_zh": "行测数量关系：题型拆解与速算技巧",
        "title_other": "行测数量关系解题技巧汇总",
        "core": "行测数量关系公认难且费时，主要包括工程问题、行程问题、利润问题、植树问题、排列组合、概率、几何、数列。应对思路：先识别题型（关键词秒判）、用代入法代替硬算、训练 30 秒内出答案的节奏。一个题型集中刷 30 道同类题，直到形成肌肉记忆。",
        "facts": [
            "工程问题：核心公式 工作量 = 效率 × 时间，找单位统一。",
            "行程问题：相遇追及公式、比例法、画图直观。",
            "利润问题：成本/售价/利润/折扣的关系转换。",
            "植树问题：单边/双边/环形/楼层的端点处理。",
            "排列组合：分类相加、分步相乘，特殊题型用捆绑/插空/隔板。",
        ],
        "tip": "推荐用网页答题工具（支持 6 种 AI 模型切换）专项刷题，每题 50 秒限时。"
    },
    {
        "id": 4,
        "category": "题库",
        "topic": "秋招行测题库如何搭建",
        "title_zh": "行测题库搭建：模块化刷题策略",
        "title_other": "秋招行测题库如何搭建",
        "core": "题库不是题海，而是按知识点归类的专项库。搭建步骤：把题按模块切片（言语/数量/判断/资料/常识）、记录每题考点与错因、形成错题本反复训练、模块突破到 80% 正确率后切换。题库的核心指标不是数量，而是未掌握知识点的覆盖率。",
        "facts": [
            "五模块切分：言语、数量、判断、资料、常识。",
            "错题三要素：考点、错因、正解思路，比抄原题重要。",
            "训练节奏：单模块 50 题/天，80% 正确率后切下个模块。",
            "复盘周期：错题隔 1 天再做，隔 7 天再做，隔 30 天再做。",
            "在线题库优势：自动判分、错题归档、知识点切片。",
        ],
        "tip": "用网页答题工具搭建个人题库，错题自动归档、知识库支持 7 种格式上传。"
    },
    {
        "id": 5,
        "category": "时间点",
        "topic": "2026 届秋招日历速查表",
        "title_zh": "2026 届秋招日历 7-12 月关键日期速查",
        "title_other": "2026 届秋招日历速查表",
        "core": "2026 届秋招从 2025 年 7 月开启到 2026 年 1 月基本收尾。7-8 月提前批，9-10 月正式批高峰，11 月补录批，12 月开始准备春招。每个节点都有该做与该避：7 月准备提前批，9 月集中投递互联网，11 月跟进入度，12 月复盘与准备春招。",
        "facts": [
            "7-8 月：互联网提前批启动，准备好简历与行测即可开投。",
            "9-10 月：正式批最高峰，跑宣讲会、做笔试、投互联网金融。",
            "11 月：补录批与 Offer 收割，跟进投递进度、补投未满企业。",
            "12-次年 1 月：复盘秋招，准备春招与毕业论文。",
            "月度速查清单：每个月的关键任务与时间窗口提前列好。",
        ],
        "tip": "把每月关键节点写到桌面便签，配合招聘流程监控工具每日提醒。"
    },
    {
        "id": 6,
        "category": "笔试",
        "topic": "大厂秋招笔试流程拆解",
        "title_zh": "大厂笔试流程：题型分布与难度分层",
        "title_other": "大厂秋招笔试流程拆解",
        "core": "大厂笔试分三类：通用行测（30%）、专业题（50%）、综合开放题（20%）。通用行测 30 题限时 30 分钟；专业题按岗位分技术/产品/运营/市场，难度从基础到进阶；综合题多为材料分析或开放题（如如何提升 XX 产品的留存率）。难度分层：通用行测及格线 60%，专业题及格线 50%。",
        "facts": [
            "通用行测 30 题：言语 10 + 数量 10 + 推理 5 + 资料 5。",
            "专业题按岗位：技术偏算法、产品偏案例分析、运营偏业务理解。",
            "综合题应答：材料题结构化答题、开放题 STAR 法则。",
            "互联网大厂题型偏技术，金融偏数字推理，国企偏时政常识。",
            "刷题节奏：每类题型每天 30 道，限时 30 分钟。",
        ],
        "tip": "用网页答题工具刷大厂真题，专项训练 + 错题归档双管齐下。"
    },
    {
        "id": 7,
        "category": "流程监控",
        "topic": "网申到 Offer 全流程追踪",
        "title_zh": "秋招全流程：从网申到 Offer 的 7 个阶段",
        "title_other": "秋招全流程：从网申到 Offer 的 7 个阶段",
        "core": "完整秋招流程：网申 → 在线测评/AI 面试 → 笔试 → 一面 → 二面 → 三面 → Offer 发放。每个阶段都有该做与该避：网申阶段避免海投、AI 面试阶段多模拟练习、笔试阶段持续刷题、一面准备基础、二面准备项目细节。进度管理：用一张总表跟踪每个企业的当前阶段、HR 联系人、下一步时间。",
        "facts": [
            "网申阶段：简历定制化、JD 关键词匹配、不海投。",
            "AI 面试/在线测评：腾讯/字节/玛氏等常见，模拟练习显著提升通过率。",
            "笔试备考节奏：提前 2 周开始刷题，每天 1 套卷子。",
            "一/二/三轮面试关注点：一面看基础、二面看项目、三面看价值观。",
            "Offer 谈判与选择：按城市-岗位-平台-薪资综合排序。",
        ],
        "tip": "用招聘流程监控工具把每个企业的当前阶段都打上标签，进度一目了然。"
    },
    {
        "id": 8,
        "category": "行测题",
        "topic": "言语理解高频考点",
        "title_zh": "行测言语理解：高频考点与破题套路",
        "title_other": "行测言语理解高频考点",
        "core": "言语理解分两大类：选词填空（实词/成语辨析）和片段阅读（主旨/意图/细节）。选词填空核心是语境分析，片段阅读核心是抓文段中心。训练要点：每天 20 题、对答案时不止看对错、看考点归类。常见易错点：望文生义、过度推断、忽略转折。",
        "facts": [
            "选词填空三大考点：实词辨析、成语使用、关联词搭配。",
            "片段阅读四大题型：主旨概括、意图判断、细节理解、语句填空。",
            "语境分析三步骤：抓关联词、找对应关系、判断语义色彩。",
            "常见易错点：望文生义、过度推断、忽略转折、忽略代词。",
            "每日训练建议：30 道选词 + 20 道片段，限时 25 分钟。",
        ],
        "tip": "搭配网页答题工具自动归档错题与考点，每周复盘 1 次。"
    },
    {
        "id": 9,
        "category": "题库",
        "topic": "在线题库自动刷题方法",
        "title_zh": "在线题库自动刷题：效率最大化方法",
        "title_other": "在线题库自动刷题方法",
        "core": "在线题库三大优势：自动判分、自动统计错题、按知识点切片。高效刷题三原则：限时训练、错题必归档、周期性重做。不要追求刷题量，追求知识点覆盖完整 + 错题反复训练。推荐节奏：单模块 50 题/天，错题隔天+隔周+隔月重做。",
        "facts": [
            "在线题库三大优势：自动判分、错题归档、知识点切片。",
            "高效三原则：限时、归档、复盘，缺一不可。",
            "错题归档格式：考点 + 错因 + 正解思路 + 关联知识点。",
            "周期性重做节奏：24 小时、7 天、30 天三个周期。",
            "模块化刷题执行：单模块 50 题/天，正确率 80% 后切下一模块。",
        ],
        "tip": "用网页答题工具搭建个人知识库，错题自动归档到知识库管理。"
    },
    {
        "id": 10,
        "category": "秋招",
        "topic": "秋招提前批 vs 正式批区别",
        "title_zh": "秋招提前批 vs 正式批：策略选择",
        "title_other": "秋招提前批 vs 正式批区别",
        "core": "提前批（5-8 月）是部分大厂的预招阶段，多为内推或定向，质量高、竞争小，但岗位少。正式批（8-10 月）是主战场，岗位多、竞争激烈。投递策略：提前批可大胆尝试（竞争小 + 多一次机会），正式批要更精准（JD 匹配 + 简历优化）。",
        "facts": [
            "提前批：5-8 月启动，部分大厂的内推或定向招聘。",
            "正式批：8-10 月启动，所有岗位开放，秋招主战场。",
            "投递节奏：提前批可海投积累面试经验。",
            "正式批要精准：JD 关键词匹配 + 简历定制。",
            "补录批：11-12 月，未招满岗位的二次机会。",
        ],
        "tip": "提前批先练手积累经验，正式批主攻心仪大厂。"
    },
    {
        "id": 11,
        "category": "时间点",
        "topic": "央国企秋招时间点梳理",
        "title_zh": "央国企秋招时间节点梳理",
        "title_other": "央国企秋招时间点",
        "core": "央国企秋招普遍 9 月启动、10-11 月集中投递，12 月到次年 1 月补录。央国企笔试偏时政、行测、公文写作，部分需要考专业知识。央企（国家电网、中石油、中石化等）通常有全国统考；地方国企（各省市城投、国资集团）招聘时间点更分散。",
        "facts": [
            "国家电网：通常 11 月统考，分两批，每批招聘人数可观。",
            "烟草系统：每年 4 月与 11 月两次集中招聘。",
            "中石油/中石化：9-10 月启动，笔试考行测+英语+综合。",
            "中国建筑、中国交建等中字头：8 月开始，10 月截止。",
            "地方国企：时间点更分散，需关注当地国资委发布的招聘。",
        ],
        "tip": "用招聘流程监控工具同时监控多家央国企官网，避免漏看公告。"
    },
    {
        "id": 12,
        "category": "流程监控",
        "topic": "秋招投递跟踪表模板分享",
        "title_zh": "秋招投递跟踪表模板分享",
        "title_other": "秋招投递跟踪表模板",
        "core": "投递跟踪是秋招的隐形竞争力。一张好的跟踪表需要：企业、岗位、投递时间、当前阶段、下一步时间、HR 联系人、备注。建议用 Excel/飞书表格管理，每日更新；进阶玩法是用招聘流程监控工具自动跟踪企业官网岗位变化，结合个人投递状态。",
        "facts": [
            "跟踪表核心字段：企业、岗位、投递时间、当前阶段、下一步时间。",
            "阶段标识：投递/AI 面试/笔试/一面/二面/三面/Offer/拒信。",
            "维护节奏：投递后 1 周未更新要主动跟进 HR。",
            "高阶玩法：招聘流程监控工具自动监控企业官网新增岗位。",
            "复盘价值：秋招复盘时，跟踪数据是最有说服力的材料。",
        ],
        "tip": "求职者必备工具：招聘流程监控工具 + 跟踪表组合使用。"
    },
    {
        "id": 13,
        "category": "笔试",
        "topic": "笔试通用解题套路",
        "title_zh": "笔试通用解题套路：跨题型通用方法",
        "title_other": "笔试通用解题套路",
        "core": "笔试通用方法五步走：① 看题型先判定（秒判考点）；② 看选项先代入（用代入法排除）；③ 看时间先标记（难题跳过）；④ 看材料先勾画（关键数据要标注）；⑤ 看答案先验证（3 遍以上交叉验证）。通用方法适用于行测、专业题与开放题。",
        "facts": [
            "判定题型：先看问法与关键词，秒判考点。",
            "代入法：选项关系（互斥/包含/特值）能跳过硬算。",
            "时间管理：难题标记后跳过，回头再战。",
            "材料题：关键数据勾画出来，避免重复看。",
            "验证环节：做完 30 题至少验证 3 道。",
        ],
        "tip": "练习时严格执行方法套路，形成肌肉记忆后再提速。"
    },
    {
        "id": 14,
        "category": "行测题",
        "topic": "资料分析提速秘籍",
        "title_zh": "行测资料分析：核心题型与提速秘籍",
        "title_other": "行测资料分析提速秘籍",
        "core": "资料分析是行测性价比最高的题型，掌握后正确率可达 90% 以上。核心考点：增长率、比重、平均数、倍数。提速秘籍：① 熟记常见公式（增长率 = 增长量/基期值）；② 学会快速估算（特殊分数 1/7≈14.3%）；③ 训练速算能力（多练除法估算）。",
        "facts": [
            "增长率 = 增长量 / 基期值，速算用特殊分数法。",
            "比重 = 部分 / 总体，速算用截位直除法。",
            "平均数 = 总量 / 个数，速算用削峰填谷法。",
            "倍数关系：A 是 B 的几倍 = A/B。",
            "提速口诀：先看问题、再看材料、勾画数据、对比选项。",
        ],
        "tip": "资料分析是性价比最高的题型，每天 5 篇速算训练。"
    },
    {
        "id": 15,
        "category": "秋招",
        "topic": "2026 届秋招开启节奏",
        "title_zh": "2026 届秋招已经开启：关键节奏",
        "title_other": "2026 届秋招开启节奏",
        "core": "截至 7 月初，2026 届秋招的提前批已陆续开启。字节跳动 6 月开岗、阿里 7 月初、美团 7 月中、京东 7 月初。7-8 月是提前批的主战场，9 月起进入正式批高峰。建议：6 月底前完成简历定稿、7 月初开始投递、9 月前完成 80% 投递目标。",
        "facts": [
            "字节跳动：通常 6 月开岗，技术岗为主。",
            "阿里系（阿里/淘宝/蚂蚁）：7 月初集中开启。",
            "腾讯系：通常 6 月提前批，9 月正式批。",
            "美团/京东：7 月中开始校招提前批。",
            "投递节奏建议：6 月底前完成简历，7 月开投，9 月前 80% 完成。",
        ],
        "tip": "用招聘监控雷达（watch.quizmate.vip）第一时间感知企业开岗，不错过任何一个机会。"
    },
    {
        "id": 16,
        "category": "题库",
        "topic": "个人题库高效刷题法",
        "title_zh": "个人题库高效刷题：从题海到题精",
        "title_other": "个人题库高效刷题法",
        "core": "个人题库的核心是高质量筛选 + 针对性训练。高质量筛选：先把题按难度分层（基础 70%、进阶 20%、挑战 10%）；针对性训练：按错题高频考点重点突破；复盘环节：每周抽 30 分钟对错题做关联分析。题库不是越多越好，是越精越好。",
        "facts": [
            "题库分层：基础 70% + 进阶 20% + 挑战 10%。",
            "针对性训练：按错题高频考点重点突破。",
            "复盘环节：每周 30 分钟对错题做关联分析。",
            "题库建设的三个维度：覆盖度、错题率、复盘频率。",
            "进阶玩家：把个人题库按考点建索引，随时调阅。",
        ],
        "tip": "推荐用网页答题工具搭建 7 种格式知识库，让错题归档到本地永久可查。"
    },
    {
        "id": 17,
        "category": "流程监控",
        "topic": "秋招节奏把控",
        "title_zh": "秋招节奏把控：从投递到 Offer 节奏",
        "title_other": "秋招从投递到 Offer 节奏把控",
        "core": "秋招节奏把控的关键：每周复盘投递进度、及时止损（连续挂掉的同类岗位调整策略）、保持投递节奏（每周 5-10 个新岗位）、Offer 到来前的备选（保持 3 个面试并行）。快到手的 Offer 与进行中的面试合理分配精力。",
        "facts": [
            "每周复盘：投递数、面试数、Offer 数。",
            "止损策略：同类岗位挂 3 次以上，复盘简历或调整方向。",
            "投递节奏：每周 5-10 个新岗位，保稳定增量。",
            "面试并行：保持 3 个进行中面试，避免空窗期。",
            "Offer 决策：手握 2-3 个 Offer 时，按城市-岗位-平台排序。",
        ],
        "tip": "用招聘流程监控工具 + 跟踪表，让节奏感视觉化。"
    },
    {
        "id": 18,
        "category": "笔试",
        "topic": "笔试题型分布盘点",
        "title_zh": "笔试题型盘点：互联网/金融/国企差异",
        "title_other": "笔试题型分布",
        "core": "三大行业笔试题型差异显著：互联网偏重行测+编程题+产品/运营案例分析；金融偏重行测+英语+数字推理；央国企偏重行测+时政+公文写作。求职者应根据目标行业定制刷题策略，盲目刷题效率最低。",
        "facts": [
            "互联网行业：行测 30% + 编程/算法 40% + 案例分析 30%。",
            "金融行业：行测 40% + 英语 20% + 数字推理 20% + 财经知识 20%。",
            "央国企：行测 50% + 时政 20% + 公文写作 20% + 专业 10%。",
            "求职策略调整：根据目标行业调整刷题模块的占比。",
            "多行业投递：建议行测为主、行业专业知识为辅。",
        ],
        "tip": "先确定 1-2 个目标行业，然后专项刷对应模块。"
    },
    {
        "id": 19,
        "category": "行测题",
        "topic": "判断推理破题口诀",
        "title_zh": "行测判断推理：四大题型破题口诀",
        "title_other": "判断推理破题口诀",
        "core": "判断推理分四大题型：图形推理（找规律）、定义判断（抠细节）、类比推理（找关系）、逻辑判断（真假推理）。每类题型的破题口诀：图形找数量、定义抠主语、类比看词项关系、逻辑先翻译后推理。每天 30 题，正确率 80% 即可。",
        "facts": [
            "图形推理：元素数量、位置、样式三大规律。",
            "定义判断：抠主语与关键限定词。",
            "类比推理：词项关系（并列/包含/工具/因果）。",
            "逻辑判断：先翻译（如果/那么），再推理。",
            "每日训练建议：图形 10 + 定义 10 + 类比 5 + 逻辑 5。",
        ],
        "tip": "判断推理是最容易提速的题型，集中训练 2 周可见效。"
    },
    {
        "id": 20,
        "category": "时间点",
        "topic": "秋招时间点错过再等一年",
        "title_zh": "秋招节点错过再等一年",
        "title_other": "秋招时间点错过再等一年",
        "core": "秋招是 9-10 月两个月的窗口期，每个批次的截止时间都比想象中早。提前批截止后不会补招、正式批简历冻结期长达 2-4 周、补录批机会少。建议：建立个人秋招日历、提前 1 个月开始准备、提前批即使不心仪也可练手。",
        "facts": [
            "秋招只有 2 个月窗口期（9-10 月），不能等。",
            "提前批截止后不会再补招，错过就真错过了。",
            "正式批简历冻结期 2-4 周，修改后无法重投。",
            "补录批机会少，且集中度不如正式批。",
            "建立个人秋招日历：把每个企业的时间点都标注好。",
        ],
        "tip": "招聘流程监控工具企业监控 + 个人日历，把节奏管理工具化。"
    },
]

print(f"TOPICS loaded: {len(TOPICS)} topics")
print(f"PLATFORMS: {len(PLATFORMS)} platforms")
print(f"Total articles to generate: {len(TOPICS) * len(PLATFORMS)}")
