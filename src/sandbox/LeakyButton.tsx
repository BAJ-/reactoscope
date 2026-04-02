/**
 * A deliberately leaky component for testing.
 * The module-level array grows on every render, simulating
 * a component that accumulates state outside React's lifecycle.
 */

interface LeakyButtonProps {
  label: string
  onClick: () => void
  disabled?: boolean
}

// This is the leak: grows on every render, never cleaned up
const renderLog: string[] = []

const LeakyButton = ({
  label,
  onClick,
  disabled = false,
}: LeakyButtonProps) => {
  // Every render adds to the array AND iterates the whole thing
  renderLog.push(`rendered: ${label}`)

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '8px 16px',
        backgroundColor: '#646cff',
        color: 'white',
        border: 'none',
        borderRadius: '4px',
      }}
    >
      {label}
    </button>
  )
}

export default LeakyButton
