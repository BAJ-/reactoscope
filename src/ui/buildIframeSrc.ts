import type { SerializableProps } from './resolveProps'

export function buildIframeSrc(
  componentPath: string,
  props: SerializableProps,
): string {
  const params = new URLSearchParams()
  params.set('render', '')
  params.set('component', componentPath)
  params.set('props', JSON.stringify(props))
  return `/?${params.toString()}`
}
