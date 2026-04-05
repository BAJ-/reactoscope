import { describe, it, expect } from 'vitest'
import { hydrateValue, isDescriptor } from './hydrateDescriptor'

describe('isDescriptor', () => {
  it('returns true for objects with a string __hydrate key', () => {
    expect(isDescriptor({ __hydrate: 'Promise', value: '' })).toBe(true)
  })

  it('returns false for plain objects', () => {
    expect(isDescriptor({ name: 'test' })).toBe(false)
  })

  it('returns false for primitives and null', () => {
    expect(isDescriptor(null)).toBe(false)
    expect(isDescriptor('string')).toBe(false)
    expect(isDescriptor(42)).toBe(false)
  })
})

describe('hydrateValue', () => {
  it('passes through null and undefined', () => {
    expect(hydrateValue(null)).toBe(null)
    expect(hydrateValue(undefined)).toBe(undefined)
  })

  it('passes through primitives', () => {
    expect(hydrateValue('hello')).toBe('hello')
    expect(hydrateValue(42)).toBe(42)
    expect(hydrateValue(true)).toBe(true)
  })

  it('passes through plain objects with recursive hydration', () => {
    const result = hydrateValue({ a: 1, b: 'two' })
    expect(result).toEqual({ a: 1, b: 'two' })
  })

  it('passes through arrays with recursive hydration', () => {
    const result = hydrateValue([1, 'two', { x: 3 }])
    expect(result).toEqual([1, 'two', { x: 3 }])
  })

  it('hydrates a Promise descriptor', async () => {
    const result = hydrateValue({ __hydrate: 'Promise', value: 'resolved' })
    expect(result).toBeInstanceOf(Promise)
    await expect(result).resolves.toBe('resolved')
  })

  it('hydrates a Date descriptor', () => {
    const result = hydrateValue({ __hydrate: 'Date' })
    expect(result).toBeInstanceOf(Date)
  })

  it('hydrates a Map descriptor', () => {
    const result = hydrateValue({ __hydrate: 'Map' })
    expect(result).toBeInstanceOf(Map)
  })

  it('hydrates a Set descriptor', () => {
    const result = hydrateValue({ __hydrate: 'Set' })
    expect(result).toBeInstanceOf(Set)
  })

  it('hydrates a RegExp descriptor', () => {
    const result = hydrateValue({ __hydrate: 'RegExp' })
    expect(result).toBeInstanceOf(RegExp)
  })

  it('hydrates a Function descriptor', () => {
    const result = hydrateValue({
      __hydrate: 'Function',
      returnDefault: 'hello',
    })
    expect(typeof result).toBe('function')
    expect((result as () => unknown)()).toBe('hello')
  })

  it('hydrates a Function descriptor with complex return', () => {
    const result = hydrateValue({
      __hydrate: 'Function',
      returnDefault: { name: '', count: 0 },
    })
    const fn = result as () => unknown
    expect(fn()).toEqual({ name: '', count: 0 })
  })

  it('returns null for unknown descriptor types', () => {
    expect(hydrateValue({ __hydrate: 'UnknownType' })).toBe(null)
  })

  it('hydrates nested descriptors inside plain objects', () => {
    const result = hydrateValue({
      created: { __hydrate: 'Date' },
      name: 'test',
    }) as Record<string, unknown>
    expect(result.name).toBe('test')
    expect(result.created).toBeInstanceOf(Date)
  })

  it('hydrates nested descriptors inside arrays', () => {
    const result = hydrateValue([{ __hydrate: 'Date' }, 'plain']) as unknown[]
    expect(result[0]).toBeInstanceOf(Date)
    expect(result[1]).toBe('plain')
  })

  it('hydrates Promise with nested descriptor value', async () => {
    const result = hydrateValue({
      __hydrate: 'Promise',
      value: { __hydrate: 'Date' },
    })
    const resolved = await (result as Promise<unknown>)
    expect(resolved).toBeInstanceOf(Date)
  })

  it('produces fresh instances on each call', () => {
    const desc = { __hydrate: 'Date' }
    const a = hydrateValue(desc)
    const b = hydrateValue(desc)
    expect(a).not.toBe(b)
  })
})
