from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
LOGO = ROOT.parent / "品牌素材" / "微信图片_2026-07-18_214023_380.png"
OUTPUT = ROOT / "02_品牌素材"
OUTPUT.mkdir(parents=True, exist_ok=True)


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    candidates = [
        Path(r"C:\Windows\Fonts\msyhbd.ttc") if bold else Path(r"C:\Windows\Fonts\msyh.ttc"),
        Path(r"C:\Windows\Fonts\simhei.ttf"),
    ]
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size=size)
    return ImageFont.load_default()


def fitted_logo(size: int) -> Image.Image:
    source = Image.open(LOGO).convert("RGBA")
    source.thumbnail((size, size), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (7, 18, 43, 255))
    canvas.alpha_composite(source, ((size - source.width) // 2, (size - source.height) // 2))
    return canvas


def make_header() -> None:
    width, height = 1920, 190
    image = Image.new("RGBA", (width, height), (5, 13, 32, 255))
    draw = ImageDraw.Draw(image)
    for x in range(width):
        ratio = x / max(width - 1, 1)
        color = (
            int(5 + 6 * ratio),
            int(13 + 16 * ratio),
            int(32 + 28 * ratio),
            255,
        )
        draw.line((x, 0, x, height - 1), fill=color)

    logo = fitted_logo(136)
    image.alpha_composite(logo, (38, 25))

    draw.text((204, 25), "QuizMate 答题悬浮助手", font=font(50, bold=True), fill=(255, 255, 255, 255))
    draw.text((206, 96), "官方网站  www.quizmate.vip", font=font(30), fill=(119, 224, 255, 255))
    draw.text((1310, 65), "Windows / macOS 使用教程", font=font(32), fill=(222, 232, 247, 255))
    draw.text((1312, 112), "界面与功能请以正式产品为准", font=font(22), fill=(151, 169, 198, 255))
    draw.rectangle((0, height - 5, width, height), fill=(50, 209, 255, 255))
    image.save(OUTPUT / "video-brand-header.png", optimize=True)


def make_intro_card() -> None:
    width, height = 1040, 300
    image = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle(
        (0, 0, width - 1, height - 1),
        radius=38,
        fill=(5, 13, 32, 246),
        outline=(50, 209, 255, 255),
        width=4,
    )
    logo = fitted_logo(190)
    image.alpha_composite(logo, (52, 54))
    draw.text((286, 50), "QuizMate", font=font(62, bold=True), fill=(255, 255, 255, 255))
    draw.text((289, 132), "答题悬浮助手 使用教程", font=font(42, bold=True), fill=(215, 235, 252, 255))
    draw.text((292, 210), "www.quizmate.vip", font=font(31), fill=(87, 220, 255, 255))
    image.save(OUTPUT / "video-brand-intro-card.png", optimize=True)


def make_nav_badge() -> None:
    width, height = 570, 108
    image = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle(
        (0, 0, width - 1, height - 1),
        radius=20,
        fill=(5, 13, 32, 250),
        outline=(50, 209, 255, 255),
        width=3,
    )
    logo = fitted_logo(82)
    image.alpha_composite(logo, (14, 13))
    draw.text((112, 13), "QuizMate 答题悬浮助手", font=font(30, bold=True), fill=(255, 255, 255, 255))
    draw.text((114, 61), "www.quizmate.vip", font=font(22), fill=(87, 220, 255, 255))
    image.save(OUTPUT / "video-nav-brand-badge.png", optimize=True)


if __name__ == "__main__":
    if not LOGO.exists():
        raise FileNotFoundError(f"找不到品牌 Logo：{LOGO}")
    make_header()
    make_intro_card()
    make_nav_badge()
    print(OUTPUT)
