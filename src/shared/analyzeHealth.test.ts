import { describe, it, expect } from 'vitest'
import {
  analyzeHealth,
  worstSeverity,
  type StressResult,
} from './analyzeHealth'

function makeResult(overrides: Partial<StressResult> = {}): StressResult {
  return {
    iterations: 100,
    totalRenders: 100,
    warmup: 10,
    timings: {
      min: 0.01,
      max: 0.05,
      mean: 0.02,
      median: 0.02,
      p95: 0.04,
      stddev: 0.005,
    },
    mismatchedRenders: 0,
    outputLengths: Array.from({ length: 100 }, () => 200),
    outputByteSize: 200,
    heapPerRound: null,
    rendersPerRound: 500,
    ...overrides,
  }
}

describe('analyzeHealth', () => {
  it('returns pass for a healthy component', () => {
    const findings = analyzeHealth(makeResult())
    expect(findings.every((f) => f.severity === 'pass')).toBe(true)
    expect(findings.find((f) => f.id === 'determinism')?.severity).toBe('pass')
    expect(findings.find((f) => f.id === 'render-speed')?.severity).toBe('pass')
  })

  it('flags non-deterministic output', () => {
    const findings = analyzeHealth(makeResult({ mismatchedRenders: 47 }))
    const f = findings.find((f) => f.id === 'determinism')
    expect(f?.severity).toBe('fail')
    expect(f?.message).toContain('47 of 100 renders differed')
  })

  it('flags output growth', () => {
    // Output grows linearly from 200 to 600 bytes
    const lengths = Array.from({ length: 100 }, (_, i) => 200 + i * 4)
    const findings = analyzeHealth(makeResult({ outputLengths: lengths }))
    const f = findings.find((f) => f.id === 'output-growth')
    expect(f?.severity).toBe('fail')
    expect(f?.message).toContain('grew')
  })

  it('does not flag stable output lengths', () => {
    const findings = analyzeHealth(makeResult())
    const f = findings.find((f) => f.id === 'output-growth')
    expect(f?.severity).toBe('pass')
  })

  it('flags consistent heap growth as a memory leak', () => {
    // 100 bytes/render: 100KB per round of 1000, slope = 100KB/round / 500 renders = 200 bytes/render
    const heapPerRound = Array.from(
      { length: 11 },
      (_, i) => 50_000_000 + i * 100_000,
    )
    const findings = analyzeHealth(
      makeResult({ heapPerRound, rendersPerRound: 500 }),
    )
    const f = findings.find((f) => f.id === 'memory-leak')
    expect(f?.severity).toBe('fail')
    expect(f?.message).toContain('bytes per render')
  })

  it('flags borderline heap growth as a warning', () => {
    // Slope = 15KB/round / 500 = 30 bytes/render (between 20 and 50)
    const heapPerRound = Array.from(
      { length: 11 },
      (_, i) => 50_000_000 + i * 15_000,
    )
    const findings = analyzeHealth(
      makeResult({ heapPerRound, rendersPerRound: 500 }),
    )
    const f = findings.find((f) => f.id === 'memory-leak')
    expect(f?.severity).toBe('warn')
  })

  it('does not flag stable heap', () => {
    // Flat heap across rounds
    const heapPerRound = Array.from({ length: 11 }, () => 50_000_000)
    const findings = analyzeHealth(
      makeResult({ heapPerRound, rendersPerRound: 500 }),
    )
    const f = findings.find((f) => f.id === 'memory-leak')
    expect(f?.severity).toBe('pass')
  })

  it('does not flag noisy heap with no net growth', () => {
    // Alternating up and down — regression slope near zero
    const heapPerRound = Array.from(
      { length: 11 },
      (_, i) => 50_000_000 + (i % 2 === 0 ? 30_000 : -30_000),
    )
    const findings = analyzeHealth(
      makeResult({ heapPerRound, rendersPerRound: 500 }),
    )
    const f = findings.find((f) => f.id === 'memory-leak')
    expect(f?.severity).toBe('pass')
  })

  it('flags slow render as fail', () => {
    const timings = {
      min: 90,
      max: 200,
      mean: 120,
      median: 110,
      p95: 180,
      stddev: 25,
    }
    const findings = analyzeHealth(makeResult({ timings }))
    const f = findings.find((f) => f.id === 'render-speed')
    expect(f?.severity).toBe('fail')
  })

  it('flags medium render as warn', () => {
    const timings = {
      min: 10,
      max: 30,
      mean: 20,
      median: 20,
      p95: 28,
      stddev: 4,
    }
    const findings = analyzeHealth(makeResult({ timings }))
    const f = findings.find((f) => f.id === 'render-speed')
    expect(f?.severity).toBe('warn')
  })

  it('flags large output size', () => {
    const findings = analyzeHealth(makeResult({ outputByteSize: 120_000 }))
    const f = findings.find((f) => f.id === 'output-size')
    expect(f?.severity).toBe('fail')
    expect(f?.message).toContain('KB')
  })

  it('does not flag small output size', () => {
    const findings = analyzeHealth(makeResult({ outputByteSize: 500 }))
    const f = findings.find((f) => f.id === 'output-size')
    expect(f?.severity).toBe('pass')
  })
})

describe('worstSeverity', () => {
  it('returns pass when all pass', () => {
    expect(
      worstSeverity([
        { id: 'a', severity: 'pass', message: '' },
        { id: 'b', severity: 'pass', message: '' },
      ]),
    ).toBe('pass')
  })

  it('returns fail when any finding fails', () => {
    expect(
      worstSeverity([
        { id: 'a', severity: 'pass', message: '' },
        { id: 'b', severity: 'fail', message: '' },
        { id: 'c', severity: 'warn', message: '' },
      ]),
    ).toBe('fail')
  })

  it('returns warn when worst is warn', () => {
    expect(
      worstSeverity([
        { id: 'a', severity: 'pass', message: '' },
        { id: 'b', severity: 'warn', message: '' },
      ]),
    ).toBe('warn')
  })
})
