import { useState, useCallback, useRef, useEffect } from 'react'
import type { PropInfo } from '../shared/types'
import type { StressResult } from '../shared/analyzeHealth'
import type { SerializableProps } from './resolveProps'
import { UNSET, API_AI_MODELS, API_AI_CHAT } from '../shared/constants'

export interface AIModel {
  name: string
  size: string
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface AIState {
  models: AIModel[]
  selectedModel: string | null
  messages: ChatMessage[]
  streaming: boolean
  error: string | null
}

const STORAGE_KEY = 'observatory:ai-model'

function buildSystemPrompt(
  componentPath: string,
  propInfos: PropInfo[],
  activeProps: SerializableProps,
  healthResult: StressResult | null,
): string {
  let prompt =
    'You review React components. The component source is injected below by the server.\n\n' +
    'STRICT RULES — violating any of these makes your response worthless:\n' +
    '1. Only report bugs, correctness issues, or performance problems you can prove from the source code.\n' +
    '2. NEVER invent hypothetical issues. If you cannot point to a specific line, do not mention it.\n' +
    '3. One finding per root cause. Do not split the same problem into multiple findings.\n' +
    '4. Each finding: 2-4 sentences. State the issue, why it matters, and a one-line fix suggestion.\n' +
    '5. No full code rewrites. At most a 1-line code snippet per finding.\n' +
    '6. Do not comment on styling choices (inline styles, CSS organization, naming).\n' +
    '7. Do not summarize or describe what the component does.\n'

  if (healthResult) {
    prompt +=
      '8. Health check data is provided below. If a code issue explains a health check symptom, ' +
      'say so explicitly (e.g. "This causes the memory growth shown in the health check").\n'
  }

  prompt += `\nComponent: ${componentPath}\n`

  if (propInfos.length > 0) {
    prompt += '\nProp schema:\n```json\n'
    prompt += JSON.stringify(
      propInfos.map((p) => {
        const info: Record<string, unknown> = {
          name: p.name,
          type: p.type,
          required: p.required,
        }
        if (p.signature) info.signature = p.signature
        return info
      }),
      null,
      2,
    )
    prompt += '\n```\n'
  }

  // Filter out internal sentinels: function props (hydrated at runtime) and UNSET values (use defaults)
  const visibleProps: SerializableProps = {}
  const functionPropNames = new Set(
    propInfos.filter((p) => p.type === 'function').map((p) => p.name),
  )
  for (const [key, value] of Object.entries(activeProps)) {
    if (!functionPropNames.has(key) && value !== UNSET) {
      visibleProps[key] = value
    }
  }

  prompt += '\nCurrent prop values:\n```json\n'
  prompt += JSON.stringify(visibleProps, null, 2)
  prompt += '\n```\n'

  if (healthResult) {
    prompt += '\nHealth check results:\n```json\n'
    prompt += JSON.stringify(
      {
        iterations: healthResult.iterations,
        totalRenders: healthResult.totalRenders,
        mismatchedRenders: healthResult.mismatchedRenders,
        outputByteSize: healthResult.outputByteSize,
        timings: healthResult.timings,
        heapPerRound: healthResult.heapPerRound,
      },
      null,
      2,
    )
    prompt += '\n```\n'
  }

  return prompt
}

interface UseAIReturn {
  state: AIState
  selectModel: (name: string) => void
  analyze: (
    componentPath: string,
    propInfos: PropInfo[],
    activeProps: SerializableProps,
    healthResult: StressResult | null,
  ) => void
  sendMessage: (content: string) => void
  stop: () => void
  clearConversation: () => void
}

export function useAI(): UseAIReturn {
  const [state, setState] = useState<AIState>({
    models: [],
    selectedModel: localStorage.getItem(STORAGE_KEY),
    messages: [],
    streaming: false,
    error: null,
  })
  const abortRef = useRef<AbortController | null>(null)
  const componentPathRef = useRef<string | null>(null)

  // Fetch available models once on mount
  useEffect(() => {
    fetch(API_AI_MODELS)
      .then((res) => res.json())
      .then((data: { models?: AIModel[]; error?: string }) => {
        if (data.models && data.models.length > 0) {
          setState((prev) => {
            const saved = prev.selectedModel
            const validSaved = data.models!.some((m) => m.name === saved)
            return {
              ...prev,
              models: data.models!,
              selectedModel: validSaved ? saved : data.models![0].name,
            }
          })
        } else if (data.error) {
          setState((prev) => ({ ...prev, error: data.error! }))
        }
      })
      .catch(() => {
        setState((prev) => ({
          ...prev,
          error: 'Could not reach AI backend. Is Ollama running?',
        }))
      })
  }, [])

  const selectModel = useCallback((name: string) => {
    localStorage.setItem(STORAGE_KEY, name)
    setState((prev) => ({ ...prev, selectedModel: name }))
  }, [])

  const streamChat = useCallback(
    (messages: ChatMessage[], componentPath: string | null) => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      setState((prev) => ({
        ...prev,
        streaming: true,
        error: null,
        messages: [...messages, { role: 'assistant', content: '' }],
      }))

      fetch(API_AI_CHAT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: state.selectedModel,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
          component: componentPath,
        }),
        signal: controller.signal,
      })
        .then(async (res) => {
          if (!res.ok || !res.body) {
            if (abortRef.current === controller) {
              const data = await res.json().catch(() => ({}))
              setState((prev) => ({
                ...prev,
                streaming: false,
                error:
                  (data as { error?: string }).error ??
                  `AI request failed (${res.status})`,
                messages: prev.messages.slice(0, -1),
              }))
            }
            return
          }

          const reader = res.body.getReader()
          const decoder = new TextDecoder()
          let buffer = ''

          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            // Keep the last potentially incomplete line in the buffer
            buffer = lines.pop() ?? ''

            for (const line of lines) {
              if (!line.startsWith('data: ')) continue
              const json = line.slice(6)
              try {
                const parsed = JSON.parse(json) as {
                  message?: { content?: string }
                  done?: boolean
                }
                if (parsed.message?.content) {
                  setState((prev) => {
                    const msgs = [...prev.messages]
                    const last = msgs[msgs.length - 1]
                    msgs[msgs.length - 1] = {
                      ...last,
                      content: last.content + parsed.message!.content!,
                    }
                    return { ...prev, messages: msgs }
                  })
                }
              } catch {
                // skip malformed JSON lines
              }
            }
          }

          // Only mark idle if this request is still the active one
          if (abortRef.current === controller) {
            setState((prev) => ({ ...prev, streaming: false }))
          }
        })
        .catch((err) => {
          if (err instanceof DOMException && err.name === 'AbortError') {
            // Aborted by a newer request — don't touch streaming state
            return
          }
          if (abortRef.current === controller) {
            setState((prev) => ({
              ...prev,
              streaming: false,
              error: err instanceof Error ? err.message : String(err),
              messages: prev.messages.slice(0, -1),
            }))
          }
        })
    },
    [state.selectedModel],
  )

  const analyze = useCallback(
    (
      componentPath: string,
      propInfos: PropInfo[],
      activeProps: SerializableProps,
      healthResult: StressResult | null,
    ) => {
      componentPathRef.current = componentPath
      const systemMsg: ChatMessage = {
        role: 'system',
        content: buildSystemPrompt(
          componentPath,
          propInfos,
          activeProps,
          healthResult,
        ),
      }
      const userMsg: ChatMessage = {
        role: 'user',
        content: healthResult
          ? 'What in this code causes the issues shown in the health check? List only real bugs you can prove from the source.'
          : 'List only the real bugs and correctness issues in this component. No speculation.',
      }
      streamChat([systemMsg, userMsg], componentPath)
    },
    [streamChat],
  )

  const sendMessage = useCallback(
    (content: string) => {
      if (!content.trim() || state.streaming) return
      const newMsg: ChatMessage = { role: 'user', content }
      const messages = [...state.messages, newMsg]
      setState((prev) => ({ ...prev, messages }))
      streamChat(messages, componentPathRef.current)
    },
    [state.messages, state.streaming, streamChat],
  )

  const stop = useCallback(() => {
    abortRef.current?.abort()
    setState((prev) => {
      const msgs = prev.messages
      // Remove the empty assistant placeholder if stop was hit before any content arrived
      const cleaned =
        msgs.length > 0 &&
        msgs[msgs.length - 1].role === 'assistant' &&
        !msgs[msgs.length - 1].content
          ? msgs.slice(0, -1)
          : msgs
      return { ...prev, streaming: false, messages: cleaned }
    })
  }, [])

  const clearConversation = useCallback(() => {
    abortRef.current?.abort()
    setState((prev) => ({
      ...prev,
      messages: [],
      streaming: false,
      error: null,
    }))
  }, [])

  return { state, selectModel, analyze, sendMessage, stop, clearConversation }
}
