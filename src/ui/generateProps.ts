import type { PropInfo } from '../shared/types'
import { UNSET } from '../shared/constants'

export function generateProps(props: PropInfo[]): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  for (const prop of props) {
    result[prop.name] = prop.required ? generateValue(prop) : UNSET
  }

  return result
}

function generateValue(prop: PropInfo): unknown {
  switch (prop.type) {
    case 'string':
      return 'example'
    case 'number':
      return 0
    case 'boolean':
      return false
    case 'enum':
      return prop.enumValues?.[0] ?? ''
    case 'function':
      return UNSET
    case 'array':
      return []
    case 'object':
      return {}
    default:
      return ''
  }
}
