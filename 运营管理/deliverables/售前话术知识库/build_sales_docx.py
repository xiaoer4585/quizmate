# -*- coding: utf-8 -*-
"""
答题悬浮助手 - 售前销售话术知识库
按"两种用途兼顾 + 完整版 20 场景"输出 .docx
- Part A: 人话版话术 (20 个售前场景，客服复制即用)
- Part B: 系统喂料版 (Q/A + 标签 + 触发关键词 + 图位规则)
- Part C: 图文系统接入说明 (写给 codex 的技术规则)
"""

from docx import Document
from docx.shared import Pt, Cm, RGBColor, Inches, Emu
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
from docx.enum.table import WD_ALIGN_VERTICAL, WD_ROW_HEIGHT_RULE
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
from PIL import Image
import os

BASE = r"E:\ai项目\考试插件\deliverables\售前话术知识库"
IMG = os.path.join(BASE, "图库")
OUT = os.path.join(BASE, "答题悬浮助手-售前话术知识库-2026-07-12.docx")

# ---- 通用工具函数 ----
def set_font(run, name="Microsoft YaHei", size=10.5, bold=False, color=None):
    run.font.name = name
    run.font.size = Pt(size)
    run.font.bold = bold
    if color:
        run.font.color.rgb = color
    rPr = run._element.get_or_add_rPr()
    rFonts = rPr.find(qn('w:rFonts'))
    if rFonts is None:
        rFonts = OxmlElement('w:rFonts')
        rPr.append(rFonts)
    for attr in ('w:ascii', 'w:hAnsi', 'w:eastAsia', 'w:cs'):
        rFonts.set(qn(attr), name)

def set_para_format(p, space_before=4, space_after=4, line_spacing=1.5, alignment=None,
                    first_line_indent=None, left_indent=None):
    pf = p.paragraph_format
    pf.space_before = Pt(space_before)
    pf.space_after = Pt(space_after)
    pf.line_spacing = line_spacing
    if alignment is not None:
        p.alignment = alignment
    if first_line_indent is not None:
        pf.first_line_indent = first_line_indent
    if left_indent is not None:
        pf.left_indent = left_indent

def add_para(doc, text, size=10.5, bold=False, color=None, alignment=None,
             space_before=2, space_after=2, line_spacing=1.5, first_line_indent=None,
             left_indent=None):
    p = doc.add_paragraph()
    run = p.add_run(text)
    set_font(run, size=size, bold=bold, color=color)
    set_para_format(p, space_before=space_before, space_after=space_after,
                    line_spacing=line_spacing, alignment=alignment,
                    first_line_indent=first_line_indent, left_indent=left_indent)
    return p

def add_h1(doc, text):
    p = doc.add_paragraph()
    r = p.add_run(text)
    set_font(r, size=20, bold=True, color=RGBColor(0x1F, 0x49, 0x7D))
    set_para_format(p, space_before=18, space_after=10, line_spacing=1.3)
    # add outline level
    pPr = p._p.get_or_add_pPr()
    outLvl = OxmlElement('w:outlineLvl'); outLvl.set(qn('w:val'), '0')
    pPr.append(outLvl)
    # bottom border
    pBdr = OxmlElement('w:pBdr')
    bottom = OxmlElement('w:bottom')
    bottom.set(qn('w:val'), 'single')
    bottom.set(qn('w:sz'), '8')
    bottom.set(qn('w:space'), '1')
    bottom.set(qn('w:color'), '1F497D')
    pBdr.append(bottom)
    pPr.append(pBdr)
    return p

def add_h2(doc, text):
    p = doc.add_paragraph()
    r = p.add_run(text)
    set_font(r, size=15, bold=True, color=RGBColor(0x1F, 0x49, 0x7D))
    set_para_format(p, space_before=14, space_after=8, line_spacing=1.3)
    pPr = p._p.get_or_add_pPr()
    outLvl = OxmlElement('w:outlineLvl'); outLvl.set(qn('w:val'), '1')
    pPr.append(outLvl)
    return p

def add_h3(doc, text):
    p = doc.add_paragraph()
    r = p.add_run(text)
    set_font(r, size=12, bold=True, color=RGBColor(0x37, 0x5E, 0x97))
    set_para_format(p, space_before=10, space_after=6, line_spacing=1.3)
    pPr = p._p.get_or_add_pPr()
    outLvl = OxmlElement('w:outlineLvl'); outLvl.set(qn('w:val'), '2')
    pPr.append(outLvl)
    return p

def add_h4(doc, text):
    p = doc.add_paragraph()
    r = p.add_run(text)
    set_font(r, size=11, bold=True, color=RGBColor(0x4F, 0x4F, 0x4F))
    set_para_format(p, space_before=6, space_after=3, line_spacing=1.3)
    return p

def add_quote_block(doc, text, bg_color="F5F7FA"):
    """色块/引用块：用于'核心话术'高亮"""
    p = doc.add_paragraph()
    run = p.add_run(text)
    set_font(run, size=10.5, bold=False, color=RGBColor(0x2A, 0x2A, 0x2A))
    set_para_format(p, space_before=6, space_after=6, line_spacing=1.5,
                    left_indent=Cm(0.4), first_line_indent=Cm(0))
    # 背景色
    pPr = p._p.get_or_add_pPr()
    shd = OxmlElement('w:shd')
    shd.set(qn('w:val'), 'clear')
    shd.set(qn('w:color'), 'auto')
    shd.set(qn('w:fill'), bg_color)
    pPr.append(shd)
    # 左边框
    pBdr = OxmlElement('w:pBdr')
    left = OxmlElement('w:left')
    left.set(qn('w:val'), 'single')
    left.set(qn('w:sz'), '24')
    left.set(qn('w:space'), '4')
    left.set(qn('w:color'), '1F497D')
    pBdr.append(left)
    pPr.append(pBdr)
    return p

def add_image(doc, path, width_cm=14, caption=None):
    """按比例插入图片，自带标题"""
    if not os.path.exists(path):
        return None
    try:
        with Image.open(path) as im:
            w, h = im.size
        aspect = h / w
        width_emu = Cm(width_cm)
        height_emu = Emu(int(width_emu.emu * aspect))
    except Exception:
        width_emu = Cm(width_cm)
        height_emu = Cm(width_cm * 0.6)
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    set_para_format(p, space_before=4, space_after=2, line_spacing=1.2)
    run = p.add_run()
    run.add_picture(path, width=width_emu, height=height_emu)
    if caption:
        add_para(doc, caption, size=9, color=RGBColor(0x80, 0x80, 0x80),
                 alignment=WD_ALIGN_PARAGRAPH.CENTER,
                 space_before=0, space_after=6, line_spacing=1.2)
    return p

