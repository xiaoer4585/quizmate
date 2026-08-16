# -*- coding: utf-8 -*-
"""
抖音号图文轮播图生成器（v2）

抖音号新规则：
- 形式：以一系列图片为主
- 文字：尽量特别少，基本上一两句话
- 图片内文字：字体大、内容简单、不紧凑、字不要太小

输出：每篇 4-5 张 1080×1440 大字号图文，每张图只放 1 个核心信息
"""
import os
import sys
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from topics_data import TOPICS

BASE_DIR = r"E:\ai项目\考试插件\运营管理\deliverables\2026-07-25-秋招多平台20篇-md"
QRCODE_PATH = os.path.join(BASE_DIR, "qrcode_wechat.jpg")

# 颜色
BRAND_RED = (255, 36, 66)
WHITE = (255, 255, 255)
LIGHT_PINK = (255, 240, 242)
DARK_TEXT = (40, 40, 40)
GRAY_TEXT = (120, 120, 120)

FONT_REG = r"C:\Windows\Fonts\msyh.ttc"
FONT_BOLD = r"C:\Windows\Fonts\msyhbd.ttc"


def font(size, bold=False):
    return ImageFont.truetype(FONT_BOLD if bold else FONT_REG, size)


def wrap_text(text, font_obj, max_width):
    """文字换行处理"""
    if not text:
        return [""]
    avg_char_w = font_obj.size * 0.95
    max_chars = int(max_width / avg_char_w)
    if max_chars < 4:
        max_chars = 4

    lines = []
    current = ""
    for ch in text:
        char_w = 1.0 if ord(ch) > 127 else 0.55
        if len(current) + char_w > max_chars:
            lines.append(current)
            current = ch
        else:
            current += ch
    if current:
        lines.append(current)
    return lines


def make_base_image(bg_color):
    """创建基础空白图"""
    W, H = 1080, 1440
    img = Image.new("RGB", (W, H), bg_color)
    return img, W, H


