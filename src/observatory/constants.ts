/** PostMessage type for sending props from the shell to the iframe. */
export const MSG_PROPS = 'observatory:props'

/** PostMessage type for the iframe signalling it has rendered. */
export const MSG_RENDERED = 'observatory:rendered'

/** Vite HMR event name for schema changes. */
export const HMR_SCHEMA_UPDATE = 'observatory:schema-update'

/** Server endpoint for fetching component prop schemas. */
export const API_SCHEMA = '/api/schema'

/** ID of the wrapper element around the rendered component in the iframe. */
export const COMPONENT_ROOT_ID = 'observatory-component-root'
