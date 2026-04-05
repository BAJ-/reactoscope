export interface PdiffResult {
  /** Diff image with changed pixels highlighted in magenta. */
  diff: ImageData
  /** Number of pixels that differ between the two images. */
  changedPixels: number
}

/**
 * Compare two ImageData snapshots pixel-by-pixel.
 * Returns a diff image where changed pixels are magenta and
 * unchanged pixels are transparent.
 *
 * Handles snapshots of different sizes (e.g. when a component
 * grows or shrinks between steps). The diff canvas uses the
 * union size (max width/height), and pixels only present in
 * one snapshot are marked as changed.
 */
export function compareSnapshots(
  before: ImageData,
  after: ImageData,
): PdiffResult {
  const width = Math.max(before.width, after.width)
  const height = Math.max(before.height, after.height)
  const diff = new ImageData(width, height)
  let changedPixels = 0

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const di = (y * width + x) * 4

      const inBefore = x < before.width && y < before.height
      const inAfter = x < after.width && y < after.height

      if (inBefore && inAfter) {
        const bi = (y * before.width + x) * 4
        const ai = (y * after.width + x) * 4

        const match =
          before.data[bi] === after.data[ai] &&
          before.data[bi + 1] === after.data[ai + 1] &&
          before.data[bi + 2] === after.data[ai + 2] &&
          before.data[bi + 3] === after.data[ai + 3]

        if (match) {
          diff.data[di] = 0
          diff.data[di + 1] = 0
          diff.data[di + 2] = 0
          diff.data[di + 3] = 0
        } else {
          diff.data[di] = 255
          diff.data[di + 1] = 0
          diff.data[di + 2] = 255
          diff.data[di + 3] = 255
          changedPixels++
        }
      } else {
        // Pixel exists in only one snapshot — count as changed
        diff.data[di] = 255
        diff.data[di + 1] = 0
        diff.data[di + 2] = 255
        diff.data[di + 3] = 255
        changedPixels++
      }
    }
  }

  return { diff, changedPixels }
}
