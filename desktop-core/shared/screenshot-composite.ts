export interface ScreenshotBitmap {
  buffer: Buffer
  width: number
  height: number
}

/** Stack screenshots vertically in queue order, keeping the widest row width. */
export function composeVerticalBitmap(bitmaps: ScreenshotBitmap[]): ScreenshotBitmap | null {
  const valid = bitmaps.filter((bitmap) => {
    const rowBytes = bitmap.width * 4
    return bitmap.width > 0 && bitmap.height > 0 && bitmap.buffer.length >= rowBytes * bitmap.height
  })
  if (!valid.length) return null

  const width = Math.max(...valid.map((bitmap) => bitmap.width))
  const height = valid.reduce((sum, bitmap) => sum + bitmap.height, 0)
  const buffer = Buffer.alloc(width * height * 4, 0xff)

  let offsetY = 0
  for (const bitmap of valid) {
    const srcRowBytes = bitmap.width * 4
    for (let row = 0; row < bitmap.height; row += 1) {
      const srcStart = row * srcRowBytes
      const dstStart = ((offsetY + row) * width) * 4
      bitmap.buffer.copy(buffer, dstStart, srcStart, srcStart + srcRowBytes)
    }
    offsetY += bitmap.height
  }

  return { buffer, width, height }
}
