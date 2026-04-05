import { useState, useCallback, useRef, useEffect } from 'react'
import type { SerializableProps } from './resolveProps'
import type { Timeline } from './timelineTree'
import {
  createTimeline,
  addNode as addTimelineNode,
  goToNode as goToTimelineNode,
  getActiveNode,
  getMarkedSequence,
  toggleMarked as toggleTimelineMarked,
} from './timelineTree'

interface UseTimelineReturn {
  timeline: Timeline
  activeProps: SerializableProps
  handlePropChange: (key: string, value: unknown) => void
  goToNode: (id: string) => void
  toggleMarked: (id: string) => void
  initTimeline: (props: SerializableProps) => void
  mergeActiveProps: (baseProps: SerializableProps) => void
  replay: (stepMs?: number) => void
  replaySequence: (nodeIds: string[], stepMs?: number) => void
  cancelReplay: () => void
}

export function useTimeline(
  initialProps: SerializableProps = {},
): UseTimelineReturn {
  const [timeline, setTimeline] = useState<Timeline>(() =>
    createTimeline(initialProps),
  )
  const replayTimersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const timelineRef = useRef(timeline)

  useEffect(() => {
    timelineRef.current = timeline
  }, [timeline])

  // Clear any in-flight replay timers on unmount
  useEffect(() => {
    return () => {
      for (const t of replayTimersRef.current) clearTimeout(t)
    }
  }, [])

  const activeProps = getActiveNode(timeline).props

  const cancelReplay = useCallback(() => {
    for (const t of replayTimersRef.current) clearTimeout(t)
    replayTimersRef.current = []
  }, [])

  const handlePropChange = useCallback(
    (key: string, value: unknown) => {
      cancelReplay()
      setTimeline((prev) => {
        const currentProps = getActiveNode(prev).props
        if (currentProps[key] === value) return prev
        return addTimelineNode(prev, { ...currentProps, [key]: value })
      })
    },
    [cancelReplay],
  )

  const goToNode = useCallback(
    (id: string) => {
      cancelReplay()
      setTimeline((prev) => goToTimelineNode(prev, id))
    },
    [cancelReplay],
  )

  const toggleMarked = useCallback(
    (id: string) => {
      cancelReplay()
      setTimeline((prev) => toggleTimelineMarked(prev, id))
    },
    [cancelReplay],
  )

  const initTimeline = useCallback((props: SerializableProps) => {
    setTimeline(createTimeline(props))
  }, [])

  const mergeActiveProps = useCallback((baseProps: SerializableProps) => {
    setTimeline((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) => ({
        ...n,
        props: { ...baseProps, ...n.props },
      })),
    }))
  }, [])

  const replaySequence = useCallback(
    (nodeIds: string[], stepMs = 600) => {
      if (nodeIds.length === 0) return

      cancelReplay()

      setTimeline((prev) => goToTimelineNode(prev, nodeIds[0]))

      const remaining = nodeIds.slice(1)
      remaining.forEach((nodeId, i) => {
        const timer = setTimeout(
          () => {
            setTimeline((prev) => goToTimelineNode(prev, nodeId))
            if (i === remaining.length - 1) {
              replayTimersRef.current = []
            }
          },
          stepMs * (i + 1),
        )
        replayTimersRef.current.push(timer)
      })
    },
    [cancelReplay],
  )

  const replay = useCallback(
    (stepMs = 600) => {
      const sequence = getMarkedSequence(timelineRef.current)
      replaySequence(
        sequence.map((n) => n.id),
        stepMs,
      )
    },
    [replaySequence],
  )

  return {
    timeline,
    activeProps,
    handlePropChange,
    goToNode,
    toggleMarked,
    initTimeline,
    mergeActiveProps,
    replay,
    replaySequence,
    cancelReplay,
  }
}
