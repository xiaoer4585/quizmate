from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path


def find_ffmpeg(root: Path, explicit: Path | None) -> Path:
    if explicit:
        candidate = explicit.resolve()
        if candidate.exists():
            return candidate
        raise FileNotFoundError(candidate)

    candidates = sorted((root / ".deps" / "imageio_ffmpeg" / "binaries").glob("ffmpeg*.exe"))
    if candidates:
        return candidates[0]
    raise FileNotFoundError(
        "No project-local ffmpeg binary found. Install imageio-ffmpeg into <project>/.deps "
        "or pass --ffmpeg."
    )


def run(command, cwd):
    subprocess.run([str(value) for value in command], cwd=str(cwd), check=True)


def main():
    parser = argparse.ArgumentParser(description="Regenerate illustrated DOCX/PDF manuals and website videos.")
    parser.add_argument("--project-root", type=Path, required=True)
    parser.add_argument("--ffmpeg", type=Path)
    args = parser.parse_args()

    root = args.project_root.resolve()
    manifest_path = root / "tools" / "video_manual_manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    ffmpeg = find_ffmpeg(root, args.ffmpeg)

    run(
        [
            sys.executable,
            root / "tools" / "build_video_manual.py",
            "--root",
            root,
            "--manifest",
            manifest_path,
            "--ffmpeg",
            ffmpeg,
        ],
        root,
    )
    run(
        [
            sys.executable,
            root / "tools" / "build_video_manual_pdf.py",
            "--root",
            root,
            "--manifest",
            manifest_path,
        ],
        root,
    )

    site_assets = root / "考试插件" / "下载官网" / "assets"
    site_assets.mkdir(parents=True, exist_ok=True)
    shutil.copy2(root / manifest["videos"]["desktop"], site_assets / "desktop-demo.mp4")
    shutil.copy2(root / manifest["videos"]["android"], site_assets / "android-demo.mp4")

    outputs = {
        "docx": str(root / manifest["outputs"]["docx"]),
        "pdf": str(root / manifest["outputs"]["pdf"]),
        "frames": str(root / manifest["outputs"]["frames"]),
        "desktop_video": str(site_assets / "desktop-demo.mp4"),
        "android_video": str(site_assets / "android-demo.mp4"),
    }
    for path in outputs.values():
        if not Path(path).exists():
            raise FileNotFoundError(path)
    print(json.dumps(outputs, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
