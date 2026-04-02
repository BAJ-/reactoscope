import { useMemo } from 'react'
import type { StressRun } from './useStress'
import { analyzeHealth, worstSeverity, type Finding } from './analyzeHealth'
import {
  X,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  XCircle,
} from 'react-feather'

interface StressModalProps {
  run: StressRun
  onClose: () => void
  onRerun: () => void
}

function SeverityIcon({ severity }: { severity: Finding['severity'] }) {
  switch (severity) {
    case 'pass':
      return <CheckCircle size={14} className="finding-icon finding-pass" />
    case 'warn':
      return <AlertTriangle size={14} className="finding-icon finding-warn" />
    case 'fail':
      return <XCircle size={14} className="finding-icon finding-fail" />
  }
}

function severityClass(severity: Finding['severity']): string {
  switch (severity) {
    case 'pass':
      return 'verdict-good'
    case 'warn':
      return 'verdict-warn'
    case 'fail':
      return 'verdict-bad'
  }
}

function ModalShell({
  onClose,
  children,
}: {
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div className="pdiff-overlay" onClick={onClose}>
      <div
        className="pdiff-modal stress-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pdiff-header">
          <h3>Health check</h3>
          <button
            className="pdiff-close-btn"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function StressModal({ run, onClose, onRerun }: StressModalProps) {
  const findings = useMemo(
    () => (run.result ? analyzeHealth(run.result) : null),
    [run.result],
  )

  if (run.running) {
    return (
      <ModalShell onClose={onClose}>
        <div className="pdiff-loading">
          <p>Running health checks…</p>
        </div>
      </ModalShell>
    )
  }

  if (run.error) {
    return (
      <ModalShell onClose={onClose}>
        <p className="stress-error">{run.error}</p>
      </ModalShell>
    )
  }

  if (!run.result || !findings) return null

  const worst = worstSeverity(findings)

  return (
    <ModalShell onClose={onClose}>
      <div className={`stress-summary ${severityClass(worst)}`}>
        {worst === 'pass' && 'No problems detected'}
        {worst === 'warn' && 'Minor concerns found'}
        {worst === 'fail' && 'Problems detected'}
        <span className="stress-summary-detail">
          {run.result.totalRenders} renders analyzed
        </span>
      </div>

      <details className="stress-props">
        <summary>Props used</summary>
        <pre>{JSON.stringify(run.props, null, 2)}</pre>
      </details>

      <div className="stress-findings">
        {findings.map((f) => (
          <div key={f.id} className={`stress-finding finding-${f.severity}`}>
            <SeverityIcon severity={f.severity} />
            <p className="stress-finding-msg">{f.message}</p>
          </div>
        ))}
      </div>

      <div className="stress-actions">
        <button className="stress-rerun-btn" onClick={onRerun}>
          <RefreshCw size={14} />
          Run again
        </button>
      </div>
    </ModalShell>
  )
}
