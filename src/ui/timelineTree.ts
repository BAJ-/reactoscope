import type { SerializableProps } from './resolveProps'
import { UNSET } from '../shared/constants'

export function getNodeLabel(
  node: TimelineNode,
  parent: TimelineNode | null,
): string {
  if (!parent) return 'initial'

  const changed: string[] = []
  for (const [key, value] of Object.entries(node.props)) {
    if (parent.props[key] !== value) {
      const formatted =
        value === UNSET
          ? 'unset'
          : typeof value === 'string'
            ? `'${value}'`
            : String(value)
      changed.push(`${key}: ${formatted}`)
    }
  }

  return changed.length > 0 ? changed.join(', ') : 'no change'
}

export interface TimelineNode {
  id: string
  parentId: string | null
  props: SerializableProps
  marked?: boolean
}

export interface Timeline {
  nodes: TimelineNode[]
  activeId: string
}

export function createTimeline(initialProps: SerializableProps): Timeline {
  const id = crypto.randomUUID()
  return {
    nodes: [{ id, parentId: null, props: initialProps }],
    activeId: id,
  }
}

export function addNode(
  timeline: Timeline,
  props: SerializableProps,
): Timeline {
  const id = crypto.randomUUID()
  const node: TimelineNode = {
    id,
    parentId: timeline.activeId,
    props,
  }
  return {
    nodes: [...timeline.nodes, node],
    activeId: id,
  }
}

export function goToNode(timeline: Timeline, id: string): Timeline {
  if (!timeline.nodes.some((n) => n.id === id)) return timeline
  return { ...timeline, activeId: id }
}

export function getActiveNode(timeline: Timeline): TimelineNode {
  return timeline.nodes.find((n) => n.id === timeline.activeId)!
}

export function getChildren(timeline: Timeline, id: string): TimelineNode[] {
  return timeline.nodes.filter((n) => n.parentId === id)
}

export function toggleMarked(timeline: Timeline, id: string): Timeline {
  return {
    ...timeline,
    nodes: timeline.nodes.map((n) =>
      n.id === id ? { ...n, marked: !n.marked } : n,
    ),
  }
}

export function getMarkedSequence(timeline: Timeline): TimelineNode[] {
  const markedIds = new Set(
    timeline.nodes.filter((n) => n.marked).map((n) => n.id),
  )
  if (markedIds.size === 0) return []

  // Preorder (depth-first) traversal collects marked nodes
  // in the order they appear visually in the tree
  const result: TimelineNode[] = []
  function walk(id: string) {
    const node = timeline.nodes.find((n) => n.id === id)
    if (!node) return
    if (markedIds.has(node.id)) result.push(node)
    for (const child of timeline.nodes.filter((n) => n.parentId === id)) {
      walk(child.id)
    }
  }

  const root = timeline.nodes.find((n) => n.parentId === null)
  if (root) walk(root.id)
  return result
}
