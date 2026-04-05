import type { PropInfo } from './plugins/schemaPlugin'
import { UNSET } from './generateProps'
import { hydrateValue } from './hydrateDescriptor'

/**
 * Server-safe function prop hydration.
 * Replaces serialized function placeholders (UNSET, "noop", etc.)
 * with real callable stubs that return structurally correct defaults.
 *
 * Used by the stress plugin where the full client-side resolveProps
 * (which includes browser-only helpers) cannot be imported.
 */
export function hydrateProps(
  serializable: Record<string, unknown>,
  propInfos: PropInfo[],
): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(serializable)) {
    if (value === UNSET) continue

    const prop = propInfos.find((p) => p.name === key)
    if (prop?.type === 'function') {
      result[key] = buildStub(prop)
    } else {
      result[key] = value
    }
  }

  // Ensure all required function props get a stub even if not in serializable
  for (const prop of propInfos) {
    if (prop.type === 'function' && !(prop.name in result)) {
      result[prop.name] = buildStub(prop)
    }
  }

  return result
}

function buildStub(prop: PropInfo): (...args: unknown[]) => unknown {
  const ret = prop.returnDefault
  if (ret === undefined || ret === null) {
    return () => {}
  }
  return () => hydrateValue(ret)
}