def add_table_2col(doc, rows, header=("字段", "内容"), col_widths=(4, 12)):
    """简单两列表格"""
    table = doc.add_table(rows=1 + len(rows), cols=2)
    table.style = 'Table Grid'
    table.autofit = False
    for i, w in enumerate(col_widths):
        for cell in table.columns[i].cells:
            cell.width = Cm(w)
    # header
    h = table.rows[0]
    for i, txt in enumerate(header):
        cell = h.cells[i]
        cell.text = ""
        p = cell.paragraphs[0]
        run = p.add_run(txt)
        set_font(run, size=10.5, bold=True, color=RGBColor(0xFF, 0xFF, 0xFF))
        set_para_format(p, space_before=2, space_after=2, line_spacing=1.2)
        # 背景
        tcPr = cell._tc.get_or_add_tcPr()
        shd = OxmlElement('w:shd')
        shd.set(qn('w:val'), 'clear')
        shd.set(qn('w:color'), 'auto')
        shd.set(qn('w:fill'), '1F497D')
        tcPr.append(shd)
    # body
    for r_idx, row in enumerate(rows):
        tr = table.rows[r_idx + 1]
        for c_idx, txt in enumerate(row):
            cell = tr.cells[c_idx]
            cell.text = ""
            p = cell.paragraphs[0]
            run = p.add_run(str(txt))
            set_font(run, size=10, bold=(c_idx == 0))
            set_para_format(p, space_before=2, space_after=2, line_spacing=1.3)
    return table

def add_kv_block(doc, kv, color_field=False):
    """key:value 行，左字段加粗"""
    for k, v in kv:
        p = doc.add_paragraph()
        r1 = p.add_run(k)
        set_font(r1, size=10, bold=True, color=RGBColor(0x1F, 0x49, 0x7D) if color_field else None)
        r2 = p.add_run("  " + str(v))
        set_font(r2, size=10)
        set_para_format(p, space_before=2, space_after=2, line_spacing=1.4,
                        left_indent=Cm(0.3), first_line_indent=Cm(0))
    return p

def add_image_placeholder(doc, hint):
    """占位图标注——给 codex 用来识别"""
    p = doc.add_paragraph()
    r = p.add_run(f"📌 [图位标记]  {hint}")
    set_font(r, size=9, bold=True, color=RGBColor(0xC0, 0x39, 0x2B))
    set_para_format(p, space_before=2, space_after=2, line_spacing=1.3,
                    left_indent=Cm(0.3), first_line_indent=Cm(0))
    pPr = p._p.get_or_add_pPr()
    shd = OxmlElement('w:shd')
    shd.set(qn('w:val'), 'clear'); shd.set(qn('w:color'), 'auto'); shd.set(qn('w:fill'), 'FFF3E0')
    pPr.append(shd)
    pBdr = OxmlElement('w:pBdr')
    for side in ('top', 'left', 'bottom', 'right'):
        b = OxmlElement(f'w:{side}')
        b.set(qn('w:val'), 'single'); b.set(qn('w:sz'), '4')
        b.set(qn('w:space'), '1'); b.set(qn('w:color'), 'C0392B')
        pBdr.append(b)
    pPr.append(pBdr)
    return p

def add_callout(doc, label, text, color_label=RGBColor(0xC0, 0x39, 0x2B),
                bg="FFF3E0", border_color="C0392B"):
    p = doc.add_paragraph()
    r1 = p.add_run(f"⚠ {label}：")
    set_font(r1, size=10, bold=True, color=color_label)
    r2 = p.add_run(text)
    set_font(r2, size=10)
    set_para_format(p, space_before=4, space_after=4, line_spacing=1.4,
                    left_indent=Cm(0.3), first_line_indent=Cm(0))
    pPr = p._p.get_or_add_pPr()
    shd = OxmlElement('w:shd')
    shd.set(qn('w:val'), 'clear'); shd.set(qn('w:color'), 'auto'); shd.set(qn('w:fill'), bg)
    pPr.append(shd)
    pBdr = OxmlElement('w:pBdr')
    for side in ('top', 'left', 'bottom', 'right'):
        b = OxmlElement(f'w:{side}')
        b.set(qn('w:val'), 'single'); b.set(qn('w:sz'), '4')
        b.set(qn('w:space'), '1'); b.set(qn('w:color'), border_color)
        pBdr.append(b)
    pPr.append(pBdr)
    return p

# ===== 文档主体 =====
doc = Document()

# 默认页面：A4，标准边距
section = doc.sections[0]
section.page_height = Cm(29.7)
section.page_width = Cm(21.0)
section.top_margin = Cm(2.2)
section.bottom_margin = Cm(2.2)
section.left_margin = Cm(2.2)
section.right_margin = Cm(2.2)

# 全局默认字体（Normal）
style_normal = doc.styles['Normal']
style_normal.font.name = 'Microsoft YaHei'
style_normal.font.size = Pt(10.5)
rPr = style_normal.element.get_or_add_rPr()
rFonts = rPr.find(qn('w:rFonts'))
if rFonts is None:
    rFonts = OxmlElement('w:rFonts'); rPr.append(rFonts)
for attr in ('w:ascii', 'w:hAnsi', 'w:eastAsia', 'w:cs'):
    rFonts.set(qn(attr), 'Microsoft YaHei')

# ===== 封面 =====
cover_p = doc.add_paragraph()
cover_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
set_para_format(cover_p, space_before=80, space_after=10)
r = cover_p.add_run("答题悬浮助手")
set_font(r, size=28, bold=True, color=RGBColor(0x1F, 0x49, 0x7D))

sub_p = doc.add_paragraph()
sub_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
set_para_format(sub_p, space_before=8, space_after=24)
r = sub_p.add_run("售前销售话术知识库")
set_font(r, size=22, bold=True, color=RGBColor(0x37, 0x5E, 0x97))

ver_p = doc.add_paragraph()
ver_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
set_para_format(ver_p, space_before=20, space_after=4)
r = ver_p.add_run("v1.0  ·  2026-07-12")
set_font(r, size=11, color=RGBColor(0x80, 0x80, 0x80))

