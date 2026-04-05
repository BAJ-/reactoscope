import { useState, useCallback } from 'react'
import type { TimelineNode } from './timelineTree'

export interface Scenario {
  id: string
  name: string
  steps: TimelineNode[]
}

function createScenario(name: string, steps: TimelineNode[]): Scenario {
  return { id: crypto.randomUUID(), name, steps }
}

interface UseScenariosReturn {
  scenarios: Scenario[]
  playingScenarioId: string | null
  addScenario: (name: string, steps: TimelineNode[]) => void
  renameScenario: (id: string, name: string) => void
  deleteScenario: (id: string) => void
  selectScenario: (id: string | null) => void
}

export function useScenarios(): UseScenariosReturn {
  const [scenarios, setScenarios] = useState<Scenario[]>([])
  const [playingScenarioId, setPlayingScenarioId] = useState<string | null>(
    null,
  )

  const addScenario = useCallback((name: string, steps: TimelineNode[]) => {
    setScenarios((prev) => [...prev, createScenario(name, steps)])
  }, [])

  const renameScenario = useCallback((id: string, name: string) => {
    setScenarios((prev) => prev.map((s) => (s.id === id ? { ...s, name } : s)))
  }, [])

  const deleteScenario = useCallback((id: string) => {
    setScenarios((prev) => prev.filter((s) => s.id !== id))
    setPlayingScenarioId((prev) => (prev === id ? null : prev))
  }, [])

  const selectScenario = useCallback((id: string | null) => {
    setPlayingScenarioId(id)
  }, [])

  return {
    scenarios,
    playingScenarioId,
    addScenario,
    renameScenario,
    deleteScenario,
    selectScenario,
  }
}
