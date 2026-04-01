import { useState } from 'react'
import type { PdiffRun } from './usePdiff'
import { X, ChevronLeft, ChevronRight } from 'react-feather'

interface PdiffModalProps {
  run: PdiffRun
  scenarioName: string
  onClose: () => void
}

export function PdiffModal({ run, scenarioName, onClose }: PdiffModalProps) {
  const [pairIndex, setPairIndex] = useState(0)

  if (run.running) {
    return (
      <div className="pdiff-overlay" onClick={onClose}>
        <div className="pdiff-modal" onClick={(e) => e.stopPropagation()}>
          <div className="pdiff-header">
            <h3>Running pixel diff…</h3>
            <button
              className="pdiff-close-btn"
              onClick={onClose}
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>
          <div className="pdiff-loading">
            <p>Capturing scenario steps…</p>
          </div>
        </div>
      </div>
    )
  }

  if (run.pairs.length === 0) {
    return (
      <div className="pdiff-overlay" onClick={onClose}>
        <div className="pdiff-modal" onClick={(e) => e.stopPropagation()}>
          <div className="pdiff-header">
            <h3>Pixel diff — {scenarioName}</h3>
            <button
              className="pdiff-close-btn"
              onClick={onClose}
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>
          <p className="pdiff-empty">No step pairs to compare.</p>
        </div>
      </div>
    )
  }

  const pair = run.pairs[pairIndex]
  const changed = pair.changedPixels > 0
  const totalSteps = run.pairs.length + 1

  return (
    <div className="pdiff-overlay" onClick={onClose}>
      <div className="pdiff-modal" onClick={(e) => e.stopPropagation()}>
        <div className="pdiff-header">
          <h3>Pixel diff — {scenarioName}</h3>
          <button
            className="pdiff-close-btn"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="pdiff-nav">
          <button
            className="pdiff-nav-btn"
            disabled={pairIndex <= 0}
            onClick={() => setPairIndex((i) => i - 1)}
            aria-label="Previous pair"
          >
            <ChevronLeft size={16} />
          </button>

          <div className="pdiff-steps-bar">
            {Array.from({ length: totalSteps }, (_, i) => {
              const isBeforeStep = i === pairIndex
              const isAfterStep = i === pairIndex + 1
              const hasLineBefore = i > 0
              const lineIndex = i - 1
              const lineSelected = lineIndex === pairIndex
              const lineChanged =
                hasLineBefore && run.pairs[lineIndex].changedPixels > 0

              return (
                <div className="pdiff-step-segment" key={i}>
                  {hasLineBefore && (
                    <div
                      className={`pdiff-step-line${lineSelected ? ' selected' : ''}${lineChanged ? ' changed' : ' identical'}`}
                    />
                  )}
                  <div
                    className={`pdiff-step-dot${isBeforeStep ? ' before' : ''}${isAfterStep ? ' after' : ''}`}
                  >
                    <span className="pdiff-step-number">{i + 1}</span>
                  </div>
                </div>
              )
            })}
          </div>

          <button
            className="pdiff-nav-btn"
            disabled={pairIndex >= run.pairs.length - 1}
            onClick={() => setPairIndex((i) => i + 1)}
            aria-label="Next pair"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        <div className="pdiff-status">
          {changed ? (
            <span className="pdiff-changed">
              {pair.changedPixels.toLocaleString()} pixel
              {pair.changedPixels !== 1 ? 's' : ''} changed
            </span>
          ) : (
            <span className="pdiff-identical">Identical</span>
          )}
        </div>

        <div className="pdiff-images">
          <div className="pdiff-image-col">
            <span className="pdiff-image-label">Before</span>
            <img src={pair.beforeUrl} alt="Before" />
          </div>
          <div className="pdiff-image-col">
            <span className="pdiff-image-label">After</span>
            <img src={pair.afterUrl} alt="After" />
          </div>
          <div className="pdiff-image-col">
            <span className="pdiff-image-label">Diff</span>
            <div className="pdiff-diff-container">
              <img src={pair.beforeUrl} alt="Base" />
              <img
                className="pdiff-diff-overlay"
                src={pair.diffUrl}
                alt="Diff overlay"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
