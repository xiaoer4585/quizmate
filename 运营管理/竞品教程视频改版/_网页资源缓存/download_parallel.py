from __future__ import annotations

import argparse
import concurrent.futures
import hashlib
import json
import os
import shutil
import time
from pathlib import Path

import requests


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def download_part(url: str, part_path: Path, start: int, end: int) -> None:
    expected = end - start + 1
    for attempt in range(1, 21):
        existing = part_path.stat().st_size if part_path.exists() else 0
        if existing == expected:
            return
        if existing > expected:
            raise RuntimeError(f"part already exceeds expected size: {existing} > {expected}")
        current_start = start + existing
        try:
            with requests.get(
                url,
                headers={"Range": f"bytes={current_start}-{end}"},
                stream=True,
                timeout=(20, 45),
            ) as response:
                response.raise_for_status()
                if response.status_code != 206:
                    raise RuntimeError(f"range request returned {response.status_code}")
                with part_path.open("ab") as handle:
                    for chunk in response.iter_content(chunk_size=1024 * 1024):
                        if chunk:
                            handle.write(chunk)
            actual = part_path.stat().st_size
            if actual != expected:
                raise RuntimeError(f"part size {actual}, expected {expected}")
            return
        except Exception:
            if attempt == 20:
                raise
            time.sleep(min(attempt * 2, 10))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("url")
    parser.add_argument("target")
    parser.add_argument("--size", type=int, required=True)
    parser.add_argument("--parts", type=int, default=8)
    parser.add_argument("--cache", required=True)
    parser.add_argument("--sha256")
    args = parser.parse_args()

    target = Path(args.target).resolve()
    cache = Path(args.cache).resolve()
    target.parent.mkdir(parents=True, exist_ok=True)
    cache.mkdir(parents=True, exist_ok=True)

    if target.exists() and target.stat().st_size == args.size:
        digest = sha256(target)
        if args.sha256 and digest.lower() != args.sha256.lower():
            raise RuntimeError(f"SHA-256 mismatch: {digest}")
        print(json.dumps({"path": str(target), "bytes": args.size, "sha256": digest}))
        return

    if target.exists():
        incomplete = cache / f"{target.stem}.incomplete-{target.stat().st_size}{target.suffix}"
        suffix = 1
        while incomplete.exists():
            incomplete = cache / f"{target.stem}.incomplete-{target.stat().st_size}-{suffix}{target.suffix}"
            suffix += 1
        target.replace(incomplete)

    chunk_size = (args.size + args.parts - 1) // args.parts
    ranges: list[tuple[int, int, Path]] = []
    for index in range(args.parts):
        start = index * chunk_size
        if start >= args.size:
            break
        end = min(args.size - 1, (index + 1) * chunk_size - 1)
        ranges.append((start, end, cache / f"{target.name}.part{index:02d}"))

    with concurrent.futures.ThreadPoolExecutor(max_workers=len(ranges)) as pool:
        futures = [pool.submit(download_part, args.url, part, start, end) for start, end, part in ranges]
        for future in concurrent.futures.as_completed(futures):
            future.result()

    assembling = target.with_suffix(target.suffix + ".download")
    with assembling.open("wb") as output:
        for _, _, part in ranges:
            with part.open("rb") as source:
                shutil.copyfileobj(source, output, length=1024 * 1024)

    actual = assembling.stat().st_size
    if actual != args.size:
        raise RuntimeError(f"assembled size {actual}, expected {args.size}")
    if target.suffix.lower() == ".mp4":
        with assembling.open("rb") as handle:
            if b"ftyp" not in handle.read(16):
                raise RuntimeError("MP4 signature not found")
    os.replace(assembling, target)
    for _, _, part in ranges:
        part.unlink()

    digest = sha256(target)
    if args.sha256 and digest.lower() != args.sha256.lower():
        raise RuntimeError(f"SHA-256 mismatch: {digest}")
    print(json.dumps({"path": str(target), "bytes": actual, "sha256": digest}))


if __name__ == "__main__":
    main()