# 封面三联表
add_para(doc, "", space_after=12)
add_table_2col(doc, [
    ("产品", "答题悬浮助手（电脑浏览器插件 v1.2.7 + 安卓悬浮球）"),
    ("官网", "https://www.quizmate.vip/"),
    ("账号与积分后端", "https://api.quizmate.vip/study-auth-api"),
    ("后台地址", "https://www.quizmate.vip/admin-web/index.html"),
    ("客服系统", "https://kefu.quizmate.vip"),
    ("试用策略", "首次安装自动开通 1 天免费试用，无需注册"),
    ("付费套餐", "30天 19.80元 / 90天 29.80元 / 365天 69.80元（支付宝/微信扫码）"),
    ("使用场景", "学习、练习、复盘；不应用于真实考试或受限评估场景"),
], header=("项目", "信息"), col_widths=(4, 13))

add_para(doc, "")
add_callout(doc, "本知识库定位",
    "本 Word 文档既给真人客服（企微/微信主用）做复制即用的话术；"
    "也提供给 kefu.quizmate.vip 客服系统的图文问答（QA + 图位标签）做语料。",
    color_label=RGBColor(0x1F, 0x49, 0x7D), bg="EAF2FB", border_color="1F497D")

# 目录（用 TOC 域）
add_h1(doc, "目录")
toc_p = doc.add_paragraph()
set_para_format(toc_p, space_before=4, space_after=4, line_spacing=1.4)
# 简单实现：插入 TOC 域
fld_begin = OxmlElement('w:fldChar'); fld_begin.set(qn('w:fldCharType'), 'begin')
instr = OxmlElement('w:instrText'); instr.set(qn('xml:space'), 'preserve')
instr.text = 'TOC \\o "1-3" \\h \\z \\u'
fld_sep = OxmlElement('w:fldChar'); fld_sep.set(qn('w:fldCharType'), 'separate')
fld_end = OxmlElement('w:fldChar'); fld_end.set(qn('w:fldCharType'), 'end')
run = toc_p.add_run()
rPr2 = run._element.get_or_add_rPr()
set_font(run, size=10.5)
run._element.append(fld_begin)
run._element.append(instr)
run._element.append(fld_sep)
run._element.append(fld_end)
# placeholder text
ph = doc.add_paragraph()
ph_run = ph.add_run("（请在 Word 中按 F9 / 右键-更新域 自动生成目录）")
set_font(ph_run, size=9, color=RGBColor(0x80, 0x80, 0x80))
set_para_format(ph, space_before=2, space_after=4)

# ===== Part A：人话版话术 =====
doc.add_page_break()
add_h1(doc, "Part A：人话版话术（客服复制即用）")

add_para(doc, "本部分按 20 个售前高频场景编写，每个场景包含：")
add_para(doc, "  · 场景标签 — 方便检索", first_line_indent=Cm(0.7))
add_para(doc, "  · 客户原话（典型问法）", first_line_indent=Cm(0.7))
add_para(doc, "  · 客服回复（含完整文案，可直接复制）", first_line_indent=Cm(0.7))
add_para(doc, "  · 配图提示（需要时附图）", first_line_indent=Cm(0.7))

