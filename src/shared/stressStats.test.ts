import { describe, it, expect } from 'vitest'
import { computeStats, computeTrend } from './stressStats'

describe('computeStats', () => {
  it('returns zeros for empty input', () => {
    const stats = computeStats([])

    expect(stats).toEqual({
      min: 0,
      max: 0,
      mean: 0,
      median: 0,
      p95: 0,
      stddev: 0,
    })
  })

  it('handles a single value', () => {
    const stats = computeStats([5])

    expect(stats.min).toBe(5)
    expect(stats.max).toBe(5)
    expect(stats.mean).toBe(5)
    expect(stats.median).toBe(5)
    expect(stats.p95).toBe(5)
    expect(stats.stddev).toBe(0)
  })

  it('computes correct stats for a known sequence', () => {
    // Unsorted input → sorted: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10
    const values = [5, 3, 8, 1, 9, 2, 10, 4, 7, 6]
    const stats = computeStats(values)

    expect(stats.min).toBe(1)
    expect(stats.max).toBe(10)
    expect(stats.mean).toBe(5.5)
    // sorted[floor(10/2)] = sorted[5] = 6
    expect(stats.median).toBe(6)
    // ceil(10 * 0.95) - 1 = 9, sorted[9] = 10
    expect(stats.p95).toBe(10)
    expect(stats.stddev).toBeCloseTo(2.872, 2)
  })

  it('computes p95 correctly with 100 values', () => {
    // Arrange
    const values = Array.from({ length: 100 }, (_, i) => i + 1)

    // Act
    const stats = computeStats(values)

    // Assert — ceil(100 * 0.95) - 1 = 94, sorted[94] = 95
    expect(stats.p95).toBe(95)
  })

  it('does not mutate the input array', () => {
    const values = [3, 1, 2]

    computeStats(values)

    expect(values).toEqual([3, 1, 2])
  })
})

describe('computeTrend', () => {
  it('returns stable for fewer than 10 values', () => {
    expect(computeTrend([1, 2, 3])).toBe('stable')
  })

  it('returns stable for constant values', () => {
    const values = Array.from({ length: 20 }, () => 5)

    expect(computeTrend(values)).toBe('stable')
  })

  it('detects an increasing trend', () => {
    // Each render takes 1ms longer than the last
    const values = Array.from({ length: 50 }, (_, i) => 10 + i)

    expect(computeTrend(values)).toBe('increasing')
  })

  it('detects a decreasing trend', () => {
    // Renders get faster over time
    const values = Array.from({ length: 50 }, (_, i) => 50 - i)

    expect(computeTrend(values)).toBe('decreasing')
  })

  it('returns stable for noisy but flat data', () => {
    // Random-ish noise around 10, no real trend
    const values = [10, 11, 9, 10, 12, 8, 10, 11, 9, 10, 11, 9, 10, 12, 8]

    expect(computeTrend(values)).toBe('stable')
  })
})
