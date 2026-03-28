interface TestButtonProps {
  label: string
  onClick: () => void
  disabled?: boolean
  variant?: 'primary' | 'secondary'
}

const TestButton = ({
  label,
  onClick,
  disabled = false,
  variant = 'primary',
}: TestButtonProps) => {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '8px 16px',
        backgroundColor: variant === 'primary' ? '#646cff' : '#535bf2',
        color: 'white',
        border: 'none',
        borderRadius: '4px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {label}
    </button>
  )
}

export default TestButton
