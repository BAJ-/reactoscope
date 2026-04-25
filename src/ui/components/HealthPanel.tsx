import { useMemo } from 'react'
import type { StressRun } from '@/hooks/useStress'
import {
  analyzeHealth,
  worstSeverity,
  type Finding,
} from '@/shared/analyzeHealth'
import {
  X,
  RefreshCw,
  Activity,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Loader,
} from 'react-feather'

interface HealthPanelProps {
  run: StressRun
  onClose: () => void
  onRun: () => void
  autoRun: boolean
  onAutoRunChange: (enabled: boolean) => void
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

function AutoRunToggle({
  autoRun,
  onAutoRunChange,
}: {
  autoRun: boolean
  onAutoRunChange: (enabled: boolean) => void
}) {
  return (
    <div className="stress-auto-run">
      <label>
        <input
          type="checkbox"
          checked={autoRun}
          onChange={(e) => onAutoRunChange(e.target.checked)}
        />
        Auto-run on changes
      </label>
    </div>
  )
}

function FindingsSection({
  label,
  result,
  error,
  loading,
  memoryRunning,
}: {
  label: string
  result: StressRun['clientResult']
  error?: string | null
  loading?: boolean
  memoryRunning?: boolean
}) {
  const findings = useMemo(
    () => (result ? analyzeHealth(result) : null),
    [result],
  )

  if (loading) {
    return (
      <div className="stress-section">
        <h4 className="stress-section-label">{label}</h4>
        <div className="stress-loading-inline">
          <Loader size={14} className="spinner" />
          Running…
        </div>
      </div>
    )
  }

  if (!findings && !error) return null

  if (error) {
    return (
      <div className="stress-section">
        <h4 className="stress-section-label">{label}</h4>
        <p className="stress-error">{error}</p>
      </div>
    )
  }

  if (!findings || !result) return null

  return (
    <div className="stress-section">
      <h4 className="stress-section-label">{label}</h4>
      <div
        className={`stress-summary ${severityClass(worstSeverity(findings))}`}
      >
        {worstSeverity(findings) === 'pass' && 'No problems detected'}
        {worstSeverity(findings) === 'warn' && 'Minor concerns found'}
        {worstSeverity(findings) === 'fail' && 'Problems detected'}
        <span className="stress-summary-detail">
          {result.totalRenders} renders analyzed
        </span>
      </div>

      <div className="stress-findings">
        {findings.map((f) => (
          <div key={f.id} className={`stress-finding finding-${f.severity}`}>
            <SeverityIcon severity={f.severity} />
            <p className="stress-finding-msg">{f.message}</p>
          </div>
        ))}
        {memoryRunning && (
          <div className="stress-finding finding-loading">
            <Loader size={14} className="finding-icon spinner" />
            <p className="stress-finding-msg">Checking for memory leaks…</p>
          </div>
        )}
      </div>
    </div>
  )
}

export function HealthPanel({
  run,
  onClose,
  onRun,
  autoRun,
  onAutoRunChange,
}: HealthPanelProps) {
  const hasResults = run.clientResult || run.ssrResult || run.ssrError
  const isRunning = run.running || run.clientMemoryRunning || run.ssrRunning

  return (
    <aside className="health-panel">
      <div className="health-panel-header">
        <h3>Health check</h3>
        <button
          className="pdiff-close-btn"
          onClick={onClose}
          aria-label="Close"
        >
          <X size={16} />
        </button>
      </div>

      <AutoRunToggle autoRun={autoRun} onAutoRunChange={onAutoRunChange} />

      {run.running && (
        <div className="pdiff-loading">
          <p>Running health checks…</p>
        </div>
      )}

      {!run.running && run.error && (
        <>
          <p className="stress-error">{run.error}</p>
          <div className="stress-actions">
            <button className="stress-rerun-btn" onClick={onRun}>
              <RefreshCw size={14} />
              Run again
            </button>
          </div>
        </>
      )}

      {!run.running && !run.error && !hasResults && !isRunning && (
        <div className="stress-idle">
          <p>No health check results yet.</p>
          <button className="stress-rerun-btn" onClick={onRun}>
            <Activity size={14} />
            Run health check
          </button>
        </div>
      )}

      {!run.running && (hasResults || run.ssrRunning) && (
        <>
          <FindingsSection
            label="Client-side"
            result={run.clientResult}
            memoryRunning={run.clientMemoryRunning}
          />
          <FindingsSection
            label="Server-side (SSR)"
            result={run.ssrResult}
            error={run.ssrError}
            loading={run.ssrRunning}
          />

          {run.props && (
            <details className="stress-props">
              <summary>Props used</summary>
              <pre>{JSON.stringify(run.props, null, 2)}</pre>
            </details>
          )}

          <div className="stress-actions">
            <button
              className="stress-rerun-btn"
              onClick={onRun}
              disabled={isRunning}
            >
              <RefreshCw size={14} />
              {isRunning ? 'Running…' : 'Run again'}
            </button>
          </div>
        </>
      )}
    </aside>
  )
}
