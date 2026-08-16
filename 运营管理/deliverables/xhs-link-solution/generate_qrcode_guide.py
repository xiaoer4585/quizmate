# -*- coding: utf-8 -*-
"""
小红书站外引流完整方案 — 物料生成脚本
生成内容：
1. 独立二维码 PNG（quizmate_qrcode.png）
2. 小红书竖版引导图（xhs_guide_1080x1440.png）— 可直接作为笔记配图上传
3. 百家号横版引导图（bh_guide_1200x675.png）
"""
import qrcode
from qrcode.constants import ERROR_CORRECT_H
from PIL import Image, ImageDraw, ImageFont
import os

# ========== 配置 ==========
WEBSITE_URL = "https://www.quizmate.vip/"
BRAND_RED = (255, 36, 66)       # #FF2442
WHITE = (255, 255, 255)
LIGHT_PINK = (255, 240, 242)    # #FFF0F2
DARK_TEXT = (40, 40, 40)
GRAY_TEXT = (120, 120, 120)

OUTPUT_DIR = os.path.dirname(os.path.abspath(__file__))

# 字体路径（微软雅黑）
FONT_REGULAR = r"C:\Windows\Fonts\msyh.ttc"
FONT_BOLD = r"C:\Windows\Fonts\msyhbd.ttc"

def get_font(size, bold=False):
    path = FONT_BOLD if bold else FONT_REGULAR
    return ImageFont.truetype(path, size)

# ========== 1. 生成独立二维码 ==========
def generate_qrcode():
    qr = qrcode.QRCode(
        version=None,
        error_correction=ERROR_CORRECT_H,  # 高容错
        box_size=20,
        border=2,
    )
    qr.add_data(WEBSITE_URL)
    qr.make(fit=True)
    qr_img = qr.make_image(fill_color=BRAND_RED, back_color=WHITE)
    # 放大到 600x600
    qr_img = qr_img.resize((600, 600), Image.NEAREST)
    path = os.path.join(OUTPUT_DIR, "quizmate_qrcode.png")
    qr_img.save(path, quality=95)
    print(f"[OK] 二维码已保存: {path}")
    return qr_img

# ========== 2. 小红书竖版引导图 1080x1440 ==========
def generate_xhs_guide(qr_img):
    W, H = 1080, 1440
    img = Image.new("RGB", (W, H), WHITE)
    draw = ImageDraw.Draw(img)

    # 顶部品牌红色横条
    draw.rectangle([0, 0, W, 120], fill=BRAND_RED)
    title_font = get_font(52, bold=True)
    draw.text((W//2, 60), "QuizMate 答题悬浮助手", fill=WHITE,
              font=title_font, anchor="mm")

    # 主标题
    main_font = get_font(64, bold=True)
    draw.text((W//2, 260), "长按识别二维码", fill=BRAND_RED,
              font=main_font, anchor="mm")

    sub_font = get_font(40)
    draw.text((W//2, 340), "即可访问官网", fill=DARK_TEXT,
              font=sub_font, anchor="mm")

    # 二维码区域（居中）
    qr_size = 680
    qr_x = (W - qr_size) // 2
    qr_y = 430
    # 白底圆角背景（浅粉边框）
    padding = 30
    bg_x1 = qr_x - padding
    bg_y1 = qr_y - padding
    bg_x2 = qr_x + qr_size + padding
    bg_y2 = qr_y + qr_size + padding
    draw.rounded_rectangle([bg_x1, bg_y1, bg_x2, bg_y2],
                           radius=24, fill=LIGHT_PINK, outline=BRAND_RED, width=4)
    # 贴二维码
    qr_resized = qr_img.resize((qr_size, qr_size), Image.NEAREST)
    img.paste(qr_resized, (qr_x, qr_y))

    # 底部引导文字
    tip_font = get_font(42, bold=True)
    draw.text((W//2, 1220), "也可以戳我头像 → 看主页简介", fill=BRAND_RED,
              font=tip_font, anchor="mm")

    tip2_font = get_font(34)
    draw.text((W//2, 1290), "主页简介里有官网链接，可直接点击", fill=GRAY_TEXT,
              font=tip2_font, anchor="mm")

    # 底部品牌条
    draw.rectangle([0, 1360, W, 1440], fill=BRAND_RED)
    footer_font = get_font(30)
    draw.text((W//2, 1400), "www.quizmate.vip", fill=WHITE,
              font=footer_font, anchor="mm")

    path = os.path.join(OUTPUT_DIR, "xhs_guide_1080x1440.png")
    img.save(path, quality=95)
    print(f"[OK] 小红书引导图已保存: {path}")

# ========== 3. 百家号横版引导图 1200x675 ==========
def generate_bh_guide(qr_img):
    W, H = 1200, 675
    img = Image.new("RGB", (W, H), WHITE)
    draw = ImageDraw.Draw(img)

    # 左侧文字区（限宽 680px，留出二维码区域）
    title_font = get_font(44, bold=True)
    draw.text((60, 100), "QuizMate 答题悬浮助手", fill=BRAND_RED,
              font=title_font, anchor="lm")

    main_font = get_font(40, bold=True)
    draw.text((60, 240), "扫描二维码 访问官网", fill=DARK_TEXT,
              font=main_font, anchor="lm")

    sub_font = get_font(28)
    draw.text((60, 320), "不截屏不切屏  |  个人知识库  |  AI多模型", fill=GRAY_TEXT,
              font=sub_font, anchor="lm")

    url_font = get_font(34, bold=True)
    draw.text((60, 470), "www.quizmate.vip", fill=BRAND_RED,
              font=url_font, anchor="lm")

    # 右侧二维码区域（右侧 480px 区域）
    qr_size = 440
    qr_x = W - qr_size - 60
    qr_y = (H - qr_size) // 2
    padding = 20
    draw.rounded_rectangle([qr_x - padding, qr_y - padding,
                            qr_x + qr_size + padding, qr_y + qr_size + padding],
                           radius=16, fill=LIGHT_PINK, outline=BRAND_RED, width=3)
    qr_resized = qr_img.resize((qr_size, qr_size), Image.NEAREST)
    img.paste(qr_resized, (qr_x, qr_y))

    path = os.path.join(OUTPUT_DIR, "bh_guide_1200x675.png")
    img.save(path, quality=95)
    print(f"[OK] 百家号引导图已保存: {path}")

# ========== 执行 ==========
if __name__ == "__main__":
    print("=" * 50)
    print("小红书站外引流完整方案 — 物料生成")
    print("=" * 50)

    qr = generate_qrcode()
    generate_xhs_guide(qr)
    generate_bh_guide(qr)

    print("\n全部物料生成完成！")
    print(f"输出目录: {OUTPUT_DIR}")
