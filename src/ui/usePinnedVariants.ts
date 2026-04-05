import { useState, useCallback } from 'react'
import type { SerializableProps } from './resolveProps'
import { UNSET } from '../shared/constants'

export interface PinnedVariant {
  id: string
  label: string
  props: SerializableProps
}

function storageKey(componentPath: string): string {
  return `observatory:pinned:${componentPath}`
}

function isValidVariant(v: unknown): v is PinnedVariant {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as PinnedVariant).id === 'string' &&
    typeof (v as PinnedVariant).label === 'string' &&
    typeof (v as PinnedVariant).props === 'object' &&
    (v as PinnedVariant).props !== null &&
    !Array.isArray((v as PinnedVariant).props)
  )
}

function loadVariants(componentPath: string): PinnedVariant[] {
  try {
    const raw = localStorage.getItem(storageKey(componentPath))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isValidVariant)
  } catch {
    return []
  }
}

function saveVariants(componentPath: string, variants: PinnedVariant[]): void {
  localStorage.setItem(storageKey(componentPath), JSON.stringify(variants))
}

function summarizeProps(props: SerializableProps): string {
  const entries = Object.entries(props).filter(([, v]) => v !== UNSET)
  if (entries.length === 0) return '(no props)'
  return entries
    .map(([k, v]) => {
      if (typeof v === 'string') return `${k}="${v}"`
      if (typeof v === 'boolean') return v ? k : `!${k}`
      return `${k}=${JSON.stringify(v)}`
    })
    .join(', ')
}

interface UsePinnedVariantsReturn {
  variants: PinnedVariant[]
  pinVariant: (props: SerializableProps) => void
  unpinVariant: (id: string) => void
}

export function usePinnedVariants(
  componentPath: string | null,
): UsePinnedVariantsReturn {
  const [variants, setVariants] = useState<PinnedVariant[]>(() =>
    componentPath ? loadVariants(componentPath) : [],
  )

  const persist = useCallback(
    (next: PinnedVariant[]) => {
      if (componentPath) saveVariants(componentPath, next)
    },
    [componentPath],
  )

  const pinVariant = useCallback(
    (props: SerializableProps) => {
      const variant: PinnedVariant = {
        id: crypto.randomUUID(),
        label: summarizeProps(props),
        props: { ...props },
      }
      setVariants((prev) => {
        const next = [...prev, variant]
        persist(next)
        return next
      })
    },
    [persist],
  )

  const unpinVariant = useCallback(
    (id: string) => {
      setVariants((prev) => {
        const next = prev.filter((v) => v.id !== id)
        persist(next)
        return next
      })
    },
    [persist],
  )

  return { variants, pinVariant, unpinVariant }
}
