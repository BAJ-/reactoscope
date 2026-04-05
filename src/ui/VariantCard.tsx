import { X } from 'react-feather'
import type { PinnedVariant } from './usePinnedVariants'
import { buildIframeSrc } from './buildIframeSrc'

interface VariantCardProps {
  variant: PinnedVariant
  componentPath: string
  onUnpin: (id: string) => void
}

export function VariantCard({
  variant,
  componentPath,
  onUnpin,
}: VariantCardProps) {
  return (
    <div className="variant-card">
      <div className="variant-card-header">
        <span className="variant-card-label" title={variant.label}>
          {variant.label}
        </span>
        <button
          className="variant-card-remove"
          onClick={() => onUnpin(variant.id)}
          aria-label="Remove variant"
        >
          <X size={12} />
        </button>
      </div>
      <div className="variant-card-frame">
        <iframe
          src={buildIframeSrc(componentPath, variant.props)}
          title={`Variant: ${variant.label}`}
        />
      </div>
    </div>
  )
}
