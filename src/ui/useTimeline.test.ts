import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTimeline } from './useTimeline'
import { getChildren } from './timelineTree'

describe('useTimeline', () => {
  it('starts with an empty-props root node', () => {
    const { result } = renderHook(() => useTimeline())

    expect(result.current.timeline.nodes).toHaveLength(1)
    expect(result.current.activeProps).toEqual({})
  })

  describe('initTimeline', () => {
    it('resets the timeline with the given props', () => {
      const { result } = renderHook(() => useTimeline())

      act(() => result.current.initTimeline({ label: 'Hello' }))

      expect(result.current.timeline.nodes).toHaveLength(1)
      expect(result.current.activeProps).toEqual({ label: 'Hello' })
    })
  })

  describe('handlePropChange', () => {
    it('creates a new node with the changed prop', () => {
      const { result } = renderHook(() => useTimeline())

      act(() => result.current.initTimeline({ label: 'Hello', size: 10 }))
      act(() => result.current.handlePropChange('label', 'World'))

      expect(result.current.timeline.nodes).toHaveLength(2)
      expect(result.current.activeProps).toEqual({ label: 'World', size: 10 })
    })

    it('does not create a node when value is unchanged', () => {
      const { result } = renderHook(() => useTimeline())

      act(() => result.current.initTimeline({ v: 1 }))
      act(() => result.current.handlePropChange('v', 1))

      expect(result.current.timeline.nodes).toHaveLength(1)
    })
  })

  describe('goToNode', () => {
    it('navigates to a previous node and restores its props', () => {
      const { result } = renderHook(() => useTimeline())

      act(() => result.current.initTimeline({ v: 1 }))
      const rootId = result.current.timeline.activeId

      act(() => result.current.handlePropChange('v', 2))
      expect(result.current.activeProps).toEqual({ v: 2 })

      act(() => result.current.goToNode(rootId))
      expect(result.current.activeProps).toEqual({ v: 1 })
    })

    it('creates a branch when changing props after navigating back', () => {
      const { result } = renderHook(() => useTimeline())

      act(() => result.current.initTimeline({ v: 1 }))
      const rootId = result.current.timeline.activeId

      act(() => result.current.handlePropChange('v', 2))
      act(() => result.current.goToNode(rootId))
      act(() => result.current.handlePropChange('v', 3))

      // Root should now have two children
      const children = getChildren(result.current.timeline, rootId)
      expect(children).toHaveLength(2)
      expect(children.map((n) => n.props.v)).toContain(2)
      expect(children.map((n) => n.props.v)).toContain(3)
    })
  })

  describe('toggleMarked', () => {
    it('marks and unmarks a node', () => {
      const { result } = renderHook(() => useTimeline())

      act(() => result.current.initTimeline({ v: 1 }))
      const id = result.current.timeline.activeId

      act(() => result.current.toggleMarked(id))
      expect(result.current.timeline.nodes[0].marked).toBe(true)

      act(() => result.current.toggleMarked(id))
      expect(result.current.timeline.nodes[0].marked).toBe(false)
    })
  })

  describe('mergeActiveProps', () => {
    it('merges base props under active props', () => {
      const { result } = renderHook(() => useTimeline())

      act(() => result.current.initTimeline({ label: 'Hello' }))
      act(() => result.current.mergeActiveProps({ label: 'Default', size: 10 }))

      // User's label preserved, new size added from base
      expect(result.current.activeProps).toEqual({ label: 'Hello', size: 10 })
    })

    it('merges base props into all nodes', () => {
      const { result } = renderHook(() => useTimeline())

      act(() => result.current.initTimeline({ label: 'Hello' }))
      act(() => result.current.handlePropChange('label', 'World'))
      act(() => result.current.mergeActiveProps({ label: 'Default', size: 10 }))

      // Both nodes should have the new 'size' prop
      const nodes = result.current.timeline.nodes
      expect(nodes[0].props).toEqual({ label: 'Hello', size: 10 })
      expect(nodes[1].props).toEqual({ label: 'World', size: 10 })
    })
  })

  describe('replaySequence', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    it('navigates through specified node IDs', () => {
      const { result } = renderHook(() => useTimeline())

      act(() => result.current.initTimeline({ v: 1 }))
      const firstId = result.current.timeline.activeId

      act(() => result.current.handlePropChange('v', 2))
      const secondId = result.current.timeline.activeId

      act(() => result.current.handlePropChange('v', 3))
      const thirdId = result.current.timeline.activeId

      // Go back to first
      act(() => result.current.goToNode(firstId))
      expect(result.current.activeProps).toEqual({ v: 1 })

      // Replay only second and third
      act(() => result.current.replaySequence([secondId, thirdId], 100))
      expect(result.current.activeProps).toEqual({ v: 2 })

      act(() => vi.advanceTimersByTime(100))
      expect(result.current.activeProps).toEqual({ v: 3 })
    })

    afterEach(() => {
      vi.useRealTimers()
    })
  })

  describe('replay', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    it('steps through marked nodes in order', () => {
      const { result } = renderHook(() => useTimeline())

      act(() => result.current.initTimeline({ v: 1 }))
      act(() => result.current.handlePropChange('v', 2))
      const secondId = result.current.timeline.activeId
      act(() => result.current.handlePropChange('v', 3))
      const thirdId = result.current.timeline.activeId

      act(() => result.current.toggleMarked(secondId))
      act(() => result.current.toggleMarked(thirdId))

      // Navigate away so we can see replay navigation
      act(() => result.current.goToNode(result.current.timeline.nodes[0].id))
      expect(result.current.activeProps).toEqual({ v: 1 })

      // Start replay
      act(() => result.current.replay(100))

      // Immediately jumps to first marked node
      expect(result.current.activeProps).toEqual({ v: 2 })

      // After delay, moves to second marked node
      act(() => vi.advanceTimersByTime(100))
      expect(result.current.activeProps).toEqual({ v: 3 })
    })

    it('does nothing with no marked nodes', () => {
      const { result } = renderHook(() => useTimeline())

      act(() => result.current.initTimeline({ v: 1 }))
      act(() => result.current.handlePropChange('v', 2))

      act(() => result.current.replay())
      expect(result.current.activeProps).toEqual({ v: 2 })
    })

    it('is stopped by handlePropChange', () => {
      const { result } = renderHook(() => useTimeline())

      act(() => result.current.initTimeline({ v: 1 }))
      act(() => result.current.handlePropChange('v', 2))
      const secondId = result.current.timeline.activeId
      act(() => result.current.handlePropChange('v', 3))
      const thirdId = result.current.timeline.activeId

      act(() => result.current.toggleMarked(secondId))
      act(() => result.current.toggleMarked(thirdId))

      act(() => result.current.goToNode(result.current.timeline.nodes[0].id))
      act(() => result.current.replay(100))

      // User edits a prop mid-replay
      act(() => result.current.handlePropChange('v', 99))
      expect(result.current.activeProps).toEqual({ v: 99 })

      // Timer should not snap back
      act(() => vi.advanceTimersByTime(200))
      expect(result.current.activeProps).toEqual({ v: 99 })
    })

    it('is stopped by goToNode', () => {
      const { result } = renderHook(() => useTimeline())

      act(() => result.current.initTimeline({ v: 1 }))
      const rootId = result.current.timeline.activeId
      act(() => result.current.handlePropChange('v', 2))
      const secondId = result.current.timeline.activeId
      act(() => result.current.handlePropChange('v', 3))
      const thirdId = result.current.timeline.activeId

      act(() => result.current.toggleMarked(secondId))
      act(() => result.current.toggleMarked(thirdId))

      act(() => result.current.goToNode(rootId))
      act(() => result.current.replay(100))

      // User navigates mid-replay
      act(() => result.current.goToNode(rootId))
      expect(result.current.activeProps).toEqual({ v: 1 })

      // Timer should not snap back
      act(() => vi.advanceTimersByTime(200))
      expect(result.current.activeProps).toEqual({ v: 1 })
    })

    it('is stopped by toggleMarked', () => {
      const { result } = renderHook(() => useTimeline())

      act(() => result.current.initTimeline({ v: 1 }))
      act(() => result.current.handlePropChange('v', 2))
      const secondId = result.current.timeline.activeId
      act(() => result.current.handlePropChange('v', 3))
      const thirdId = result.current.timeline.activeId

      act(() => result.current.toggleMarked(secondId))
      act(() => result.current.toggleMarked(thirdId))

      act(() => result.current.goToNode(result.current.timeline.nodes[0].id))
      act(() => result.current.replay(100))

      // User toggles a mark mid-replay
      act(() => result.current.toggleMarked(thirdId))

      // Timer should not advance replay
      act(() => vi.advanceTimersByTime(200))
      expect(result.current.activeProps).toEqual({ v: 2 })
    })

    it('preserves marks after replaying a branch', () => {
      const { result } = renderHook(() => useTimeline())

      // Build a branching tree: root -> A -> B, root -> C -> D
      act(() => result.current.initTimeline({ v: 0 }))
      const rootId = result.current.timeline.activeId

      act(() => result.current.handlePropChange('v', 1)) // A
      const aId = result.current.timeline.activeId
      act(() => result.current.handlePropChange('v', 2)) // B
      const bId = result.current.timeline.activeId

      // Branch from root
      act(() => result.current.goToNode(rootId))
      act(() => result.current.handlePropChange('v', 3)) // C
      const cId = result.current.timeline.activeId
      act(() => result.current.handlePropChange('v', 4)) // D
      const dId = result.current.timeline.activeId

      // Mark C and D (one branch)
      act(() => result.current.toggleMarked(cId))
      act(() => result.current.toggleMarked(dId))

      // Navigate to root
      act(() => result.current.goToNode(rootId))

      // Verify marks before replay
      expect(
        result.current.timeline.nodes.find((n) => n.id === cId)!.marked,
      ).toBe(true)
      expect(
        result.current.timeline.nodes.find((n) => n.id === dId)!.marked,
      ).toBe(true)

      // Replay
      act(() => result.current.replay(100))
      expect(result.current.activeProps).toEqual({ v: 3 }) // at C

      act(() => vi.advanceTimersByTime(100))
      expect(result.current.activeProps).toEqual({ v: 4 }) // at D

      // Marks must still be set after replay
      expect(
        result.current.timeline.nodes.find((n) => n.id === cId)!.marked,
      ).toBe(true)
      expect(
        result.current.timeline.nodes.find((n) => n.id === dId)!.marked,
      ).toBe(true)

      // Unmarked nodes must still be unmarked
      expect(
        result.current.timeline.nodes.find((n) => n.id === aId)!.marked,
      ).toBeFalsy()
      expect(
        result.current.timeline.nodes.find((n) => n.id === bId)!.marked,
      ).toBeFalsy()
    })

    afterEach(() => {
      vi.useRealTimers()
    })
  })
})