def draw_centered_text(draw, text, y, font_obj, fill, W, max_width=None):
    """在指定 y 居中绘制文字（自动换行）"""
    if max_width is None:
        max_width = W - 80
    lines = wrap_text(text, font_obj, max_width)
    for i, line in enumerate(lines):
        line_y = y + i * (font_obj.size + 20)
        draw.text((W // 2, line_y), line, fill=fill, font=font_obj, anchor="mm")
    return y + len(lines) * (font_obj.size + 20)


def draw_top_banner(img, draw, label):
    """顶部品牌红色横条"""
    W, H = img.size
    draw.rectangle([0, 0, W, 100], fill=BRAND_RED)
    f_brand = font(36, bold=True)
    draw.text((40, 50), "QuizMate", fill=WHITE, font=f_brand)
    draw.text((W - 40, 50), label, fill=WHITE, font=f_brand, anchor="rm")


def draw_bottom_brand(draw, idx, total, W, H):
    """底部品牌色横条 + 编号"""
    draw.rectangle([0, H - 80, W, H], fill=BRAND_RED)
    f_foot = font(28, bold=True)
    draw.text((W // 2, H - 40), f"#{idx}/{total} · 2026 秋招指南",
              fill=WHITE, font=f_foot, anchor="mm")


# ========== 4 张标准轮播图 ==========

def make_img1_hook(topic, idx, total):
    """图 1：封面图（反问 + 钩子）"""
    img, W, H = make_base_image(WHITE)
    draw = ImageDraw.Draw(img)
    draw_top_banner(img, draw, f"第 {idx} 集")

    # 大字反问（80pt）
    f_hook = font(96, bold=True)
    f_emoji = font(60)

    # 根据分类生成不同反问
    category = topic["category"]
    topic_text = topic["title_zh"].replace("答题悬浮助手", "").replace("求职雷达", "")

    if category == "时间点":
        hook = "秋招错过？"
        sub = "再等一年！"
    elif category == "流程监控":
        hook = "招聘漏看？"
        sub = "少走弯路"
    elif category == "行测题":
        hook = "行测刷题"
        sub = "没方法？"
    elif category == "题库":
        hook = "题库一堆"
        sub = "用不上？"
    elif category == "笔试":
        hook = "笔试不会"
        sub = "怎么办？"
    else:
        hook = "秋招焦虑？"
        sub = "看这里"

    # 主标题
    draw_centered_text(draw, hook, 280, f_hook, BRAND_RED, W)
    # 副标题（次行）
    draw_centered_text(draw, sub, 480, f_hook, DARK_TEXT, W)

    # 主题标签（底部）
    f_tag = font(40, bold=True)
    y = 880
    draw.rounded_rectangle([W//2 - 380, y - 40, W//2 + 380, y + 50],
                           radius=20, fill=LIGHT_PINK, outline=BRAND_RED, width=3)
    draw.text((W // 2, y), f"#{topic['category']}", fill=BRAND_RED, font=f_tag, anchor="mm")

    draw_bottom_brand(draw, idx, total, W, H)
    return img


def make_img2_pain(topic, idx, total):
    """图 2：痛点/现状（字号大，一句话）"""
    img, W, H = make_base_image(WHITE)
    draw = ImageDraw.Draw(img)
    draw_top_banner(img, draw, f"第 {idx} 集")

    # 顶部小标签
    f_label = font(40, bold=True)
    draw.text((W // 2, 220), "你是不是也这样？", fill=GRAY_TEXT, font=f_label, anchor="mm")

    # 痛点核心（一句话，大字）
    f_pain = font(72, bold=True)
    pain_lines = [
        "信息分散", "错过截止", "刷题无数",
        "正确率低", "节奏混乱", "焦虑失眠"
    ]
    # 选择 1-2 个痛点
    pain = pain_lines[hash(topic["title_zh"]) % len(pain_lines)]
    draw_centered_text(draw, pain, 400, f_pain, BRAND_RED, W)

    # 副标题（小字补充）
    f_sub = font(36)
    sub_text = "—— 这是 90% 秋招人的真实状态"
    draw_centered_text(draw, sub_text, 800, f_sub, DARK_TEXT, W)

    draw_bottom_brand(draw, idx, total, W, H)
    return img


def make_img3_solution(topic, idx, total):
    """图 3：解决方案（一句话）"""
    img, W, H = make_base_image(WHITE)
    draw = ImageDraw.Draw(img)
    draw_top_banner(img, draw, f"第 {idx} 集")

    # 标签
    f_label = font(40, bold=True)
    draw.text((W // 2, 220), "解法", fill=GRAY_TEXT, font=f_label, anchor="mm")

    # 一句话核心建议
    f_main = font(80, bold=True)

    # 从 tip 中提取（去产品名）
    tip = topic["tip"]
    for kw in ["求职雷达", "答题悬浮助手", "quizmate.vip", "watch.quizmate.vip",
               "推荐用网页答题工具", "推荐用相应工具", "用网页答题工具",
               "用相应工具", "用招聘流程监控工具"]:
        tip = tip.replace(kw, "")
    tip = tip.strip().rstrip("。.,.").strip()
    if not tip:
        tip = topic["title_zh"].replace("答题悬浮助手", "").replace("求职雷达", "")

    # 限制到 2 行内
    draw_centered_text(draw, tip[:24], 380, f_main, BRAND_RED, W)

    # 强调框
    f_emph = font(44)
    y = 800
    draw.rounded_rectangle([80, y - 40, W - 80, y + 200],
                           radius=20, fill=LIGHT_PINK, outline=BRAND_RED, width=4)
    draw.text((W // 2, y + 20), "👇 重点记住这一句", fill=BRAND_RED, font=f_emph, anchor="mm")
    # 在框里再写一行
    draw_centered_text(draw, "适合所有秋招同学", y + 100, f_emph, DARK_TEXT, W)

    draw_bottom_brand(draw, idx, total, W, H)
    return img


def make_img4_action(topic, idx, total):
    """图 4：行动指引（一句话动作）"""
    img, W, H = make_base_image(WHITE)
    draw = ImageDraw.Draw(img)
    draw_top_banner(img, draw, f"第 {idx} 集")

    # 大标题
    f_title = font(72, bold=True)
    draw_centered_text(draw, "现在就开始", 250, f_title, BRAND_RED, W)

    # 3 个动作点（每点一行，大字）
    f_action = font(56, bold=True)

    actions = ["① 明确目标", "② 建立清单", "③ 持续执行"]
    y = 500
    for action in actions:
        draw.text((W // 2, y), action, fill=DARK_TEXT, font=f_action, anchor="mm")
        y += 130

    # 强调
    f_emph = font(40)
    draw.text((W // 2, 1000), "坚持 30 天 = 看见结果",
              fill=BRAND_RED, font=f_emph, anchor="mm")

    draw_bottom_brand(draw, idx, total, W, H)
    return img


def make_img5_qrcode(topic, idx, total):
    """图 5：二维码 + 加微信引导"""
    img, W, H = make_base_image(WHITE)
    draw = ImageDraw.Draw(img)
    draw_top_banner(img, draw, f"第 {idx} 集")

    # 顶部引导语（大字）
    f_top = font(72, bold=True)
    draw_centered_text(draw, "想要更多？", 240, f_top, BRAND_RED, W)

    # 二维码（中央）
    qr_size = 600
    qr_x = (W - qr_size) // 2
    qr_y = 360
    pad = 20
    draw.rounded_rectangle([qr_x - pad, qr_y - pad, qr_x + qr_size + pad, qr_y + qr_size + pad],
                           radius=24, fill=LIGHT_PINK, outline=BRAND_RED, width=5)
    qr_img = Image.open(QRCODE_PATH).convert("RGB")
    qr_img = qr_img.resize((qr_size, qr_size), Image.NEAREST)
    img.paste(qr_img, (qr_x, qr_y))

    # 二维码下方引导（大字）
    f_qr_title = font(56, bold=True)
    draw.text((W // 2, 1080), "👆 长按识别二维码", fill=BRAND_RED, font=f_qr_title, anchor="mm")

    f_qr_sub = font(40)
    draw.text((W // 2, 1170), "加企业微信，咨询秋招方案",
              fill=DARK_TEXT, font=f_qr_sub, anchor="mm")

    draw_bottom_brand(draw, idx, total, W, H)
    return img


def make_dy_carousel(topic):
    """生成抖音图文轮播：5 张图"""
    total = 5
    images = [
        make_img1_hook(topic, 1, total),      # 封面反问
        make_img2_pain(topic, 2, total),      # 痛点
        make_img3_solution(topic, 3, total),  # 解决方案
        make_img4_action(topic, 4, total),    # 行动指引
        make_img5_qrcode(topic, 5, total),    # 二维码 CTA
    ]
    return images


def main():
    dy_dir = os.path.join(BASE_DIR, "09_抖音")
    # 清理旧的轮播图（保留原 cover 和 md 文件）
    for f in os.listdir(dy_dir):
        if f.startswith("dy_") and f.endswith(".jpg") and "carousel" not in f and "cover" not in f:
            try:
                os.remove(os.path.join(dy_dir, f))
            except OSError:
                pass
    print("清理抖音旧轮播图完成")

    print("\n开始生成抖音轮播图（每篇 5 张，共 100 张）...")
    total_imgs = 0
    for topic in TOPICS:
        images = make_dy_carousel(topic)
        for i, img in enumerate(images, 1):
            out = os.path.join(dy_dir, f"dy_{topic['id']:02d}_carousel_{i}.jpg")
            img.save(out, quality=90)
            total_imgs += 1
        print(f"  ✓ {topic['id']:02d}. {topic['topic']} (5 张)")

    print(f"\n总计：{total_imgs} 张轮播图生成成功")
    print(f"输出目录：{dy_dir}")


if __name__ == "__main__":
    main()