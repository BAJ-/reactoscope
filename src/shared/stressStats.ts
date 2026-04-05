export interface TimingStats {
  min: number
  max: number
  mean: number
  median: number
  p95: number
  stddev: number
}

export type Trend = 'stable' | 'increasing' | 'decreasing'

/**
 * Compute the slope of a series using simple linear regression.
 * Index is used as the x-axis (0, 1, 2, …).
 */
export function linearSlope(values: number[]): number {
  const n = values.length
  if (n < 2) return 0

  let sumX = 0
  let sumY = 0
  let sumXY = 0
  let sumX2 = 0

  for (let i = 0; i < n; i++) {
    sumX += i
    sumY += values[i]
    sumXY += i * values[i]
    sumX2 += i * i
  }

  return (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)
}

/**
 * Compute the trend of a time series using simple linear regression.
 * Returns 'increasing' if renders are getting meaningfully slower,
 * 'decreasing' if getting faster, 'stable' otherwise.
 *
 * The slope is normalized by the mean so the threshold works
 * regardless of absolute render time.
 */
export function computeTrend(values: number[]): Trend {
  const n = values.length
  if (n < 10) return 'stable'

  const slope = linearSlope(values)
  const mean = values.reduce((a, b) => a + b, 0) / n

  if (mean === 0) return 'stable'

  // Normalized slope: how much the render time changes per iteration
  // relative to the mean. A slope of 0.01 means 1% growth per iteration.
  const normalizedSlope = slope / mean

  if (normalizedSlope > 0.005) return 'increasing'
  if (normalizedSlope < -0.005) return 'decreasing'
  return 'stable'
}

export function computeStats(values: number[]): TimingStats {
  if (values.length === 0) {
    return { min: 0, max: 0, mean: 0, median: 0, p95: 0, stddev: 0 }
  }

  const sorted = [...values].sort((a, b) => a - b)
  const n = sorted.length
  const sum = sorted.reduce((a, b) => a + b, 0)
  const mean = sum / n
  const variance = sorted.reduce((acc, v) => acc + (v - mean) ** 2, 0) / n

  return {
    min: sorted[0],
    max: sorted[n - 1],
    mean,
    median: sorted[Math.floor(n / 2)],
    p95: sorted[Math.min(Math.ceil(n * 0.95) - 1, n - 1)],
    stddev: Math.sqrt(variance),
  }
}
