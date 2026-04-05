import { describe, it, expect } from 'vitest'
import type { PropInfo } from '../shared/types'
import { hydrateProps } from './hydrateProps'
import { UNSET } from '../shared/constants'

function makeProp(overrides: Partial<PropInfo> & { name: string }): PropInfo {
  return { type: 'string', required: true, ...overrides }
}

describe('hydrateProps', () => {
  it('passes through non-function props unchanged', () => {
    const infos = [makeProp({ name: 'label', type: 'string' })]
    const result = hydrateProps({ label: 'hello' }, infos)
    expect(result).toEqual({ label: 'hello' })
  })

  it('strips UNSET values', () => {
    const infos = [
      makeProp({ name: 'label', type: 'string' }),
      makeProp({ name: 'disabled', type: 'boolean', required: false }),
    ]
    const result = hydrateProps({ label: 'hello', disabled: UNSET }, infos)
    expect(result).toEqual({ label: 'hello' })
    expect('disabled' in result).toBe(false)
  })

  it('creates a callable stub for function props with void return', () => {
    const infos = [
      makeProp({ name: 'onClick', type: 'function', signature: '() => void' }),
    ]
    const result = hydrateProps({ onClick: UNSET }, infos)
    expect(typeof result.onClick).toBe('function')
    expect((result.onClick as () => unknown)()).toBeUndefined()
  })

  it('creates a stub that returns the returnDefault', () => {
    const infos = [
      makeProp({
        name: 'transform',
        type: 'function',
        signature: '(n: number) => string',
        returnDefault: 'default',
      }),
    ]
    const result = hydrateProps({ transform: UNSET }, infos)
    const fn = result.transform as (n: number) => string
    expect(fn(42)).toBe('default')
  })

  it('hydrates descriptors in returnDefault', () => {
    const infos = [
      makeProp({
        name: 'fetchData',
        type: 'function',
        signature: '() => Promise<string>',
        returnDefault: { __hydrate: 'Promise', value: '' },
      }),
    ]
    const result = hydrateProps({}, infos)
    const fn = result.fetchData as () => Promise<string>
    const ret = fn()
    expect(ret).toBeInstanceOf(Promise)
  })

  it('provides stubs for required function props missing from serializable', () => {
    const infos = [
      makeProp({ name: 'onClick', type: 'function', signature: '() => void' }),
    ]
    const result = hydrateProps({}, infos)
    expect(typeof result.onClick).toBe('function')
  })

  it('does not override non-function props from serializable', () => {
    const infos = [
      makeProp({ name: 'label', type: 'string' }),
      makeProp({ name: 'onClick', type: 'function', signature: '() => void' }),
    ]
    const result = hydrateProps({ label: 'test' }, infos)
    expect(result.label).toBe('test')
    expect(typeof result.onClick).toBe('function')
  })

  it('returns fresh mutable instances per stub call', () => {
    const infos = [
      makeProp({
        name: 'getDate',
        type: 'function',
        signature: '() => Date',
        returnDefault: { __hydrate: 'Date' },
      }),
    ]
    const result = hydrateProps({}, infos)
    const fn = result.getDate as () => Date
    const a = fn()
    const b = fn()
    expect(a).toBeInstanceOf(Date)
    expect(a).not.toBe(b)
  })
})
