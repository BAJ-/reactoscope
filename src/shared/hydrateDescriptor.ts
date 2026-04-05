/**
 * Hydrate descriptors allow function return defaults to represent
 * non-plain types (Promise, Date, Map, Set, RegExp, nested functions)
 * as JSON-serializable objects that get reconstructed at runtime.
 *
 * Plain values (string, number, boolean, null, plain objects, arrays)
 * pass through unchanged — no descriptor needed.
 */

export interface HydrateDescriptor {
  __hydrate: string
  [key: string]: unknown
}

export function isDescriptor(value: unknown): value is HydrateDescriptor {
  return (
    typeof value === 'object' &&
    value !== null &&
    '__hydrate' in value &&
    typeof (value as HydrateDescriptor).__hydrate === 'string'
  )
}

/**
 * Recursively reconstruct runtime values from serialized descriptors.
 * Called each time a function stub is invoked, so mutable types
 * (Map, Set, Date) get a fresh instance per call.
 */
export function hydrateValue(value: unknown): unknown {
  if (value === null || value === undefined) return value
  if (typeof value !== 'object') return value

  if (Array.isArray(value)) {
    return value.map(hydrateValue)
  }

  if (isDescriptor(value)) {
    return hydrateDescriptor(value)
  }

  // Recursively hydrate plain object values (may contain nested descriptors)
  const result: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value)) {
    result[k] = hydrateValue(v)
  }
  return result
}

function hydrateDescriptor(desc: HydrateDescriptor): unknown {
  switch (desc.__hydrate) {
    case 'Promise':
      return Promise.resolve(hydrateValue(desc.value))

    case 'Date':
      return new Date()

    case 'Map':
      return new Map()

    case 'Set':
      return new Set()

    case 'RegExp':
      return new RegExp('')

    case 'Function':
      return () => hydrateValue(desc.returnDefault)

    default:
      return null
  }
}