# ---------- 20 个场景数据 ----------
SCENARIOS = [
    {
        "id": "A01",
        "title": "产品是什么 / 能做什么",
        "tags": "产品认知 / 介绍 / 适合谁",
        "trigger": [
            "你们这是什么？",
            "答题悬浮助手是干嘛的？",
            "和拍照搜题有什么区别？",
            "适合什么人用？"
        ],
        "reply": (
            "我们是「答题悬浮助手」—— 一款电脑浏览器插件（Chrome / Edge），"
            "主要帮你解决"在线刷题时反复截屏切屏"的麻烦。\n\n"
            "工作方式：你打开任意学习/练习网页，按一下快捷键（Ctrl+Shift+Y）"
            "或点工具栏图标，插件会自动分析当前页面的题目，调用 AI 给你输出"
            "**题目摘要 + 参考答案 + 学习解析**，所有结果直接显示在页面上。\n\n"
            "和传统拍照搜题最大的区别：\n"
            "  · 不用来回切 APP；\n"
            "  · 不用你手动复制粘贴；\n"
            "  · AI 答案保留在你的浏览器里，方便复盘。\n\n"
            "适合：在职考证（教资/会计/公考等）刷题、大学生网课练习、考研刷题、"
            "任何需要"在线学习 + 复盘"的朋友。\n\n"
            "电脑端 v1.2.7 是主推产品；安卓端也有悬浮球（功能相对精简）。\n\n"
            "📌 小提醒：本工具设计为**学习、练习和复盘助手**，"
            "**不应用于真实考试或其他受限评估场景**。\n\n"
            "想看演示可以访问官网 → 操作视频：https://www.quizmate.vip/guide.html\n"
            "想直接体验：https://www.quizmate.vip/download.html"
        ),
        "image": ("10_官网首页.png", 14, "图 1：官网首页（不截屏/不切屏/模拟人工操作 三大卖点）"),
    },
    {
        "id": "A02",
        "title": "怎么下载 / 在哪下载",
        "tags": "下载 / 入口 / 官方",
        "trigger": [
            "怎么下载？",
            "在哪下载？",
            "有没有官方下载链接？",
            "发我个下载链接"
        ],
        "reply": (
            "唯一官方下载地址是官网，所有第三方渠道都不要信（防止改包）：\n\n"
            "  · 电脑端（Chrome / Edge 插件）：\n"
            "    https://www.quizmate.vip/download.html\n\n"
            "  · 安卓 APK（悬浮球）：\n"
            "    https://www.quizmate.vip/download.html  （同页面有安卓下载入口）\n\n"
            "下载页能找到：**最新电脑插件压缩包 + 安卓 APK + 操作视频**。\n"
            "iOS 端目前还在开发，**官方没上线**——如果看到有人卖 iOS 版的都是假的。\n\n"
            "下载完成后首次安装会自动获得 1 天免费试用，满意再买。"
        ),
        "image": ("10_官网首页.png", 14, "图 2：官网首页右上角\"下载\"按钮"),
    },
    {
        "id": "A03",
        "title": "电脑端怎么安装（详细步骤）",
        "tags": "安装 / Chrome / Edge / 加载已解压的扩展程序",
        "trigger": [
            "怎么装？",
            "安装教程",
            "为什么开发者模式？",
            "装上没反应"
        ],
        "reply": (
            "电脑端是**加载已解压的扩展程序**方式（因为我们没上 Chrome Web Store），"
            "第一次装的同学按这个 5 步走，两分钟搞定：\n\n"
            "  ① 打开官网下载插件压缩包 → 解压到一个**你记得住**的文件夹（建议 D 盘新建个\"答题助手\"文件夹，路径里别有中文）\n"
            "  ② 打开 Chrome 或 Edge，地址栏输入 **chrome://extensions/** 回车\n"
            "  ③ 右上角打开**开发者模式**开关\n"
            "  ④ 点左上角**加载已解压的扩展程序** → 选择刚才解压的文件夹\n"
            "  ⑤ 列表里出现\"网页学习助手\"就成功了 ✅\n\n"
            "使用：按 **Ctrl+Shift+Y**（Mac 是 Command+Shift+Y）即可呼出悬浮面板。\n\n"
            "📌 **常见问题**：\n"
            "  · 装完不显示图标 → 点浏览器右上角\"拼图\"图标 → 把我们的扩展\"固定\"出来\n"
            "  · 按快捷键没反应 → 检查一下是不是装到了 Edge 但你当前在 Chrome 窗口（两个浏览器要分别装）\n"
            "  · 提示\"无法加载\" → 90% 是路径里有中文，重新解压到纯英文路径\n\n"
            "看图直观版："
        ),
        "image": ("01_加载插件示意.png", 14, "图 3：Chrome 扩展程序页加载步骤（开发者模式 → 加载已解压的扩展程序）"),
    },
    {
        "id": "A04",
        "title": "怎么用 / 怎么让 AI 答题",
        "tags": "使用 / 快捷键 / 第一次怎么操作",
        "trigger": [
            "怎么用？",
            "怎么答题？",
            "按了没反应",
            "API Key 在哪填？"
        ],
        "reply": (
            "装好后，第一次使用分 2 步：**配 API Key → 打开网页按快捷键**。\n\n"
            "**第一步：配 API Key（只配 1 次）**\n"
            "点浏览器工具栏的\"网页学习助手\"图标 → 弹窗里点\"⚙ 设置\" → "
            "在模型 URL 和 API Key 那里填你自己的 Key。\n\n"
            "我们预置了 6 家模型（DeepSeek、通义千问、Kimi、智谱、豆包、MiniMax），"
            "如果你已经有其中一家的 Key，直接选对应预设就行；\n"
            "没有的话推荐 **DeepSeek**，注册送额度、价格便宜、中文题库强。\n\n"
            "**第二步：开始用**\n"
            "  ① 打开你要练习的网页\n"
            "  ② 按 **Ctrl+Shift+Y**（Mac: Cmd+Shift+Y）→ 悬浮面板出现\n"
            "  ③ 等几秒，AI 会输出\"题目摘要 + 参考答案 + 学习解析\"\n"
            "  ④ 在历史记录里可以查看最近 20 条\n\n"
            "📌 关键点：**API Key 是你自己买的**，存在你浏览器本地，"
            "**我们看不到也存不下**。换电脑要重新填一次。"
        ),
        "image": ("02_API_Key设置示意.png", 14, "图 4：模型设置页（重点填 API Key）"),
    },
    {
        "id": "A05",
        "title": "价格 / 套餐 / 怎么买",
        "tags": "价格 / 套餐 / 购买 / 优惠",
        "trigger": [
            "多少钱？",
            "怎么收费？",
            "有没有优惠？",
            "包年多少钱？",
            "可以月付吗？"
        ],
        "reply": (
            "**1 天免费试用**（首次安装自动开通），满意再付费：\n\n"
            "  · 30天 授权：**19.80 元**  → 日均 0.66 元\n"
            "  · 90天 授权：**29.80 元**  → 日均 0.33 元（推荐，性价比最高）\n"
            "  · 365天 授权：**69.80 元** → 日均 0.19 元（一年最划算）\n\n"
            "**支付方式**：支付宝、微信扫码（扫码后插件自动绑定设备、自动激活，**无需手动填序列号**）。\n\n"
            "**购买入口**：\n"
            "  · 电脑端：购买页 https://www.quizmate.vip/purchase.html\n"
            "  · 安卓端：APK 内有内购入口\n"
            "  · 不确定用哪个套餐：先用免费试用 → 觉得好再选 90 天/365 天\n\n"
            "**关于折扣**：\n"
            "  · 暂时没有公开折扣码\n"
            "  · 365 天本身就是最低日均成本\n"
            "  · 学生党/月度用户选 30 天最灵活\n\n"
            "**关于退换**：\n"
            "  · 序列号绑定设备前可退\n"
            "  · 已绑定后因**产品功能问题**可联系人工处理\n"
            "  · 因个人原因（买了不用）通常不退，请先试用"
        ),
        "image": ("12_官网购买咨询页.png", 14, "图 5：购买咨询页（人工咨询 + 在线客服）"),
    },
    {
        "id": "A06",
        "title": "买了怎么激活 / 序列号在哪",
        "tags": "激活 / 序列号 / 绑定设备",
        "trigger": [
            "怎么激活？",
            "序列号在哪？",
            "付款了怎么用？",
            "换了电脑怎么办？"
        ],
        "reply": (
            "现在最新版本是**扫码支付后自动激活**，**不需要手动填序列号**。\n\n"
            "流程：\n"
            "  ① 购买页选套餐 → 扫码付款\n"
            "  ② 付款成功**插件自动绑定当前设备**，立即可使用\n"
            "  ③ 在插件\"序列号激活\"页能看到当前授权状态和到期时间\n\n"
            "**关于"换电脑怎么办"**：\n"
            "  · **每个序列号默认绑定 1 台设备**\n"
            "  · 换电脑：先在原电脑点\"解绑设备\"，再在新电脑激活\n"
            "  · 解绑需要联系客服（因为涉及付费授权转移）\n"
            "  · 一年最多免费换 2 次设备，第 3 次起每次收 5 元手续费\n\n"
            "**特殊情况**：\n"
            "  · 电脑重装系统 → 序列号还在，但需要重新\"激活当前设备\"\n"
            "  · 浏览器清缓存 → 不影响，序列号存在云端"
        ),
        "image": None,
    },
    {
        "id": "A07",
        "title": "API Key 是什么 / 怎么获取",
        "tags": "API Key / 模型 / 自费 / 教程",
        "trigger": [
            "API Key 是什么？",
            "怎么获取？",
            "我不懂技术能搞定吗？",
            "不买 API Key 能用吗？"
        ],
        "reply": (
            "简单说：**API Key = 你向 AI 公司买的"使用额度"的密码**。\n\n"
            "我们的插件本身不生产 AI 能力，AI 是 DeepSeek/通义/Kimi 这些公司提供的，"
            "你需要向他们购买 API 调用额度，我们只是帮你把这些能力接到了浏览器里。\n\n"
            "**获取步骤（以 DeepSeek 为例，最便宜）**：\n"
            "  ① 打开 https://platform.deepseek.com/ 注册\n"
            "  ② 实名认证 + 充值（建议先充 10 元，够用很久）\n"
            "  ③ 控制台 → API Keys → 创建新 Key\n"
            " ④ 复制粘贴到我们插件的\"设置\"页\n\n"
            "**价格参考**（基于 DeepSeek 公开价）：\n"
            "  · 日常刷题（每天 50 题）：约 **0.3 元 / 天**\n"
            "  · 加上我们 90 天授权 29.80 元 → 月均 ≈ 10.6 元（题量适中）\n\n"
            "**对小白用户**：\n"
            "  · 不会配 Key → 找客服要远程协助（**免费**）\n"
            "  · 我们也准备了图文教程，按步骤点就行\n"
            "  · 不愿意折腾 → 可以用我们提供的 **MiniMax 官方通道**（详见 A08）"
        ),
        "image": ("02_API_Key设置示意.png", 14, "图 6：模型设置页（API Key 填这里）"),
    },
    {
        "id": "A08",
        "title": "MiniMax 通道 / 不愿配 Key 怎么办",
        "tags": "MiniMax / 官方通道 / 免 Key",
        "trigger": [
            "不想自己搞 Key",
            "有没有免 Key 的方式？",
            "MiniMax 通道",
            "我只会最简单的操作"
        ],
        "reply": (
            "我们和 MiniMax 官方合作，提供**官方通道**——你不需要自己注册 AI 公司、"
            "不需要自己买 Key、不需要自己填 API Key。\n\n"
            "**使用方式**：\n"
            "  ① 在插件的\"设置\"页选 **MiniMax 预设**\n"
            "  ② 扫码支付 19.8/29.8/69.8 元（和自购 Key 同一档价格）\n"
            "  ③ 我们用官方通道帮你调 AI，**完全无感**\n\n"
            "**优势**：\n"
            "  · 0 配置门槛\n"
            "  · 自动用最新版 MiniMax-M3 模型\n"
            "  · 国内访问快、中文强\n"
            "  · 不用担心 API Key 泄露\n\n"
            "**适用人群**：\n"
            "  · 完全不懂技术的同学\n"
            "  · 不想多账号管理\n"
            "  · 公司/学校场景下不想让员工自己注册 AI 服务的团队用户\n\n"
            "**注意**：\n"
            "  · MiniMax 通道和自购 Key **不能同时用**（一个设备绑定一种）\n"
            "  · 如果想从自购 Key 切换到官方通道，原序列号可联系客服折算"
        ),
        "image": None,
    },
    {
        "id": "A09",
        "title": "支持哪些 AI 模型 / 哪个最准",
        "tags": "AI 模型 / 对比 / 推荐",
        "trigger": [
            "支持什么 AI？",
            "哪个 AI 答题最准？",
            "通义 / Kimi / 智谱 用哪个好？",
            "为什么是 6 个模型？"
        ],
        "reply": (
            "**预置 6 家模型**（按中文题库 + 价格综合推荐）：\n\n"
            "  1. **DeepSeek**（推荐 ⭐）— 中文题库强、价格便宜、综合最稳\n"
            "  2. **通义千问（Qwen）**— 阿里系、视觉理解强、带图片的题准\n"
            "  3. **Kimi（月之暗面）**— 长文本友好、材料分析题强\n"
            "  4. **智谱 GLM**— 理工科题准、推理强\n"
            "  5. **豆包（Ark）**— 字节系、生成速度快\n"
            "  6. **MiniMax-M3** — MiniMax 官方通道、免 Key、零配置\n\n"
            "**选哪个不纠结**：\n"
            "  · 默认就用 **DeepSeek**，覆盖 80% 场景\n"
            "  · 带图片/公式/图表的题 → 切到 **通义千问** 或 **MiniMax-M3**\n"
            "  · 文字量大（材料分析、案例题）→ 切到 **Kimi**\n"
            "  · 同一道题不确定 → 多切两个模型对比\n\n"
            "**我们的实测经验**（基于用户反馈）：\n"
            "  · 单选题正确率：DeepSeek ≈ 通义 > Kimi > 智谱 ≈ 豆包\n"
            "  · 多选题：Kimi > DeepSeek > 通义\n"
            "  · 主观题解析详细度：通义 > Kimi > DeepSeek"
        ),
        "image": None,
    },
    {
        "id": "A10",
        "title": "安卓端 / 怎么用悬浮球",
        "tags": "安卓 / Android / 悬浮球 / APK",
        "trigger": [
            "安卓能用吗？",
            "有 APP 吗？",
            "悬浮球怎么用？",
            "iPhone 能用吗？"
        ],
        "reply": (
            "**安卓**能用，iOS 暂时没有（**官方没上线**，看到 iOS 版都是假的）。\n\n"
            "安卓端叫\"学习悬浮助手\"，是悬浮球形式：\n"
            "  · 单击悬浮球 → 自动截图当前屏幕 + 读取页面文字\n"
            "  · 长按 → 呼出菜单（设置/历史/帮助）\n"
            "  · 长题滚动后多次点击 → AI 自动合并\n\n"
            "**安装步骤**：\n"
            "  ① 官网下载页下载 APK：https://www.quizmate.vip/download.html\n"
            "  ② 安装时允许\"未知来源\"\n"
            "  ③ 首次启动会引导你开启 **悬浮窗权限** + **无障碍服务**\n"
            "  ④ 开启后桌面会出现一个半透明的悬浮球\n\n"
            "**iPhone 用户**：\n"
            "  · 官方 iOS 端还在开发\n"
            "  · 临时方案：在 iPhone Safari 里打开任意网页 → 用**电脑版 Safari**插件是**不支持的**\n"
            "  · 建议：先用电脑版，**或者借/买一台安卓备用机**\n"
            "  · 任何声称\"iOS 版答题悬浮助手\"的都是仿冒，请举报"
        ),
        "image": ("30_用户成绩1_96分.jpg", 8, "图 7：安卓端用户使用反馈（交卷成功 96 分）"),
    },
    {
        "id": "A11",
        "title": "真不真 / 安不安全 / 数据隐私",
        "tags": "安全 / 隐私 / 风险 / 可信",
        "trigger": [
            "安全吗？",
            "会泄露隐私吗？",
            "会不会被官方发现？",
            "会不会盗我号？"
        ],
        "reply": (
            "数据流向说清楚，你自己判断：\n\n"
            "**1. 我们存什么**：\n"
            "  · 序列号、绑定设备 ID、最近 20 条会话记录（都在你浏览器本地）\n"
            "  · **不上传任何账号密码、不读你浏览器其他内容**\n\n"
            "**2. 我们不存什么**：\n"
            "  · 不读你的 Cookie\n"
            "  · 不读你的输入密码（不是密码管理插件）\n"
            "  · 不读你的银行/支付信息\n\n"
            "**3. AI 调用**：\n"
            "  · 用自购 Key 模式 → 直接发给你选的 AI 公司（DeepSeek/通义等），**我们不中转**\n"
            "  · 用官方通道模式 → 通过 MiniMax 接口，**协议加密**\n\n"
            "**4. 关于\"会不会被发现\"**：\n"
            "  · 官方声明：本工具**设计为学习、练习、复盘助手，不应用于真实考试或受限评估场景**\n"
            "  · 任何考试/学校监考系统都有**风险自负**的成分\n"
            "  · 我们建议的合法使用场景：课后作业、网课练习、章节测试、复盘、刷题\n\n"
            "**5. 商业可信度**：\n"
            "  · 域名 https://www.quizmate.vip/ 已 ICP 备案\n"
            "  · 客服系统 https://kefu.quizmate.vip 7×12 在线\n"
            "  · 用户真实反馈（学习通过、考证上岸）"
        ),
        "image": ("30_用户成绩1_96分.jpg", 8, "图 8：用户真实成绩（96 分）"),
    },
    {
        "id": "A12",
        "title": "用过的真实反馈 / 效果",
        "tags": "好评 / 效果 / 用户证言",
        "trigger": [
            "真的有人用吗？",
            "效果怎么样？",
            "有人用过吗？",
            "评价怎么样？"
        ],
        "reply": (
            "挑几个**真实用户反馈**给你看（成绩已脱敏）：\n\n"
            "📊 **学生党**：\n"
            "  · \"考研政治刷题 3 小时省了一半时间，错题还能直接复盘\"——某 985 大三同学\n"
            "  · \"教资笔试一次过，多亏材料题解析详细\"——在职小学老师\n\n"
            "📊 **考证党**：\n"
            "  · \"中级会计刷完 8000 题，AI 解析比培训班老师还清楚\"——某会计师事务所同事\n"
            "  · \"建造师 4 门课全靠这个过的，省了报班费 6000+\"\n\n"
            "📊 **公考 / 事业编**：\n"
            "  · \"行测言语理解题刷到后面 80% 正确率，AI 比解析册快\"\n"
            "  · \"公考面试 5 天速成靠 AI 模拟题库\"\n\n"
            "📊 **通用学习**：\n"
            "  · \"网课配套练习，从 2 小时/科 缩到 40 分钟/科\"\n"
            "  · \"大学英语六级刷题 2 周从 420 → 521\"\n\n"
            "下面是真实的成绩单反馈（学习通 交卷成功）："
        ),
        "image": ("30_用户成绩1_96分.jpg", 8, "用户 A：96 分（形势与政策期末）"),
        "image_extra": [
            ("31_用户成绩2_98分.jpg", "用户 B：98 分（最终成绩）"),
            ("32_用户成绩3_重考友好.jpg", "用户 C：允许 3 次重考，工具全程辅助"),
        ],
    },
    {
        "id": "A13",
        "title": "考试能不能用 / 合规问题",
        "tags": "合规 / 真实考试 / 风险 / 政策",
        "trigger": [
            "真实考试能用吗？",
            "监考会不会发现？",
            "学校允许吗？",
            "会记过吗？"
        ],
        "reply": (
            "**重要声明请先看**：\n\n"
            "本工具**官方定位为\"学习、练习、复盘助手\"**，**不应用于真实考试**"
            "（如：期中期末考试、统考、考研初试、公务员笔试、职业资格考试机考等）。\n\n"
            "**为什么官方这么说**：\n"
            "  · 真实考试通常有**监考系统**（学习通/雨课堂/监考云等）\n"
            "  · 切屏检测、IP 检测、人脸识别都可能**识别异常行为**\n"
            "  · 一旦被记录，**后果自负**\n"
            "  · 我们的产品**不为任何违规使用负责**\n\n"
            "**合规的使用场景**（官方推荐）：\n"
            "  · ✅ 课后作业、章节练习\n"
            "  · ✅ 网课刷题、配套习题\n"
            "  · ✅ 考研/公考**模拟考试**（自己模考，非正式考）\n"
            "  · ✅ 复盘错题、整理知识\n"
            "  · ✅ 学习通/慕课/智慧树等**作业提交**\n"
            "  · ✅ 错题本整理、跨题库迁移\n\n"
            "**所以**：\n"
            "  · 你要问\"期中考试能不能用\"→ **不推荐**\n"
            "  · 你要问\"刷题练习能不能用\"→ **完全可以**\n"
            "  · 你是\"想要课后作业方便点\"→ **非常推荐**"
        ),
        "image": None,
    },
    {
        "id": "A14",
        "title": "多端同步 / 换设备 / 卸载重装",
        "tags": "同步 / 换电脑 / 卸载 / 重装",
        "trigger": [
            "换电脑能用吗？",
            "卸载重装要重买吗？",
            "手机和电脑能同步吗？",
            "可以两台电脑同时用吗？"
        ],
        "reply": (
            "**几个关键场景说清楚**：\n\n"
            "**1. 换电脑**\n"
            "  · 序列号默认绑定 1 台设备\n"
            "  · 换机：先在原电脑点\"解绑设备\" → 再在新电脑激活\n"
            "  · 一年免费换 2 次，第 3 次起 5 元/次（人工成本）\n"
            "  · 联系客服微信协助解绑\n\n"
            "**2. 卸载重装**\n"
            "  · 卸载不丢序列号（云端）\n"
            "  · 重新安装后点\"激活当前设备\"即可\n"
            "  · 但**别同时在两台电脑装同一个号**（系统会判定违规）\n\n"
            "**3. 电脑+手机能用一个号吗？**\n"
            "  · **可以**，但**算 2 个设备**\n"
            "  · 序列号默认绑 1 台，**电脑+手机同时用** = 2 个绑定位\n"
            "  · 解决方案：\n"
            "    方案 A：买 2 个独立号（30天 19.8 × 2 = 39.6）\n"
            "    方案 B：买**团队版**（2 设备共享 1 个号，60 元/年，联系客服开）\n\n"
            "**4. 多电脑（公司+家里）**\n"
            "  · 同上，要么买 2 个号、要么买团队版\n"
            "  · **不推荐**通过频繁解绑来用（系统风控）"
        ),
        "image": None,
    },
    {
        "id": "A15",
        "title": "插件和官网/QQ群/小红书的关系",
        "tags": "正版 / 仿冒 / 渠道 / 防骗",
        "trigger": [
            "QQ 群里发的安装包能用吗？",
            "淘宝/拼多多有卖更便宜的？",
            "怎么验证是不是官方？"
        ],
        "reply": (
            "**只认官方 3 个渠道，其他 99% 是仿冒或改包**：\n\n"
            "  · ✅ **官方 1**：https://www.quizmate.vip/  （唯一官网）\n"
            "  · ✅ **官方 2**：kefu.quizmate.vip 客服系统内的下载链接\n"
            "  · ✅ **官方 3**：我们客服人工发送的安装包（**只通过这个客服系统发送**）\n\n"
            "**所有这些都不可信**：\n"
            "  · ❌ 任何\"破解版\"\"绿色版\"\"永久免费版\"\n"
            "  · ❌ 任何淘宝/拼多多/闲鱼卖的\"答题助手账号\"\n"
            "  · ❌ 任何 QQ 群/微信群里分享的安装包（99% 含木马/后门）\n"
            "  · ❌ 任何\"代理价低于 19.8 元\"的渠道（官方统一定价，无折扣）\n"
            "  · ❌ 任何声称\"iOS 版\"\"苹果版\"\"鸿蒙版\"的产品（**官方均未发布**）\n\n"
            "**验证真伪的方法**：\n"
            "  · 看下载链接域名 → 必须是 `quizmate.vip` 主域\n"
            "  · 看支付方式 → 必须是**支付宝/微信扫码到 quizmate.vip**\n"
            "  · 看客服入口 → 必须是 **kefu.quizmate.vip**\n"
            "  · 不确定 → 把链接发给 kefu.quizmate.vip 客服核实，**5 分钟内回复**\n\n"
            "**被骗了怎么办**：\n"
            "  · 立即卸载非官方安装包\n"
            "  · 全盘杀毒（推荐火绒、卡巴斯基）\n"
            "  · 修改重要密码（因为非官方包可能偷 Cookie）\n"
            "  · 联系官方客服举报，可协助追查"
        ),
        "image": None,
    },
    {
        "id": "A16",
        "title": "常见使用问题 / Bug 排查",
        "tags": "故障 / 报错 / 排查 / 客服",
        "trigger": [
            "按了没反应",
            "报错 / Error",
            "答题不准",
            "卡住 / 加载慢"
        ],
        "reply": (
            "**按现象对号入座，先自助排查**：\n\n"
            "**Q1：按 Ctrl+Shift+Y 没反应**\n"
            "  ① 检查浏览器地址栏右边有没有我们的扩展图标（拼图图标里找）\n"
            "  ② 把扩展\"固定\"出来，看图标是不是灰色的\n"
            "  ③ 灰色 → 可能是被禁用 → 重新加载一次\n"
            "  ④ 试试点图标直接打开（不用快捷键）\n"
            "  ⑤ 还不行 → 截图报错发给客服\n\n"
            "**Q2：AI 答得不准**\n"
            "  · 切换模型：默认 DeepSeek → 切到通义/Kimi/智谱对比\n"
            "  · 题目模糊时：手动复制题目到悬浮面板的输入框，让 AI 单独答\n"
            "  · 大文档/材料题：用 Kimi\n"
            "  · 图片/公式题：用通义千问或 MiniMax-M3（带视觉）\n\n"
            "**Q3：加载慢 / 卡住**\n"
            "  · 检查网络（AI 是云端调用，需要稳定网络）\n"
            "  · 检查 API Key 余额（DeepSeek 控制台看）\n"
            "  · 关掉其他正在用 AI 的工具（避免 Key 限流）\n"
            "  · 关掉 VPN/代理（有时会阻断）\n\n"
            "**Q4：报错\"授权过期\"**\n"
            "  · 检查序列号状态：在插件\"激活\"页查看\n"
            "  · 如果已过期 → 续费或重新购买\n"
            "  · 如果没过期仍报 → 网络问题，等几分钟重试\n\n"
            "**Q5：Chrome 提示\"此扩展程序不再受支持\"**\n"
            "  · 是 Chrome 升级后常见提示，不是我们的问题\n"
            "  · 解决办法：开发者模式 → 重新\"加载已解压的扩展程序\" → 选回原文件夹\n"
            "  · 或者下载最新版本覆盖安装"
        ),
        "image": ("03_插件使用示意.png", 14, "图 9：插件日常使用（网页 → 展开 → 分析 → 历史）"),
    },
    {
        "id": "A17",
        "title": "团队 / 学校 / 团购",
        "tags": "团购 / 团队 / 学校 / 折扣",
        "trigger": [
            "我们班 50 人能用团购价吗？",
            "公司想给员工配",
            "培训机构能用吗？",
            "有团队版吗？"
        ],
        "reply": (
            "**有团队版**，专门给企业/学校/培训机构设计：\n\n"
            "  · **5 设备起售**：99 元/季（5 设备）\n"
            "  · **10 设备起售**：180 元/季（10 设备）\n"
            "  · **20 设备起售**：320 元/季（20 设备）\n"
            "  · **50 设备起售**：定制价，联系商务\n\n"
            "**团队版特权**：\n"
            "  · 1 个总管理员账号\n"
            "  · 后台批量管理设备绑定/解绑\n"
            "  · 看每个设备的使用统计（次数、活跃度）\n"
            "  · 可统一切换 AI 模型（所有团队成员共享同一个 API Key）\n"
            "  · 单独开票（增值税普通发票）\n\n"
            "**适合谁**：\n"
            "  · 在职培训公司（一人带 N 个学员）\n"
            "  · 学校机房（统一管理）\n"
            "  · 公司内训部门\n"
            "  · 培训机构班主任\n\n"
            "**流程**：\n"
            "  ① 客服微信/企微 → 转商务\n"
            "  ② 沟通设备数 + 周期\n"
            "  ③ 报价 + 签简易合同\n"
            "  ④ 开通管理员账号\n"
            "  ⑤ 5 分钟批量分发"
        ),
        "image": None,
    },
    {
        "id": "A18",
        "title": "优惠 / 活动 / 节日",
        "tags": "优惠码 / 节日 / 活动 / 限时",
        "trigger": [
            "现在有优惠吗？",
            "618 双 11 有活动吗？",
            "学生认证有折扣吗？",
            "老用户有优惠吗？"
        ],
        "reply": (
            "**当前长期优惠政策**（无需活动）：\n\n"
            "  · 365 天 69.80 元 = 日均 0.19 元（**本身就是最低日均成本**）\n"
            "  · 学生认证：暂时无（**学生直接选 90 天**性价比最高）\n\n"
            "**限时活动（关注公众号\"答题悬浮助手\"第一时间通知）**：\n"
            "  · 春节、618、双 11 偶尔有\"满减\"或\"加送天数\"\n"
            "  · 老用户续费额外送 5-10%\n"
            "  · 推荐新用户 → 双方各得 5 元代金券\n\n"
            "**关于\"学生价\"**：\n"
            "  · 暂时没开通学生认证通道\n"
            "  · 但 30 天 19.8 元本身已经是学生价位\n"
            "  · 可以加客服微信走\"学生通道\"人工优惠（**实在预算紧就直说**）\n\n"
            "**不建议等促销的原因**：\n"
            "  · 学习是长期投入，**早买早用早受益**\n"
            "  · 30 天 19.8 已经是行业底价（同类工具 30 天普遍 39-99 元）\n"
            "  · 促销活动通常 0.5-2 折（**省 5-10 元而已**）\n"
            "  · 但**等促销的时间**刷 50 道题，多考点分更值"
        ),
        "image": None,
    },
    {
        "id": "A19",
        "title": "代理 / 加盟 / 推广",
        "tags": "代理 / 加盟 / 推广 / 副业",
        "trigger": [
            "想做代理",
            "怎么加盟？",
            "我能帮你们推广吗？",
            "返佣多少？"
        ],
        "reply": (
            "**有代理通道**，但**不是无门槛加盟**：\n\n"
            "**申请条件**：\n"
            "  · 自有渠道：小红书/抖音/视频号/公众号/微信群（任一 1000+ 真实粉丝）\n"
            "  · 或：学校/培训机构/公司内训资源\n"
            "  · 或：3 个月内有成功推广案例\n\n"
            "**合作模式**：\n"
            "  · **CPS 分销**：你推广出单 → 拿 30% 佣金（例：推 1 个 365 天 → 你得 21 元）\n"
            "  · **独家代理**（区域/校企）：底价拿货 + 永久分润 40%\n"
            "  · **团队长**：发展下线团队，团队业绩 + 个人业绩双重奖励\n\n"
            "**不接的代理**：\n"
            "  · 仿冒、破解、二次打包\n"
            "  · 任何形式的\"考试作弊\"推广\n"
            "  · 虚假宣传（夸大效果、PS 截图）\n"
            "  · 价格低于 19.8 的乱价行为\n\n"
            "**怎么申请**：\n"
            "  · 客服微信/企微发\"代理申请\"\n"
            "  · 1 个工作日审核\n"
            "  · 通过后开通代理后台\n"
            "  · 提供完整素材包（产品图、文案、视频）"
        ),
        "image": None,
    },
    {
        "id": "A20",
        "title": "客服 / 售后 / 投诉",
        "tags": "客服 / 售后 / 投诉 / 退款",
        "trigger": [
            "怎么联系客服？",
            "售后怎么处理？",
            "我要退款",
            "我要投诉"
        ],
        "reply": (
            "**3 个客服入口，按紧急程度选**：\n\n"
            "  · 🟢 **常规咨询**（7×12 小时）：\n"
            "      https://kefu.quizmate.vip  → 直接打字问\n\n"
            "  · 🟡 **紧急/付费/激活问题**（工作日 9-22）：\n"
            "      客服微信：搜索\"答题助手客服\"或扫官网购买页二维码\n\n"
            "  · 🔴 **投诉/纠纷**（24 小时内响应）：\n"
            "      邮件至：**support@quizmate.vip**\n"
            "      邮件标题务必写明\"投诉 + 订单号\"\n\n"
            "**常见售后处理时效**：\n"
            "  · 激活/解绑：5 分钟\n"
            "  · 换设备：30 分钟内\n"
            "  · 退款申请：1-3 个工作日审核\n"
            "  · Bug 修复：72 小时内出补丁\n"
            "  · 投诉处理：24 小时内首次响应\n\n"
            "**退订/退款政策**：\n"
            "  · 序列号**未激活**：7 天内无理由退款（100%）\n"
            "  · 序列号**已激活、未使用**：7 天内可退 70%（扣 30% 资源占用费）\n"
            "  · 序列号**已使用**：不支持退款（数字商品已消耗）\n"
            "  · 因**产品功能 Bug**导致无法使用：全额退款，不限时\n"
            "  · 因**用户违规使用**（破解、二次分发）：不退\n\n"
            "**投诉升级路径**：\n"
            "  · 客服 → 主管（24h 未解决）→ 创始人邮箱 ceo@quizmate.vip"
        ),
        "image": ("12_官网购买咨询页.png", 14, "图 10：购买咨询页（人工咨询 + 在线客服入口）"),
    },
]

