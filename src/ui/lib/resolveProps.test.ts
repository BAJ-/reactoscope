import { describe, it, expect, vi, afterEach } from 'vitest'
import { resolveProps, readPropsFromUrl } from './resolveProps'
import type { PropInfo } from '@/shared/types'
import { UNSET } from '@/shared/constants'

function prop(overrides: Partial<PropInfo> & { name: string }): PropInfo {
  return {
    type: 'string',
    required: false,
    ...overrides,
  }
}

describe('resolveProps', () => {
  it('passes through non-function values', () => {
    const result = resolveProps({ name: 'hello', count: 42, active: true }, [
      prop({ name: 'name' }),
      prop({ name: 'count', type: 'number' }),
    ])
    expect(result.name).toBe('hello')
    expect(result.count).toBe(42)
    expect(result.active).toBe(true)
  })

  it('filters out UNSET values', () => {
    const result = resolveProps({ name: 'hello', age: UNSET }, [
      prop({ name: 'name' }),
      prop({ name: 'age', type: 'number' }),
    ])
    expect(result.name).toBe('hello')
    expect('age' in result).toBe(false)
  })

  it('creates noop stubs for function props', () => {
    const result = resolveProps({ onClick: 'noop' }, [
      prop({ name: 'onClick', type: 'function' }),
    ])
    expect(typeof result.onClick).toBe('function')
    expect((result.onClick as () => unknown)()).toBeUndefined()
  })

  it('creates logging stubs for function props with log behavior', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const result = resolveProps({ onClick: 'log' }, [
      prop({ name: 'onClick', type: 'function' }),
    ])
    ;(result.onClick as (x: number) => void)(42)
    expect(logSpy).toHaveBeenCalledWith('[onClick]', 42)
    logSpy.mockRestore()
  })

  it('defaults to noop for unknown function behavior', () => {
    const result = resolveProps({ onClick: 'unknown-behavior' }, [
      prop({ name: 'onClick', type: 'function' }),
    ])
    expect(typeof result.onClick).toBe('function')
    expect((result.onClick as () => unknown)()).toBeUndefined()
  })

  it('creates stubs with returnDefault', () => {
    const result = resolveProps({ getData: 'noop' }, [
      prop({ name: 'getData', type: 'function', returnDefault: 'hello' }),
    ])
    expect((result.getData as () => string)()).toBe('hello')
  })

  it('adds stubs for required function props not in serializable', () => {
    const result = resolveProps({}, [
      prop({ name: 'onChange', type: 'function', required: true }),
    ])
    expect(typeof result.onChange).toBe('function')
  })

  it('adds stubs for optional function props not in serializable', () => {
    const result = resolveProps({}, [
      prop({ name: 'onHover', type: 'function', required: false }),
    ])
    expect(typeof result.onHover).toBe('function')
  })

  it('auto-stub loop does not overwrite explicitly set function props', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const result = resolveProps({ onClick: 'log' }, [
      prop({ name: 'onClick', type: 'function' }),
    ])
    ;(result.onClick as () => void)()
    // If the auto-stub loop overwrote it, this would be a noop — not a log call
    expect(logSpy).toHaveBeenCalledWith('[onClick]')
    logSpy.mockRestore()
  })
})

describe('readPropsFromUrl', () => {
  afterEach(() => {
    window.history.replaceState({}, '', '/')
  })

  it('returns empty object when no props param', () => {
    window.history.replaceState({}, '', '/')
    expect(readPropsFromUrl()).toEqual({})
  })

  it('parses valid JSON props from URL', () => {
    window.history.replaceState(
      {},
      '',
      '/?props=' + encodeURIComponent('{"name":"test"}'),
    )
    expect(readPropsFromUrl()).toEqual({ name: 'test' })
  })

  it('returns empty object for invalid JSON', () => {
    window.history.replaceState({}, '', '/?props=not-json')
    expect(readPropsFromUrl()).toEqual({})
  })
})
