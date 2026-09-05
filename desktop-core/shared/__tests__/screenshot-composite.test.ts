import { describe, expect, it } from 'vitest'
import { composeVerticalBitmap } from '../screenshot-composite'

function pixel(r: number, g: number, b: number, a = 255): Buffer {
  return Buffer.from([b, g, r, a])
}

describe('composeVerticalBitmap', () => {
  it('stacks screenshots in queue order and pads narrower rows', () => {
    const top = Buffer.concat([pixel(255, 0, 0), pixel(0, 255, 0)])
    const bottom = pixel(0, 0, 255)

    const result = composeVerticalBitmap([
      { buffer: top, width: 2, height: 1 },
      { buffer: bottom, width: 1, height: 1 },
    ])

    expect(result?.width).toBe(2)
    expect(result?.height).toBe(2)
    expect(Array.from(result?.buffer ?? [])).toEqual([
      0, 0, 255, 255, 0, 255, 0, 255,
      255, 0, 0, 255, 255, 255, 255, 255,
    ])
  })

  it('returns null for an empty or invalid queue', () => {
    expect(composeVerticalBitmap([])).toBeNull()
    expect(composeVerticalBitmap([{ buffer: Buffer.alloc(3), width: 1, height: 1 }])).toBeNull()
  })
})
