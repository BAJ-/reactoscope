import { describe, it, expect, beforeAll } from 'vitest'
import { compareSnapshots } from './pdiff'

beforeAll(() => {
  if (typeof globalThis.ImageData === 'undefined') {
    globalThis.ImageData = class ImageData {
      readonly width: number
      readonly height: number
      readonly data: Uint8ClampedArray
      constructor(
        dataOrWidth: Uint8ClampedArray | number,
        widthOrHeight: number,
        height?: number,
      ) {
        if (dataOrWidth instanceof Uint8ClampedArray) {
          this.data = dataOrWidth
          this.width = widthOrHeight
          this.height = height!
        } else {
          this.width = dataOrWidth
          this.height = widthOrHeight
          this.data = new Uint8ClampedArray(this.width * this.height * 4)
        }
      }
    } as unknown as typeof ImageData
  }
})

function makeImageData(
  width: number,
  height: number,
  fill: [number, number, number, number],
): ImageData {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < data.length; i += 4) {
    data[i] = fill[0]
    data[i + 1] = fill[1]
    data[i + 2] = fill[2]
    data[i + 3] = fill[3]
  }
  return new ImageData(data, width, height)
}

describe('compareSnapshots', () => {
  it('reports zero changes for identical images', () => {
    const a = makeImageData(2, 2, [255, 0, 0, 255])
    const b = makeImageData(2, 2, [255, 0, 0, 255])

    const result = compareSnapshots(a, b)

    expect(result.changedPixels).toBe(0)
    // All pixels should be transparent
    for (let i = 0; i < result.diff.data.length; i += 4) {
      expect(result.diff.data[i + 3]).toBe(0)
    }
  })

  it('reports all pixels changed for completely different images', () => {
    const a = makeImageData(2, 2, [255, 0, 0, 255])
    const b = makeImageData(2, 2, [0, 0, 255, 255])

    const result = compareSnapshots(a, b)

    expect(result.changedPixels).toBe(4)
    // All pixels should be magenta
    for (let i = 0; i < result.diff.data.length; i += 4) {
      expect(result.diff.data[i]).toBe(255) // R
      expect(result.diff.data[i + 1]).toBe(0) // G
      expect(result.diff.data[i + 2]).toBe(255) // B
      expect(result.diff.data[i + 3]).toBe(255) // A
    }
  })

  it('detects a single changed pixel', () => {
    const a = makeImageData(3, 1, [100, 100, 100, 255])
    const bData = new Uint8ClampedArray(a.data)
    // Change middle pixel's red channel by 1
    bData[4] = 101
    const b = new ImageData(bData, 3, 1)

    const result = compareSnapshots(a, b)

    expect(result.changedPixels).toBe(1)
    // First pixel: transparent (unchanged)
    expect(result.diff.data[3]).toBe(0)
    // Second pixel: magenta (changed)
    expect(result.diff.data[4]).toBe(255)
    expect(result.diff.data[5]).toBe(0)
    expect(result.diff.data[6]).toBe(255)
    expect(result.diff.data[7]).toBe(255)
    // Third pixel: transparent (unchanged)
    expect(result.diff.data[11]).toBe(0)
  })

  it('detects alpha-only changes', () => {
    const a = makeImageData(1, 1, [0, 0, 0, 255])
    const b = makeImageData(1, 1, [0, 0, 0, 128])

    const result = compareSnapshots(a, b)

    expect(result.changedPixels).toBe(1)
  })

  it('handles different-sized images by using the union size', () => {
    // 2x1 red vs 3x2 blue — union is 3x2 = 6 pixels, all changed
    const a = makeImageData(2, 1, [255, 0, 0, 255])
    const b = makeImageData(3, 2, [0, 0, 255, 255])

    const result = compareSnapshots(a, b)

    expect(result.diff.width).toBe(3)
    expect(result.diff.height).toBe(2)
    // All 6 pixels should be changed (2 overlapping differ + 4 only in one)
    expect(result.changedPixels).toBe(6)
  })

  it('marks size-only growth pixels as changed', () => {
    // Same color, but after is wider — extra column should be changed
    const a = makeImageData(2, 1, [100, 100, 100, 255])
    const b = makeImageData(3, 1, [100, 100, 100, 255])

    const result = compareSnapshots(a, b)

    expect(result.diff.width).toBe(3)
    expect(result.diff.height).toBe(1)
    // First 2 pixels match, third pixel only in 'after'
    expect(result.changedPixels).toBe(1)
  })
})
