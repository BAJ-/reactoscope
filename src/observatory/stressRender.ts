import { createElement, type ComponentType } from 'react'
import { renderToString } from 'react-dom/server'

export function render(
  Component: ComponentType<Record<string, unknown>>,
  props: Record<string, unknown>,
): string {
  return renderToString(createElement(Component, props))
}
