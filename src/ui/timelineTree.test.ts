import { describe, it, expect } from 'vitest'
import {
  createTimeline,
  addNode,
  goToNode,
  getChildren,
  toggleMarked,
  getMarkedSequence,
} from './timelineTree'

describe('createTimeline', () => {
  it('creates a timeline with one root node', () => {
    const tl = createTimeline({ label: 'Hello' })

    expect(tl.nodes).toHaveLength(1)
    expect(tl.nodes[0].parentId).toBeNull()
    expect(tl.nodes[0].props).toEqual({ label: 'Hello' })
    expect(tl.activeId).toBe(tl.nodes[0].id)
  })
})

describe('addNode', () => {
  it('adds a child of the active node and moves active to it', () => {
    const tl = createTimeline({ label: 'Hello' })
    const tl2 = addNode(tl, { label: 'World' })

    expect(tl2.nodes).toHaveLength(2)
    expect(tl2.nodes[1].parentId).toBe(tl.activeId)
    expect(tl2.nodes[1].props).toEqual({ label: 'World' })
    expect(tl2.activeId).toBe(tl2.nodes[1].id)
  })

  it('creates a branch when adding from a non-leaf node', () => {
    let tl = createTimeline({ v: 1 })
    const rootId = tl.activeId
    tl = addNode(tl, { v: 2 })
    tl = addNode(tl, { v: 3 })

    // Go back to root and branch
    tl = goToNode(tl, rootId)
    tl = addNode(tl, { v: 4 })

    expect(tl.nodes).toHaveLength(4)
    // Root should have two children
    const rootChildren = getChildren(tl, rootId)
    expect(rootChildren).toHaveLength(2)
    expect(rootChildren.map((n) => n.props.v)).toContain(2)
    expect(rootChildren.map((n) => n.props.v)).toContain(4)
  })
})

describe('goToNode', () => {
  it('changes the active node', () => {
    let tl = createTimeline({ v: 1 })
    const rootId = tl.activeId
    tl = addNode(tl, { v: 2 })

    expect(tl.activeId).not.toBe(rootId)
    tl = goToNode(tl, rootId)
    expect(tl.activeId).toBe(rootId)
  })

  it('returns the same timeline for an unknown id', () => {
    const tl = createTimeline({ v: 1 })
    const result = goToNode(tl, 'nonexistent')
    expect(result).toBe(tl)
  })
})

describe('toggleMarked', () => {
  it('toggles marked state', () => {
    const tl = createTimeline({ v: 1 })
    const marked = toggleMarked(tl, tl.activeId)
    expect(marked.nodes[0].marked).toBe(true)

    const unmarked = toggleMarked(marked, tl.activeId)
    expect(unmarked.nodes[0].marked).toBe(false)
  })

  it('does not mutate the original timeline', () => {
    const tl = createTimeline({ v: 1 })
    toggleMarked(tl, tl.activeId)

    expect(tl.nodes[0].marked).toBeUndefined()
  })
})

describe('getMarkedSequence', () => {
  it('returns marked nodes in tree order', () => {
    let tl = createTimeline({ v: 1 })
    tl = addNode(tl, { v: 2 })
    const secondId = tl.activeId
    tl = addNode(tl, { v: 3 })
    const thirdId = tl.activeId

    // Mark in reverse order
    tl = toggleMarked(tl, thirdId)
    tl = toggleMarked(tl, secondId)

    const seq = getMarkedSequence(tl)
    expect(seq).toHaveLength(2)
    expect(seq[0].props.v).toBe(2)
    expect(seq[1].props.v).toBe(3)
  })

  it('returns empty array when nothing is marked', () => {
    const tl = createTimeline({ v: 1 })
    expect(getMarkedSequence(tl)).toHaveLength(0)
  })

  it('returns marked nodes in preorder across branches', () => {
    let tl = createTimeline({ v: 1 })
    const rootId = tl.activeId
    tl = addNode(tl, { v: 2 }) // A
    const aId = tl.activeId
    tl = addNode(tl, { v: 3 }) // B
    const bId = tl.activeId

    // Branch off from root
    tl = goToNode(tl, rootId)
    tl = addNode(tl, { v: 4 }) // C
    const cId = tl.activeId
    tl = addNode(tl, { v: 5 }) // D
    const dId = tl.activeId

    tl = toggleMarked(tl, rootId)
    tl = toggleMarked(tl, aId)
    tl = toggleMarked(tl, bId)
    tl = toggleMarked(tl, cId)
    tl = toggleMarked(tl, dId)

    const seq = getMarkedSequence(tl)
    expect(seq.map((n) => n.props.v)).toEqual([1, 2, 3, 4, 5])
  })
})
