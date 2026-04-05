import { useState } from 'react'
import type { Scenario } from './useScenarios'
import { getNodeLabel } from './timelineTree'
import {
  Play,
  ChevronLeft,
  ChevronRight,
  X,
  ChevronDown,
  ChevronUp,
  Camera,
} from 'react-feather'

interface ScenarioPanelProps {
  scenarios: Scenario[]
  playback: { scenarioId: string; stepIndex: number } | null
  pdiffRunningId: string | null
  onPlay: (scenarioId: string) => void
  onStepTo: (scenarioId: string, stepIndex: number) => void
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
  onRunPdiff: (scenarioId: string) => void
}

export function ScenarioPanel({
  scenarios,
  playback,
  pdiffRunningId,
  onPlay,
  onStepTo,
  onRename,
  onDelete,
  onRunPdiff,
}: ScenarioPanelProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  if (scenarios.length === 0) return null

  return (
    <div className="scenario-panel">
      <h3>Scenarios</h3>
      <div className="scenario-list">
        {scenarios.map((scenario) => {
          const isExpanded = expandedId === scenario.id

          return (
            <ScenarioItem
              key={scenario.id}
              scenario={scenario}
              isExpanded={isExpanded}
              currentStep={
                playback?.scenarioId === scenario.id ? playback.stepIndex : null
              }
              isPdiffRunning={pdiffRunningId === scenario.id}
              onToggleExpand={() =>
                setExpandedId(isExpanded ? null : scenario.id)
              }
              onPlay={() => onPlay(scenario.id)}
              onStepTo={(index) => onStepTo(scenario.id, index)}
              onRename={(name) => onRename(scenario.id, name)}
              onDelete={() => onDelete(scenario.id)}
              onRunPdiff={() => onRunPdiff(scenario.id)}
            />
          )
        })}
      </div>
    </div>
  )
}

function ScenarioItem({
  scenario,
  isExpanded,
  currentStep,
  isPdiffRunning,
  onToggleExpand,
  onPlay,
  onStepTo,
  onRename,
  onDelete,
  onRunPdiff,
}: {
  scenario: Scenario
  isExpanded: boolean
  currentStep: number | null
  isPdiffRunning: boolean
  onToggleExpand: () => void
  onPlay: () => void
  onStepTo: (index: number) => void
  onRename: (name: string) => void
  onDelete: () => void
  onRunPdiff: () => void
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState(scenario.name)

  function commitRename() {
    const trimmed = editName.trim()
    if (trimmed && trimmed !== scenario.name) {
      onRename(trimmed)
    }
    setIsEditing(false)
  }

  return (
    <div className="scenario-item">
      <div className="scenario-header">
        <button
          className="scenario-expand-btn"
          onClick={onToggleExpand}
          aria-label={isExpanded ? 'Collapse scenario' : 'Expand scenario'}
        >
          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        {isEditing ? (
          <input
            className="scenario-name-input"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename()
              if (e.key === 'Escape') setIsEditing(false)
            }}
            autoFocus
          />
        ) : (
          <button
            className="scenario-name"
            onClick={() => {
              setEditName(scenario.name)
              setIsEditing(true)
            }}
            title="Click to rename"
          >
            {scenario.name}
          </button>
        )}
        <span className="scenario-step-count">
          {scenario.steps.length} step{scenario.steps.length !== 1 ? 's' : ''}
        </span>
        <button
          className="scenario-delete-btn"
          onClick={onDelete}
          aria-label="Delete scenario"
        >
          <X size={12} />
        </button>
      </div>

      {isExpanded && (
        <div className="scenario-body">
          <div className="scenario-controls">
            <button
              className="scenario-control-btn"
              onClick={() => onStepTo(Math.max(0, (currentStep ?? 0) - 1))}
              disabled={currentStep === null || currentStep <= 0}
              aria-label="Previous step"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              className="scenario-control-btn"
              onClick={onPlay}
              aria-label="Play scenario"
            >
              <Play size={14} />
            </button>
            <button
              className="scenario-control-btn"
              onClick={onRunPdiff}
              disabled={isPdiffRunning || scenario.steps.length < 2}
              aria-label="Run pixel diff"
              title="Run pixel diff"
            >
              <Camera size={14} />
            </button>
            <button
              className="scenario-control-btn"
              onClick={() =>
                onStepTo(
                  Math.min(scenario.steps.length - 1, (currentStep ?? -1) + 1),
                )
              }
              disabled={
                currentStep === null || currentStep >= scenario.steps.length - 1
              }
              aria-label="Next step"
            >
              <ChevronRight size={14} />
            </button>
          </div>
          <div className="scenario-steps">
            {scenario.steps.map((step, i) => (
              <button
                key={i}
                className={`scenario-step${currentStep === i ? ' active' : ''}`}
                onClick={() => onStepTo(i)}
              >
                <span className="scenario-step-index">{i + 1}</span>
                <span className="scenario-step-label">
                  {getNodeLabel(step, i > 0 ? scenario.steps[i - 1] : null)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
