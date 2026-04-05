import type { Timeline, TimelineNode } from './timelineTree'
import { getChildren, getNodeLabel } from './timelineTree'
import { Save } from 'react-feather'

interface TimelinePanelProps {
  timeline: Timeline
  onGoToNode: (id: string) => void
  onToggleMarked: (id: string) => void
  onReplay: () => void
  onSaveScenario: () => void
}

export function TimelinePanel({
  timeline,
  onGoToNode,
  onToggleMarked,
  onReplay,
  onSaveScenario,
}: TimelinePanelProps) {
  const root = timeline.nodes.find((n) => n.parentId === null)
  if (!root) return null

  const hasMarked = timeline.nodes.some((n) => n.marked)

  return (
    <div className="timeline-panel">
      <div className="timeline-header">
        <h3>Timeline</h3>
        {hasMarked && (
          <div className="timeline-actions">
            <button className="timeline-replay-btn" onClick={() => onReplay()}>
              Replay
            </button>
            <button
              className="timeline-save-btn"
              onClick={onSaveScenario}
              title="Save marked nodes as scenario"
            >
              <Save size={14} />
            </button>
          </div>
        )}
      </div>
      <div className="timeline-tree">
        <NodeRow
          node={root}
          timeline={timeline}
          depth={0}
          onGoToNode={onGoToNode}
          onToggleMarked={onToggleMarked}
        />
      </div>
    </div>
  )
}

function NodeRow({
  node,
  timeline,
  depth,
  onGoToNode,
  onToggleMarked,
}: {
  node: TimelineNode
  timeline: Timeline
  depth: number
  onGoToNode: (id: string) => void
  onToggleMarked: (id: string) => void
}) {
  const children = getChildren(timeline, node.id)
  const isActive = node.id === timeline.activeId
  const parent = node.parentId
    ? (timeline.nodes.find((n) => n.id === node.parentId) ?? null)
    : null
  const label = getNodeLabel(node, parent)

  return (
    <>
      <div className={`timeline-node${isActive ? ' active' : ''}`}>
        <span
          className="timeline-indent"
          style={{ width: `${depth * 12}px` }}
        />
        <button
          className={`timeline-mark${node.marked ? ' marked' : ''}`}
          onClick={() => onToggleMarked(node.id)}
          aria-label={node.marked ? 'Unmark node' : 'Mark node'}
        />
        <button className="timeline-label" onClick={() => onGoToNode(node.id)}>
          {label}
        </button>
      </div>
      {children.map((child) => (
        <NodeRow
          key={child.id}
          node={child}
          timeline={timeline}
          depth={depth + 1}
          onGoToNode={onGoToNode}
          onToggleMarked={onToggleMarked}
        />
      ))}
    </>
  )
}
