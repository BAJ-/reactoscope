export interface PropInfo {
  name: string
  type:
    | 'string'
    | 'number'
    | 'boolean'
    | 'function'
    | 'enum'
    | 'array'
    | 'object'
    | 'unknown'
  required: boolean
  enumValues?: string[]
  /** Full TypeScript signature for function props, e.g. "(n: number) => string" */
  signature?: string
  /** Serializable default return value for function props, derived from the return type */
  returnDefault?: unknown
}