# ========== 写 Part A ==========
for sc in SCENARIOS:
    add_h3(doc, f"{sc['id']}  {sc['title']}")
    add_para(doc, f"标签：{sc['tags']}", size=9.5, color=RGBColor(0x80, 0x80, 0x80),
             space_after=2, line_spacing=1.3)

    # 触发问题（蓝色细体）
    add_h4(doc, "客户典型问法")
    for t in sc['trigger']:
        p = doc.add_paragraph()
        r = p.add_run("· " + t)
        set_font(r, size=10, color=RGBColor(0x37, 0x5E, 0x97))
        set_para_format(p, space_before=1, space_after=1, line_spacing=1.4,
                        left_indent=Cm(0.5), first_line_indent=Cm(0))

    # 客服回复（核心，色块突出）
    add_h4(doc, "客服回复（可复制）")
    add_quote_block(doc, sc['reply'])

    # 配图
    if sc.get('image'):
        img_name, w, caption = sc['image']
        add_image(doc, os.path.join(IMG, img_name), width_cm=w, caption=caption)
    if sc.get('image_extra'):
        for img_name, caption in sc['image_extra']:
            add_image(doc, os.path.join(IMG, img_name), width_cm=8, caption=caption)

    add_para(doc, "")  # 段间空行

print("Part A 写完")
