import { useState, useRef, useEffect } from 'react'
import type { AIState, AIModel, ChatMessage } from './useAI'
import { X, Send, Square, Trash2, Cpu, MessageSquare } from 'react-feather'

interface AIPanelProps {
  state: AIState
  onClose: () => void
  onSelectModel: (name: string) => void
  onAnalyze: () => void
  onSendMessage: (content: string) => void
  onStop: () => void
  onClear: () => void
  autoRun: boolean
  onAutoRunChange: (enabled: boolean) => void
}

function ModelSelector({
  models,
  selected,
  onSelect,
  disabled,
}: {
  models: AIModel[]
  selected: string | null
  onSelect: (name: string) => void
  disabled: boolean
}) {
  if (models.length === 0) return null
  return (
    <select
      className="ai-model-select"
      value={selected ?? ''}
      onChange={(e) => onSelect(e.target.value)}
      disabled={disabled}
    >
      {models.map((m) => (
        <option key={m.name} value={m.name}>
          {m.name} ({m.size})
        </option>
      ))}
    </select>
  )
}

function MessageBubble({ message }: { message: ChatMessage }) {
  if (message.role === 'system') return null
  return (
    <div className={`ai-message ai-message-${message.role}`}>
      <span className="ai-message-role">
        {message.role === 'user' ? 'You' : 'AI'}
      </span>
      <div className="ai-message-content">
        {message.content || <span className="ai-typing">Thinking…</span>}
      </div>
    </div>
  )
}

export function AIPanel({
  state,
  onClose,
  onSelectModel,
  onAnalyze,
  onSendMessage,
  onStop,
  onClear,
  autoRun,
  onAutoRunChange,
}: AIPanelProps) {
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [state.messages])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || state.streaming) return
    onSendMessage(input.trim())
    setInput('')
  }

  const hasConversation = state.messages.some((m) => m.role !== 'system')

  return (
    <div className="ai-panel">
      <div className="ai-panel-header">
        <div className="ai-panel-title">
          <Cpu size={14} />
          <h3>AI Feedback</h3>
        </div>
        <div className="ai-panel-controls">
          <ModelSelector
            models={state.models}
            selected={state.selectedModel}
            onSelect={onSelectModel}
            disabled={state.streaming}
          />
          <label className="ai-auto-run">
            <input
              type="checkbox"
              checked={autoRun}
              onChange={(e) => onAutoRunChange(e.target.checked)}
            />
            Auto-run
          </label>
          {hasConversation && (
            <button
              className="ai-header-btn"
              onClick={onClear}
              disabled={state.streaming}
              title="Clear conversation"
            >
              <Trash2 size={14} />
            </button>
          )}
          <button
            className="ai-header-btn"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="ai-messages">
        {state.error && <p className="ai-error">{state.error}</p>}

        {!hasConversation && !state.error && (
          <div className="ai-empty">
            <MessageSquare size={20} />
            <p>No AI analysis yet.</p>
            <button
              className="ai-analyze-btn"
              onClick={onAnalyze}
              disabled={!state.selectedModel || state.streaming}
            >
              <Cpu size={14} />
              Analyze component
            </button>
          </div>
        )}

        {state.messages.map((msg, i) => (
          <MessageBubble key={i} message={msg} />
        ))}
        <div ref={messagesEndRef} />
      </div>

      <form className="ai-input-bar" onSubmit={handleSubmit}>
        {!hasConversation ? (
          <button
            type="button"
            className="ai-analyze-btn ai-analyze-btn-bar"
            onClick={onAnalyze}
            disabled={!state.selectedModel || state.streaming}
          >
            <Cpu size={14} />
            Analyze
          </button>
        ) : null}
        <input
          className="ai-input"
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            hasConversation ? 'Ask a follow-up…' : 'Or ask a specific question…'
          }
          disabled={state.streaming}
        />
        {state.streaming ? (
          <button
            type="button"
            className="ai-send-btn"
            onClick={onStop}
            title="Stop"
          >
            <Square size={14} />
          </button>
        ) : (
          <button
            type="submit"
            className="ai-send-btn"
            disabled={!input.trim()}
            title="Send"
          >
            <Send size={14} />
          </button>
        )}
      </form>
    </div>
  )
}
