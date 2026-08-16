# Project layout

Use paths relative to the project root.

| Purpose | Path |
|---|---|
| Desktop source video | `宣传/电脑端_精修.mp4` |
| Android source video | `宣传/安卓端操作教程.mp4` |
| Step and frame manifest | `tools/video_manual_manifest.json` |
| DOCX builder | `tools/build_video_manual.py` |
| PDF builder | `tools/build_video_manual_pdf.py` |
| Website root | `考试插件/下载官网` |
| Website manual screenshots | `考试插件/下载官网/assets/manual` |
| Website Word manual | `考试插件/下载官网/downloads/学习悬浮助手操作手册.docx` |
| Website PDF manual | `考试插件/下载官网/downloads/学习悬浮助手操作手册.pdf` |
| Website desktop tutorial | `考试插件/下载官网/assets/desktop-demo.mp4` |
| Website Android tutorial | `考试插件/下载官网/assets/android-demo.mp4` |

The project keeps `imageio-ffmpeg` under `.deps/`. Its bundled executable is normally:

`.deps/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe`

If that file changes, locate the executable through `imageio_ffmpeg.get_ffmpeg_exe()` or pass `--ffmpeg`.
