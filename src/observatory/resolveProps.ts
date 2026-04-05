import type { PropInfo } from './plugins/schemaPlugin'
import { UNSET } from './generateProps'
import { hydrateValue } from './hydrateDescriptor'

type FunctionBehavior = 'noop' | 'log'

const functionBehaviors: Record<
  FunctionBehavior,
  (propName: string) => (...args: unknown[]) => void
> = {
  noop: () => () => {},
  log:
    (propName) =>
    (...args) =>
      console.log(`[${propName}]`, ...args),
}

/**
 * Build a callable function stub from a PropInfo's returnDefault.
 * Calls hydrateValue on each invocation so mutable types (Map, Date, etc.)
 * get a fresh instance per call.
 */
function buildFunctionStub(
  prop: PropInfo,
  behavior: FunctionBehavior,
): (...args: unknown[]) => unknown {
  const base =
    functionBehaviors[behavior]?.(prop.name) ??
    functionBehaviors.noop(prop.name)
  if (prop.returnDefault === undefined || prop.returnDefault === null) {
    return base
  }
  return (...args: unknown[]) => {
    base(...args)
    return hydrateValue(prop.returnDefault)
  }
}

export type SerializableProps = Record<string, unknown>

export function readPropsFromUrl(): SerializableProps {
  const raw = new URLSearchParams(window.location.search).get('props')
  if (!raw) return {}
  try {
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

export function resolveProps(
  serializable: SerializableProps,
  props: PropInfo[],
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(serializable)) {
    if (value === UNSET) continue

    const prop = props.find((p) => p.name === key)

    if (prop?.type === 'function') {
      const behavior = (
        typeof value === 'string' && value in functionBehaviors ? value : 'noop'
      ) as FunctionBehavior
      resolved[key] = buildFunctionStub(prop, behavior)
    } else {
      resolved[key] = value
    }
  }

  // Ensure all required function props get a stub even if not in serializable
  for (const prop of props) {
    if (prop.type === 'function' && !(prop.name in resolved)) {
      resolved[prop.name] = buildFunctionStub(prop, 'noop')
    }
  }

  return resolved
}

export const functionBehaviorOptions: {
  value: FunctionBehavior
  label: string
}[] = [
  { value: 'noop', label: 'No-op' },
  { value: 'log', label: 'Console log' },
]
