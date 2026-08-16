# -*- coding: utf-8 -*-
"""
小红书 + 抖音配图生成器
- 每个选题生成 1 张 1080×1440 文字排版图
- 二维码固定在右下角
- 标题 + 关键要点 + 二维码
"""
import os
import sys
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from topics_data import TOPICS

BASE_DIR = r"E:\ai项目\考试插件\运营管理\deliverables\2026-07-25-秋招多平台20篇-md"
QRCODE_PATH = os.path.join(BASE_DIR, "qrcode_wechat.jpg")

# 颜色
BRAND_RED = (255, 36, 66)        # #FF2442
WHITE = (255, 255, 255)
LIGHT_PINK = (255, 240, 242)     # #FFF0F2
DARK_TEXT = (40, 40, 40)
GRAY_TEXT = (120, 120, 120)
LIGHT_GRAY = (240, 240, 240)

# 字体
FONT_REG = r"C:\Windows\Fonts\msyh.ttc"
FONT_BOLD = r"C:\Windows\Fonts\msyhbd.ttc"


def font(size, bold=False):
    path = FONT_BOLD if bold else FONT_REG
    return ImageFont.truetype(path, size)


def generate_cover(topic, platform, out_dir, img_name):
    """生成 1080×1440 文字排版图"""
    W, H = 1080, 1440
    img = Image.new("RGB", (W, H), WHITE)
    draw = ImageDraw.Draw(img)

    # 顶部红色横条
    draw.rectangle([0, 0, W, 140], fill=BRAND_RED)
    plat_label = "小红书图文" if platform == "08_小红书" else "抖音图文"
    f_brand = font(36, bold=True)
    f_sub = font(22)
    draw.text((40, 50), "QuizMate 秋招指南", fill=WHITE, font=f_brand)
    draw.text((40, 100), f"#{topic['category']} · {plat_label}", fill=(255, 220, 225), font=f_sub)

    # 主标题（安全处理，不出现产品名）
    title = topic['title_zh']
    for kw in ["答题悬浮助手", "求职雷达"]:
        title = title.replace(kw, "")
    f_title = font(46, bold=True)
    # 标题换行处理
    title_lines = wrap_text(title, f_title, W - 80)
    y = 180
    for line in title_lines:
        draw.text((W//2, y), line, fill=BRAND_RED, font=f_title, anchor="mm")
        y += 56

    # 内容卡片（浅粉底）
    card_y1 = y + 20
    card_y2 = 1080
    draw.rounded_rectangle(
        [40, card_y1, W - 40, card_y2],
        radius=20, fill=LIGHT_PINK, outline=BRAND_RED, width=3
    )

    # 关键要点标题
    f_section = font(30, bold=True)
    draw.text((60, card_y1 + 24), "📋 核心要点", fill=BRAND_RED, font=f_section)

    # 要点列表
    f_bullet = font(24)
    y = card_y1 + 80
    for i, f in enumerate(topic["facts"][:4], 1):
        text = f"{i}. {f}"
        wrapped = wrap_text(text, f_bullet, W - 140)
        for line in wrapped:
            if y > card_y2 - 20:
                break
            draw.text((60, y), line, fill=DARK_TEXT, font=f_bullet)
            y += 36
        y += 8
        if y > card_y2 - 20:
            break

    # Tip 区域
    if y < card_y2 - 60:
        draw.line([60, y, W - 60, y], fill=(255, 200, 210), width=2)
        y += 16
        f_tip_label = font(22, bold=True)
        draw.text((60, y), "💡 关键思路", fill=BRAND_RED, font=f_tip_label)
        y += 36
        f_tip = font(22)
        tip_text = topic["tip"]
        for kw in ["答题悬浮助手", "求职雷达"]:
            tip_text = tip_text.replace(kw, "对应工具")
        wrapped = wrap_text(tip_text, f_tip, W - 140)
        for line in wrapped:
            if y > card_y2 - 20:
                break
            draw.text((60, y), line, fill=DARK_TEXT, font=f_tip)
            y += 32

    # 底部二维码区域
    qr_y = 1110
    qr_size = 220
    qr_x = 60

    # 二维码白底圆角边框
    pad = 14
    draw.rounded_rectangle(
        [qr_x - pad, qr_y - pad, qr_x + qr_size + pad, qr_y + qr_size + pad],
        radius=16, fill=WHITE, outline=BRAND_RED, width=4
    )
    qr_img = Image.open(QRCODE_PATH).convert("RGB")
    qr_img = qr_img.resize((qr_size, qr_size), Image.NEAREST)
    img.paste(qr_img, (qr_x, qr_y))

    # 二维码右侧文字
    text_x = qr_x + qr_size + 40
    f_qr_title = font(28, bold=True)
    f_qr_sub = font(20)

    draw.text((text_x, qr_y + 40), "加企业微信", fill=BRAND_RED, font=f_qr_title)
    draw.text((text_x, qr_y + 80), "免费咨询秋招", fill=DARK_TEXT, font=f_qr_sub)
    draw.text((text_x, qr_y + 115), "方案 + 工具", fill=DARK_TEXT, font=f_qr_sub)
    draw.text((text_x, qr_y + 150), "👆 长按图片识别", fill=BRAND_RED, font=f_qr_sub)

    # 底部品牌条
    draw.rectangle([0, 1360, W, 1440], fill=BRAND_RED)
    f_foot = font(28, bold=True)
    draw.text((W//2, 1400), f"#{topic['id']:02d} · 2026 秋招", fill=WHITE, font=f_foot, anchor="mm")

    # 保存
    out = os.path.join(out_dir, img_name)
    os.makedirs(out_dir, exist_ok=True)
    img.save(out, quality=92)
    return out


def wrap_text(text, font_obj, max_width):
    """简单的文字换行处理"""
    if not text:
        return [""]
    # 估算宽度
    avg_char_w = font_obj.size * 0.95
    max_chars = int(max_width / avg_char_w)
    if max_chars < 6:
        max_chars = 6

    lines = []
    current = ""
    for ch in text:
        # 粗略按 CJK 字符算 1 单位宽度，ASCII 算 0.5
        char_w = 1.0 if ord(ch) > 127 else 0.55
        if len(current) + char_w > max_chars:
            lines.append(current)
            current = ch
        else:
            current += ch
    if current:
        lines.append(current)
    return lines


def main():
    print("开始生成小红书 + 抖音配图...")
    total = 0
    for platform, img_name in [("08_小红书", "xhs_cover.jpg"), ("09_抖音", "dy_cover.jpg")]:
        out_dir = os.path.join(BASE_DIR, platform)
        print(f"\n[{platform}] 生成 {len(TOPICS)} 张 {img_name}")
        for topic in TOPICS:
            try:
                # 每篇文章图名 + 选题编号，避免冲突
                out_name = f"{img_name.split('.')[0]}_{topic['id']:02d}.jpg"
                # 但 xhs_cover.jpg 是 .md 里引用的文件名
                # 每篇 .md 引用同目录的 xhs_cover.jpg，所以每篇用覆盖式也OK
                # 更稳妥：每篇生成独立图，.md 引用对应编号
                generate_cover(topic, platform, out_dir, out_name)
                total += 1
            except Exception as e:
                print(f"  ✗ {topic['id']:02d}. {topic['topic']} - ERROR: {e}")
        print(f"  ✓ 完成")

    # 另存一份所有 .md 引用的"统一图名"
    for platform in ("08_小红书", "09_抖音"):
        base_name = "xhs_cover.jpg" if platform == "08_小红书" else "dy_cover.jpg"
        out_dir = os.path.join(BASE_DIR, platform)
        # 把第 1 张图复制成 base_name（确保 .md 引用能找到）
        src = os.path.join(out_dir, f"{base_name.split('.')[0]}_01.jpg")
        dst = os.path.join(out_dir, base_name)
        if os.path.exists(src):
            import shutil
            shutil.copy(src, dst)
            print(f"  复制 {src} -> {dst}")

    print(f"\n总计：{total} 张配图生成成功")


if __name__ == "__main__":
    main()
