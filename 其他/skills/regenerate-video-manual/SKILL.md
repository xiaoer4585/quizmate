---
name: regenerate-video-manual
description: Rebuild the Learning Floating Assistant user manual from updated desktop and Android MP4 operation videos. Use when Codex must inspect replacement tutorial videos frame by frame, revise the detailed step manifest, regenerate illustrated DOCX and PDF manuals, replace website video/manual assets, validate rendered pages, or repeat this workflow after the product UI changes.
---

# Regenerate Video Manual

Rebuild the product manual from the latest operation videos while keeping Word, PDF, screenshots, and website files synchronized.

## Required workflow

1. Read `references/project-layout.md` and confirm the project root and source videos.
2. Use the documents and PDF skills for the artifact work.
3. Inspect both videos before editing text:
   - Read duration and resolution.
   - Extract a frame every 3 seconds.
   - Create chronological contact sheets with timestamps.
   - Inspect transition points more closely and extract additional frames when needed.
4. Treat the videos as the source of truth. Do not preserve old instructions that conflict with what is visible.
5. Update `tools/video_manual_manifest.json`:
   - Keep steps in the same order as the videos.
   - Use precise interface names visible in the videos.
   - Add a screenshot timestamp, action detail, and practical tip to every step.
   - Keep Apple status as `开发中` until the user supplies a completed Apple workflow.
6. Run `scripts/regenerate_manual.py --project-root <root>`.
7. Render and inspect:
   - Render the DOCX with the documents skill. If LibreOffice is unavailable, perform structural DOCX checks and disclose that limitation.
   - Render the PDF to page PNGs with Poppler.
   - Build a contact sheet covering every page, then inspect the cover, one desktop page, one Android permission page, one Android usage page, and the final FAQ page at full size.
   - Fix clipping, overlap, unreadable screenshots, awkward page breaks, or inconsistent labels; rerun until clean.
8. Verify the website:
   - The Word and PDF links exist and point to the stable filenames.
   - The current tutorial videos replace `desktop-demo.mp4` and `android-demo.mp4`.
   - The manual card describes the current page count and supported versions.
9. Publish only when the user explicitly asks. Uploading or changing DNS/SSL is a separate deployment step.

## Content rules

- Use the `compact_reference_guide` document preset and `editorial_cover` first-page pattern.
- Prefer one screenshot per important user action.
- Keep desktop screenshots wide enough to read browser controls.
- Keep Android screenshots centered and tall enough to read system permission text.
- Explain notification, overlay, and accessibility/page-reading permissions separately.
- State that page reading enables simulated user interaction and that users should authorize it only for an official installation.
- Include installation, authorization, daily use, troubleshooting, and support.
- Do not invent features, button names, or platform support absent from the videos.

## Stable outputs

Keep these filenames unchanged so the website does not need link edits:

- `学习悬浮助手操作手册.docx`
- `学习悬浮助手操作手册.pdf`
- `assets/manual/*.jpg`
- `assets/desktop-demo.mp4`
- `assets/android-demo.mp4`

## Reusable script

Run:

```powershell
python scripts/regenerate_manual.py --project-root "D:\ai项目\考试插件"
```

Pass `--ffmpeg <path>` if the project-local `imageio-ffmpeg` dependency is unavailable.
