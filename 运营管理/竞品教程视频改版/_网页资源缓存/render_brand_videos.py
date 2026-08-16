from pathlib import Path
import subprocess


ROOT = Path(__file__).resolve().parents[1]
FFMPEG = ROOT / "_网页资源缓存" / "python_packages" / "imageio_ffmpeg" / "binaries" / "ffmpeg-win-x86_64-v7.1.exe"
HEADER = ROOT / "02_品牌素材" / "video-brand-header.png"
CARD = ROOT / "02_品牌素材" / "video-brand-intro-card.png"
NAV_BADGE = ROOT / "02_品牌素材" / "video-nav-brand-badge.png"
SOURCE = ROOT / "01_竞品原片"
OUTPUT = ROOT / "03_品牌适配成片"
OUTPUT.mkdir(parents=True, exist_ok=True)


JOBS = [
    (
        SOURCE / "QuizCoze-Windows教程-原片.mp4",
        OUTPUT / "QuizMate-答题悬浮助手-Windows使用教程-品牌适配版.mp4",
        12,
    ),
    (
        SOURCE / "QuizCoze-macOS教程-原片.mp4",
        OUTPUT / "QuizMate-答题悬浮助手-macOS使用教程-品牌适配版.mp4",
        16,
    ),
]


def render(source: Path, output: Path, intro_seconds: int) -> None:
    if output.exists():
        output.unlink()
    filter_graph = (
        "[1:v]format=rgba[header];"
        "[0:v][header]overlay=0:0:eof_action=pass[with_header];"
        "[3:v]format=rgba[nav_badge];"
        "[with_header][nav_badge]overlay=96:205:eof_action=pass[with_nav_badge];"
        "[2:v]format=rgba[card];"
        f"[with_nav_badge][card]overlay=x=(main_w-overlay_w)/2:y=270:"
        f"enable='between(t,0,{intro_seconds})':eof_action=pass[vout]"
    )
    command = [
        str(FFMPEG),
        "-hide_banner",
        "-y",
        "-i",
        str(source),
        "-loop",
        "1",
        "-framerate",
        "30",
        "-i",
        str(HEADER),
        "-loop",
        "1",
        "-framerate",
        "30",
        "-i",
        str(CARD),
        "-loop",
        "1",
        "-framerate",
        "30",
        "-i",
        str(NAV_BADGE),
        "-filter_complex",
        filter_graph,
        "-map",
        "[vout]",
        "-map",
        "0:a:0?",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "21",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "copy",
        "-movflags",
        "+faststart",
        "-shortest",
        "-metadata",
        "title=QuizMate 答题悬浮助手使用教程",
        str(output),
    ]
    print(f"开始生成：{output.name}", flush=True)
    subprocess.run(command, check=True)


if __name__ == "__main__":
    required = [FFMPEG, HEADER, CARD, NAV_BADGE, *(item[0] for item in JOBS)]
    missing = [str(path) for path in required if not path.exists()]
    if missing:
        raise FileNotFoundError("缺少以下文件：\n" + "\n".join(missing))
    for job in JOBS:
        render(*job)
    print("两个品牌适配版视频均已生成。", flush=True)
