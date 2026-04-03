import type { Severity } from './analyzeHealth'
import { Activity, Copy } from 'react-feather'

interface Viewport {
  label: string
  width: number | null
  height: number | null
}

const presets: Viewport[] = [
  { label: 'Mobile', width: 375, height: 667 },
  { label: 'Tablet', width: 768, height: 1024 },
  { label: 'Desktop', width: 1280, height: 800 },
  { label: 'Full', width: null, height: null },
]

interface ViewportControlsProps {
  width: number | null
  height: number | null
  onChange: (width: number | null, height: number | null) => void
  onPinVariant?: () => void
  onToggleHealthCheck?: () => void
  healthCheckRunning?: boolean
  healthCheckSeverity?: Severity | null
}

export function ViewportControls({
  width,
  height,
  onChange,
  onPinVariant,
  onToggleHealthCheck,
  healthCheckRunning,
  healthCheckSeverity,
}: ViewportControlsProps) {
  return (
    <div className="viewport-controls">
      {presets.map((preset) => (
        <button
          key={preset.label}
          className={
            width === preset.width && height === preset.height
              ? 'viewport-btn active'
              : 'viewport-btn'
          }
          onClick={() => onChange(preset.width, preset.height)}
        >
          {preset.label}
        </button>
      ))}
      <span className="viewport-separator" />
      <label className="viewport-size">
        W
        <input
          type="number"
          value={width ?? ''}
          placeholder="auto"
          onChange={(e) =>
            onChange(
              e.target.value === '' ? null : Number(e.target.value),
              height,
            )
          }
        />
      </label>
      <span className="viewport-x">&times;</span>
      <label className="viewport-size">
        H
        <input
          type="number"
          value={height ?? ''}
          placeholder="auto"
          onChange={(e) =>
            onChange(
              width,
              e.target.value === '' ? null : Number(e.target.value),
            )
          }
        />
      </label>
      {onPinVariant && (
        <>
          <span className="viewport-separator" />
          <button className="viewport-btn" onClick={onPinVariant}>
            <Copy size={14} /> Pin
          </button>
        </>
      )}
      {onToggleHealthCheck && (
        <>
          <span className="viewport-separator" />
          <button
            className="viewport-btn"
            onClick={onToggleHealthCheck}
          >
            {healthCheckRunning ? (
              'Checking…'
            ) : (
              <>
                <Activity size={14} />
                {healthCheckSeverity && (
                  <span
                    className={`health-status-dot health-status-${healthCheckSeverity}`}
                  />
                )}
                Health
              </>
            )}
          </button>
        </>
      )}
    </div>
  )
}
