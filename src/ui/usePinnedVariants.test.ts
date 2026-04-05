import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePinnedVariants } from './usePinnedVariants'

const COMPONENT = 'src/sandbox/TestButton.tsx'
const storageKey = `observatory:pinned:${COMPONENT}`

beforeEach(() => {
  localStorage.clear()
})

describe('usePinnedVariants', () => {
  it('starts empty when no stored variants exist', () => {
    const { result } = renderHook(() => usePinnedVariants(COMPONENT))
    expect(result.current.variants).toEqual([])
  })

  it('starts empty when componentPath is null', () => {
    const { result } = renderHook(() => usePinnedVariants(null))
    expect(result.current.variants).toEqual([])
  })

  describe('pinVariant', () => {
    it('adds a variant with generated label', () => {
      const { result } = renderHook(() => usePinnedVariants(COMPONENT))

      act(() =>
        result.current.pinVariant({ label: 'Click me', disabled: false }),
      )

      expect(result.current.variants).toHaveLength(1)
      expect(result.current.variants[0].props).toEqual({
        label: 'Click me',
        disabled: false,
      })
      expect(result.current.variants[0].label).toContain('label=')
    })

    it('generates a readable label from props', () => {
      const { result } = renderHook(() => usePinnedVariants(COMPONENT))

      act(() => result.current.pinVariant({ label: 'OK', disabled: true }))

      const label = result.current.variants[0].label
      expect(label).toContain('label="OK"')
      expect(label).toContain('disabled')
    })

    it('skips unset props in the label', () => {
      const { result } = renderHook(() => usePinnedVariants(COMPONENT))

      act(() => result.current.pinVariant({ label: 'OK', size: '__unset__' }))

      const label = result.current.variants[0].label
      expect(label).toContain('label="OK"')
      expect(label).not.toContain('size')
    })

    it('shows "(no props)" when all props are unset', () => {
      const { result } = renderHook(() => usePinnedVariants(COMPONENT))

      act(() => result.current.pinVariant({ size: '__unset__' }))

      expect(result.current.variants[0].label).toBe('(no props)')
    })

    it('can pin multiple variants', () => {
      const { result } = renderHook(() => usePinnedVariants(COMPONENT))

      act(() => result.current.pinVariant({ label: 'A' }))
      act(() => result.current.pinVariant({ label: 'B' }))

      expect(result.current.variants).toHaveLength(2)
      expect(result.current.variants[0].props.label).toBe('A')
      expect(result.current.variants[1].props.label).toBe('B')
    })
  })

  describe('unpinVariant', () => {
    it('removes a variant by id', () => {
      const { result } = renderHook(() => usePinnedVariants(COMPONENT))

      act(() => result.current.pinVariant({ label: 'A' }))
      act(() => result.current.pinVariant({ label: 'B' }))
      const idToRemove = result.current.variants[0].id

      act(() => result.current.unpinVariant(idToRemove))

      expect(result.current.variants).toHaveLength(1)
      expect(result.current.variants[0].props.label).toBe('B')
    })
  })

  describe('localStorage persistence', () => {
    it('persists variants to localStorage', () => {
      const { result } = renderHook(() => usePinnedVariants(COMPONENT))

      act(() => result.current.pinVariant({ label: 'Saved' }))

      const stored = JSON.parse(localStorage.getItem(storageKey)!)
      expect(stored).toHaveLength(1)
      expect(stored[0].props.label).toBe('Saved')
    })

    it('restores variants from localStorage on mount', () => {
      // Seed localStorage
      const seed = [{ id: 'test-id', label: 'Restored', props: { x: 1 } }]
      localStorage.setItem(storageKey, JSON.stringify(seed))

      const { result } = renderHook(() => usePinnedVariants(COMPONENT))

      expect(result.current.variants).toHaveLength(1)
      expect(result.current.variants[0].label).toBe('Restored')
      expect(result.current.variants[0].props).toEqual({ x: 1 })
    })

    it('handles corrupted localStorage gracefully', () => {
      localStorage.setItem(storageKey, 'not-json')

      const { result } = renderHook(() => usePinnedVariants(COMPONENT))
      expect(result.current.variants).toEqual([])
    })
  })
})
