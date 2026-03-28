import type { PropInfo } from './plugins/schemaPlugin'
import { UNSET } from './generateProps'
import { functionBehaviorOptions, type SerializableProps } from './resolveProps'

interface PropsPanelProps {
  props: PropInfo[]
  values: SerializableProps
  onChange: (key: string, value: unknown) => void
}

export function PropsPanel({ props, values, onChange }: PropsPanelProps) {
  if (props.length === 0) {
    return <p className="props-empty">No props detected.</p>
  }

  return (
    <div className="props-panel">
      <h3>Props</h3>
      {props.map((prop) => (
        <div key={prop.name} className="props-field">
          <label htmlFor={`prop-${prop.name}`}>
            {prop.name}
            {!prop.required && <span className="props-optional"> ?</span>}
          </label>
          {renderControl(prop, values[prop.name], onChange)}
        </div>
      ))}
    </div>
  )
}

function renderControl(
  prop: PropInfo,
  value: unknown,
  onChange: (key: string, value: unknown) => void,
) {
  const unsetOption = !prop.required ? (
    <option value={UNSET}>Unset</option>
  ) : null

  switch (prop.type) {
    case 'function':
      return (
        <select
          id={`prop-${prop.name}`}
          value={(value ?? 'noop') as string}
          onChange={(e) => onChange(prop.name, e.target.value)}
        >
          {unsetOption}
          {functionBehaviorOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      )
    case 'enum':
      return (
        <select
          id={`prop-${prop.name}`}
          value={(value ?? '') as string}
          onChange={(e) => onChange(prop.name, e.target.value)}
        >
          {unsetOption}
          {prop.enumValues?.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      )
    case 'boolean':
      return (
        <select
          id={`prop-${prop.name}`}
          value={value === UNSET ? UNSET : value ? 'true' : 'false'}
          onChange={(e) => {
            const v = e.target.value
            if (v === UNSET) onChange(prop.name, UNSET)
            else onChange(prop.name, v === 'true')
          }}
        >
          {unsetOption}
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      )
    case 'number':
      return (
        <input
          id={`prop-${prop.name}`}
          type="number"
          value={value === UNSET ? '' : ((value as number) ?? 0)}
          placeholder={!prop.required ? 'Unset' : undefined}
          onChange={(e) => {
            if (e.target.value === '' && !prop.required) {
              onChange(prop.name, UNSET)
            } else {
              onChange(prop.name, Number(e.target.value))
            }
          }}
        />
      )
    case 'string':
    default:
      return (
        <input
          id={`prop-${prop.name}`}
          type="text"
          value={value === UNSET ? '' : ((value as string) ?? '')}
          placeholder={!prop.required ? 'Unset' : undefined}
          onChange={(e) => {
            if (e.target.value === '' && !prop.required) {
              onChange(prop.name, UNSET)
            } else {
              onChange(prop.name, e.target.value)
            }
          }}
        />
      )
  }
}
