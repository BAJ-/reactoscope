export const MSG_PROPS = 'observatory:props'
export const MSG_RENDERED = 'observatory:rendered'
export const MSG_STRESS_START = 'observatory:stress-start'
export const MSG_STRESS_TIMING = 'observatory:stress-timing'
export const MSG_STRESS_RESULT = 'observatory:stress-result'
export const MSG_STRESS_ERROR = 'observatory:stress-error'

export const HMR_SCHEMA_UPDATE = 'observatory:schema-update'

export const API_SCHEMA = '/api/schema'
export const API_STRESS = '/api/stress'
export const API_AI_MODELS = '/api/ai/models'

/** Server endpoint for AI chat (streaming). */
export const API_AI_CHAT = '/api/ai/chat'

/** ID of the wrapper element around the rendered component in the iframe. */
export const COMPONENT_ROOT_ID = 'observatory-component-root'

/** Sentinel value for unset props. */
export const UNSET = '__unset__' as const
