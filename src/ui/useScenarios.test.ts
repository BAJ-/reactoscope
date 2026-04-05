import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useScenarios } from './useScenarios'
import type { TimelineNode } from './timelineTree'

const node = (id: string, props: Record<string, unknown>): TimelineNode => ({
  id,
  parentId: null,
  props,
})

describe('useScenarios', () => {
  it('starts with no scenarios and no selection', () => {
    const { result } = renderHook(() => useScenarios())

    expect(result.current.scenarios).toEqual([])
    expect(result.current.playingScenarioId).toBeNull()
  })

  describe('addScenario', () => {
    it('adds a scenario with name and steps', () => {
      const { result } = renderHook(() => useScenarios())

      act(() =>
        result.current.addScenario('Test', [
          node('1', { v: 1 }),
          node('2', { v: 2 }),
        ]),
      )

      expect(result.current.scenarios).toHaveLength(1)
      expect(result.current.scenarios[0].name).toBe('Test')
      expect(result.current.scenarios[0].steps).toHaveLength(2)
    })
  })

  describe('renameScenario', () => {
    it('renames a scenario', () => {
      const { result } = renderHook(() => useScenarios())

      act(() => result.current.addScenario('Old', [node('1', { v: 1 })]))
      const id = result.current.scenarios[0].id

      act(() => result.current.renameScenario(id, 'New'))

      expect(result.current.scenarios[0].name).toBe('New')
    })
  })

  describe('deleteScenario', () => {
    it('removes a scenario', () => {
      const { result } = renderHook(() => useScenarios())

      act(() => result.current.addScenario('A', [node('1', { v: 1 })]))
      act(() => result.current.addScenario('B', [node('2', { v: 2 })]))
      const id = result.current.scenarios[0].id

      act(() => result.current.deleteScenario(id))

      expect(result.current.scenarios).toHaveLength(1)
      expect(result.current.scenarios[0].name).toBe('B')
    })

    it('clears playingScenarioId when deleting the playing scenario', () => {
      const { result } = renderHook(() => useScenarios())

      act(() => result.current.addScenario('A', [node('1', { v: 1 })]))
      const id = result.current.scenarios[0].id

      act(() => result.current.selectScenario(id))
      expect(result.current.playingScenarioId).toBe(id)

      act(() => result.current.deleteScenario(id))
      expect(result.current.playingScenarioId).toBeNull()
    })
  })

  describe('selectScenario', () => {
    it('sets and clears playingScenarioId', () => {
      const { result } = renderHook(() => useScenarios())

      act(() => result.current.selectScenario('some-id'))
      expect(result.current.playingScenarioId).toBe('some-id')

      act(() => result.current.selectScenario(null))
      expect(result.current.playingScenarioId).toBeNull()
    })
  })
})
